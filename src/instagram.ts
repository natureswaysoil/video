import axios from 'axios';

export async function postToInstagram(videoUrl: string, caption: string, accessToken: string, igId: string) {
  // Step 1: Create media container
  const containerRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igId}/media`,
    {
      video_url: videoUrl,
      media_type: 'VIDEO',
      caption,
      access_token: accessToken,
    }
  );
  const containerId = containerRes.data.id;
  // Step 2: Publish media container
  const publishRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igId}/media_publish`,
    {
      creation_id: containerId,
      access_token: accessToken,
    }
  );
  return publishRes.data.id;
}