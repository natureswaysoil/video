"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToTwitter = postToTwitter;
const axios_1 = __importDefault(require("axios"));
const twitter_api_v2_1 = require("twitter-api-v2");
// Posts to Twitter/X.
// If OAuth 1.0a credentials are present (env), uploads the video and posts a tweet with the media.
// Otherwise, falls back to a simple text tweet (caption + URL) using Bearer token.
async function postToTwitter(videoUrl, caption, bearerToken) {
    const canUpload = Boolean(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET);
    if (canUpload) {
        const client = new twitter_api_v2_1.TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
        const rwClient = client.readWrite;
        // Download the video file into memory for upload
        const resp = await axios_1.default.get(videoUrl, { responseType: 'arraybuffer' });
        const mediaId = await rwClient.v1.uploadMedia(Buffer.from(resp.data), { type: 'video/mp4' });
        await rwClient.v2.tweet({ text: caption, media: { media_ids: [mediaId] } });
        return;
    }
    if (!bearerToken)
        throw new Error('Twitter bearer token missing and upload credentials not provided');
    await axios_1.default.post('https://api.twitter.com/2/tweets', { text: `${caption}\n${videoUrl}` }, { headers: { 'Authorization': `Bearer ${bearerToken}` } });
}
