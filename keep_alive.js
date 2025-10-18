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
 * Pattern: [2025-10-18T23:01:00.000Z][INFO    ] [GENERAL     ] Message { "metadata": "here" }
 */
console.log = (logLine) => {
    // 1. Log to the console (standard behavior)
    originalLog(logLine); 

    // 2. Attempt to parse and buffer for the dashboard
    try {
        // Regex to capture the timestamp, level, source (module), and the rest of the message
        const logMatch = logLine.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\[(\w+)\s*\] \[(\w+)\s*\] (.*)/);
        
        if (logMatch) {
             const [_, timestamp, level, module, messageAndMetadata] = logMatch;
             
             // The structured message only needs the first part of the log line
             const message = messageAndMetadata.replace(/ \{.*\}/s, '').trim(); 
             
             const logEntry = {
                 id: logIdCounter++,
                 timestamp: new Date(timestamp).getTime(), // Unix timestamp for JS
                 level: level.trim(),
                 module: module.trim(),
                 message: message
             };

             logBuffer.push(logEntry);

             if (logBuffer.length > MAX_LOGS_IN_MEMORY) {
                 logBuffer.shift(); // Remove the oldest log
             }
        }
    } catch (e) {
        // If parsing fails, just keep the standard log in the buffer
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


// --- Server Setup ---

// Serve static files (dashboard.html, dashboard_script.js) from the root directory
app.use(express.static(path.join(__dirname))); 

app.listen(3000, () => {
    originalLog(`\n--- KEEP ALIVE SERVER ---`);
    originalLog(`Web server running on port 3000 for dashboard.`);
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

