import 'dotenv/config';
import { postToTwitter } from '../src/twitter';

const videoUrl = 'https://d1q70pf5vjeyhc.cloudfront.net/predictions/49f692482b6a461c9aa1eac28ab8be21/1.mp4';
const caption = '🌱 Transform your garden naturally! Premium organic soil amendments for healthier plants. #OrganicGardening #SoilHealth #NaturesWaySoil';

console.log('Testing Twitter video post...\n');
console.log('Video URL:', videoUrl);
console.log('Caption:', caption);
console.log('');

// Check which credentials are available
const hasUploadCreds = Boolean(
  process.env.TWITTER_API_KEY && 
  process.env.TWITTER_API_SECRET && 
  process.env.TWITTER_ACCESS_TOKEN && 
  process.env.TWITTER_ACCESS_SECRET
);
const hasBearerToken = Boolean(process.env.TWITTER_BEARER_TOKEN);

console.log('OAuth 1.0a credentials (for video upload):', hasUploadCreds ? 'SET' : 'NOT SET');
console.log('Bearer token (for text tweet):', hasBearerToken ? 'SET' : 'NOT SET');
console.log('');

if (!hasUploadCreds && !hasBearerToken) {
  console.error('❌ No Twitter credentials found!');
  console.error('Set either:');
  console.error('  - TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET (for video upload)');
  console.error('  - TWITTER_BEARER_TOKEN (for text tweet with link)');
  process.exit(1);
}

postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN)
  .then(() => {
    console.log('');
    console.log('✅ SUCCESS! Posted to Twitter!');
    console.log('');
    if (hasUploadCreds) {
      console.log('Video uploaded and tweeted with media.');
    } else {
      console.log('Text tweet posted with video link.');
    }
    console.log('Check your Twitter feed: https://twitter.com/');
  })
  .catch(err => {
    console.error('❌ Error posting to Twitter:');
    console.error(err.response?.data || err.message);
    process.exit(1);
  });
