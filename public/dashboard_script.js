/**
 * dashboard_script.js
 * * Handles all frontend logic:
 * 1. API interaction (fetching metrics and logs from the server).
 * 2. Metric updates (Uptime, Memory, Latency, Status, DB Status).
 * 3. Log rendering and consolidation.
 * 4. Chart drawing (using Chart.js).
 */

// --- Configuration ---
const API_BASE_URL = '/api'; 
const REFRESH_INTERVAL_MS = 3000;
const MAX_CHART_POINTS = 60; // 3 minutes of history at 3-second refresh

// --- DOM Elements ---
const logOutput = document.getElementById('log-output');
const refreshButton = document.getElementById('refresh-button');
const scaleButton = document.getElementById('scale-button');
const modalViewer = document.getElementById('modal-log-viewer');
const closeModalButton = document.getElementById('close-modal-button');
const modalLogContent = document.getElementById('modal-log-content');

const statusText = document.getElementById('status-text');
const uptimeText = document.getElementById('uptime-text');
const memoryText = document.getElementById('memory-text');
const latencyText = document.getElementById('latency-text');
const dbStatusText = document.getElementById('db-status-text');

// --- Global State ---
let isFetching = false;
let lastLogId = 0; // Tracks the ID of the last processed log entry
let metricsChart;

let systemState = {
    // Chart Data
    chartLabels: [],
    chartLatencyData: [],
    chartMemoryData: []
};


// --- Utility Functions ---

/**
 * Formats seconds into HH:MM:SS.
 */
function formatUptime(seconds) {
    if (!seconds || seconds < 0) return '--:--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Cleans, colors, and formats a structured log object into styled HTML.
 */
function formatLogLine(logEntry) {
    const lineElement = document.createElement('div');
    lineElement.classList.add('log-line');

    const id = logEntry.id || 'X'; 
    const dateObj = new Date(logEntry.timestamp);
    const time = dateObj.toTimeString().split(' ')[0] + '.' + dateObj.getMilliseconds().toString().padStart(3, '0');
    
    const level = (logEntry.level || 'INFO').toUpperCase();
    const module = (logEntry.module || 'SYSTEM').toUpperCase();

    // Template for structured log line
    lineElement.innerHTML = `
        <span class="log-timestamp">[ ${String(id).padStart(4, '0')} | ${time} ]</span>
        <span class="log-module text-sm">[${module.padEnd(12, ' ')}]</span>
        <span class="LEVEL_${level} flex-grow">${level.padEnd(8, ' ')} ${logEntry.message}</span>
    `;

    return lineElement;
}


/**
 * Initializes the Chart.js line chart for metrics.
 */
function initChart() {
    const ctx = document.getElementById('metrics-chart')?.getContext('2d');
    if (!ctx) return;
    
    metricsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: systemState.chartLabels,
            datasets: [{
                label: 'Latency (ms)',
                data: systemState.chartLatencyData,
                borderColor: 'rgba(255, 0, 255, 1)', // Magenta
                backgroundColor: 'rgba(255, 0, 255, 0.1)',
                fill: false,
                tension: 0.2,
                pointRadius: 2,
                yAxisID: 'yLatency',
            }, {
                label: 'Bot Memory (MB)',
                data: systemState.chartMemoryData,
                borderColor: 'rgba(0, 255, 255, 1)', // Cyan
                backgroundColor: 'rgba(0, 255, 255, 0.1)',
                fill: true,
                tension: 0.2,
                pointRadius: 2,
                yAxisID: 'yMemory',
            }]
        },
        options: {
            animation: { duration: 0 },
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    display: false,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                yLatency: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Latency (ms)', color: 'rgba(255, 0, 255, 1)' },
                    grid: { color: 'rgba(255, 255, 255, 0.2)' },
                    ticks: { color: 'rgba(255, 0, 255, 1)' }
                },
                yMemory: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Bot Memory (MB)', color: 'rgba(0, 255, 255, 1)' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: 'rgba(0, 255, 255, 1)' }
                }
            },
            plugins: {
                legend: { labels: { color: 'white' } },
                tooltip: {
                    mode: 'index', intersect: false, 
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    borderColor: 'rgba(0, 255, 255, 1)',
                    borderWidth: 1,
                    titleColor: 'rgba(0, 255, 255, 1)',
                    bodyColor: 'white'
                }
            }
        }
    });
}


/**
 * Fetches data from the backend API with exponential backoff.
 */
