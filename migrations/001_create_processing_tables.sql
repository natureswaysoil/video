-- Migration: Create tables for processing locks and idempotency
-- This migration creates the necessary tables for the ProcessingLock class

-- Create processing_locks table
CREATE TABLE IF NOT EXISTS processing_locks (
    id TEXT PRIMARY KEY,
    locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    locked_by TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on expires_at for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_processing_locks_expires_at ON processing_locks(expires_at);

-- Create index on locked_by for tracking
CREATE INDEX IF NOT EXISTS idx_processing_locks_locked_by ON processing_locks(locked_by);

-- Create processed_records table for idempotency
CREATE TABLE IF NOT EXISTS processed_records (
    id TEXT PRIMARY KEY,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_by TEXT NOT NULL,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on processed_at for queries
CREATE INDEX IF NOT EXISTS idx_processed_records_processed_at ON processed_records(processed_at);

-- Create index on processed_by for tracking
CREATE INDEX IF NOT EXISTS idx_processed_records_processed_by ON processed_records(processed_by);

-- Function to automatically clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS void AS $$
BEGIN
    DELETE FROM processing_locks
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup (requires pg_cron extension)
-- Uncomment if pg_cron is available:
-- SELECT cron.schedule('cleanup-expired-locks', '*/5 * * * *', 'SELECT cleanup_expired_locks()');

-- Comments for documentation
COMMENT ON TABLE processing_locks IS 'Stores distributed locks to prevent concurrent processing of the same resource';
COMMENT ON TABLE processed_records IS 'Stores processed resources for idempotency checks';
COMMENT ON FUNCTION cleanup_expired_locks IS 'Removes expired lock entries from processing_locks table';
