const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config({ quiet: true });

const app = express();
app.use(cors());
app.use(express.json());

const router = express.Router();

// Set Puppeteer cache directory for Render
process.env.PUPPETEER_CACHE_DIR = '/opt/render/.cache/puppeteer';

// Use persistent disk path for Render
const mockMoviesPath = path.join('/opt/render/data', 'MockMovies.json');
const outputFileName = path.join('/opt/render/data', 'FinallyMovies.json');

// --- Helper Functions ---
function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

// --- TheScrapperCallable ---
async function TheScrapperCallable(maxPages = 2) {
    const baseUrl = 'https://mihetofilms.web.app/browse?genre=All&page=';
    let existingMovies = [];
    let allMoviesData = [];
    let currentPage = 1;
    let browser;

    // Load existing movies
    try {
        if (fs.existsSync(mockMoviesPath)) {
            existingMovies = JSON.parse(fs.readFileSync(mockMoviesPath, 'utf8'));
            console.log(`[Phase 1] Loaded ${existingMovies.length} existing movies from MockMovies.json`);
        }
    } catch (error) {
        console.error(`[Phase 1] Error loading MockMovies.json: ${error.message}`);
    }

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for Render
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        page.setDefaultNavigationTimeout(100000);
        console.log('[Phase 1] Starting movie data extraction...');

        while (currentPage <= maxPages) {
            const url = `${baseUrl}${currentPage}`;
            console.log(`[Phase 1] Navigating to page: ${url}`);

            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                await page.waitForSelector('.grid.grid-cols-3.md\\:grid-cols-4.lg\\:grid-cols-6.gap-4', { timeout: 30000 });
                console.log(`[Phase 1] Movie grid found on page ${currentPage}.`);
            } catch (navigationError) {
                console.error(`[Phase 1] Failed to navigate or find movie grid on ${url}: ${navigationError.message}`);
                break;
            }

            const scrapedMoviesOnPage = await page.evaluate(() => {
                const movies = [];
                const movieElements = document.querySelectorAll('.grid.grid-cols-3.md\\:grid-cols-4.lg\\:grid-cols-6.gap-4 > a');
                movieElements.forEach(movieEl => {
                    const titleElement = movieEl.querySelector('h3');
                    const imageElement = movieEl.querySelector('img');
                    const timeAgoElement = movieEl.querySelector('p.text-gray-400');
                    const subberElement = movieEl.querySelector('p.text-white.font-medium');

                    const title = titleElement ? titleElement.innerText.trim() : 'N/A';
                    const imageUrl = imageElement ? imageElement.src : 'N/A';
                    const detailPageRelativeUrl = movieEl.getAttribute('href') || 'N/A';
                    const movieIdMatch = detailPageRelativeUrl.match(/\/details\/([a-f0-9-]+)/);
                    const movieId = movieIdMatch ? movieIdMatch[1] : 'N/A';
                    const uploadedTime = timeAgoElement ? timeAgoElement.innerText.trim() : 'N/A';
                    const subber = subberElement ? subberElement.innerText.trim() : 'N/A';

                    movies.push({
                        id: movieId,
                        title,
                        imageUrl,
                        detailPageRelativeUrl,
                        uploadedTime,
                        subber
                    });
                });
                return movies;
            });

            if (scrapedMoviesOnPage.length === 0) {
                console.log(`[Phase 1] No movies found on page ${currentPage}. Ending scrape.`);
                break;
            }

            // Filter out existing movies by title
            const newMovies = scrapedMoviesOnPage.filter(scrapedMovie => 
                !existingMovies.some(existing => existing.title === scrapedMovie.title)
            );

            allMoviesData.push(...newMovies);
            console.log(`[Phase 1] Page ${currentPage} scraped: ${newMovies.length} new movies found. Total new: ${allMoviesData.length}`);
            currentPage++;
            await delay(1500);
        }

        if (allMoviesData.length > 0) {
            // Update MockMovies.json
            const updatedMovies = [...existingMovies, ...allMoviesData];
            fs.writeFileSync(mockMoviesPath, JSON.stringify(updatedMovies, null, 2));
            console.log(`[Phase 1] Updated MockMovies.json with ${allMoviesData.length} new movies. Total: ${updatedMovies.length}`);
        } else {
            console.log('[Phase 1] No new movies found. MockMovies.json unchanged.');
        }

        return allMoviesData;

    } catch (error) {
        console.error(`[Phase 1] Unexpected error during browse scraping: ${error.message}`);
        return [];
    } finally {
        if (browser) {
            await browser.close();
            console.log('[Phase 1] Browser closed.');
        }
    }
}

