# Quick Start Guide

Get the video automation system running in under 10 minutes.

## Prerequisites

- Node.js 20+ installed
- Google Sheets with product data (ASIN, Title, Description)
- HeyGen account with API key
- OpenAI account with API key

## 1. Clone and Install

```bash
git clone https://github.com/natureswaysoil/video.git
cd video
npm install
```

## 2. Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your preferred editor
```

**Required minimal configuration:**

```bash
# Google Sheets CSV export URL
CSV_URL="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID"

# HeyGen (video generation)
HEYGEN_API_KEY="your_heygen_api_key"

# OpenAI (script generation)
OPENAI_API_KEY="your_openai_api_key"
```

**How to get your CSV_URL:**
1. Open your Google Sheet
2. File → Share → Publish to web
3. Choose "Comma-separated values (.csv)"
4. Select the specific sheet (tab)
5. Copy the generated URL

## 3. Test Locally (Dry Run)

Test without posting to social media:

```bash
DRY_RUN_LOG_ONLY=true RUN_ONCE=true npm run dev
```

**What happens:**
- ✅ Fetches products from Google Sheets
- ✅ Generates marketing script with OpenAI
- ✅ Creates video with HeyGen (10-15 minutes)
- ✅ Writes video URL to sheet
- ❌ Skips social media posting (logs what would be posted)

**Expected output:**
```
🏥 Health check server running on port 8080
========== Processing Row 2 ==========
Product: { title: 'Your Product Name', ... }
✅ Generated script with OpenAI: ...
🎬 Creating video with HeyGen...
📝 HeyGen mapping: { avatar: 'garden_expert_01', ... }
✅ Created HeyGen video job: abc123
⏳ Waiting for HeyGen video completion...
... (10-15 minutes) ...
✅ HeyGen video ready: https://...
✅ Wrote video URL to sheet
[DRY RUN] Would post to Instagram: { videoUrl: '...', caption: '...' }
[DRY RUN] Would post to Twitter: { videoUrl: '...', caption: '...' }
```

## 4. Add Social Media (Optional)

To enable social media posting, add credentials to `.env`:

### Instagram

```bash
INSTAGRAM_ACCESS_TOKEN="your_token"
INSTAGRAM_IG_ID="your_instagram_user_id"
```

[How to get Instagram credentials →](https://developers.facebook.com/docs/instagram-api/getting-started)

### Twitter/X

```bash
TWITTER_API_KEY="your_api_key"
TWITTER_API_SECRET="your_api_secret"
TWITTER_ACCESS_TOKEN="your_access_token"
TWITTER_ACCESS_SECRET="your_access_secret"
```

[How to get Twitter credentials →](https://developer.twitter.com/en/docs/authentication/oauth-1-0a)

### Pinterest

```bash
PINTEREST_ACCESS_TOKEN="your_token"
PINTEREST_BOARD_ID="your_board_id"
```

[How to get Pinterest credentials →](https://developers.pinterest.com/docs/getting-started/authentication/)

### YouTube (Optional)

```bash
YT_CLIENT_ID="your_client_id"
YT_CLIENT_SECRET="your_client_secret"
YT_REFRESH_TOKEN="your_refresh_token"
```

## 5. Full Test with Posting

Process one product and post to social media:

```bash
RUN_ONCE=true npm run dev
```

This will:
1. Generate video
2. Write to sheet
3. Post to configured social platforms

## 6. Google Sheets Writeback (Optional)

To automatically mark rows as posted in your sheet:

1. **Create a Google Cloud service account:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a project (or use existing)
   - Enable Google Sheets API
   - Create service account
   - Download JSON key

2. **Extract credentials from JSON:**
   ```bash
   # From the downloaded JSON file
   cat service-account-key.json | jq -r '.client_email'
   cat service-account-key.json | jq -r '.private_key'
   ```

3. **Add to .env:**
   ```bash
   GS_SERVICE_ACCOUNT_EMAIL="sa@project.iam.gserviceaccount.com"
   GS_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   ```

4. **Share your Google Sheet with the service account:**
   - Open your Google Sheet
   - Click "Share"
   - Paste the service account email
   - Set permission to "Editor"
   - Uncheck "Notify people"
   - Click "Share"

## 7. Deploy to Google Cloud

For automated twice-daily execution, deploy to Google Cloud:

```bash
# Set project details
export PROJECT_ID="your-gcp-project-id"
export REGION="us-east1"

