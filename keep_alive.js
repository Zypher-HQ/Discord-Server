// keep_alive.js
// ✅ Purpose: Keeps your Replit bot alive + displays real-time console logs on a small webpage.

const express = require("express");
const fs = require("fs");
const path = require("path");
const server = express();

const LOG_FILE = path.join(__dirname, "bot.log");

// Middleware to serve static HTML logs
server.get("/", (req, res) => {
  try {
    const logs = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, "utf8") : "No logs yet.";
    res.send(`
      <html>
        <head>
          <title>Discord Bot Console Logs</title>
          <style>
            body { font-family: monospace; background: #0e0e0e; color: #00ff90; padding: 20px; }
            h1 { color: #00ffaa; }
            pre { background: #111; padding: 15px; border-radius: 10px; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>🤖 Discord Bot Console Logs</h1>
          <pre>${logs}</pre>
          <p>Last updated: ${new Date().toLocaleString()}</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.send("⚠️ Failed to load logs.");
  }
});

// Start web server
function keepAlive() {
  server.listen(3000, () => {
    console.log("🌐 Keep-alive web dashboard running on port 3000");
  });
}

module.exports = keepAlive;
