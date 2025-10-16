"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToPinterest = postToPinterest;
const axios_1 = __importDefault(require("axios"));
async function postToPinterest(videoUrl, caption, accessToken, boardId) {
    await axios_1.default.post(`https://api.pinterest.com/v5/pins`, {
        board_id: boardId,
        media_source: { source_type: "video_url", url: videoUrl },
        title: caption,
        description: caption,
    }, { headers: { 'Authorization': `Bearer ${accessToken}` } });
}
