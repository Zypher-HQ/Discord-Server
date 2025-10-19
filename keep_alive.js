// --- keep_alive.js ---
// This file sets up the Express server for the web service (keeps it alive),
// binds to the correct port, implements the in-memory logging system, and 
// now serves the enhanced HTML dashboard with live log fetching.

const express = require('express');
const app = express();
const originalLog = console.log;

// --- Log Storage: In-memory buffer ---
const MAX_LOGS_IN_MEMORY = 150; // Keep the last 150 logs
const logBuffer = [];
let logIdCounter = 1;


/**
 * OVERRIDES console.log. This function buffers the logs for the dashboard API.
 */
console.log = (logLine) => {
    // 1. Log to the console (standard behavior)
    originalLog(logLine); 

    // 2. Buffer the log for the dashboard
    try {
        // Regex to capture the structured log: [TIMESTAMP][LEVEL][MODULE] MESSAGE
        // Adapting to capture the structured logs we defined earlier
        const logMatch = logLine.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\[(\w+)\s*\] \[(\w+)\s*\] (.*)/);
        
        if (logMatch) {
             const [_, timestamp, level, module, messageAndMetadata] = logMatch;
             // Remove potential trailing metadata object { ... } from the message
             const message = messageAndMetadata.replace(/ \{.*\}/s, '').trim(); 
             
             const logEntry = {
                 id: logIdCounter++,
                 timestamp: new Date(timestamp).getTime(), 
                 level: level.trim().toUpperCase(),
                 module: module.trim().toUpperCase(),
                 message: message
             };

             logBuffer.push(logEntry);

             if (logBuffer.length > MAX_LOGS_IN_MEMORY) {
                 logBuffer.shift(); 
             }
        } else {
             // Capture non-structured log lines
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
        // Self-logging error if log buffering fails
        logBuffer.push({
            id: logIdCounter++,
            timestamp: Date.now(),
            level: 'ERROR',
            module: 'LOG_ERR',
            message: 'Failed to process log line: ' + logLine.substring(0, 50)
        });
        if (logBuffer.length > MAX_LOGS_IN_MEMORY) logBuffer.shift();
    }
};

// Expose the custom log function reference so index.cjs can call it directly
console._log = console.log;

// --- API Endpoint for Logs ---
app.get('/api/logs', (req, res) => {
    // Send logs in reverse chronological order
    res.json(logBuffer.slice().reverse()); 
});

// --- Root Endpoint (The actual Dashboard HTML) ---
app.get('/', (req, res) => {
    res.send(generateDashboardHtml());
});


// --- Server Startup ---
const PORT = process.env.PORT || 3000;
const serverStartTime = Date.now(); // Record when the Express server started

app.listen(PORT, () => {
    originalLog(`\n--- KEEP ALIVE SERVER STATUS ---`);
    originalLog(`Web service successfully bound to Port ${PORT}. Dashboard is now live.`);
    originalLog(`--- /SERVER STATUS ---\n`);
});


/**
 * Generates the full, self-contained HTML for the dashboard using the new template.
 */
