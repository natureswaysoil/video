"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadVideoToCloudinary = uploadVideoToCloudinary;
const crypto_1 = __importDefault(require("crypto"));
async function uploadVideoToCloudinary(videoUrl) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error('Cloudinary credentials not set');
    }
    console.log('☁️  Uploading video to Cloudinary:', videoUrl);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const publicId = `nws_video_${timestamp}`;
    // Cloudinary signature: SHA1 of alphabetically sorted params + secret (no resource_type in sig)
    const sigInput = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto_1.default.createHash('sha1').update(sigInput).digest('hex');
    const body = new URLSearchParams({
        file: videoUrl,
        public_id: publicId,
        timestamp,
        api_key: apiKey,
        signature,
    });
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
    const response = await fetch(uploadUrl, {
        method: 'POST',
        body: body.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const result = await response.json();
    if (!response.ok || result.error) {
        throw new Error(`Cloudinary upload failed: ${JSON.stringify(result.error || result)}`);
    }
    console.log('✅ Cloudinary upload complete:', result.secure_url);
    return result.secure_url;
}
