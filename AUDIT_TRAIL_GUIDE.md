# Audit Trail & Troubleshooting Guide

## Overview

This system now includes comprehensive audit trail logging to diagnose why videos aren't being posted to social media. Use the built-in diagnostic tools to quickly identify configuration issues.

## Quick Diagnostic

Run the audit tool to check your configuration:

```bash
npm run audit
```

This will validate:
- ✅ Environment configuration
- ✅ CSV data source accessibility
- ✅ Platform credentials
- ✅ Video generation setup
- ✅ Google Sheets writeback
- ✅ Posting windows and filters

## Common Issues and Solutions

### 🔴 CRITICAL: No platform credentials configured

**Symptom:**
```
❌ Instagram: Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_IG_ID
❌ Twitter: No credentials
❌ Pinterest: Missing PINTEREST_ACCESS_TOKEN or PINTEREST_BOARD_ID
```

**Solution:**
Add at least one platform's credentials to your `.env` file:

```bash
# Instagram
INSTAGRAM_ACCESS_TOKEN="your_token_here"
INSTAGRAM_IG_ID="your_ig_id_here"

# Twitter (Option 1: Full credentials for media upload)
TWITTER_API_KEY="your_api_key"
TWITTER_API_SECRET="your_api_secret"
TWITTER_ACCESS_TOKEN="your_access_token"
TWITTER_ACCESS_SECRET="your_access_secret"

# Twitter (Option 2: Bearer token for link posts)
TWITTER_BEARER_TOKEN="your_bearer_token"

# Pinterest
PINTEREST_ACCESS_TOKEN="your_token"
PINTEREST_BOARD_ID="your_board_id"

# YouTube (optional)
YT_CLIENT_ID="your_client_id"
YT_CLIENT_SECRET="your_client_secret"
YT_REFRESH_TOKEN="your_refresh_token"
```

**Verification:**
After adding credentials, run:
```bash
npm run audit
```

Should show:
```
✅ Instagram: Credentials configured
```

---

### 🔴 CRITICAL: CSV data source not accessible

**Symptom:**
```
❌ CSV_URL: Not configured
```

**Solution:**
Add your Google Sheets CSV export URL to `.env`:

```bash
CSV_URL="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID"
```

**How to get the URL:**
1. Open your Google Sheet
2. Note the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=GID`
3. Convert to CSV export URL:
   ```
   https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=GID
   ```

**Verification:**
After adding CSV_URL, run:
```bash
npm run audit
```

Should show:
```
✅ CSV accessible
✅ CSV contains X lines
```

---

### ❌ DRY_RUN_LOG_ONLY is enabled

**Symptom:**
```
❌ DRY_RUN_LOG_ONLY: true - NO POSTS WILL BE SENT!
```

**What this means:**
The system is running in dry-run mode. It will:
- ✅ Process products
- ✅ Generate videos (if needed)
- ❌ NOT post to social media

**Solution:**
To enable actual posting, update `.env`:

```bash
# Remove this line or set to false
DRY_RUN_LOG_ONLY=false
```

Or remove the variable entirely (defaults to false).

**Verification:**
```bash
npm run audit
```

Should show:
```
✅ DRY_RUN_LOG_ONLY: false (posts enabled)
```

---

### ⚠️ Outside posting window

**Symptom:**
When running, you see:
```
⏭️  [POSTING] Outside posting window
```

**What this means:**
`ENFORCE_POSTING_WINDOWS=true` is set, which restricts posting to:
- 9:00 AM Eastern Time (±5 minutes)
- 5:00 PM Eastern Time (±5 minutes)

**Solution Option 1: Disable posting windows**
For testing or continuous posting:

```bash
ENFORCE_POSTING_WINDOWS=false
```

**Solution Option 2: Wait for posting window**
If you want to keep windows enforced, run the system at:
- 9:00 AM ET (8:55-9:05)
- 5:00 PM ET (4:55-5:05)

**Solution Option 3: Schedule with Cloud Scheduler**
Deploy to Google Cloud with automatic scheduling:
```bash
./scripts/deploy-gcp.sh
```

This sets up automatic runs at 9 AM and 5 PM ET daily.

---

### ⚠️ No valid products found in sheet

**Symptom:**
```
⚠️  [CSV] No valid products found in sheet
```

**Possible causes:**

1. **Products already posted**
   - If `ALWAYS_GENERATE_NEW_VIDEO` is not set to `true`, products with `Posted=1` or `Posted=TRUE` are skipped
   - Solution: Set `ALWAYS_GENERATE_NEW_VIDEO=true` to repost, or clear the Posted column

2. **Products not marked as ready**
   - If your sheet has a `Ready` column, it must be set to `1`, `true`, `yes`, `y`, `on`, `post`, or `enabled`
   - Solution: Set `Ready=1` for products you want to post

3. **Missing jobId/ASIN**
   - Each product needs a unique identifier (jobId, ASIN, or SKU)
   - Solution: Ensure your CSV has one of these columns with values

**Verification:**
Check your CSV in the browser to ensure:
- Products have jobId/ASIN/SKU
- Products have Ready=1 (if that column exists)
- Products don't have Posted=1 (or set ALWAYS_GENERATE_NEW_VIDEO=true)

---

### ⚠️ Video generation not configured

**Symptom:**
```
⚠️  Video generation not configured
```

**What this means:**
HeyGen credentials are not configured. The system can still post if:
- Videos already exist in the CSV (Video URL column)
- OR videos are accessible via template URL

**Solution (if you want video generation):**
Add HeyGen credentials:

```bash
# Direct API key
HEYGEN_API_KEY="your_api_key_here"

