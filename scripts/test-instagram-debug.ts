import 'dotenv/config';
import axios from 'axios';

const videoUrl = 'https://d1q70pf5vjeyhc.cloudfront.net/predictions/49f692482b6a461c9aa1eac28ab8be21/1.mp4';
const caption = '�� Transform your garden naturally! Premium organic soil amendments for healthier plants. #OrganicGardening #SoilHealth #NaturesWaySoil';
const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN!;
const igId = process.env.INSTAGRAM_IG_ID!;

console.log('Testing Instagram REELS post...\n');
console.log('IG ID:', igId);
console.log('Video URL:', videoUrl);
console.log('Caption:', caption);
console.log('');

async function test() {
  // Step 1: Create container
  console.log('Step 1: Creating media container...');
  const containerRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igId}/media`,
    {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: true
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  
  const containerId = containerRes.data.id;
  console.log('✅ Container created:', containerId);
  console.log('');
  
  // Step 2: Poll status
  console.log('Step 2: Waiting for video to process...');
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const statusRes = await axios.get(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code,status`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    console.log(`[${i+1}/12] Status:`, statusRes.data);
    
    if (statusRes.data.status_code === 'FINISHED') {
      console.log('✅ Video processed successfully!');
      break;
    }
    if (statusRes.data.status_code === 'ERROR') {
      console.error('❌ Video processing failed!');
      console.error('Status details:', statusRes.data);
      throw new Error('Video processing ERROR');
    }
  }
  
  // Step 3: Publish
  console.log('');
  console.log('Step 3: Publishing to Instagram...');
  const publishRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igId}/media_publish`,
    { creation_id: containerId },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  console.log('');
  console.log('✅ SUCCESS! Post published!');
  console.log('Post ID:', publishRes.data.id);
  console.log('');
  console.log('Check your Instagram: https://www.instagram.com/naturessoil/');
}

test().catch(err => {
  console.error('❌ Error:');
  console.error(err.response?.data || err.message);
  process.exit(1);
});
