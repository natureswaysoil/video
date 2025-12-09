"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadServiceAccountFromEnv = loadServiceAccountFromEnv;
exports.hasConfiguredGoogleCredentials = hasConfiguredGoogleCredentials;
exports.createGoogleAuthClient = createGoogleAuthClient;
const googleapis_1 = require("googleapis");
const google_auth_library_1 = require("google-auth-library");
const secret_manager_1 = require("@google-cloud/secret-manager");
function normalizePrivateKey(key) {
    return key.replace(/\\n/g, '\n');
}
async function loadServiceAccountFromEnv() {
    if (process.env.GCP_SA_JSON) {
        try {
            const parsed = JSON.parse(process.env.GCP_SA_JSON);
            if (!parsed?.client_email || !parsed?.private_key) {
                throw new Error('Service account JSON is missing client_email or private_key');
            }
            return {
                client_email: parsed.client_email,
                private_key: normalizePrivateKey(parsed.private_key),
            };
        }
        catch (error) {
            throw new Error(`GCP_SA_JSON error: ${error instanceof Error ? error.message : 'contains invalid JSON'}`);
        }
    }
    const secretResource = process.env.GCP_SECRET_SA_JSON;
    if (secretResource) {
        const secretClient = new secret_manager_1.SecretManagerServiceClient();
        const [accessResponse] = await secretClient.accessSecretVersion({ name: secretResource });
        const payload = accessResponse.payload?.data?.toString('utf8');
        if (!payload) {
            throw new Error('Secret payload empty');
        }
        let parsed;
        try {
            parsed = JSON.parse(payload);
        }
        catch (error) {
            throw new Error('Secret payload is not valid JSON');
        }
        if (!parsed?.client_email || !parsed?.private_key) {
            throw new Error('Service account JSON is missing client_email or private_key');
        }
        return {
            client_email: parsed.client_email,
            private_key: normalizePrivateKey(parsed.private_key),
        };
    }
    const clientEmail = process.env.GS_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GS_SERVICE_ACCOUNT_KEY;
    if (clientEmail && privateKey) {
        return {
            client_email: clientEmail,
            private_key: normalizePrivateKey(privateKey),
        };
    }
    return null;
}
function hasConfiguredGoogleCredentials() {
    if (process.env.GCP_SA_JSON || process.env.GCP_SECRET_SA_JSON) {
        return true;
    }
    if (process.env.GS_SERVICE_ACCOUNT_EMAIL && process.env.GS_SERVICE_ACCOUNT_KEY) {
        return true;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        return true;
    }
    return false;
}
async function createGoogleAuthClient(scopes) {
    const serviceAccount = await loadServiceAccountFromEnv();
    if (serviceAccount) {
        return new googleapis_1.google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes,
        });
    }
    const googleAuth = new google_auth_library_1.GoogleAuth({ scopes });
    return googleAuth.getClient();
}
