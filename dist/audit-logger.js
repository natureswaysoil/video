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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = void 0;
exports.getAuditLogger = getAuditLogger;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const error_sanitizer_1 = require("./error-sanitizer");
const logger = (0, logger_1.getLogger)();
const appendFile = (0, util_1.promisify)(fs.appendFile);
const readFile = (0, util_1.promisify)(fs.readFile);
const mkdir = (0, util_1.promisify)(fs.mkdir);
class AuditLogger {
    constructor(options = {}) {
        this.logFile = options.logFile || process.env.AUDIT_LOG_FILE || '/tmp/audit.log';
        this.bufferSize = options.bufferSize || 100;
        this.flushInterval = options.flushInterval || 30000; // 30 seconds
        this.eventsBuffer = [];
        this.flushTimer = null;
        // Start auto-flush timer
        this.startAutoFlush();
    }
    startAutoFlush() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flushTimer = setInterval(async () => {
            try {
                await this.flush();
            }
            catch (error) {
                logger.error('Failed to auto-flush audit log', 'AuditLogger', {}, error);
            }
        }, this.flushInterval);
    }
    /**
     * Log an event with the legacy format (for backward compatibility)
     */
    async logEvent(event) {
        const type = `${event.category || 'GENERAL'}:${event.level || 'INFO'}`;
        const data = {
            message: event.message || '',
            ...event.details
        };
        await this.log(type, data, { success: event.success, error: event.error });
    }
    async log(type, data, options) {
        try {
            const event = {
                timestamp: new Date().toISOString(),
                type,
                data: (0, error_sanitizer_1.sanitizeObject)(data),
                success: options?.success,
                error: options?.error,
            };
            this.eventsBuffer.push(event);
            if (this.eventsBuffer.length >= this.bufferSize) {
                await this.flush();
            }
        }
        catch (error) {
            logger.error('Failed to log audit event', 'AuditLogger', { type }, error);
        }
    }
    async flush() {
        if (this.eventsBuffer.length === 0) {
            return;
        }
        try {
            const events = [...this.eventsBuffer];
            this.eventsBuffer = [];
            const dir = path.dirname(this.logFile);
            await mkdir(dir, { recursive: true });
            const lines = events.map(event => JSON.stringify(event)).join('\n') + '\n';
            await appendFile(this.logFile, lines, 'utf8');
            logger.debug('Flushed audit events', 'AuditLogger', {
                eventCount: events.length,
                logFile: this.logFile,
            });
        }
        catch (error) {
            logger.error('Failed to flush audit log', 'AuditLogger', {
                logFile: this.logFile,
                bufferSize: this.eventsBuffer.length,
            }, error);
            throw new errors_1.AppError(`Failed to flush audit log: ${error.message || String(error)}`, errors_1.ErrorCode.FILE_OPERATION_ERROR, 500, true, { logFile: this.logFile }, error instanceof Error ? error : undefined);
        }
    }
    async close() {
        try {
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
                this.flushTimer = null;
            }
            await this.flush();
            logger.debug('Audit logger closed', 'AuditLogger', {
                logFile: this.logFile,
            });
        }
        catch (error) {
            logger.error('Failed to close audit logger', 'AuditLogger', {}, error);
        }
    }
    async getEvents(options) {
        try {
            const content = await readFile(this.logFile, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            let events = lines.map((line) => {
                try {
                    return JSON.parse(line);
                }
                catch {
                    return null;
                }
            }).filter(Boolean);
            if (options?.startTime) {
                events = events.filter(e => e.timestamp >= options.startTime);
            }
            if (options?.endTime) {
                events = events.filter(e => e.timestamp <= options.endTime);
            }
            if (options?.type) {
                events = events.filter(e => e.type === options.type);
            }
            if (options?.limit && options.limit > 0) {
                events = events.slice(-options.limit);
            }
            return events;
        }
        catch (error) {
            logger.error('Failed to get audit events', 'AuditLogger', {
                logFile: this.logFile,
            }, error);
            if (error.code === 'ENOENT') {
                return [];
            }
            throw new errors_1.AppError(`Failed to read audit log: ${error.message || String(error)}`, errors_1.ErrorCode.FILE_OPERATION_ERROR, 500, true, { logFile: this.logFile }, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Print a summary of audit events
     */
    async printSummary() {
        console.log('Audit log summary not yet implemented');
    }
    /**
     * Clear the audit log file
     */
    async clear() {
        this.eventsBuffer = [];
    }
}
exports.AuditLogger = AuditLogger;
let globalAuditLogger = null;
function getAuditLogger() {
    if (!globalAuditLogger) {
        globalAuditLogger = new AuditLogger();
    }
    return globalAuditLogger;
}
