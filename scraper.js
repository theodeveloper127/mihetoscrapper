const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Helper function for delay
function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    });
}

async function scrapeMovieFullDetails(movieId) {
    const detailUrl = `https://mihetofilms.web.app/details/${movieId}`;
    let browser;
    let movieData = {};

    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        page.setDefaultNavigationTimeout(60000); // 60 seconds timeout

        console.log(`Navigating to movie detail page: ${detailUrl}`);

        try {
            await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.waitForSelector('section[aria-label="Movie Info and Media"] div.card', { timeout: 15000 });
            console.log("Main content card found. The Scrapper start to scraping.");
        } catch (navigationError) {
            console.error(`Failed to navigate or find primary content on ${detailUrl}: ${navigationError.message}`);
            return null;
        }

        // --- EXTRACTING MOVIE DETAILS ---
        movieData = await page.evaluate((dynamicMovieId) => {
            const data = {};
            data.id = dynamicMovieId;

            // Title - Primary extraction from the main heading
            const titleEl = document.querySelector('div.title h2.text-white.text-3xl.font-bold');
            data.title = titleEl ? titleEl.innerText.trim() : 'N/A';

            // Poster Image URL
            const posterImgEl = document.querySelector('img.border-3.border-\\[\\#141414\\].rounded-full.md\\:translate-x-1\\/4.translate-y-\\[-50\\%\\].w-32.aspect-square.object-cover');
            data.posterUrl = posterImgEl ? posterImgEl.src : 'N/A';

            // Movie Info section (Country, Narrator, Videos Count)
            const movieInfoDiv = document.querySelector('div.card.my-5.rounded-2xl.border.border-gray-700.bg-gray-900.shadow-md.p-4 div.text-sm.text-gray-300.space-y-3');
            if (movieInfoDiv) {
                const infoItems = movieInfoDiv.querySelectorAll('div.flex.items-center.gap-2');
                infoItems.forEach(item => {
                    const labelEl = item.querySelector('span.font-medium.text-gray-400');
                    const valueEl = item.querySelector('span.text-white');
                    if (labelEl && valueEl) {
                        const label = labelEl.innerText.trim().replace(':', '');
                        const value = valueEl.innerText.trim();
                        if (label === 'Country') {
                            data.country = value;
                        } else if (label === 'Narrator') {
                            data.narrator = value;
                        } else if (label === 'Videos') {
                            data.numberOfVideos = parseInt(value) || 0;
                        }
                    }
                });
            }

            // Description
            const descriptionCardHeading = Array.from(document.querySelectorAll('div.card h2.text-lg.font-semibold.text-white.mb-3')).find(el => el.textContent.includes('Movie Description'));
            if (descriptionCardHeading) {
                const descriptionEl = descriptionCardHeading.nextElementSibling;
                data.description = descriptionEl ? descriptionEl.innerText.trim() : 'N/A';
            } else {
                data.description = 'N/A';
            }

            // Trailer (Check availability)
            const trailerCardHeading = Array.from(document.querySelectorAll('div.card h2.text-lg.font-semibold.text-white.mb-4'))
                                        .find(el => el.textContent.includes('Trailer'));
            if (trailerCardHeading) {
                const trailerStatusEl = trailerCardHeading.nextElementSibling;
                data.trailerAvailable = !(trailerStatusEl && trailerStatusEl.innerText.trim() === 'No trailer available');
                data.trailerText = trailerStatusEl ? trailerStatusEl.innerText.trim() : 'N/A';
            } else {
                data.trailerAvailable = false;
                data.trailerText = 'Not found';
            }

            // Videos List (Episodes and Download Links) - This part should now work better
            data.videos = [];
            // Find the correct card's heading, then its sibling UL
            const movieVideosHeading = Array.from(document.querySelectorAll('div.card h2.text-lg.font-semibold.text-white.mb-4')).find(el => el.textContent.includes('Movie Videos'));

            if (movieVideosHeading) {
                const videoListEl = movieVideosHeading.nextElementSibling;

                if (videoListEl && videoListEl.tagName === 'UL' && videoListEl.classList.contains('space-y-3')) {
                    const videoItems = videoListEl.querySelectorAll('li.flex.items-center.justify-between');
                    if (videoItems.length > 0) {
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
            }

            // Comments (Check availability)
            data.comments = []; // Initialize comments array
            const commentsCardHeading = Array.from(document.querySelectorAll('div.card h2.text-lg.font-semibold.text-white.mb-4'))
                                            .find(el => el.textContent.includes('Comments'));
            if (commentsCardHeading) {
                const commentListEl = commentsCardHeading.nextElementSibling;
                if (commentListEl && commentListEl.tagName === 'UL') {
                    const noCommentsEl = commentListEl.querySelector('li.text-gray-400');
                    data.commentsAvailable = (commentListEl.querySelectorAll('li').length > 0) && !(noCommentsEl && noCommentsEl.innerText.trim() === 'No comments yet');

                    if (data.commentsAvailable) {
                        // Logic to extract comments if available (currently empty)
                    }
                } else {
                    data.commentsAvailable = false; // If ul is not found after heading
                }
            } else {
                data.commentsAvailable = false; // If Comments heading itself is not found
            }

            return data;
        }, movieId); // Pass movieId as an argument to page.evaluate

        // Display only the ID of the movie whose data was fetched
        console.log(`Successfully scraped data for movie ID: ${movieId}`);

        return movieData;

    } catch (error) {
        console.error(`An unexpected error occurred while scraping movie ID ${movieId}:`, error);
        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`Browser closed for movie ID: ${movieId}`); // Confirm browser closure per movie
        }
    }
}

