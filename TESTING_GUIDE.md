# Testing Guide for Video Automation System

This guide provides comprehensive instructions for testing the automated video generation and social media posting system.

## Overview

The video automation system consists of several integrated components:

1. **Google Sheets CSV Processing** - Fetches product data from a Google Sheet
2. **OpenAI Script Generation** - Creates marketing scripts for products
3. **HeyGen Video Creation** - Generates product videos with AI avatars
4. **Social Media Posting** - Posts videos to Instagram, Twitter, Pinterest, and YouTube

## Test Suite

We provide several test scripts to validate each component individually and the entire system end-to-end.

### Test Scripts

| Script | Purpose | Duration | Cost |
|--------|---------|----------|------|
| `test-csv-processing.ts` | Test Google Sheets CSV fetching and parsing | < 10 sec | Free |
| `test-openai-script.ts` | Test OpenAI script generation | < 30 sec | ~$0.01 |
| `test-heygen-integration.ts` | Test HeyGen video creation | 10-20 min | ~$1-2 per video |
| `test-all-platforms.ts` | Test posting to all social platforms | 1-5 min | Free (uses existing video) |
| `test-e2e-integration.ts` | Complete end-to-end workflow | 10-25 min | ~$1-2 |

## Prerequisites

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and configure the required variables:

```bash
cp .env.example .env
```

#### Required for All Tests
- `CSV_URL` - Google Sheet CSV export URL

#### Required for Script Generation
- `OPENAI_API_KEY` - OpenAI API key

#### Required for Video Generation
- `HEYGEN_API_KEY` - HeyGen API key
- OR `GCP_SECRET_HEYGEN_API_KEY` - GCP Secret Manager path

#### Required for Social Media Posting
Choose which platforms to enable:

**Instagram:**
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_IG_ID`

**Twitter/X:**
- `TWITTER_BEARER_TOKEN` (for text tweets with links)
- OR for native video upload:
  - `TWITTER_API_KEY`
  - `TWITTER_API_SECRET`
  - `TWITTER_ACCESS_TOKEN`
  - `TWITTER_ACCESS_SECRET`

**Pinterest:**
- `PINTEREST_ACCESS_TOKEN`
- `PINTEREST_BOARD_ID`

**YouTube:**
- `YT_CLIENT_ID`
- `YT_CLIENT_SECRET`
- `YT_REFRESH_TOKEN`
- `YT_PRIVACY_STATUS` (optional: public/unlisted/private)

## Running Tests

### 1. Test CSV Processing

Validates that the system can fetch and parse product data from Google Sheets.

```bash
npx ts-node scripts/test-csv-processing.ts
```

**What it tests:**
- ✓ CSV URL is accessible
- ✓ CSV data is properly parsed
- ✓ Product rows are extracted correctly
- ✓ Row filtering logic (Posted, Ready status)
- ✓ Column mapping works as configured

**Expected output:**
```
📊 Testing Google Sheets CSV Processing...
✓ Successfully parsed CSV: 5 row(s) found

📦 Product Rows:
Row 1 (Sheet Row 2):
  Job ID: ASIN123...
  Product ID: PROD-001
  Title: Nature's Way Kelp Meal...
  ...

✅ CSV processing test completed successfully!
```

### 2. Test OpenAI Script Generation

Tests script generation for various product types.

```bash
npx ts-node scripts/test-openai-script.ts
```

**What it tests:**
- ✓ OpenAI API key is valid
- ✓ Scripts are generated for different product types
- ✓ Script length and quality are reasonable
- ✓ Error handling works correctly

**Expected output:**
```
🤖 Testing OpenAI Script Generation...
✓ Script generated successfully!
Length: 245 characters
Word count: 42 words

Generated script:
---
Transform your garden naturally with premium organic kelp...
---

✅ All script generation tests passed!
```

### 3. Test HeyGen Video Creation

Tests the complete HeyGen video generation workflow. **This takes 10-20 minutes and costs ~$1-2.**

```bash
npx ts-node scripts/test-heygen-integration.ts
```

**Optional environment variables:**
- `TEST_SCRIPT` - Custom script to use for testing
- `TEST_TIMEOUT_MINUTES` - Timeout in minutes (default: 25)

**What it tests:**
- ✓ HeyGen credentials are valid
- ✓ Product mapping to avatar/voice works
- ✓ Video job creation succeeds
- ✓ Polling mechanism waits for completion
- ✓ Video URL is retrieved and accessible

**Expected output:**
```
🎬 Testing HeyGen Integration...
✓ HeyGen client created successfully
🎥 Creating video generation job...
✓ Video job created!
  Job ID: abc123...

