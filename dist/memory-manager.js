"use strict";
/**
 * Memory management utilities
 * Phase 2.2: Fix memory issues
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TempFileManager = exports.MemoryMonitor = void 0;
exports.getMemoryUsage = getMemoryUsage;
exports.logMemoryUsage = logMemoryUsage;
exports.isMemoryAboveThreshold = isMemoryAboveThreshold;
exports.forceGC = forceGC;
exports.getTempFileManager = getTempFileManager;
exports.setupCleanupHandlers = setupCleanupHandlers;
const logger_1 = require("./logger");
const logger = (0, logger_1.getLogger)();
/**
 * Check current memory usage
 */
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        rss: usage.rss,
        heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
        externalMB: Math.round(usage.external / 1024 / 1024),
        rssMB: Math.round(usage.rss / 1024 / 1024),
    };
}
/**
 * Log current memory usage
 */
function logMemoryUsage(context) {
    const usage = getMemoryUsage();
    logger.info('Memory usage', context || 'MemoryManager', {
        heapUsedMB: usage.heapUsedMB,
        heapTotalMB: usage.heapTotalMB,
        externalMB: usage.externalMB,
        rssMB: usage.rssMB,
    });
}
/**
 * Check if memory usage is above threshold
 */
function isMemoryAboveThreshold(thresholdMB) {
    const usage = getMemoryUsage();
    return usage.heapUsedMB > thresholdMB;
}
/**
 * Force garbage collection if available
 */
function forceGC() {
    if (typeof global.gc === "function") {
        // gc called above; logger.debug('Forcing garbage collection', 'MemoryManager')
        // gc called above
    }
    else {
        logger.warn('Garbage collection not available. Run with --expose-gc flag.', 'MemoryManager');
    }
}
/**
 * Monitor memory usage and warn if above threshold
 */
class MemoryMonitor {
    constructor(options = {}) {
        this.interval = null;
        this.thresholdMB = options.thresholdMB || 500;
        this.checkIntervalMs = options.checkIntervalMs || 30000; // 30 seconds
        this.autoGC = options.autoGC || false;
    }
    start() {
        if (this.interval) {
            return; // Already started
        }
        logger.info('Starting memory monitor', 'MemoryMonitor', {
            thresholdMB: this.thresholdMB,
            checkIntervalMs: this.checkIntervalMs,
            autoGC: this.autoGC,
        });
        this.interval = setInterval(() => {
            const usage = getMemoryUsage();
            if (usage.heapUsedMB > this.thresholdMB) {
                logger.warn('Memory usage above threshold', 'MemoryMonitor', {
                    heapUsedMB: usage.heapUsedMB,
                    thresholdMB: this.thresholdMB,
                });
                if (this.autoGC) {
                    forceGC();
                }
            }
        }, this.checkIntervalMs);
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            logger.info('Stopped memory monitor', 'MemoryMonitor');
        }
    }
}
exports.MemoryMonitor = MemoryMonitor;
/**
 * Temporary file cleanup manager
 */
class TempFileManager {
    constructor() {
        this.tempFiles = new Set();
    }
    /**
     * Register a temporary file for cleanup
     */
    register(filepath) {
        this.tempFiles.add(filepath);
    }
    /**
     * Unregister a temporary file
     */
    unregister(filepath) {
        this.tempFiles.delete(filepath);
    }
    /**
     * Clean up a specific temporary file
     */
    async cleanup(filepath) {
        try {
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            await fs.unlink(filepath);
            this.unregister(filepath);
            logger.debug('Cleaned up temporary file', 'TempFileManager', { filepath });
        }
        catch (error) {
            logger.warn('Failed to clean up temporary file', 'TempFileManager', { filepath }, error);
        }
    }
    /**
     * Clean up all registered temporary files
     */
    async cleanupAll() {
        logger.info('Cleaning up all temporary files', 'TempFileManager', {
            count: this.tempFiles.size,
        });
        const promises = Array.from(this.tempFiles).map(filepath => this.cleanup(filepath));
        await Promise.allSettled(promises);
        this.tempFiles.clear();
    }
    /**
     * Get count of registered temporary files
     */
    getCount() {
        return this.tempFiles.size;
    }
}
exports.TempFileManager = TempFileManager;
// Global temp file manager instance
let globalTempFileManager = null;
/**
 * Get or create the global temp file manager instance
 */
function getTempFileManager() {
    if (!globalTempFileManager) {
        globalTempFileManager = new TempFileManager();
    }
    return globalTempFileManager;
}
/**
 * Ensure cleanup on process exit
 */
function setupCleanupHandlers() {
    const tempFileManager = getTempFileManager();
    const cleanup = async () => {
        logger.info('Process cleanup triggered', 'MemoryManager');
        await tempFileManager.cleanupAll();
    };
    process.on('exit', () => {
        // Synchronous cleanup only
        logger.info('Process exiting', 'MemoryManager');
    });
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT', 'MemoryManager');
        await cleanup();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM', 'MemoryManager');
        await cleanup();
        process.exit(0);
    });
    process.on('uncaughtException', async (error) => {
        logger.error('Uncaught exception', 'MemoryManager', {}, error);
        await cleanup();
        process.exit(1);
    });
    process.on('unhandledRejection', async (reason) => {
        logger.error('Unhandled rejection', 'MemoryManager', {}, reason);
        await cleanup();
        process.exit(1);
    });
}
