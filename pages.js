const puppeteer = require('puppeteer');
const fs = require('fs'); 

// Helper function for delay
function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    });
}
// scrapping movies from mihetofilms website function here
async function TheScrapper() {
    const baseUrl = 'https://mihetofilms.web.app/browse?genre=All&page=';
    const allMoviesData = [];
    let currentPage = 1;
    let browser;

    try {
        browser = await puppeteer.launch({ headless: true }); 
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        page.setDefaultNavigationTimeout(1000000); // Global 100 seconds timeout for navigation
        console.log('Starting movie data extraction from all browse pages...');

        while (true) {
            const url = `${baseUrl}${currentPage}`;
            console.log(`Navigating to page: ${url}`);

            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 100000 });
                await page.waitForSelector('.grid.grid-cols-3.md\\:grid-cols-4.lg\\:grid-cols-6.gap-4', { timeout: 50000 }); // Wait up to 20 seconds
                console.log(`Movie grid found on page ${currentPage}.`);

            } catch (navigationError) {
                console.error(`Failed to navigate or find movie grid on ${url}: ${navigationError.message}`);
                if (currentPage === 1) {
                    console.error("Critical error: Could not load the first page. Exiting.");
                    return null;
                } else {
                    console.log(`No more pages or an error occurred after page ${currentPage - 1}. Ending scrape.`);
                    break;
                }
            }

            const scrapedMoviesOnPage = await page.evaluate(() => {
                const movies = [];
                // Selector for each movie card (the <a> tag)
                const movieElements = document.querySelectorAll('.grid.grid-cols-3.md\\:grid-cols-4.lg\\:grid-cols-6.gap-4 > a');

                movieElements.forEach(movieEl => {
                    const titleElement = movieEl.querySelector('h3');
                    const imageElement = movieEl.querySelector('img');
                    const timeAgoElement = movieEl.querySelector('p.text-gray-400');
                    const subberElement = movieEl.querySelector('p.text-white.font-medium');

                    const title = titleElement ? titleElement.innerText.trim() : 'N/A';
                    const imageUrl = imageElement ? imageElement.src : 'N/A';
                    const detailPageRelativeUrl = movieEl.getAttribute('href') || 'N/A';

                    // Extract the movie ID from the detailPageRelativeUrl
                    const movieIdMatch = detailPageRelativeUrl.match(/\/details\/([a-f0-9-]+)/);
                    const movieId = movieIdMatch ? movieIdMatch[1] : 'N/A';

                    const uploadedTime = timeAgoElement ? timeAgoElement.innerText.trim() : 'N/A';
                    const subber = subberElement ? subberElement.innerText.trim() : 'N/A';

                    movies.push({
                        id: movieId,
                        title: title,
                        imageUrl: imageUrl,
                        detailPageRelativeUrl: detailPageRelativeUrl,
                        uploadedTime: uploadedTime,
                        subber: subber
                    });
                });
                return movies;
            });

            if (scrapedMoviesOnPage.length === 0) {
                console.log(`No movies found on page ${currentPage}. Assuming end of results. Ending scrape.`);
                break; 
            }

            allMoviesData.push(...scrapedMoviesOnPage);
            console.log(`Page ${currentPage} scraped: ${scrapedMoviesOnPage.length} movies found. Total: ${allMoviesData.length}`);
            currentPage++;
            await delay(1500);
        }

        console.log(`\nScraping complete! Total movies found across all pages: ${allMoviesData.length}`);

        // Save the data to a JSON file
        fs.writeFileSync('MockMovies.json', JSON.stringify(allMoviesData, null, 2));
        console.log('All movies data from browse pages saved to MockMovies.json');
        return allMoviesData;

    } catch (error) {
        console.error(`An unexpected error occurred during scraping:`, error);
        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
    }
}

TheScrapper();