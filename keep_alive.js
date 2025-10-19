// --- keep_alive.js ---
// Sets up the Express server, starts the web listener, and manages in-memory logs.

const express = require('express');
const app = express();
const path = require('path');
const originalLog = console.log;

// --- Log Storage ---
const MAX_LOGS_IN_MEMORY = 100; // Keep the last 100 logs
const logBuffer = [];
let logIdCounter = 1;


/**
 * Parses the structured log format from index.cjs and adds it to the buffer.
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
                 timestamp: new Date(timestamp).getTime(),
                 level: level.trim(),
                 module: module.trim(),
                 message: message
             };

             logBuffer.push(logEntry);

             if (logBuffer.length > MAX_LOGS_IN_MEMORY) {
                 logBuffer.shift(); // Remove oldest log
             }
        }
    } catch (e) {
        // Fallback for logs that don't match the structure
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


// --- Server Setup (FIXED: Port Binding) ---

// Get the port from the hosting environment (e.g., Render) or default to 3000
const PORT = process.env.PORT || 3000;

// Serve ALL static files (HTML, CSS, JS, donation, etc.) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'))); 

// Start the server using the correct PORT
app.listen(PORT, () => {
    originalLog(`\n--- KEEP ALIVE SERVER ---`);
    originalLog(`Web server running on port ${PORT}, serving static files from /public.`);
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