# Create secrets from .env
source .env
./scripts/create-secrets-from-env.sh

# Deploy (builds image, creates job, sets up scheduler)
./scripts/deploy-gcp.sh

# Verify deployment
./scripts/verify-deployment.sh
```

See [COMPLETE_AUTOMATION_GUIDE.md](./COMPLETE_AUTOMATION_GUIDE.md) for detailed deployment instructions.

## Troubleshooting

### "CSV_URL not set in .env"

Make sure you've created `.env` file and set `CSV_URL`.

### "HeyGen API key required"

Add `HEYGEN_API_KEY` to your `.env` file.

### "No valid products found in sheet"

Check:
1. CSV_URL is correct and accessible
2. Sheet has data in expected columns (ASIN, Title)
3. Rows have Ready=TRUE or similar status (if you have a Ready column)

### Video generation takes too long

Video generation typically takes 10-15 minutes. Be patient! The system polls HeyGen every 15 seconds.

### "Failed to write video URL to sheet"

1. Check GS_SERVICE_ACCOUNT_EMAIL and GS_SERVICE_ACCOUNT_KEY are set
2. Verify service account has Editor access to the sheet
3. Ensure Google Sheets API is enabled in your GCP project

### Social media posting fails

1. Verify credentials are correct in `.env`
2. Check token hasn't expired
3. Ensure app has write permissions
4. Review error messages in console

## Configuration Tips

### Process specific platforms only

```bash
# Post to Instagram and Twitter only
ENABLE_PLATFORMS=instagram,twitter RUN_ONCE=true npm run dev
```

### Always regenerate videos

```bash
# Ignore Posted column, regenerate all videos
ALWAYS_GENERATE_NEW_VIDEO=true RUN_ONCE=true npm run dev
```

### Custom video duration

```bash
# Generate 45-second videos
HEYGEN_VIDEO_DURATION_SECONDS=45 RUN_ONCE=true npm run dev
```

### Different sheet column

```bash
# Write video URLs to column AC instead of AB
SHEET_VIDEO_TARGET_COLUMN_LETTER=AC RUN_ONCE=true npm run dev
```

## Next Steps

- **Production deployment:** See [COMPLETE_AUTOMATION_GUIDE.md](./COMPLETE_AUTOMATION_GUIDE.md)
- **HeyGen setup details:** See [HEYGEN_SETUP.md](./HEYGEN_SETUP.md)
- **Monitoring:** Check `/health` endpoint at http://localhost:8080/health
- **Cleanup:** Use `./scripts/cleanup-stray-files.sh` to analyze videos

## Common Workflows

### Daily Workflow (Manual)

```bash
# Process new products once daily
RUN_ONCE=true npm run dev
```

### Test New Product

```bash
# Add product to sheet
# Run dry run to see what will happen
DRY_RUN_LOG_ONLY=true RUN_ONCE=true npm run dev
# If looks good, run for real
RUN_ONCE=true npm run dev
```

### Regenerate Videos

```bash
# Clear Posted column in sheet for rows to regenerate
# Run with always generate flag
ALWAYS_GENERATE_NEW_VIDEO=true RUN_ONCE=true npm run dev
```

### Continuous Polling (Development)

```bash
# Process new products every minute
RUN_ONCE=false POLL_INTERVAL_MS=60000 npm run dev
# Ctrl+C to stop
```

## Getting Help

- **Issues:** https://github.com/natureswaysoil/video/issues
- **Documentation:** [README.md](./README.md), [COMPLETE_AUTOMATION_GUIDE.md](./COMPLETE_AUTOMATION_GUIDE.md)
- **Logs:** Check console output for detailed error messages

## Summary

✅ **5 minutes** to test video generation locally  
✅ **10 minutes** to add social media posting  
✅ **15 minutes** to deploy to Google Cloud for automation

The system handles:
- Automated script generation
- Intelligent avatar/voice selection
- Multi-platform social posting
- Google Sheets integration
- Retry logic and error handling

**Ready to scale!** 🚀
