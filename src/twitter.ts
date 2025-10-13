import axios from 'axios';

export async function postToTwitter(videoUrl: string, caption: string, bearerToken: string) {
  await axios.post(
    'https://api.twitter.com/2/tweets',
    {
      text: `${caption}\n${videoUrl}`
    },
    { headers: { 'Authorization': `Bearer ${bearerToken}` } }
  );
}