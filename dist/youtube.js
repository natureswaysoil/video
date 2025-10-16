"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToYouTube = postToYouTube;
const googleapis_1 = require("googleapis");
const axios_1 = __importDefault(require("axios"));
async function postToYouTube(videoUrl, caption, clientId, clientSecret, refreshToken, privacyStatus = 'unlisted') {
    const oauth2Client = new googleapis_1.google.auth.OAuth2({ clientId, clientSecret });
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const youtube = googleapis_1.google.youtube({ version: 'v3', auth: oauth2Client });
    // Stream the video from the remote URL to YouTube
    const res = await axios_1.default.get(videoUrl, { responseType: 'stream' });
    const mediaBody = res.data;
    const title = caption?.slice(0, 95) || 'Video';
    const description = caption || '';
    const upload = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
            snippet: { title, description, categoryId: '22' }, // People & Blogs default
            status: { privacyStatus },
        },
        media: { body: mediaBody },
    });
    const videoId = upload.data.id;
    if (!videoId)
        throw new Error('YouTube upload did not return a video ID');
    return videoId;
}
