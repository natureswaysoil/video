# Social Media Posting Verification Guide

This guide explains how to verify the video posting functionality by posting test videos to social media platforms.

## Overview

The verification system includes test scripts for all supported platforms:
- **Instagram** - Posts video as Reels
- **Twitter/X** - Posts video natively or as a link
- **Pinterest** - Posts video pins
- **YouTube** - Uploads video (unlisted by default)

## Prerequisites

1. **Environment Configuration**: Create a `.env` file based on `.env.example` with your API credentials
2. **Node.js 20+**: Ensure you have the correct Node version
3. **Dependencies**: Run `npm install` to install all packages

## Required Credentials

### Instagram
```env
INSTAGRAM_ACCESS_TOKEN=your_token_here
INSTAGRAM_IG_ID=your_instagram_user_id
```

### Twitter/X
For native video upload (recommended):
```env
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
```

Or for text-only tweets with video link:
```env
TWITTER_BEARER_TOKEN=your_bearer_token
```

### Pinterest
```env
PINTEREST_ACCESS_TOKEN=your_access_token
PINTEREST_BOARD_ID=your_board_id
```

### YouTube
```env
YT_CLIENT_ID=your_client_id
YT_CLIENT_SECRET=your_client_secret
YT_REFRESH_TOKEN=your_refresh_token
YT_PRIVACY_STATUS=unlisted  # or 'public' or 'private'
```

## Running Tests

### Individual Platform Tests

Test each platform separately:

```bash
# Test Instagram posting
npx ts-node scripts/test-instagram.ts

# Test Twitter posting
npx ts-node scripts/test-twitter.ts

# Test Pinterest posting
npx ts-node scripts/test-pinterest.ts

# Test YouTube posting
npx ts-node scripts/test-youtube.ts
```

### Unified Verification Script

Run all platform tests in sequence:

```bash
npx ts-node scripts/verify-social-posting.ts
```

This script will:
1. Check which platforms have valid credentials
2. Test posting to all enabled platforms
3. Provide a detailed summary of results
4. Exit with error code if any platform fails

### Filter Platforms

You can limit which platforms to test using the `ENABLE_PLATFORMS` environment variable:

```bash
# Test only Instagram and Twitter
ENABLE_PLATFORMS=instagram,twitter npx ts-node scripts/verify-social-posting.ts

# Test only YouTube
ENABLE_PLATFORMS=youtube npx ts-node scripts/verify-social-posting.ts
```

## Test Video

All test scripts use a sample video URL:
```
https://d1q70pf5vjeyhc.cloudfront.net/predictions/49f692482b6a461c9aa1eac28ab8be21/1.mp4
```

This is a real video file that demonstrates the organic soil product. When you run the tests, **real content will be posted to your social media accounts**.

## Expected Results

### Successful Test Output

```
═══════════════════════════════════════════════════════
  Social Media Posting Verification Script
═══════════════════════════════════════════════════════

Test Video URL: https://d1q70pf5vjeyhc.cloudfront.net/predictions/...
Test Caption: 🌱 Transform your garden naturally! ...

═══════════════════════════════════════════════════════
  Platform Status Check
═══════════════════════════════════════════════════════

Instagram:
  Credentials: ✅ Present
  Enabled: ✅ Yes
  Status: ✅ READY

[... other platforms ...]

═══════════════════════════════════════════════════════
  Testing Instagram
═══════════════════════════════════════════════════════
✅ SUCCESS! Posted to Instagram
Result: "container_id_here"

[... other platforms ...]

═══════════════════════════════════════════════════════
  Verification Summary
═══════════════════════════════════════════════════════

Total Platforms Tested: 4
Successful: 4
Failed: 0

✅ Successful platforms:
   - Instagram
   - Twitter
   - Pinterest
   - YouTube
```

### Common Issues

#### Missing Credentials
```
❌ No platforms are ready for testing!
Please configure credentials in .env for at least one platform:
  - Instagram
  - Twitter
  - Pinterest
  - YouTube
```

**Solution**: Add the required credentials to your `.env` file.

#### Instagram 403 Error
```
❌ Error posting to Instagram:
{ error: { message: 'Invalid OAuth access token', type: 'OAuthException' } }
```

**Solution**: 
- Verify your access token is valid and not expired
- Ensure the token has the required permissions (`instagram_basic`, `instagram_content_publish`)
- Check that the Instagram user ID matches the account

#### Twitter 401 Error
```
❌ Error posting to Twitter:
{ title: 'Unauthorized', detail: 'Unauthorized' }
```

**Solution**:
- Verify all four OAuth 1.0a credentials are correct
- Ensure the app has read/write permissions
- Regenerate tokens if needed

#### YouTube Upload Error
```
❌ YouTube upload failed:
Error: insufficient authentication scopes
```

**Solution**:
- Re-authenticate with YouTube using the `get-youtube-refresh-token.ts` script
- Ensure the OAuth client has YouTube Data API v3 enabled
- Verify the refresh token is valid

## Dry Run Mode

To test the verification logic without actually posting, set:

```bash
DRY_RUN_LOG_ONLY=true npx ts-node scripts/verify-social-posting.ts
```

Note: The current test scripts don't implement dry-run mode yet, but the main CLI (`src/cli.ts`) supports it.

## Integration with Main Application

After verifying that posting works, you can run the full application:

```bash
# Single run (process once and exit)
RUN_ONCE=true npm run dev

# Continuous mode (poll and process every 60 seconds)
npm run dev
```

The main application (`src/cli.ts`) includes:
- CSV processing from Google Sheets
- HeyGen video generation
- OpenAI script generation
- Automatic posting to all configured platforms
- Google Sheets writeback for tracking

## Troubleshooting Checklist

- [ ] `.env` file exists and contains all required credentials
- [ ] Dependencies installed (`npm install`)
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] Test video URL is accessible (check in browser)
- [ ] Social media accounts are active and accessible
- [ ] API tokens/credentials are valid and not expired
- [ ] Required API permissions are granted
- [ ] No rate limits or quotas exceeded

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit your `.env` file to version control
- Never share API keys or tokens publicly
- Rotate credentials immediately if they are exposed
- Use environment variables or secret managers for production deployments

## Production Deployment

For production use, see:
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - Full deployment guide
- [DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md) - Quick start guide

Production deployments should use:
- Google Cloud Secret Manager for credentials
- Cloud Run Jobs for scheduled execution
- Proper monitoring and alerting
- Automated backups of posted content tracking