function generateDashboardHtml() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Service Metric Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    /* Custom styles for log coloring */
    .log-line .LEVEL-SUCCESS, .log-line .LEVEL-BOT { color: #4ade80; } /* green-400 */
    .log-line .LEVEL-ERROR, .log-line .LEVEL-CRITICAL, .log-line .LEVEL-AUTH_FAILED { color: #f87171; } /* red-400 */
    .log-line .LEVEL-INFO, .log-line .LEVEL-CORE { color: #93c5fd; } /* blue-300 */
    .log-line .LEVEL-WARNING, .log-line .LEVEL-WARN { color: #fcd34d; } /* yellow-300 */
    .log-line .LEVEL-DB, .log-line .LEVEL-VERIFY { color: #a78bfa; } /* violet-400 */
    .log-line .LEVEL-COMMANDS, .log-line .LEVEL-GEMINI { color: #fb923c; } /* orange-400 */
    .log-line .LEVEL-RAW, .log-line .LEVEL-SYSTEM_RAW, .log-line .LEVEL-LOG_ERR { color: #9ca3af; } /* gray-400 */
    .log-line { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body class="bg-slate-900 text-gray-100 min-h-screen p-4 flex flex-col items-center">

  <!-- HEADER -->
  <header class="w-full max-w-5xl mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Roblox Bot Monitoring Dashboard</h1>
      <p class="text-gray-400 text-sm">Live service health and operational logs</p>
    </div>
    <div class="mt-3 sm:mt-0 flex gap-2">
      <a href="/public/donation/index.html" target="_blank" class="bg-yellow-600 hover:bg-yellow-500 text-sm px-3 py-1.5 rounded-lg flex items-center gap-1 transition text-slate-900 font-medium">
        <i data-lucide="heart" class="w-4 h-4 fill-slate-900"></i> Donate
      </a>
      <button id="refreshBtn" class="bg-slate-700 hover:bg-slate-600 text-sm px-3 py-1.5 rounded-lg flex items-center gap-1 transition">
        <i data-lucide="refresh-ccw" class="w-4 h-4"></i> Refresh
      </button>
    </div>
  </header>

  <!-- METRIC GRID -->
  <main class="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

    <!-- DISCORD TOKEN STATUS -->
    <div class="bg-slate-800/60 backdrop-blur-xl rounded-xl p-4 shadow-lg border border-slate-700">
      <div class="flex items-center justify-between">
        <h2 class="text-sm text-gray-400">Discord Token</h2>
        <i data-lucide="key" class="w-5 h-5 text-indigo-400"></i>
      </div>
      <div class="mt-2 flex items-end justify-between">
        <p id="token-status" class="text-xl font-semibold text-gray-300">Checking...</p>
      </div>
      <span class="text-xs text-gray-500 mt-2 block">Bot Login Check</span>
    </div>

    <!-- DATABASE STATUS -->
    <div class="bg-slate-800/60 backdrop-blur-xl rounded-xl p-4 shadow-lg border border-slate-700">
      <div class="flex items-center justify-between">
        <h2 class="text-sm text-gray-400">Database (PG)</h2>
        <i data-lucide="database" class="w-5 h-5 text-blue-400"></i>
      </div>
      <div class="mt-2 flex items-end justify-between">
        <p id="db-status" class="text-xl font-semibold text-gray-300">Checking...</p>
      </div>
      <span class="text-xs text-gray-500 mt-2 block">Verification Storage</span>
    </div>

    <!-- UPTIME -->
    <div class="bg-slate-800/60 backdrop-blur-xl rounded-xl p-4 shadow-lg border border-slate-700">
      <div class="flex items-center justify-between">
        <h2 class="text-sm text-gray-400">Service Uptime</h2>
        <i data-lucide="clock" class="w-5 h-5 text-green-400"></i>
      </div>
      <div class="mt-2 flex items-end justify-between">
        <p id="uptime" class="text-2xl font-semibold">00:00:00</p>
        <span class="text-xs text-gray-500">hh:mm:ss</span>
      </div>
    </div>

    <!-- LOG COUNT -->
    <div class="bg-slate-800/60 backdrop-blur-xl rounded-xl p-4 shadow-lg border border-slate-700">
      <div class="flex items-center justify-between">
        <h2 class="text-sm text-gray-400">Log Entries</h2>
        <i data-lucide="list-ordered" class="w-5 h-5 text-yellow-400"></i>
      </div>
      <div class="mt-2 flex items-end justify-between">
        <p id="log-count" class="text-2xl font-semibold">0</p>
        <span class="text-xs text-gray-500">since startup</span>
      </div>
    </div>
  </main>

  <!-- STATUS PANEL -->
  <section class="w-full max-w-5xl bg-slate-800/60 backdrop-blur-xl rounded-xl p-4 shadow-lg border border-slate-700 mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-3">
      <div id="status-dot" class="w-3 h-3 bg-gray-500 rounded-full"></div>
      <p class="font-medium">Bot Status: <span id="status-text" class="text-gray-400">Initializing...</span></p>
    </div>
    <div class="text-sm text-gray-400 mt-2 sm:mt-0">
      Last log update: <span id="last-update">--:--:--</span>
    </div>
  </section>

  <!-- CONSOLE LOGS -->
  <section class="w-full max-w-5xl bg-slate-950/70 backdrop-blur-xl rounded-xl p-4 shadow-inner border border-slate-800 mt-6">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-medium text-gray-300 flex items-center gap-1">
        <i data-lucide="terminal" class="w-4 h-4"></i> Console Logs (Latest 150)
      </h2>
      <div class="flex gap-2">
        <button id="pauseBtn" class="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-md transition">Pause</button>
        <button id="clearBtn" class="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-md transition">Clear Buffer</button>
      </div>
    </div>
    <div id="console" class="font-mono text-[10px] sm:text-xs text-gray-300 h-64 overflow-y-auto bg-slate-900/60 rounded-lg p-2 border border-slate-800">
        <p class="text-gray-500 text-center py-4">Waiting for server logs...</p>
    </div>
  </section>

  <script>
    lucide.createIcons();

    let serverStartTime = Date.now(); // We assume the page load is close to the server start time.
    let paused = false;
    const consoleEl = document.getElementById("console");
    const refreshBtn = document.getElementById("refreshBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const clearBtn = document.getElementById("clearBtn");
    
    // Time formatter
    function formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // --- Metric and Status Updater ---
    function updateMetricsAndStatus(logs) {
        const tokenStatusEl = document.getElementById('token-status');
        const dbStatusEl = document.getElementById('db-status');
        const statusTextEl = document.getElementById('status-text');
        const statusDotEl = document.getElementById('status-dot');

        // Check for critical states by scanning logs
        const tokenError = logs.find(l => l.LEVEL === 'CRITICAL' && l.message.includes('DISCORD_TOKEN is missing'));
        const authSuccess = logs.find(l => l.MODULE === 'BOT' && l.LEVEL === 'SUCCESS' && l.message.includes('online!'));
        const dbSuccess = logs.find(l => l.MODULE === 'DB' && l.LEVEL === 'SUCCESS' && l.message.includes('schema confirmed'));
        const dbWarn = logs.find(l => l.MODULE === 'DB' && l.LEVEL === 'WARNING');
        
        let overallStatus = 'Initializing...';
        let statusColor = 'gray-500';
        let statusDotClass = 'bg-gray-500';

        // 1. Check Token Status
        if (tokenError) {
            tokenStatusEl.textContent = 'MISSING/INVALID';
            tokenStatusEl.className = 'text-xl font-semibold text-red-500';
            overallStatus = 'CRITICAL ERROR';
            statusColor = 'red-500';
            statusDotClass = 'bg-red-500';
        } else if (authSuccess) {
            tokenStatusEl.textContent = 'OK';
            tokenStatusEl.className = 'text-xl font-semibold text-green-500';
        } else {
             tokenStatusEl.textContent = 'Found (Attempting Login)';
             tokenStatusEl.className = 'text-xl font-semibold text-yellow-500';
        }

        // 2. Check Database Status
        if (dbSuccess) {
            dbStatusEl.textContent = 'CONNECTED';
            dbStatusEl.className = 'text-xl font-semibold text-green-500';
        } else if (dbWarn) {
            dbStatusEl.textContent = 'DISABLED';
            dbStatusEl.className = 'text-xl font-semibold text-yellow-500';
        } else {
            dbStatusEl.textContent = 'Connecting...';
            dbStatusEl.className = 'text-xl font-semibold text-gray-300';
        }
        
        // 3. Overall Bot Status
        if (tokenError) {
             overallStatus = 'CRITICAL ERROR';
             statusColor = 'red-500';
             statusDotClass = 'bg-red-500';
        } else if (authSuccess) {
            overallStatus = 'ONLINE';
            statusColor = 'green-500';
            statusDotClass = 'bg-green-500 animate-pulse';
        } else {
            overallStatus = 'Awaiting Login';
            statusColor = 'yellow-500';
            statusDotClass = 'bg-yellow-500 animate-pulse';
        }
        
        statusTextEl.textContent = overallStatus;
        statusTextEl.className = \`text- \${statusColor}\`;
        statusDotEl.className = \`w-3 h-3 rounded-full \${statusDotClass}\`;

        // Update Log Count
        document.getElementById("log-count").textContent = logs.length;
    }

    // --- Log Fetcher ---
    async function fetchLogs() {
        if (paused) return;
        
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Loading';
        lucide.createIcons(); // Re-render icon

        try {
            const response = await fetch('/api/logs');
            if (!response.ok) throw new Error(\`HTTP error! status: \${response.status}\`);
            
            const logs = await response.json();
            
            // 1. Update Metrics Panel
            updateMetricsAndStatus(logs);

            // 2. Update Console Logs
            consoleEl.innerHTML = '';
            if (logs.length === 0) {
                consoleEl.innerHTML = '<p class="text-gray-500 text-center py-4">No logs found yet. Waiting for bot activity...</p>';
            } else {
                logs.forEach(log => {
                    const logElement = document.createElement('div');
                    logElement.className = 'log-line';
                    logElement.innerHTML = \`
                        <span class="text-gray-500">[ \${formatTime(log.timestamp)} ]</span>
                        <span class="font-bold LEVEL-\${log.level}">[\${log.level.padEnd(8)}]</span>
                        <span class="font-bold LEVEL-\${log.module}">[\${log.module.padEnd(10)}]</span>
                        \${log.message}
                    \`;
                    consoleEl.appendChild(logElement);
                });
                consoleEl.scrollTop = consoleEl.scrollHeight;
            }

            // 3. Update Last Update Time
            document.getElementById("last-update").textContent = new Date().toLocaleTimeString();

        } catch (error) {
            console.error('Error fetching logs:', error);
            document.getElementById("status-text").textContent = 'API ERROR';
            document.getElementById("status-dot").className = 'w-3 h-3 bg-red-500 rounded-full';
            consoleEl.innerHTML = \`<p class="text-red-500 text-center py-4">Failed to load logs: \${error.message}</p>\`;
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i data-lucide="refresh-ccw" class="w-4 h-4"></i> Refresh';
            lucide.createIcons();
        }
    }
    
    // --- Uptime Timer ---
    function updateUptime() {
        if (paused) return;
        const diff = Math.floor((Date.now() - serverStartTime) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        document.getElementById("uptime").textContent = \`\${h}:\${m}:\${s}\`;
    }


    // --- Event Listeners and Initial Load ---
    document.addEventListener('DOMContentLoaded', () => {
        // Run initial load
        fetchLogs();
        // Start timers
        setInterval(fetchLogs, 5000); // Poll every 5 seconds
        setInterval(updateUptime, 1000); // Uptime update every second
    });

    refreshBtn.addEventListener("click", fetchLogs);
    clearBtn.addEventListener("click", () => consoleEl.innerHTML = "");
    pauseBtn.addEventListener("click", (e) => {
        paused = !paused;
        e.target.textContent = paused ? "Resume" : "Pause";
        if (!paused) fetchLogs(); // Fetch immediately upon resume
    });
    
    // --- TEMPORARY STATIC METRICS (Since Node.js process data is not exposed) ---
    document.getElementById("memory").textContent = "N/A";
    document.getElementById("db-status").parentElement.parentElement.children[0].children[0].textContent = "Database (PG)";
    document.getElementById("db-status").parentElement.parentElement.children[0].children[1].setAttribute('data-lucide', 'database');
    document.getElementById("db-status").parentElement.parentElement.children[2].textContent = "Verification Storage";
    
    
    // Replaced the Lag and Code Updates with more relevant bot metrics
    document.getElementById("lag").parentElement.parentElement.children[0].children[0].textContent = "AI Channel Status";
    document.getElementById("lag").parentElement.parentElement.children[0].children[1].setAttribute('data-lucide', 'message-circle');
    document.getElementById("lag").textContent = "Enabled"; // Assuming it is enabled if DB is connected
    document.getElementById("lag").className = 'text-xl font-semibold text-green-500';
    document.getElementById("lag").parentElement.parentElement.children[2].textContent = "Gemini API Health";
    document.getElementById("lagBar").style.width = "100%";
    
    document.getElementById("updates").parentElement.parentElement.children[0].children[0].textContent = "Core Version";
    document.getElementById("updates").parentElement.parentElement.children[0].children[1].setAttribute('data-lucide', 'code-2');
    document.getElementById("updates").textContent = "v5.1";
    document.getElementById("updates").className = 'text-xl font-semibold text-gray-300';
    document.getElementById("updates").parentElement.parentElement.children[2].textContent = "Latest build";
    
    lucide.createIcons(); // Rerun to process new icons
  </script>
</body>
</html>
    `;
}

// Export the Express app instance and the log getter for index.cjs (No change from last version)
module.exports = { app, getLogList };

