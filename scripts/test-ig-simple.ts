import 'dotenv/config';
import axios from 'axios';

const videoUrl = 'https://d1q70pf5vjeyhc.cloudfront.net/predictions/49f692482b6a461c9aa1eac28ab8be21/1.mp4';
const caption = 'Transform your garden naturally! Premium organic soil amendments. #OrganicGardening #SoilHealth';
const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN!;
const igId = process.env.INSTAGRAM_IG_ID!;

console.log('Testing Instagram REELS (simplified)...\n');

async function test() {
  // Create container
  console.log('Creating container...');
  const containerRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igId}/media`,
    {
      media_type: 'REELS',
      video_url: videoUrl,
      caption
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  const containerId = containerRes.data.id;
  console.log('Container ID:', containerId);
  console.log('Waiting for processing...\n');
  
  // Poll status
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const statusRes = await axios.get(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code,status`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    console.log(`[${i+1}]`, statusRes.data);
    
    if (statusRes.data.status_code === 'FINISHED') {
      // Publish
      const publishRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igId}/media_publish`,
        { creation_id: containerId },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      console.log('\n✅ SUCCESS! Post ID:', publishRes.data.id);
      console.log('Check: https://www.instagram.com/naturessoil/');
      return;
    }
    if (statusRes.data.status_code === 'ERROR') {
      console.error('\n❌ Processing failed:', statusRes.data.status);
      throw new Error('ERROR status');
    }
  }
  throw new Error('Timeout');
}

test().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
