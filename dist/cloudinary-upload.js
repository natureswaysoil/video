"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadVideoToCloudinary = uploadVideoToCloudinary;
const cloudinary_1 = require("cloudinary");
async function uploadVideoToCloudinary(videoUrl) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error('Cloudinary credentials not set');
    }
    cloudinary_1.v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    console.log('☁️  Uploading video to Cloudinary:', videoUrl);
    const result = await cloudinary_1.v2.uploader.upload(videoUrl, {
        resource_type: 'video',
        public_id: `nws_video_${Date.now()}`,
        overwrite: true,
    });
    console.log('✅ Cloudinary upload complete:', result.secure_url);
    return result.secure_url;
}
