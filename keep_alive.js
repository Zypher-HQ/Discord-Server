// 
// --- EXPRESS KEEP-ALIVE SERVER (v2.1) ---
// 
// Summary: Sets up a simple Express server to keep the Node process running.
// It features clean routing for /dashboard and /donation (no .html extension), 
// and a secure geolocation check endpoint.
// 

const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // For external API calls (Geolocation)

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const LOG_FILE_PATH = path.join(__dirname, 'bot.log');
const DASHBOARD_FILE_PATH = path.join(__dirname, 'dashboard.html');
const DONATION_FILE_PATH = path.join(__dirname, 'donation.htm'); // New file path
const ICON_PATH = path.join(__dirname, 'Discord-Server', 'data', 'logo_icon.png');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'super-secret-admin-key-12345';

// Middleware to check API Key for privileged routes
function checkApiKey(req, res, next) {
    const providedKey = req.query.key;
    if (providedKey && providedKey === ADMIN_API_KEY) {
        next();
    } else {
        res.status(401).send('Unauthorized. Missing or invalid API key.');
    }
}

// --- Route Definitions ---

// 1. Root Route: Redirection to /dashboard (Ensures clean URL start)
app.get('/', (req, res) => {
    // User goes to https://my_website.onrender.com and gets redirected to /dashboard
    res.redirect('/dashboard'); 
});

// 2. Dashboard Route (Serves dashboard.html without the .html extension)
app.get('/dashboard', (req, res) => {
    res.sendFile(DASHBOARD_FILE_PATH);
});

// 3. Donation Route (Serves donation.htm without the .html extension)
app.get('/donation', (req, res) => {
    res.sendFile(DONATION_FILE_PATH);
});

// 4. Health Check/Status Route
app.get('/status', (req, res) => {
    const status = {
        status: 'UP',
        uptime_seconds: process.uptime(),
        memory_usage_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        message: 'Bot is currently running and processing events.'
    };
    res.json(status);
});

// 5. Log Viewer Route (Requires API Key)
app.get('/logs', checkApiKey, (req, res) => {
    fs.readFile(LOG_FILE_PATH, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading log file:', err.message);
            return res.status(500).json({ error: 'Could not retrieve log file.' });
        }
        const logLines = data.split('\n').filter(line => line.trim() !== '');
        res.json({ logs: logLines.reverse() }); 
    });
});

// 6. Geolocation Check Endpoint (COMPLEXITY ADDED HERE)
app.get('/check-location', async (req, res) => {
    // Get the user's IP address from common proxy headers (like Render uses) or the socket.
    const ip = req.headers['x-forwarded-for']?.split(',').shift() || req.socket.remoteAddress;

    try {
        // Use ip-api.com to get location data
        const geoResponse = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`);
        
        if (geoResponse.data.status !== 'success') {
            return res.json({ allowed: false, country: 'UNKNOWN', message: 'Geolocation service failed or IP is reserved/invalid.' });
        }

        const countryCode = geoResponse.data.countryCode;
        const countryName = geoResponse.data.country;
        const isPhilippines = countryCode === 'PH'; // PH is the country code for Philippines

        res.json({ 
            allowed: isPhilippines, 
            countryCode: countryCode,
            countryName: countryName,
            message: isPhilippines ? 'Access granted.' : `Donation restricted to the Philippines (Detected: ${countryName}).`
        });

    } catch (error) {
        console.error('GEOLOCATION API ERROR:', error.message);
        // Fail safe: If external API fails, restrict access by default for security.
        res.status(200).json({ allowed: false, countryCode: 'API_ERROR', countryName: 'API_ERROR', message: 'Internal server error during location check. Access denied by default.' });
    }
});

// 7. Favicon Route (Directly serves the logo)
app.get('/favicon.ico', (req, res) => {
    // Check if the icon exists at the specified path
    if (fs.existsSync(ICON_PATH)) {
        res.sendFile(ICON_PATH);
    } else {
        // Fallback with a 204 No Content if the icon file cannot be found
        res.status(204).end();
    }
});


// --- Server Startup Function ---
function keepAlive() {
    app.listen(PORT, () => {
        console.log(`🟢 Keep-Alive Server online and listening on port ${PORT}`);
        console.log(`🌐 Clean URLs: /dashboard and /donation are active.`);
    });
}

// Export the startup function
module.exports = keepAlive;

