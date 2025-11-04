# Quick Start: Verify Social Media Posting

This guide helps you quickly verify that the video posting system works correctly.

## Prerequisites

1. **Node.js 20+** installed
2. **API Credentials** for at least one social media platform
3. **5 minutes** to complete the verification

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Credentials

Copy the example environment file and add your credentials:

```bash
cp .env.example .env
```

Edit `.env` and add credentials for the platforms you want to test. At minimum, you need one of:

### Instagram (Recommended for Testing)
```env
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
INSTAGRAM_IG_ID=your_instagram_user_id
```

### Twitter/X
```env
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
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
YT_PRIVACY_STATUS=unlisted
```

## Step 3: Run Verification

### Option A: Verify All Platforms

Test all platforms with configured credentials:

```bash
npm run verify
```

### Option B: Test Individual Platforms

Test one platform at a time:

```bash
# Test Instagram only
npm run test:instagram

# Test Twitter only
npm run test:twitter

# Test Pinterest only
npm run test:pinterest

# Test YouTube only
npm run test:youtube
```

### Option C: Test Specific Platforms

Use `ENABLE_PLATFORMS` to filter which platforms to test:

```bash
# Test only Instagram and Twitter
ENABLE_PLATFORMS=instagram,twitter npm run verify

# Test only YouTube
ENABLE_PLATFORMS=youtube npm run verify
```

## Expected Output

### Successful Verification

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

Twitter:
  Credentials: ✅ Present
  Enabled: ✅ Yes
  Status: ✅ READY

═══════════════════════════════════════════════════════
  Testing Instagram
═══════════════════════════════════════════════════════
✅ SUCCESS! Posted to Instagram
Result: "1234567890_1234567890"

═══════════════════════════════════════════════════════
  Testing Twitter
═══════════════════════════════════════════════════════
✅ SUCCESS! Posted to Twitter

═══════════════════════════════════════════════════════
  Verification Summary
═══════════════════════════════════════════════════════

Total Platforms Tested: 2
Successful: 2
Failed: 0

✅ Successful platforms:
   - Instagram
   - Twitter
```

### No Credentials Found

```
❌ No platforms are ready for testing!

Please configure credentials in .env for at least one platform:
  - Instagram
  - Twitter
  - Pinterest
  - YouTube
```

**Solution:** Add credentials to your `.env` file (see Step 2 above).

## What Gets Posted?

The verification script posts **real content** to your social media accounts:

- **Video:** A sample organic soil product video (~30 seconds)
- **Caption:** "🌱 Transform your garden naturally! Premium organic soil amendments for healthier plants. #OrganicGardening #SoilHealth #NaturesWaySoil"

⚠️ **Important:** This creates real posts on your accounts. You may want to delete them after verification.

## Troubleshooting

### Build Errors

```bash
# Verify TypeScript compiles
npm run typecheck

# Build the project
npm run build
```

### Missing Dependencies

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### API Errors

Common issues:

1. **401 Unauthorized:** Check your credentials are correct
2. **403 Forbidden:** Verify your API permissions/scopes
3. **429 Rate Limited:** Wait a few minutes and try again
4. **Invalid Token:** Regenerate your access token

### Platform-Specific Issues

#### Instagram
- Token must have `instagram_basic` and `instagram_content_publish` permissions
- User ID must match the account associated with the token
- Videos must be between 3-60 seconds

#### Twitter
- Need all 4 OAuth credentials for video upload
- App must have read/write permissions
- Videos must be under 512MB

#### Pinterest
- Access token must have `pins:write` scope
- Board ID must be valid and owned by the token user

#### YouTube
- Must authenticate with YouTube Data API v3 scope
- Default privacy is "unlisted" to avoid public posts during testing

## Next Steps

After successful verification:

1. **Review Posted Content:** Check your social media accounts
2. **Delete Test Posts:** Remove the test video posts if desired
3. **Configure Production:** Set up credentials in Google Cloud Secret Manager
4. **Deploy:** Follow the [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) guide

## Advanced Usage

### Use the Main Application

After verification, run the full application:

```bash
# Single run (process once and exit)
RUN_ONCE=true npm run dev

# Continuous mode (poll every 60 seconds)
npm run dev
```

The main application includes:
- CSV processing from Google Sheets
- HeyGen AI video generation
- OpenAI script generation
- Automatic multi-platform posting
- Google Sheets writeback

### Verify Specific Features

```bash
# Test HeyGen video generation
npx ts-node scripts/fill-video-urls.ts

# Test YouTube authentication
npx ts-node scripts/get-youtube-refresh-token.ts
```

## Documentation

For detailed information:

- **[VERIFICATION_GUIDE.md](./VERIFICATION_GUIDE.md)** - Complete verification documentation
- **[README.md](./README.md)** - Main project documentation
- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** - Deployment guide

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review platform-specific error messages
3. Verify your credentials and permissions
4. Check API rate limits and quotas

---

**Time to Complete:** ~5 minutes
**Difficulty:** Easy
**Prerequisites:** Node.js 20+, API credentials for at least one platform