⏳ Polling for video completion (timeout: 25 minutes)...
  This may take 10-20 minutes...

✅ SUCCESS! Video generation completed!
  Video URL: https://...

🎉 All HeyGen integration tests passed!
```

### 4. Test Social Media Posting

Tests posting to all configured social platforms using an existing video. **This will post to actual accounts!**

```bash
npx ts-node scripts/test-all-platforms.ts
```

**Optional environment variables:**
- `TEST_VIDEO_URL` - Video URL to use for testing
- `TEST_CAPTION` - Caption text for posts

**What it tests:**
- ✓ Instagram posting (Reels)
- ✓ Twitter posting (native video or text with link)
- ✓ Pinterest pin creation
- ✓ YouTube video upload

**Expected output:**
```
📱 Testing Social Media Posting (All Platforms)...
⚠️  WARNING: This will post to actual social media accounts!

--- Testing Instagram ---
✓ Instagram post successful!
  Media ID: 123456...

--- Testing Twitter/X ---
✓ Twitter post successful!

📊 Test Summary:
  Successful posts: 4
✅ All platform posting tests passed!
```

### 5. End-to-End Integration Test

Tests the complete workflow from CSV to social media posting. **This is the most comprehensive test and takes 10-25 minutes.**

```bash
# Full test (will post to social media)
npx ts-node scripts/test-e2e-integration.ts

# Dry run (skips social media posting)
DRY_RUN=true npx ts-node scripts/test-e2e-integration.ts
```

**What it tests:**
- ✓ Complete workflow from start to finish
- ✓ CSV → Script → Video → Social Media
- ✓ Error handling at each stage
- ✓ Integration between all components

**Expected output:**
```
🚀 End-to-End Integration Test
============================================================

Step 1: Validating Configuration
------------------------------------------------------------
✓ All required configs present

Step 2: Fetching Product from Google Sheets
------------------------------------------------------------
✓ Product fetched successfully

Step 3: Generating Marketing Script
------------------------------------------------------------
✓ Script generated with OpenAI

Step 4: Creating Video with HeyGen
------------------------------------------------------------
✓ Video generated in 12.3 minutes

Step 5: Posting to Social Media Platforms
------------------------------------------------------------
✓ Posted to all enabled platforms

============================================================
✅ END-TO-END TEST COMPLETED SUCCESSFULLY!
============================================================
🎉 The complete video automation system is working!
```

## Existing Individual Platform Tests

In addition to the new comprehensive test suite, there are existing individual platform tests:

```bash
# Test Instagram only
npx ts-node scripts/test-instagram.ts