// --- scrapeMovieFullDetails ---
async function scrapeMovieFullDetails(movieId) {
    const detailUrl = `https://mihetofilms.web.app/details/${movieId}`;
    let browser;
    let movieData = {};

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for Render
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        page.setDefaultNavigationTimeout(60000);
        console.log(`[Phase 2 - Detail] Navigating to: ${detailUrl}`);

        try {
            await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.waitForSelector('section[aria-label="Movie Info and Media"] div.card', { timeout: 15000 });
            console.log("[Phase 2 - Detail] Main content card found.");
        } catch (navigationError) {
            console.error(`[Phase 2 - Detail] Failed to navigate or find content on ${detailUrl}: ${navigationError.message}`);
            return null;
        }

        movieData = await page.evaluate((dynamicMovieId) => {
            const data = { id: dynamicMovieId };
            const getElementText = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.innerText.trim() : 'N/A';
            };

            data.title = getElementText('div.title h2.text-white.text-3xl.font-bold');
            const posterImgEl = document.querySelector('img.border-3.border-\\[\\#141414\\].rounded-full.md\\:translate-x-1\\/4.translate-y-\\[-50\\%\\].w-32.aspect-square.object-cover');
            data.posterUrl = posterImgEl ? posterImgEl.src : 'N/A';

            const movieInfoDiv = document.querySelector('div.card.my-5.rounded-2xl.border.border-gray-700.bg-gray-900.shadow-md.p-4 div.text-sm.text-gray-300.space-y-3');
            if (movieInfoDiv) {
                const infoItems = movieInfoDiv.querySelectorAll('div.flex.items-center.gap-2');
                infoItems.forEach(item => {
                    const labelEl = item.querySelector('span.font-medium.text-gray-400');
                    const valueEl = item.querySelector('span.text-white');
                    if (labelEl && valueEl) {
                        const label = labelEl.innerText.trim().replace(':', '');
                        const value = valueEl.innerText.trim();
                        if (label === 'Country') data.country = value;
                        else if (label === 'Narrator') data.narrator = value;
                        else if (label === 'Videos') data.numberOfVideos = parseInt(value) || 0;
                    }
                });
            }

            const descriptionCardHeading = Array.from(document.querySelectorAll('div.card h2.text-lg.font-semibold.text-white.mb-3')).find(el => el.textContent.includes('Movie Description'));
            data.description = descriptionCardHeading ? (descriptionCardHeading.nextElementSibling?.innerText.trim() || 'N/A') : 'N/A';

            const trailerCardHeading = Array.from(document.querySelectorAll('div.card h2.text-lg.font-semibold.text-white.mb-4')).find(el => el.textContent.includes('Trailer'));
            data.trailerAvailable = trailerCardHeading ? !(trailerCardHeading.nextElementSibling?.innerText.trim() === 'No trailer available') : false;
            data.trailerText = trailerCardHeading ? (trailerCardHeading.nextElementSibling?.innerText.trim() || 'N/A') : 'Not found';

            data.videos = [];
            const movieVideosHeading = Array.from(document.querySelectorAll('div.card h2.text-lg.font-semibold.text-white.mb-4')).find(el => el.textContent.includes('Movie Videos'));
            if (movieVideosHeading) {
                const videoListEl = movieVideosHeading.nextElementSibling;
                if (videoListEl?.tagName === 'UL' && videoListEl.classList.contains('space-y-3')) {
                    const videoItems = videoListEl.querySelectorAll('li.flex.items-center.justify-between');
                    videoItems.forEach(item => {
                        const episodeNameEl = item.querySelector('span.text-gray-300.font-medium');
                        const videoImgEl = item.querySelector('img');
                        const downloadLinkEl = item.querySelector('a[href][target="_blank"][rel="noopener noreferrer"]');
                        data.videos.push({
                            episode: episodeNameEl ? episodeNameEl.innerText.trim() : 'N/A',
                            thumbnailUrl: videoImgEl ? videoImgEl.src : 'N/A',
                            downloadLink: downloadLinkEl ? downloadLinkEl.href : 'N/A'
                        });
                    });
                }
            }

            data.commentsAvailable = false;
            const commentsCardHeading = Array.from(document.querySelectorAll('div.card h2.text-lg.font-semibold.text-white.mb-4')).find(el => el.textContent.includes('Comments'));
            if (commentsCardHeading) {
                const commentListEl = commentsCardHeading.nextElementSibling;
                if (commentListEl?.tagName === 'UL') {
                    const noCommentsEl = commentListEl.querySelector('li.text-gray-400');
                    data.commentsAvailable = commentListEl.querySelectorAll('li').length > 0 && !(noCommentsEl?.innerText.trim() === 'No comments yet');
                }
            }

            return data;
        }, movieId);

        return movieData;

    } catch (error) {
        console.error(`[Phase 2 - Detail] Error scraping movie ID ${movieId}: ${error.message}`);
        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`[Phase 2 - Detail] Browser closed for movie ID: ${movieId}`);
        }
    }
}

