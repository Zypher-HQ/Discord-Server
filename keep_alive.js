// --- keep_alive.js ---
// This file sets up the Express server for the web service (keeps it alive),
// ensures correct port binding for cloud hosting, and implements the in-memory
// structured logging system used by the dashboard.

const express = require('express');
const app = express();
const path = require('path');
const originalLog = console.log;

// --- Log Storage: In-memory buffer ---
const MAX_LOGS_IN_MEMORY = 150; // Keep the last 150 logs
const logBuffer = [];
let logIdCounter = 1;


/**
 * OVERRIDES console.log. This function now handles standard console output 
 * AND buffers the logs for the dashboard API.
 */
console.log = (logLine) => {
    // 1. Log to the console (standard behavior)
    originalLog(logLine); 

    // 2. Attempt to parse and buffer for the dashboard
    try {
        // Regex to capture the structured log: [TIMESTAMP][LEVEL][MODULE] MESSAGE
        const logMatch = logLine.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\[(\w+)\s*\] \[(\w+)\s*\] (.*)/);
        
        if (logMatch) {
             const [_, timestamp, level, module, messageAndMetadata] = logMatch;
             // Remove potential trailing metadata object { ... } from the message
             const message = messageAndMetadata.replace(/ \{.*\}/s, '').trim(); 
             
             const logEntry = {
                 id: logIdCounter++,
                 timestamp: new Date(timestamp).getTime(), // Unix timestamp for easy sorting/display
                 level: level.trim(),
                 module: module.trim(),
                 message: message
             };

             logBuffer.push(logEntry);

             if (logBuffer.length > MAX_LOGS_IN_MEMORY) {
                 logBuffer.shift(); // Remove oldest log to prevent memory overflow
             }
        } else {
             // Capture non-structured log lines (e.g., startup messages from Express/Node)
             logBuffer.push({
                id: logIdCounter++,
                timestamp: Date.now(),
                level: 'RAW',
                module: 'SYSTEM_RAW',
                message: logLine
            });
            if (logBuffer.length > MAX_LOGS_IN_MEMORY) logBuffer.shift();
        }
    } catch (e) {
        // Fallback for unexpected log errors
        logBuffer.push({
            id: logIdCounter++,
            timestamp: Date.now(),
            level: 'ERROR',
            module: 'LOG_ERR',
            message: 'Failed to process log line: ' + logLine
        });
        if (logBuffer.length > MAX_LOGS_IN_MEMORY) logBuffer.shift();
    }
};

// Expose the custom log function reference so index.cjs can call it directly
console._log = console.log;


// --- Server Setup (FIXED: Port Binding) ---

// CRITICAL FIX: Use the port provided by the hosting environment or default to 3000
const PORT = process.env.PORT || 3000;

// Serve ALL static files (e.g., dashboard.html) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'))); 

// Start the server using the correct PORT
app.listen(PORT, () => {
    originalLog(`\n--- KEEP ALIVE SERVER STATUS ---`);
    originalLog(`Web service successfully bound to Port ${PORT}.`);
    originalLog(`Serving dashboard files from /public.`);
    originalLog(`--- /SERVER STATUS ---\n`);
});


/**
 * @returns {Array} The in-memory log entries for the dashboard API.
 */
function getLogList() {
    return logBuffer;
}

// Export the Express app instance and the log getter for index.cjs
module.exports = { app, getLogList };

