"use strict";
/**
 * Webhook authentication and signature verification
 * Phase 1.5: Add webhook authentication
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.verifyWebhookSignatureWithPrefix = verifyWebhookSignatureWithPrefix;
exports.webhookAuthMiddleware = webhookAuthMiddleware;
exports.generateWebhookSignature = generateWebhookSignature;
exports.verifyWebhookTimestamp = verifyWebhookTimestamp;
exports.webhookAuthWithTimestampMiddleware = webhookAuthWithTimestampMiddleware;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Verify webhook signature using HMAC
 */
function verifyWebhookSignature(payload, signature, secret, algorithm = 'sha256') {
    try {
        const hmac = crypto_1.default.createHmac(algorithm, secret);
        const digest = hmac.update(payload).digest('hex');
        // Constant-time comparison to prevent timing attacks
        return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    }
    catch (error) {
        console.error('[WebhookAuth] Signature verification error:', error);
        return false;
    }
}
/**
 * Verify webhook signature with SHA256 prefix (e.g., "sha256=...")
 */
function verifyWebhookSignatureWithPrefix(payload, signature, secret) {
    const match = signature.match(/^(sha256|sha1|md5)=(.+)$/);
    if (!match) {
        return verifyWebhookSignature(payload, signature, secret);
    }
    const [, algorithm, hash] = match;
    return verifyWebhookSignature(payload, hash, secret, algorithm);
}
/**
 * Express middleware to verify webhook signatures
 */
function webhookAuthMiddleware(options = {}) {
    const { secretEnvVar = 'WEBHOOK_SECRET', signatureHeader = 'x-signature', algorithm = 'sha256', required = true, } = options;
    return (req, res, next) => {
        const secret = process.env[secretEnvVar];
        // If webhook auth is not configured and not required, allow the request
        if (!secret) {
            if (required) {
                return res.status(500).json({
                    error: 'Webhook authentication not configured',
                });
            }
            return next();
        }
        const signature = req.headers[signatureHeader.toLowerCase()];
        if (!signature) {
            return res.status(401).json({
                error: 'Missing webhook signature',
            });
        }
        // Get raw body for signature verification
        let payload;
        if (Buffer.isBuffer(req.body)) {
            payload = req.body;
        }
        else if (typeof req.body === 'string') {
            payload = req.body;
        }
        else {
            payload = JSON.stringify(req.body);
        }
        const valid = verifyWebhookSignatureWithPrefix(payload, signature, secret);
        if (!valid) {
            return res.status(401).json({
                error: 'Invalid webhook signature',
            });
        }
        next();
    };
}
/**
 * Generate a webhook signature for testing
 */
function generateWebhookSignature(payload, secret, algorithm = 'sha256') {
    const hmac = crypto_1.default.createHmac(algorithm, secret);
    const digest = hmac.update(payload).digest('hex');
    return `${algorithm}=${digest}`;
}
/**
 * Verify timestamp to prevent replay attacks
 */
function verifyWebhookTimestamp(timestamp, maxAgeSeconds = 300 // 5 minutes default
) {
    try {
        const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
        const now = Math.floor(Date.now() / 1000);
        const age = now - ts;
        return age >= 0 && age <= maxAgeSeconds;
    }
    catch (error) {
        return false;
    }
}
/**
 * Full webhook authentication middleware with timestamp verification
 */
function webhookAuthWithTimestampMiddleware(options = {}) {
    const { secretEnvVar = 'WEBHOOK_SECRET', signatureHeader = 'x-signature', timestampHeader = 'x-timestamp', algorithm = 'sha256', maxAgeSeconds = 300, required = true, } = options;
    return (req, res, next) => {
        const secret = process.env[secretEnvVar];
        // If webhook auth is not configured and not required, allow the request
        if (!secret) {
            if (required) {
                return res.status(500).json({
                    error: 'Webhook authentication not configured',
                });
            }
            return next();
        }
        // Verify signature
        const signature = req.headers[signatureHeader.toLowerCase()];
        if (!signature) {
            return res.status(401).json({
                error: 'Missing webhook signature',
            });
        }
        let payload;
        if (Buffer.isBuffer(req.body)) {
            payload = req.body;
        }
        else if (typeof req.body === 'string') {
            payload = req.body;
        }
        else {
            payload = JSON.stringify(req.body);
        }
        const validSignature = verifyWebhookSignatureWithPrefix(payload, signature, secret);
        if (!validSignature) {
            return res.status(401).json({
                error: 'Invalid webhook signature',
            });
        }
        // Verify timestamp (if provided)
        const timestamp = req.headers[timestampHeader.toLowerCase()];
        if (timestamp) {
            const validTimestamp = verifyWebhookTimestamp(timestamp, maxAgeSeconds);
            if (!validTimestamp) {
                return res.status(401).json({
                    error: 'Webhook timestamp too old or invalid',
                });
            }
        }
        next();
    };
}
