import 'dotenv/config';
import { postToInstagram } from '../src/instagram';

const videoUrl = 'https://d1q70pf5vjeyhc.cloudfront.net/predictions/49f692482b6a461c9aa1eac28ab8be21/1.mp4';
const caption = '🌱 Transform your garden naturally! Premium organic soil amendments for healthier plants. #OrganicGardening #SoilHealth #NaturesWaySoil';

console.log('Testing Instagram video post...\n');
console.log('Video URL:', videoUrl);
console.log('Caption:', caption);
console.log('');

postToInstagram(
  videoUrl,
  caption,
  process.env.INSTAGRAM_ACCESS_TOKEN!,
  process.env.INSTAGRAM_IG_ID!
)
  .then(result => {
    console.log('');
    console.log('✅ SUCCESS! Instagram post created!');
    console.log('Post ID:', result);
    console.log('');
    console.log('Check your Instagram feed: https://www.instagram.com/naturessoil/');
  })
  .catch(err => {
    console.error('❌ Error posting to Instagram:');
    console.error(err.response?.data || err.message);
    process.exit(1);
  });
