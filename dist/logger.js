"use strict";
/**
 * Structured logging and metrics collection
 * Phase 2.5: Add structured logging and metrics
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogLevel = void 0;
exports.getLogger = getLogger;
exports.getMetrics = getMetrics;
const error_sanitizer_1 = require("./error-sanitizer");
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
const LOG_LEVEL_PRIORITY = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
};
class Logger {
    constructor(minLevel = LogLevel.INFO) {
        this.minLevel = minLevel;
    }
    setLevel(level) {
        this.minLevel = level;
    }
    shouldLog(level) {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
    }
    formatLog(entry) {
        const base = {
            timestamp: entry.timestamp,
            level: entry.level,
            message: entry.message,
            ...(entry.context && { context: entry.context }),
            ...(entry.metadata && { metadata: (0, error_sanitizer_1.sanitizeObject)(entry.metadata) }),
            ...(entry.error && { error: (0, error_sanitizer_1.sanitizeError)(entry.error) }),
        };
        return JSON.stringify(base);
    }
    log(level, message, context, metadata, error) {
        if (!this.shouldLog(level)) {
            return;
        }
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context,
            metadata,
            error,
        };
        const formatted = this.formatLog(entry);
        switch (level) {
            case LogLevel.DEBUG:
            case LogLevel.INFO:
                console.log(formatted);
                break;
            case LogLevel.WARN:
                console.warn(formatted);
                break;
            case LogLevel.ERROR:
                console.error(formatted);
                break;
        }
    }
    debug(message, context, metadata) {
        this.log(LogLevel.DEBUG, message, context, metadata);
    }
    info(message, context, metadata) {
        this.log(LogLevel.INFO, message, context, metadata);
    }
    warn(message, context, metadata, error) {
        this.log(LogLevel.WARN, message, context, metadata, error);
    }
    error(message, context, metadata, error) {
        this.log(LogLevel.ERROR, message, context, metadata, error);
    }
}
// Global logger instance
let globalLogger = null;
/**
 * Get or create the global logger instance
 */
function getLogger() {
    if (!globalLogger) {
        const logLevel = process.env.LOG_LEVEL?.toLowerCase() || LogLevel.INFO;
        globalLogger = new Logger(logLevel);
    }
    return globalLogger;
}
/**
 * Metrics collector for monitoring
 */
class MetricsCollector {
    constructor() {
        this.metrics = new Map();
        this.counters = new Map();
        this.histograms = new Map();
    }
    /**
     * Set a gauge metric
     */
    setGauge(name, value) {
        this.metrics.set(name, value);
    }
    /**
     * Get a gauge metric
     */
    getGauge(name) {
        return this.metrics.get(name);
    }
    /**
     * Increment a counter
     */
    incrementCounter(name, value = 1) {
        const current = this.counters.get(name) || 0;
        this.counters.set(name, current + value);
    }
    /**
     * Get a counter value
     */
    getCounter(name) {
        return this.counters.get(name) || 0;
    }
    /**
     * Record a histogram value
     */
    recordHistogram(name, value) {
        if (!this.histograms.has(name)) {
            this.histograms.set(name, []);
        }
        this.histograms.get(name).push(value);
    }
    /**
     * Get histogram statistics
     */
    getHistogramStats(name) {
        const values = this.histograms.get(name);
        if (!values || values.length === 0) {
            return undefined;
        }
        const sorted = [...values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);
        return {
            count,
            min: sorted[0],
            max: sorted[count - 1],
            avg: sum / count,
            p50: sorted[Math.floor(count * 0.5)],
            p95: sorted[Math.floor(count * 0.95)],
            p99: sorted[Math.floor(count * 0.99)],
        };
    }
    /**
     * Time an async operation and record the duration
     */
    async time(name, operation) {
        const start = Date.now();
        try {
            const result = await operation();
            const duration = Date.now() - start;
            this.recordHistogram(name, duration);
            return result;
        }
        catch (error) {
            const duration = Date.now() - start;
            this.recordHistogram(`${name}.error`, duration);
            throw error;
        }
    }
    /**
     * Get all metrics as a summary
     */
    getSummary() {
        const gauges = {};
        for (const [key, value] of this.metrics.entries()) {
            gauges[key] = value;
        }
        const counters = {};
        for (const [key, value] of this.counters.entries()) {
            counters[key] = value;
        }
        const histograms = {};
        for (const key of this.histograms.keys()) {
            histograms[key] = this.getHistogramStats(key);
        }
        return { gauges, counters, histograms };
    }
    /**
     * Reset all metrics
     */
    reset() {
        this.metrics.clear();
        this.counters.clear();
        this.histograms.clear();
    }
}
// Global metrics collector instance
let globalMetrics = null;
/**
 * Get or create the global metrics collector instance
 */
function getMetrics() {
    if (!globalMetrics) {
        globalMetrics = new MetricsCollector();
    }
    return globalMetrics;
}
