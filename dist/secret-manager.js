"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SECRET_NAMES = void 0;
exports.loadSecretToEnv = loadSecretToEnv;
exports.loadSecretsToEnv = loadSecretsToEnv;
const secret_manager_1 = require("@google-cloud/secret-manager");
const client = new secret_manager_1.SecretManagerServiceClient();
const loaded = new Set();
exports.DEFAULT_SECRET_NAMES = [
    'CSV_URL',
    'GOOGLE_SHEET_CSV_URL',
    'GS_SHEET_NAME',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'HEYGEN_API_KEY',
    'HEYGEN_DEFAULT_AVATAR',
    'HEYGEN_DEFAULT_VOICE',
    'HEYGEN_WEBHOOK_URL',
    'INSTAGRAM_ACCESS_TOKEN',
    'INSTAGRAM_ACCOUNT_ID',
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REFRESH_TOKEN',
    'FACEBOOK_ACCESS_TOKEN',
    'FACEBOOK_PAGE_ID',
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_TOKEN_SECRET',
    'PINTEREST_ACCESS_TOKEN',
    'PINTEREST_BOARD_ID',
];
function getProjectId() {
    return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
}
async function loadSecretToEnv(secretName) {
    if (process.env[secretName])
        return true;
    if (loaded.has(secretName))
        return !!process.env[secretName];
    const projectId = getProjectId();
    if (!projectId) {
        console.warn(`No Google Cloud project ID found; skipping Secret Manager lookup for ${secretName}`);
        loaded.add(secretName);
        return false;
    }
    try {
        const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
        const [version] = await client.accessSecretVersion({ name });
        const value = version.payload?.data?.toString();
        if (value) {
            process.env[secretName] = value;
            console.log(`Loaded secret from Google Secret Manager: ${secretName}`);
            loaded.add(secretName);
            return true;
        }
    }
    catch (error) {
        console.warn(`Could not load secret ${secretName}:`, error?.message || error);
    }
    loaded.add(secretName);
    return false;
}
async function loadSecretsToEnv(secretNames = exports.DEFAULT_SECRET_NAMES) {
    for (const secretName of secretNames) {
        await loadSecretToEnv(secretName);
    }
}