// --- scrapeMultipleMovieDetails ---
async function scrapeMultipleMovieDetails(movieIds) {
    let allScrapedDetails = [];

    // Load existing data
    try {
        if (fs.existsSync(outputFileName)) {
            allScrapedDetails = JSON.parse(fs.readFileSync(outputFileName, 'utf8'));
            console.log(`[Phase 2] Loaded ${allScrapedDetails.length} existing movie details from ${outputFileName}`);
        }
    } catch (error) {
        console.error(`[Phase 2] Error loading FinallyMovies.json: ${error.message}`);
    }

    let fetchedCount = allScrapedDetails.length;

    for (const id of movieIds) {
        if (allScrapedDetails.some(movie => movie.id === id)) {
            console.log(`[Phase 2] Skipping movie ID: ${id} (already in FinallyMovies.json)`);
            continue;
        }

        console.log(`[Phase 2] Starting scrape for new movie ID: ${id}`);
        const details = await scrapeMovieFullDetails(id);
        if (details) {
            allScrapedDetails.push(details);
            fetchedCount++;
            console.log(`[Phase 2] Movies fetched so far: ${fetchedCount}`);

            // Update FinallyMovies.json
            try {
                fs.writeFileSync(outputFileName, JSON.stringify(allScrapedDetails, null, 2));
                console.log(`[Phase 2] Updated ${outputFileName} with movie ID ${id}`);
            } catch (saveError) {
                console.error(`[Phase 2] Error saving to ${outputFileName}: ${saveError.message}`);
            }
        }
        await delay(2000);
    }

    console.log('\n--- Scraping Process Complete ---');
    console.log(`Total movies requested for detail scrape: ${movieIds.length}`);
    console.log(`Total unique movie data saved: ${allScrapedDetails.length}`);

    return allScrapedDetails;
}

// --- Express GET Router ---
router.get('/scrape', async (req, res) => {
    console.log('--- Initiating scraping process... ---');
    let basicMovies = [];

    // Phase 1: Check/Scrape MockMovies.json
    try {
        if (fs.existsSync(mockMoviesPath)) {
            basicMovies = JSON.parse(fs.readFileSync(mockMoviesPath, 'utf8'));
            console.log(`[Main] MockMovies.json exists with ${basicMovies.length} entries.`);
            if (basicMovies.length === 0) {
                console.log('[Main] MockMovies.json is empty. Scraping 2 pages.');
                basicMovies = await TheScrapperCallable(2);
            } else {
                console.log('[Main] Using existing MockMovies.json and scraping 2 pages for new movies.');
                const newMovies = await TheScrapperCallable(2);
                basicMovies = [...basicMovies, ...newMovies];
            }
        } else {
            console.log('[Main] MockMovies.json not found. Scraping 2 pages.');
            basicMovies = await TheScrapperCallable(2);
        }

        if (!basicMovies || basicMovies.length === 0) {
            return res.status(500).json({ error: 'Failed to obtain basic movie data.' });
        }
        console.log(`[Main] Obtained ${basicMovies.length} basic movie entries.`);

    } catch (error) {
        console.error(`[Main] Error during MockMovies check/scrape: ${error.message}`);
        return res.status(500).json({ error: `Initial scrape failed: ${error.message}` });
    }

    // Phase 2: Scrape details
    try {
        const movieIDsToScrape = basicMovies.map(movie => movie.id);
        const finalScrapedData = await scrapeMultipleMovieDetails(movieIDsToScrape);

        res.status(200).json({
            message: 'Scraping completed.',
            totalMoviesProcessedForDetails: movieIDsToScrape.length,
            totalUniqueMoviesSaved: finalScrapedData.length
        });
    } catch (error) {
        console.error(`[Main] Error during detail scraping: ${error.message}`);
        return res.status(500).json({ error: `Detail scraping failed: ${error.message}` });
    }
});

app.use('/api', router);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`The scrapper running on https://mihetoscrapper.onrender.com:${PORT}`);
});

module.exports = app;