async function fetchData() {
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
        try {
            const response = await fetch(`${API_BASE_URL}/status`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            retries++;
            if (retries >= maxRetries) {
                throw new Error(`Failed to fetch status after ${maxRetries} attempts: ${error.message}`);
            }
            const delay = Math.pow(2, retries) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Updates metrics on the dashboard.
 */
function updateMetrics(metrics) {
    // 1. Update Text Metrics
    uptimeText.textContent = formatUptime(metrics.uptime);
    memoryText.textContent = `${metrics.process_memory.toFixed(2)}`; // Updated property name
    latencyText.textContent = `${metrics.latency}`;
    dbStatusText.textContent = metrics.db_status || 'UNKNOWN';

    // 2. Status coloring logic (System Status)
    statusText.classList.remove('text-green-400', 'text-yellow-500', 'text-red-400');
    if (metrics.is_online && metrics.latency < 100) {
        statusText.classList.add('text-green-400');
        statusText.textContent = 'ONLINE';
    } else if (metrics.is_online && metrics.latency >= 100) {
        statusText.classList.add('text-yellow-500');
        statusText.textContent = 'DEGRADED';
    } else {
        statusText.classList.add('text-red-400');
        statusText.textContent = 'OFFLINE';
    }
    
    // 3. Status coloring logic (DB Status)
    dbStatusText.classList.remove('text-green-400', 'text-red-400');
    if (metrics.db_status === 'CONNECTED') {
        dbStatusText.classList.add('text-green-400');
    } else {
        dbStatusText.classList.add('text-red-400');
    }
    
    // 4. Latency coloring logic
    latencyText.classList.remove('text-green-400', 'text-yellow-500', 'text-red-400');
    if (metrics.latency < 80) {
        latencyText.classList.add('text-green-400');
    } else if (metrics.latency < 200) {
        latencyText.classList.add('text-yellow-500');
    } else {
        latencyText.classList.add('text-red-400');
    }

    // 5. Update Chart Data
    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    systemState.chartLabels.push(timeLabel);
    systemState.chartLatencyData.push(metrics.latency);
    systemState.chartMemoryData.push(metrics.process_memory);
    
    // Limit chart data points
    if (systemState.chartLabels.length > MAX_CHART_POINTS) {
        systemState.chartLabels.shift();
        systemState.chartLatencyData.shift();
        systemState.chartMemoryData.shift();
    }
    
    if (metricsChart) {
        metricsChart.update();
    }
}

/**
 * Updates the log stream display by appending *only* new logs.
 */
function updateLogs(allLogs) {
    if (!Array.isArray(allLogs) || !logOutput) return;

    // Filter for new logs based on the highest ID seen so far
    // This finds the highest ID currently in the log buffer (which might have wrapped)
    let currentMaxId = allLogs.reduce((max, log) => Math.max(max, log.id), 0); 
    
    // If the buffer wrapped, we should redraw everything, but for simplicity, we focus on new additions
    const newLogs = allLogs.filter(log => log.id > lastLogId);

    if (logOutput.children.length === 0 && allLogs.length === 0) {
        // Show "Awaiting" message if no logs at all
        const initialMessage = document.createElement('div');
        initialMessage.classList.add('text-gray-500', 'text-sm');
        initialMessage.textContent = 'Awaiting first API response...';
        logOutput.appendChild(initialMessage);
        return;
    }
    
    // Remove the initial awaiting message if logs are coming in
    if (logOutput.firstElementChild && logOutput.firstElementChild.textContent.includes('Awaiting first API response')) {
        logOutput.innerHTML = '';
    }

    // Append new logs to the display
    newLogs.forEach(log => {
        const logElement = formatLogLine(log);
        logOutput.appendChild(logElement);
    });

    // Update the last seen ID only if new logs were actually processed
    if (newLogs.length > 0) {
        lastLogId = currentMaxId;
    }

    // Auto-scroll logic (scroll to bottom)
    logOutput.scrollTop = logOutput.scrollHeight;
}


/**
 * Main function to fetch data and refresh the dashboard.
 */
async function updateDashboard() {
    if (isFetching) return;
    isFetching = true;

    if (refreshButton) {
        refreshButton.textContent = 'EXECUTING_REFRESH...';
        refreshButton.disabled = true;
    }

    try {
        const data = await fetchData();
        
        // The API returns: { metrics: {...}, logs: [...] }
        updateMetrics(data.metrics);
        updateLogs(data.logs);

    } catch (error) {
        console.error('SYSTEM ERROR: Dashboard failed to execute network call.', error);
        
        // Display critical failure on the dashboard
        statusText.textContent = 'CRITICAL';
        statusText.classList.remove('text-green-400', 'text-yellow-500', 'text-red-400');
        statusText.classList.add('text-red-400');

        const fetchError = `NETWORK INTERRUPTED. Cannot execute API call. (${error.message})`;
        
        // Add a CRITICAL log entry
        const errorLine = formatLogLine({ 
            id: 'X', 
            timestamp: Date.now(), 
            level: 'CRITICAL', 
            module: 'MONITOR_CORE', 
            message: fetchError 
        });

        const lastChild = logOutput.lastElementChild;
        // Only add the error line if it's not already the last thing there
        if (!lastChild || !lastChild.querySelector('.LEVEL_CRITICAL')) {
            logOutput.appendChild(errorLine);
            logOutput.scrollTop = logOutput.scrollHeight;
        }

    } finally {
        isFetching = false;
        if (refreshButton) {
            refreshButton.textContent = 'MANUAL REFRESH';
            refreshButton.disabled = false;
        }
    }
}


// --- Event Listeners and Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    updateDashboard(); // Initial load
    setInterval(updateDashboard, REFRESH_INTERVAL_MS);

    if (refreshButton) {
        refreshButton.addEventListener('click', updateDashboard);
    }

    // Modal view logic
    if (scaleButton) {
        scaleButton.addEventListener('click', () => {
            if (!modalViewer || !modalLogContent || !logOutput) return;
            
            // Redraw all logs from the main log display into the modal
            modalLogContent.innerHTML = '';
            const allLogs = logOutput.querySelectorAll('.log-line');
            allLogs.forEach(log => modalLogContent.appendChild(log.cloneNode(true)));
            
            modalViewer.classList.remove('hidden');
            modalLogContent.scrollTop = modalLogContent.scrollHeight;
        });
    }

    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            if (modalViewer) {
                modalViewer.classList.add('hidden');
            }
        });
    }
    
    // Allow closing modal by pressing ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modalViewer.classList.contains('hidden')) {
            modalViewer.classList.add('hidden');
        }
    });
});

          
