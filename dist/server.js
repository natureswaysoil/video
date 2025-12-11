"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const PORT = parseInt(process.env.PORT || '8080', 10);
let server = null;
// Status tracking (shared with health-server pattern)
let lastRunStatus = {
    timestamp: new Date().toISOString(),
    status: 'starting',
    rowsProcessed: 0,
    successfulPosts: 0,
    failedPosts: 0,
    errors: []
};
// Request handler for the HTTP server
async function handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/' && req.method === 'GET') {
        res.statusCode = 200;
        res.end(JSON.stringify({
            service: 'video-automation',
            status: 'running',
            version: '2.0.0',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            endpoints: {
                '/': 'Service info',
                '/healthz': 'Health check (Cloud Run)',
                '/readyz': 'Readiness check (Cloud Run)',
                '/health': 'Detailed health status',
                '/status': 'Processing status'
            }
        }, null, 2));
    }
    else if ((req.url === '/healthz' || req.url === '/readyz') && req.method === 'GET') {
        // Simple health check for Cloud Run
        res.statusCode = 200;
        res.end(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString()
        }));
    }
    else if (req.url === '/health' && req.method === 'GET') {
        // Detailed health endpoint
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
                pollInterval: process.env.POLL_INTERVAL_MS || '60000',
                nodeEnv: process.env.NODE_ENV
            }
        }, null, 2));
    }
    else if (req.url === '/status' && req.method === 'GET') {
        // Processing status endpoint
        res.statusCode = 200;
        res.end(JSON.stringify(lastRunStatus, null, 2));
    }
    else {
        // For all other paths, return 404
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    }
}
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
async function runCliOnce() {
    console.log('🚀 Running CLI logic once at startup (RUN_ONCE=true)...');
    lastRunStatus.status = 'running-cli';
    lastRunStatus.timestamp = new Date().toISOString();
    try {
        // Set flag to prevent CLI from starting its own health server
        process.env.SKIP_HEALTH_SERVER = 'true';
        // Import and run the main function from cli.ts
        const cliModule = await Promise.resolve().then(() => __importStar(require('./cli')));
        await cliModule.main();
        console.log('✅ CLI logic completed successfully');
        lastRunStatus.status = 'cli-completed';
        lastRunStatus.timestamp = new Date().toISOString();
    }
    catch (error) {
        console.error('❌ CLI logic failed:', error?.message || error);
        lastRunStatus.status = 'cli-failed';
        lastRunStatus.errors.push(`CLI: ${error?.message || String(error)}`);
        lastRunStatus.timestamp = new Date().toISOString();
        // Don't crash the server - log the error and continue
        // This allows the server to stay up for health checks even if processing fails
    }
}
async function startServer() {
    console.log('🌐 Starting HTTP server for Cloud Run...');
    console.log('Environment:', {
        PORT,
        RUN_ONCE: process.env.RUN_ONCE === 'true',
        DRY_RUN: process.env.DRY_RUN_LOG_ONLY === 'true',
        NODE_ENV: process.env.NODE_ENV
    });
    // Create the HTTP server
    server = http_1.default.createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
            console.error('Request handler error:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal server error' }));
        });
    });
    // Start listening
    await new Promise((resolve) => {
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Server listening on http://0.0.0.0:${PORT}`);
            console.log('📋 Available endpoints:');
            console.log(`   GET http://0.0.0.0:${PORT}/          - Service info`);
            console.log(`   GET http://0.0.0.0:${PORT}/healthz   - Health check`);
            console.log(`   GET http://0.0.0.0:${PORT}/readyz    - Readiness check`);
            console.log(`   GET http://0.0.0.0:${PORT}/health    - Detailed health`);
            console.log(`   GET http://0.0.0.0:${PORT}/status    - Processing status`);
            resolve();
        });
    });
    lastRunStatus.status = 'server-ready';
    lastRunStatus.timestamp = new Date().toISOString();
    // If RUN_ONCE is true, run the CLI logic once at startup
    // Do this AFTER the server is listening to ensure Cloud Run sees the service as healthy
    if (process.env.RUN_ONCE === 'true') {
        // Run CLI logic asynchronously so it doesn't block the server
        runCliOnce().catch(err => {
            console.error('❌ Error in CLI execution:', err);
            lastRunStatus.status = 'cli-error';
            lastRunStatus.errors.push(`CLI fatal: ${err?.message || String(err)}`);
        });
    }
    else {
        console.log('ℹ️  RUN_ONCE not set to true, server will only handle HTTP requests');
        lastRunStatus.status = 'idle';
    }
    // Setup graceful shutdown handlers
    const shutdown = async (signal) => {
        console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
        lastRunStatus.status = 'shutting-down';
        // Stop accepting new connections
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        console.error('Error closing server:', err);
                        reject(err);
                    }
                    else {
                        console.log('✅ Server closed');
                        resolve();
                    }
                });
            });
        }
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
// Start the server
startServer().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
