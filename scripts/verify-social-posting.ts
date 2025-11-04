import 'dotenv/config';
import { postToInstagram } from '../src/instagram';
import { postToTwitter } from '../src/twitter';
import { postToPinterest } from '../src/pinterest';
import { postToYouTube } from '../src/youtube';

// Test video URL - using a known working video
const videoUrl = 'https://d1q70pf5vjeyhc.cloudfront.net/predictions/49f692482b6a461c9aa1eac28ab8be21/1.mp4';
const caption = '🌱 Transform your garden naturally! Premium organic soil amendments for healthier plants. #OrganicGardening #SoilHealth #NaturesWaySoil';

interface PlatformTest {
  name: string;
  enabled: boolean;
  credentialCheck: () => boolean;
  test: () => Promise<any>;
}

const platforms: PlatformTest[] = [
  {
    name: 'Instagram',
    enabled: true,
    credentialCheck: () => Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_ID),
    test: async () => {
      return await postToInstagram(
        videoUrl,
        caption,
        process.env.INSTAGRAM_ACCESS_TOKEN!,
        process.env.INSTAGRAM_IG_ID!
      );
    }
  },
  {
    name: 'Twitter',
    enabled: true,
    credentialCheck: () => {
      const hasUploadCreds = Boolean(
        process.env.TWITTER_API_KEY && 
        process.env.TWITTER_API_SECRET && 
        process.env.TWITTER_ACCESS_TOKEN && 
        process.env.TWITTER_ACCESS_SECRET
      );
      const hasBearerToken = Boolean(process.env.TWITTER_BEARER_TOKEN);
      return hasUploadCreds || hasBearerToken;
    },
    test: async () => {
      return await postToTwitter(videoUrl, caption, process.env.TWITTER_BEARER_TOKEN);
    }
  },
  {
    name: 'Pinterest',
    enabled: true,
    credentialCheck: () => Boolean(process.env.PINTEREST_ACCESS_TOKEN && process.env.PINTEREST_BOARD_ID),
    test: async () => {
      return await postToPinterest(
        videoUrl,
        caption,
        process.env.PINTEREST_ACCESS_TOKEN!,
        process.env.PINTEREST_BOARD_ID!
      );
    }
  },
  {
    name: 'YouTube',
    enabled: true,
    credentialCheck: () => Boolean(
      process.env.YT_CLIENT_ID && 
      process.env.YT_CLIENT_SECRET && 
      process.env.YT_REFRESH_TOKEN
    ),
    test: async () => {
      return await postToYouTube(
        videoUrl,
        caption,
        process.env.YT_CLIENT_ID!,
        process.env.YT_CLIENT_SECRET!,
        process.env.YT_REFRESH_TOKEN!,
        (process.env.YT_PRIVACY_STATUS as any) || 'unlisted'
      );
    }
  }
];

async function runVerification() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Social Media Posting Verification Script');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('Test Video URL:', videoUrl);
  console.log('Test Caption:', caption);
  console.log('');
  console.log('NOTE: This script will post REAL content to your social media accounts!');
  console.log('Make sure you have proper credentials configured in .env');
  console.log('');

  // Check which platforms are ready
  const enabledPlatformsEnv = (process.env.ENABLE_PLATFORMS || '').toLowerCase();
  const enabledPlatforms = new Set(enabledPlatformsEnv.split(',').map(s => s.trim()).filter(Boolean));
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Platform Status Check');
  console.log('═══════════════════════════════════════════════════════');
  
  const readyPlatforms: PlatformTest[] = [];
  const skippedPlatforms: PlatformTest[] = [];
  
  for (const platform of platforms) {
    const hasCredentials = platform.credentialCheck();
    const isExplicitlyEnabled = enabledPlatforms.size === 0 || enabledPlatforms.has(platform.name.toLowerCase());
    const isReady = platform.enabled && hasCredentials && isExplicitlyEnabled;
    
    console.log(`\n${platform.name}:`);
    console.log(`  Credentials: ${hasCredentials ? '✅ Present' : '❌ Missing'}`);
    console.log(`  Enabled: ${isExplicitlyEnabled ? '✅ Yes' : '❌ No (filtered by ENABLE_PLATFORMS)'}`);
    console.log(`  Status: ${isReady ? '✅ READY' : '⏭️  SKIPPED'}`);
    
    if (isReady) {
      readyPlatforms.push(platform);
    } else {
      skippedPlatforms.push(platform);
    }
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Ready to test: ${readyPlatforms.length} platform(s)`);
  console.log(`  Skipped: ${skippedPlatforms.length} platform(s)`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  if (readyPlatforms.length === 0) {
    console.log('❌ No platforms are ready for testing!');
    console.log('');
    console.log('Please configure credentials in .env for at least one platform:');
    for (const platform of skippedPlatforms) {
      console.log(`  - ${platform.name}`);
    }
    process.exit(1);
  }

  // Run tests
  const results: { platform: string; success: boolean; error?: any; result?: any }[] = [];
  
  for (const platform of readyPlatforms) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Testing ${platform.name}`);
    console.log('═══════════════════════════════════════════════════════');
    
    try {
      const result = await platform.test();
      console.log(`✅ SUCCESS! Posted to ${platform.name}`);
      console.log('Result:', JSON.stringify(result, null, 2));
      results.push({ platform: platform.name, success: true, result });
    } catch (err: any) {
      console.error(`❌ FAILED! Error posting to ${platform.name}`);
      console.error('Error:', err.response?.data || err.message || err);
      results.push({ platform: platform.name, success: false, error: err.response?.data || err.message || String(err) });
    }
    
    // Add a small delay between posts to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Verification Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Total Platforms Tested: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log('');
  
  if (successful.length > 0) {
    console.log('✅ Successful platforms:');
    successful.forEach(r => console.log(`   - ${r.platform}`));
    console.log('');
  }
  
  if (failed.length > 0) {
    console.log('❌ Failed platforms:');
    failed.forEach(r => {
      console.log(`   - ${r.platform}`);
      console.log(`     Error: ${JSON.stringify(r.error, null, 2)}`);
    });
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════');
  
  // Exit with error code if any tests failed
  if (failed.length > 0) {
    process.exit(1);
  }
}

// Run the verification
runVerification().catch(err => {
  console.error('');
  console.error('Fatal error during verification:');
  console.error(err);
  process.exit(1);
});
