"use strict";
/**
 * Processing locks and idempotency checks
 * Phase 1.3: Address race conditions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingLock = void 0;
exports.getProcessingLock = getProcessingLock;
const supabase_js_1 = require("@supabase/supabase-js");
class ProcessingLock {
    constructor() {
        this.supabase = null;
        this.instanceId = `instance_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        // Check if Supabase credentials are available
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
            this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
            this.useSupabase = true;
        }
        else {
            console.warn('[ProcessingLock] Supabase not configured, using local-only locking (not safe for concurrent processing)');
            this.useSupabase = false;
        }
    }
    /**
     * Try to acquire a lock for a given resource
     * Returns true if lock was acquired, false if already locked
     */
    async acquireLock(resourceId, options = {}) {
        const lockDurationMs = options.lockDurationMs || 300000; // 5 minutes default
        const expiresAt = new Date(Date.now() + lockDurationMs).toISOString();
        if (this.useSupabase && this.supabase) {
            try {
                // Try to insert a lock record
                const { data, error } = await this.supabase
                    .from('processing_locks')
                    .insert({
                    id: resourceId,
                    locked_at: new Date().toISOString(),
                    locked_by: this.instanceId,
                    expires_at: expiresAt,
                    metadata: options.metadata,
                })
                    .select()
                    .single();
                if (error) {
                    // Check if lock already exists
                    if (error.code === '23505') { // Unique violation
                        // Check if lock is expired
                        const { data: existing } = await this.supabase
                            .from('processing_locks')
                            .select('*')
                            .eq('id', resourceId)
                            .single();
                        if (existing && new Date(existing.expires_at) < new Date()) {
                            // Lock expired, delete and retry
                            await this.supabase
                                .from('processing_locks')
                                .delete()
                                .eq('id', resourceId);
                            return this.acquireLock(resourceId, options);
                        }
                        return false; // Lock still valid
                    }
                    console.error('[ProcessingLock] Error acquiring lock:', error);
                    return false;
                }
                return true;
            }
            catch (error) {
                console.error('[ProcessingLock] Exception acquiring lock:', error);
                return false;
            }
        }
        // Fallback: always allow (not safe for concurrent processing)
        return true;
    }
    /**
     * Release a lock for a given resource
     */
    async releaseLock(resourceId) {
        if (this.useSupabase && this.supabase) {
            try {
                await this.supabase
                    .from('processing_locks')
                    .delete()
                    .eq('id', resourceId)
                    .eq('locked_by', this.instanceId);
            }
            catch (error) {
                console.error('[ProcessingLock] Error releasing lock:', error);
            }
        }
    }
    /**
     * Check if a resource has already been processed (idempotency check)
     */
    async isAlreadyProcessed(resourceId) {
        if (this.useSupabase && this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('processed_records')
                    .select('id')
                    .eq('id', resourceId)
                    .single();
                if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                    console.error('[ProcessingLock] Error checking processed status:', error);
                    return false;
                }
                return !!data;
            }
            catch (error) {
                console.error('[ProcessingLock] Exception checking processed status:', error);
                return false;
            }
        }
        // Fallback: assume not processed
        return false;
    }
    /**
     * Mark a resource as processed
     */
    async markAsProcessed(resourceId, result) {
        if (this.useSupabase && this.supabase) {
            try {
                await this.supabase
                    .from('processed_records')
                    .insert({
                    id: resourceId,
                    processed_at: new Date().toISOString(),
                    processed_by: this.instanceId,
                    result,
                });
            }
            catch (error) {
                console.error('[ProcessingLock] Error marking as processed:', error);
            }
        }
    }
    /**
     * Process a resource with automatic locking and idempotency
     */
    async processWithLock(resourceId, processor, options = {}) {
        // Check if already processed (idempotency)
        if (!options.skipIdempotencyCheck) {
            const alreadyProcessed = await this.isAlreadyProcessed(resourceId);
            if (alreadyProcessed) {
                return {
                    processed: false,
                    reason: 'already_processed'
                };
            }
        }
        // Try to acquire lock
        const lockAcquired = await this.acquireLock(resourceId, {
            lockDurationMs: options.lockDurationMs,
            metadata: options.metadata,
        });
        if (!lockAcquired) {
            return {
                processed: false,
                reason: 'locked_by_another_process'
            };
        }
        try {
            // Process the resource
            const result = await processor();
            // Mark as processed
            await this.markAsProcessed(resourceId, { result });
            return {
                processed: true,
                result
            };
        }
        finally {
            // Always release the lock
            await this.releaseLock(resourceId);
        }
    }
}
exports.ProcessingLock = ProcessingLock;
// Global instance
let globalLock = null;
/**
 * Get or create the global processing lock instance
 */
function getProcessingLock() {
    if (!globalLock) {
        globalLock = new ProcessingLock();
    }
    return globalLock;
}
