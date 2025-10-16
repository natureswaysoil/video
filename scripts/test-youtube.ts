import 'dotenv/config';
import { postToYouTube } from '../src/youtube';

const videoUrl = 'https://d1q70pf5vjeyhc.cloudfront.net/predictions/69b5b14332234e3db7f22f64b1e92930/1.mp4';
const caption = 'Nature\'s Way Soil Organic Liquid Fertilizer - Made fresh weekly, 100% organic, USDA certified! Perfect for garden and house plants. #gardening #organic #plants';

console.log('Starting YouTube upload test...');
console.log('Video URL:', videoUrl);
console.log('Client ID:', process.env.YT_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('Client Secret:', process.env.YT_CLIENT_SECRET ? 'SET' : 'NOT SET');
console.log('Refresh Token:', process.env.YT_REFRESH_TOKEN ? 'SET (length: ' + process.env.YT_REFRESH_TOKEN?.length + ')' : 'NOT SET');
console.log('Privacy:', process.env.YT_PRIVACY_STATUS || 'public');
console.log('');

postToYouTube(
  videoUrl,
  caption,
  process.env.YT_CLIENT_ID!,
  process.env.YT_CLIENT_SECRET!,
  process.env.YT_REFRESH_TOKEN!,
  (process.env.YT_PRIVACY_STATUS as any) || 'public'
)
  .then(videoId => {
    console.log('\n✅ SUCCESS! Posted to YouTube!');
    console.log('Video ID:', videoId);
    console.log('Watch at: https://www.youtube.com/watch?v=' + videoId);
  })
  .catch(err => {
    console.error('\n❌ YouTube upload failed:');
    console.error(err);
  });
