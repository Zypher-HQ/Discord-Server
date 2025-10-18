// --- keep_alive.js ---
// Sets up the Express server, starts the web listener, and manages in-memory logs.

const express = require('express');
const app = express();
const path = require('path');

// --- Log Storage ---
const MAX_LOGS_IN_MEMORY = 100; // Keep the last 100 logs
const logBuffer = [];
let logIdCounter = 1;

// Store the original log function before override
const originalLog = console.log;

/**
 * Parses the structured log format from index.cjs and adds it to the buffer.
 */
console.log = (logLine) => {
    // 1. Log to the console (standard behavior)
    originalLog(logLine); 

    // 2. Attempt to parse and buffer for the dashboard
    try {
        const logMatch = logLine.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\[(\w+)\s*\] \[(\w+)\s*\] (.*)/);
        
        if (logMatch) {
             const [_, timestamp, level, module, messageAndMetadata] = logMatch;
             const message = messageAndMetadata.replace(/ \{.*\}/s, '').trim(); 
             
             const logEntry = {
                 id: logIdCounter++,
                 timestamp: new Date(timestamp).getTime(),
                 level: level.trim(),
                 module: module.trim(),
                 message: message
             };

             logBuffer.push(logEntry);

             if (logBuffer.length > MAX_LOGS_IN_MEMORY) {
                 logBuffer.shift(); 
             }
        }
    } catch (e) {
        logBuffer.push({
            id: logIdCounter++,
            timestamp: Date.now(),
            level: 'INFO',
            module: 'SYSTEM_ERR',
            message: logLine
        });
        if (logBuffer.length > MAX_LOGS_IN_MEMORY) logBuffer.shift();
    }
};

// Store the custom log function reference so index.cjs can call it directly
console._log = console.log;


// --- Server Setup (CRITICAL CHANGE HERE) ---

// Serve ALL static files (HTML, CSS, JS, etc.) from the 'public' directory
// Now, files in /public can be accessed directly (e.g., /public/dashboard.html becomes just /dashboard.html)
app.use(express.static(path.join(__dirname, 'public'))); 

app.listen(3000, () => {
    originalLog(`\n--- KEEP ALIVE SERVER ---`);
    originalLog(`Web server running on port 3000, serving static files from /public.`);
    originalLog(`--- /SERVER ---\n`);
});


/**
 * @returns {Array} The in-memory log entries for the dashboard API.
 */
function getLogList() {
    return logBuffer;
}

// Export app and the log list getter for use in index.cjs
module.exports = { app, getLogList };

