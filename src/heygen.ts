import axios from 'axios';

class HeyGenClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = axios.create({
            baseURL: 'https://api.heygen.com',
            headers: {'X-Api-Key': this.apiKey}
        });
    }

    async createVideoJob(payload) {
        const response = await this.client.post('/video/jobs', payload);
        return response.data.jobId;
    }

    async pollJobForVideoUrl(jobId, opts) {
        // Implement polling logic here with exponential backoff
    }

    async getJobOutput(jobId) {
        const response = await this.client.get(`/video/jobs/${jobId}/output`);
        return response.data;
    }

    static async createClientWithSecrets() {
        const apiKey = process.env.HEYGEN_API_KEY || await this.loadGCPSecret('GCP_SECRET_HEYGEN_API_KEY');
        const userId = process.env.HEYGEN_USER_ID || await this.loadGCPSecret('GCP_SECRET_HEYGEN_USER_ID');
        return new HeyGenClient(apiKey);
    }

    static async loadGCPSecret(secretName) {
        // Logic to load from GCP Secret Manager
    }
}

export default HeyGenClient;