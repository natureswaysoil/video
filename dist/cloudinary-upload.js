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
    const sigStr = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto_1.default.createHmac('sha256', apiSecret).update(`public_id=${publicId}&timestamp=${timestamp}`).digest('hex');
    // Actually use SHA1 which is what Cloudinary requires
    const sigInput = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const sig = require('crypto').createHash('sha1').update(sigInput).digest('hex');
    const formData = new URLSearchParams({
        file: videoUrl,
        public_id: publicId,
        timestamp,
        api_key: apiKey,
        signature: sig,
        resource_type: 'video',
    });
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
    const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const result = await response.json();
    if (!response.ok || result.error) {
        throw new Error(`Cloudinary upload failed: ${JSON.stringify(result.error || result)}`);
    }
    console.log('✅ Cloudinary upload complete:', result.secure_url);
    return result.secure_url;
}
