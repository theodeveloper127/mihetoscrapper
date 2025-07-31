const express = require('express');
const cors = require('cors');
const connectDB = require('./utils/database'); 
const mihetofilmsRouter = require('./routes/mihetofilms'); // Adjust this path if mihetofilms.js is located elsewhere

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
// All routes defined in mihetofilms.js will be prefixed with /api
app.use('/api', mihetofilmsRouter);
// Basic route to confirm the server is running
app.get('/', (req, res) => {
    res.send('Welcome to the Movie Scraper API! Send a GET request to /api/scrape to start scraping.');
});

app.listen(port, () => {
    console.log(`The scrapper running on ${process.env.SERVER || 'http://localhost'}:${port}`);
});
