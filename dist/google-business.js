"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToGoogleBusiness = postToGoogleBusiness;
const axios_1 = __importDefault(require("axios"));
/**
 * Post to Google Business Profile
 * Requires: GOOGLE_BUSINESS_ACCOUNT_ID, GOOGLE_BUSINESS_LOCATION_ID, GOOGLE_BUSINESS_ACCESS_TOKEN
 */
async function postToGoogleBusiness(caption, videoUrl, productUrl) {
    const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
    const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID;
    const accessToken = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
    if (!accountId || !locationId || !accessToken) {
        throw new Error('Missing Google Business Profile credentials');
    }
    // Google Business Profile post (localPost)
    const postBody = {
        languageCode: 'en-US',
        summary: caption.substring(0, 1500), // GBP max 1500 chars
        callToAction: productUrl ? {
            actionType: 'LEARN_MORE',
            url: productUrl
        } : {
            actionType: 'LEARN_MORE',
            url: 'https://natureswaysoil.com'
        },
        media: [{
                mediaFormat: 'VIDEO',
                sourceUrl: videoUrl
            }],
        topicType: 'STANDARD'
    };
    const response = await axios_1.default.post(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`, postBody, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
    return response.data;
}
