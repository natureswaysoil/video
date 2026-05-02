// src/services/PexelsService.ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export class PexelsService {
  private static instance: PexelsService;
  private apiKey: string | null = null;

  private constructor() {}

  public static getInstance(): PexelsService {
    if (!PexelsService.instance) {
      PexelsService.instance = new PexelsService();
    }
    return PexelsService.instance;
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;

    const client = new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({
      name: `projects/${process.env.GCP_PROJECT_ID}/secrets/PEXELS_API_KEY/versions/latest`,
    });
    this.apiKey = version.payload!.data!.toString();
    return this.apiKey;
  }

  /**
   * Returns a short portrait video URL from Pexels for B-roll
   */
  async getBrollVideo(keyword: string, durationMaxSeconds = 12): Promise<string> {
    try {
      const apiKey = await this.getApiKey();

      const response = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=8&orientation=portrait`,
        {
          headers: {
            Authorization: apiKey,
          },
        }
      );

      const data = await response.json();

      // Prefer short, high-quality clips
      const video = data.videos
        ?.sort((a: any, b: any) => a.duration - b.duration)
        .find((v: any) => v.duration <= durationMaxSeconds);

      return video?.video_files?.[0]?.link || '';
    } catch (error) {
      console.error('Pexels API error:', error);
      return '';
    }
  }
}
