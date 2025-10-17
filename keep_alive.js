// keep_alive.js
// ✅ Purpose: Keeps Replit bot online 24/7 using a tiny web server pinged by UptimeRobot.

const express = require("express");
const server = express();

// Optional landing page text
server.all("/", (req, res) => {
  res.send("✅ Bot is alive and running!");
});

// Start server on port 3000
function keepAlive() {
  server.listen(3000, () => {
    console.log("🌐 Keep-alive web server running on port 3000");
  });
}

module.exports = keepAlive;
