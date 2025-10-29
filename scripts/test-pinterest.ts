import 'dotenv/config';
import { postToPinterest } from '../src/pinterest';

const videoUrl = 'https://d1q70pf5vjeyhc.cloudfront.net/predictions/49f692482b6a461c9aa1eac28ab8be21/1.mp4';
const caption = '🌱 Transform your garden naturally! Premium organic soil amendments for healthier plants. #OrganicGardening #SoilHealth #NaturesWaySoil';

console.log('Testing Pinterest video post...\n');
console.log('Video URL:', videoUrl);
console.log('Caption:', caption);
console.log('');

// Check credentials
const hasAccessToken = Boolean(process.env.PINTEREST_ACCESS_TOKEN);
const hasBoardId = Boolean(process.env.PINTEREST_BOARD_ID);

console.log('Access Token:', hasAccessToken ? 'SET' : 'NOT SET');
console.log('Board ID:', hasBoardId ? 'SET' : 'NOT SET');
console.log('');

if (!hasAccessToken || !hasBoardId) {
  console.error('❌ Pinterest credentials missing!');
  console.error('Set PINTEREST_ACCESS_TOKEN and PINTEREST_BOARD_ID in .env');
  process.exit(1);
}

postToPinterest(
  videoUrl,
  caption,
  process.env.PINTEREST_ACCESS_TOKEN!,
  process.env.PINTEREST_BOARD_ID!
)
  .then(result => {
    console.log('');
    console.log('✅ SUCCESS! Posted to Pinterest!');
    console.log('Result:', result);
    console.log('');
    console.log('Check your Pinterest board!');
  })
  .catch(err => {
    console.error('❌ Error posting to Pinterest:');
    console.error(err.response?.data || err.message);
    process.exit(1);
  });