// === Looping through a dynamic array of Movie IDs ===
async function scrapeMultipleMovieDetails(movieIds) {
    const outputFileName = 'FinallyMovies.json';
    let allScrapedDetails = [];

    // Try to load existing data from FinallyMovies.json
    try {
        if (fs.existsSync(outputFileName)) {
            const existingData = fs.readFileSync(outputFileName, 'utf8');
            allScrapedDetails = JSON.parse(existingData);
            console.log(`Loaded ${allScrapedDetails.length} existing movie details from ${outputFileName}`);
        }
    } catch (error) {
        console.error(`Error loading existing data from ${outputFileName}:`, error);
        // Continue with an empty array if loading fails
        allScrapedDetails = [];
    }

    let fetchedCount = 0;
    // Count already fetched items if starting from an existing file
    fetchedCount = allScrapedDetails.length;

    for (const id of movieIds) {
        // Check if this movie ID has already been scraped
        const alreadyScraped = allScrapedDetails.some(movie => movie.id === id);
        if (alreadyScraped) {
            console.log(`Skipping movie ID: ${id} (already scraped)`);
            continue; // Skip to the next ID
        }

        console.log(`\nStarting scrape for movie ID: ${id}`);
        const details = await scrapeMovieFullDetails(id);
        if (details) {
            allScrapedDetails.push(details);
            fetchedCount++;
            // Display the running total of movies fetched
            console.log(`Movies fetched so far: ${fetchedCount}`);

            // Save all collected movie details into the file after each successful scrape
            try {
                fs.writeFileSync(outputFileName, JSON.stringify(allScrapedDetails, null, 2));
                console.log(`Data for movie ID ${id} saved to ${outputFileName}`);
            } catch (saveError) {
                console.error(`Error saving data for movie ID ${id} to ${outputFileName}:`, saveError);
            }
        }
        await delay(2000); // Wait for 2 seconds between each movie detail page scrape
    }

    console.log('\n--- Scraping Process Complete ---');
    console.log(`Total movies requested: ${movieIds.length}`);
    console.log(`Total unique movie data successfully fetched and saved: ${allScrapedDetails.length}`);

    return allScrapedDetails;
}

// access movies from mockdata
const MocKMovies = fs.readFileSync(path.join(__dirname,'MockMovies.json'), 'utf8');
const DefineMovies = JSON.parse(MocKMovies);

// Example usage:
// This line has been updated to dynamically get all IDs from DefineMovies
const movieIDsToScrape = DefineMovies.map(movie => movie.id);

// Call the function to scrape multiple movie details
scrapeMultipleMovieDetails(movieIDsToScrape);
