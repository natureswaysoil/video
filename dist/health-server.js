"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStatus = updateStatus;
exports.incrementSuccessfulPost = incrementSuccessfulPost;
exports.incrementFailedPost = incrementFailedPost;
exports.addError = addError;
const http_1 = __importDefault(require("http"));
const PORT = parseInt(process.env.PORT || '8080', 10);
let lastRunStatus = {
    timestamp: new Date().toISOString(),
    status: 'starting',
    rowsProcessed: 0,
    successfulPosts: 0,
    failedPosts: 0,
    errors: []
};
const server = http_1.default.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health' && req.method === 'GET') {
        res.statusCode = 200;
        res.end(JSON.stringify({
            status: 'healthy',
            service: 'video-automation',
            version: '2.0.0',
            uptime: Math.floor(process.uptime()),
            uptimeFormatted: formatUptime(process.uptime()),
            timestamp: new Date().toISOString(),
            lastRun: lastRunStatus,
            env: {
                runOnce: process.env.RUN_ONCE === 'true',
                dryRun: process.env.DRY_RUN_LOG_ONLY === 'true',
                pollInterval: process.env.POLL_INTERVAL_MS || '60000'
            }
        }, null, 2));
    }
    else if (req.url === '/status' && req.method === 'GET') {
        res.statusCode = 200;
        res.end(JSON.stringify(lastRunStatus, null, 2));
    }
    else if (req.url === '/' && req.method === 'GET') {
        res.statusCode = 200;
        res.end(JSON.stringify({
            service: 'video-automation',
            status: 'running',
            endpoints: {
                health: '/health',
                status: '/status'
            }
        }, null, 2));
    }
    else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});
server.listen(PORT, () => {
    console.log(`🏥 Health check server running on port ${PORT}`);
    console.log(`   GET http://localhost:${PORT}/health`);
    console.log(`   GET http://localhost:${PORT}/status`);
});
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const parts = [];
    if (days > 0)
        parts.push(`${days}d`);
    if (hours > 0)
        parts.push(`${hours}h`);
    if (minutes > 0)
        parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
}
function updateStatus(update) {
    lastRunStatus = {
        ...lastRunStatus,
        ...update,
        timestamp: new Date().toISOString()
    };
}
function incrementSuccessfulPost() {
    lastRunStatus.successfulPosts++;
}
function incrementFailedPost() {
    lastRunStatus.failedPosts++;
}
function addError(error) {
    lastRunStatus.errors.push(error);
    // Keep only last 20 errors
    if (lastRunStatus.errors.length > 20) {
        lastRunStatus.errors = lastRunStatus.errors.slice(-20);
    }
}