# Test Twitter/X only
npx ts-node scripts/test-youtube.ts
```

## Troubleshooting

### CSV Processing Issues

**Problem:** `CSV_URL not set` or `Unable to fetch CSV`

**Solutions:**
1. Verify `CSV_URL` in `.env` is a Google Sheets CSV export URL
2. Format: `https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={GID}`
3. Ensure the sheet is publicly accessible or shared with the service account

**Problem:** `No products found in CSV`

**Solutions:**
1. Check that sheet has data rows (not just headers)
2. Verify required columns exist (`ASIN`, `Title`, etc.)
3. Check `Posted` column - set `ALWAYS_GENERATE_NEW_VIDEO=true` to ignore it
4. Verify `Ready` column values match `CSV_STATUS_TRUE_VALUES`

### OpenAI Script Generation Issues

**Problem:** `OPENAI_API_KEY not set` or `401 Unauthorized`

**Solutions:**
1. Get API key from https://platform.openai.com/api-keys
2. Verify the key is active and has sufficient credits
3. Check for extra spaces or quotes in `.env` file

**Problem:** Scripts are too short or generic

**Solutions:**
1. Ensure product descriptions in CSV are detailed
2. Adjust OpenAI prompt in `src/openai.ts` if needed
3. Consider using a different model (GPT-4 vs GPT-3.5)

### HeyGen Video Creation Issues

**Problem:** `HeyGen API key is required`

**Solutions:**
1. Sign up at https://heygen.com and get API key
2. Set `HEYGEN_API_KEY` in `.env`
3. Or configure GCP Secret Manager with `GCP_SECRET_HEYGEN_API_KEY`

**Problem:** `HeyGen job timed out`

**Solutions:**
1. Increase timeout: `TEST_TIMEOUT_MINUTES=30`
2. Check HeyGen dashboard for job status
3. Verify account has sufficient credits
4. Try again - sometimes jobs are slow

**Problem:** `HeyGen job failed`

**Solutions:**
1. Check script length (not too long or too short)
2. Verify avatar and voice IDs are valid
3. Check HeyGen API status page
4. Review HeyGen account limits/quotas

### Social Media Posting Issues

**Problem:** Instagram: `Invalid access token`

**Solutions:**
1. Regenerate token at https://developers.facebook.com/tools/explorer/
2. Ensure token has `instagram_basic`, `instagram_content_publish` permissions
3. Token must be for Instagram Business or Creator account
4. Verify `INSTAGRAM_IG_ID` is the Instagram Account ID (not Facebook Page ID)

**Problem:** Twitter: `403 Forbidden` or `Unauthorized`

**Solutions:**
1. For text tweets: use `TWITTER_BEARER_TOKEN`
2. For video upload: set all OAuth 1.0a credentials (`TWITTER_API_KEY`, etc.)
3. Verify app has "Read and Write" permissions
4. Check if Twitter account is suspended or restricted

**Problem:** Pinterest: `Invalid board_id`

**Solutions:**
1. Use `scripts/list-pinterest-boards.js` to get valid board IDs
2. Format: alphanumeric string (e.g., `1234567890123`)
3. Verify token has `boards:read` and `pins:write` scopes

**Problem:** YouTube: `The request cannot be completed because you have exceeded your quota`

**Solutions:**
1. YouTube API has daily quota limits (10,000 units default)
2. One video upload = 1,600 units
3. Request quota increase in Google Cloud Console
4. Wait until quota resets (midnight Pacific Time)

## Best Practices

### Before Production

1. **Run all tests in order:**
   ```bash
   npx ts-node scripts/test-csv-processing.ts
   npx ts-node scripts/test-openai-script.ts
   npx ts-node scripts/test-heygen-integration.ts
   DRY_RUN=true npx ts-node scripts/test-e2e-integration.ts
   ```

2. **Verify credentials are not committed:**
   ```bash
   git status
   # Ensure .env is not listed
   ```

3. **Test with one product first:**
   - Set `RUN_ONCE=true` in `.env`
   - Mark all rows as Posted except one test row
   - Run the main CLI: `npm run dev`

4. **Monitor the health endpoint:**
   - System exposes `/health` and `/status` endpoints
   - Use for monitoring in production

### During Production

1. **Check logs regularly:**
   - Look for errors in video generation
   - Monitor platform posting success rates
   - Track API quota usage

2. **Handle failures gracefully:**
   - System retries failed operations automatically
   - Failed rows are logged but don't stop processing
   - Check health endpoint for error counts

3. **Manage API costs:**
   - HeyGen: ~$1-2 per video
   - OpenAI: ~$0.01 per script
   - Social platforms: Free (but watch quotas)

## Testing Checklist

Use this checklist before deploying to production:

- [ ] CSV processing works and returns products
- [ ] OpenAI generates reasonable scripts
- [ ] HeyGen creates videos successfully
- [ ] Instagram posting works
- [ ] Twitter posting works
- [ ] Pinterest posting works
- [ ] YouTube uploading works
- [ ] End-to-end test completes successfully
- [ ] Video URLs are accessible after generation
- [ ] Sheet writeback updates Posted column
- [ ] Error handling works for API failures
- [ ] Retry logic handles transient failures
- [ ] Health endpoint returns correct status
- [ ] No credentials committed to git
- [ ] Production environment variables are set
- [ ] Cost monitoring is configured

## Getting Help

If tests fail or you need assistance:

1. Check the error message and refer to Troubleshooting section above
2. Review the relevant documentation:
   - `HEYGEN_SETUP.md` - HeyGen configuration
   - `README.md` - System overview
   - API documentation for specific platforms
3. Check API status pages:
   - [OpenAI Status](https://status.openai.com/)
   - [HeyGen Support](https://help.heygen.com/)
   - [Twitter API Status](https://api.twitterstat.us/)
   - [Meta Platform Status](https://developers.facebook.com/status/)

## Summary

This test suite provides comprehensive validation of the video automation system:

- **Fast tests** (< 1 min): CSV processing, credentials validation
- **Medium tests** (1-5 min): Script generation, social media posting
- **Slow tests** (10-25 min): Video generation, end-to-end integration

Run tests incrementally during development and run the full suite before production deployment.