# Or via GCP Secret Manager (production)
GCP_SECRET_HEYGEN_API_KEY="projects/YOUR_PROJECT/secrets/heygen-api-key/versions/latest"
```

**Solution (if videos already exist):**
Make sure your CSV has a video URL column, or that videos are accessible via the template:

```bash
# If your CSV has a video URL column
CSV_COL_VIDEO_URL="Video URL,video_url"

# Or use template (default)
VIDEO_URL_TEMPLATE="https://example.com/videos/{jobId}/video.mp4"
```

---

## Understanding Audit Trail Output

When you run the system with `npm run dev`, you'll see detailed audit trail output:

### During Processing

```
ℹ️  [SYSTEM] Video posting system started
✅ [CSV] Fetched 5 products from sheet
ℹ️  [PLATFORM] Platforms ready for posting
    Details: { instagram: true, twitter: true, pinterest: true }
ℹ️  [POSTING] Attempting Instagram post
✅ [POSTING] Instagram post successful
ℹ️  [POSTING] Attempting Twitter post
✅ [POSTING] Twitter post successful
```

### End of Cycle Summary

```
📋 AUDIT TRAIL SUMMARY
⏱️  Run Duration: 45.23s
📊 Total Events: 28

📈 By Level:
  ✅ SUCCESS: 8
  ℹ️  INFO: 15
  ⚠️  WARN: 2
  ❌ ERROR: 3
  ⏭️  SKIP: 0

📂 By Category:
  ENV: 6
  CSV: 4
  VIDEO: 2
  PLATFORM: 8
  POSTING: 8

❌ ERRORS ENCOUNTERED:
  1. Instagram post failed
     {"error":"Invalid access token"}

✅ SUCCESSFUL OPERATIONS:
  📱 Social Media Posts: 6
  🎬 Videos Generated: 2
```

## Diagnostic Workflow

Follow this workflow to diagnose posting issues:

### Step 1: Run Audit
```bash
npm run audit
```

Review the output. Fix any 🔴 CRITICAL issues first.

### Step 2: Test with Dry Run
```bash
# In .env
DRY_RUN_LOG_ONLY=true
RUN_ONCE=true

# Run
npm run dev
```

This will process products without posting. Review the audit trail to see:
- Are products being found?
- Are videos accessible?
- Which platforms would be attempted?

### Step 3: Test Real Posting
```bash
# In .env
DRY_RUN_LOG_ONLY=false
RUN_ONCE=true
ENFORCE_POSTING_WINDOWS=false

# Run
npm run dev
```

Watch the audit trail for:
- ✅ Successful posts
- ❌ Failed posts (with error details)

### Step 4: Review Audit Summary
At the end of the run, review:
- How many posts succeeded?
- How many posts failed?
- What were the error messages?

### Step 5: Fix Issues
Based on errors in the audit trail:

**"Invalid access token"** → Refresh your platform credentials

**"Video URL not reachable"** → Check video URL template or HeyGen generation

**"No products found"** → Check CSV accessibility and product filters

**"Outside posting window"** → Disable windows or run at correct time

## Platform-Specific Testing

Test individual platforms with dedicated test scripts:

```bash
# Test Instagram
npm run test:instagram

# Test Twitter
npm run test:twitter

# Test Pinterest
npm run test:pinterest

# Test YouTube
npm run test:youtube
```

These scripts will attempt to post a test video and show detailed error messages.

## Continuous Monitoring

For production deployments, the audit trail is automatically logged to:
- Console output (for Cloud Run Jobs)
- Cloud Logging (when deployed to GCP)

To view logs in production:
```bash
gcloud logging read 'resource.type="cloud_run_job"' --limit=50
```

## Getting Help

If you're still experiencing issues after following this guide:

1. **Collect audit output:**
   ```bash
   npm run audit > audit-output.txt
   npm run dev > run-output.txt 2>&1
   ```

2. **Check documentation:**
   - TROUBLESHOOTING_NO_POSTS.md
   - OPERATIONS_RUNBOOK.md
   - README.md

3. **Review platform setup guides:**
   - HEYGEN_SETUP.md
   - PINTEREST_SETUP.md
   - Blog automation: BLOG_AUTOMATION.md

## Summary of Audit Commands

| Command | Purpose |
|---------|---------|
| `npm run audit` | Validate complete system configuration |
| `npm run dev` | Run system with full audit trail logging |
| `npm run verify` | Verify social media posting works |
| `npm run test:instagram` | Test Instagram credentials only |
| `npm run test:twitter` | Test Twitter credentials only |
| `npm run test:pinterest` | Test Pinterest credentials only |
| `npm run test:youtube` | Test YouTube credentials only |

All commands provide detailed output to help diagnose issues quickly.
