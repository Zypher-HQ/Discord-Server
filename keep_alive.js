// --- REQUIRED MODULES ---
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
// Port for the web server (Standard for hosting services like Render/Replit)
const PORT = 3000; 

// Log file path, matching the setup in index.cjs
const LOG_FILE_PATH = path.join(__dirname, 'bot.log'); 

// Directory for serving HTML dashboard and donation pages
const STATIC_DIR = path.join(__dirname, 'public'); 

// Initialize the Express application
const app = express();

/**
 * Starts the Express web server responsible for uptime pings and the dashboard.
 * This function should be called once in your main bot file (e.g., index.cjs).
 */
function keepAlive() {
    // 1. Serve Static Files
    // Middleware to serve all files from the 'public' directory.
    // This allows access to /dashboard.html, /donation/index.html, etc.
    app.use(express.static(STATIC_DIR));

    // 2. Root & Dashboard Endpoints
    // Redirects the base URL to the main dashboard page for convenience.
    app.get(['/', '/dashboard'], (req, res) => { // <-- CHANGED ROUTE: Now handles both / and /dashboard
        // Ensure this points to the correct entry HTML file
        res.sendFile(path.join(STATIC_DIR, 'dashboard.html'));
    });

    // 3. API Endpoint for Bot Console Logs
    // This is called by the dashboard's JavaScript to fetch live logs.
    app.get('/api/logs', (req, res) => {
        // Asynchronously read the log file to prevent blocking the event loop
        fs.readFile(LOG_FILE_PATH, 'utf8', (err, data) => {
            if (err) {
                // Handle case where the log file doesn't exist (critical error)
                if (err.code === 'ENOENT') {
                    console.error("[KEEP_ALIVE] CRITICAL: Log file not found at:", LOG_FILE_PATH);
                    return res.status(200).json({ 
                        status: 'ERROR', 
                        logs: [
                            `[CRITICAL] Log file (bot.log) not found. Path: ${LOG_FILE_PATH}`
                        ] 
                    });
                }
                
                // Handle general file reading errors
                console.error("[KEEP_ALIVE] Error reading log file:", err.message);
                return res.status(500).json({ 
                    status: 'ERROR', 
                    logs: [
                        `[ERROR] Server failed to read logs: ${err.message}`
                    ] 
                });
            }
            
            // Split the file content into an array of log lines
            const logsArray = data.split('\n').filter(line => line.trim() !== '');

            // Return the processed logs as JSON
            res.json({
                status: 'OK',
                logs: logsArray
            });
        });
    });

    // 4. Server Start
    const server = app.listen(PORT, () => {
        console.log(`[KEEP_ALIVE] Web server operational on port ${PORT}`);
    });

    // 5. Robust Server Error Handling
    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.error(`[CRITICAL] Port ${PORT} is already in use. Cannot start web server. Is another process running?`);
        } else {
            console.error(`[CRITICAL] Web server failed with unhandled error: ${e.message}`);
        }
        // Exit the process if the server cannot start, as keep-alive functionality is broken.
        process.exit(1);
    });
}

// Export the function so it can be required and executed by index.cjs
module.exports = keepAlive;

