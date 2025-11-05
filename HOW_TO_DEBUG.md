# How to Debug: Videos Not Posting to Social Media

## Quick Start - Find Out Why

Run this single command to diagnose the issue:

```bash
npm run audit
```

This will check your entire configuration and tell you **exactly** what's wrong.

## What the Audit Checks

The audit tool validates 6 critical areas:

### 1. ✅ Environment Configuration
- Is `.env` file properly set up?
- Is dry-run mode accidentally enabled?
- Are posting windows enforced?

### 2. ✅ Data Source (CSV)
- Can the system access your Google Sheet?
- Does the sheet have products to post?
- Are required columns present?

### 3. ✅ Platform Credentials
- Are Instagram credentials configured?
- Are Twitter credentials configured?
- Are Pinterest credentials configured?
- Are YouTube credentials configured?
- **At least ONE platform must be configured**

### 4. ✅ Video Generation
- Is HeyGen configured (for creating videos)?
- Is OpenAI configured (for scripts)?
- Or do videos already exist in the sheet?

### 5. ✅ Google Sheets Writeback
- Can the system mark rows as posted?
- Are service account credentials set?

### 6. ✅ Posting Logic
- Is the system in dry-run mode?
- Are you in the posting time window?
- Are any filters blocking posts?

## Example Output

### ❌ When Nothing is Configured

```bash
$ npm run audit

🔍 COMPREHENSIVE POSTING SYSTEM AUDIT
=====================================

📋 1. ENVIRONMENT CONFIGURATION
  ❌ CSV_URL: Not configured
  ✅ DRY_RUN_LOG_ONLY: false (posts enabled)
  ✅ ENFORCE_POSTING_WINDOWS: false (posts anytime)

📊 2. DATA SOURCE (CSV)
  ❌ CSV fetch failed: CSV_URL not set

🔑 3. PLATFORM CREDENTIALS
  ❌ Instagram: Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_IG_ID
  ❌ Twitter: No credentials
  ❌ Pinterest: Missing PINTEREST_ACCESS_TOKEN or PINTEREST_BOARD_ID

🎬 4. VIDEO GENERATION (HEYGEN)
  ⚠️  HeyGen credentials: Not configured

📝 5. GOOGLE SHEETS WRITEBACK
  ⚠️  Google Sheets writeback: Not configured

🕐 6. POSTING WINDOWS & FILTERS
  ✅ Posting windows: Not enforced - posts anytime
  ✅ Dry run mode: Disabled - posts will be sent

💡 RECOMMENDATIONS

Issues found:
  1. 🔴 CRITICAL: No platform credentials configured
  2. 🔴 CRITICAL: CSV data source not accessible
  3. ⚠️  Video generation not configured
```

**Translation:** You need to:
1. Create a `.env` file
2. Add your CSV_URL
3. Add at least one platform's credentials

### ✅ When Properly Configured

```bash
$ npm run audit

🔍 COMPREHENSIVE POSTING SYSTEM AUDIT
=====================================

📋 1. ENVIRONMENT CONFIGURATION
  ✅ CSV_URL: Configured
  ✅ DRY_RUN_LOG_ONLY: false (posts enabled)
  ✅ ENFORCE_POSTING_WINDOWS: false (posts anytime)

📊 2. DATA SOURCE (CSV)
  ✅ CSV accessible: HTTP 200, 45280 bytes
  ✅ CSV contains 15 lines (14 data rows)
  ✅ Job ID column: Found
  ✅ Posted tracking column: Found

🔑 3. PLATFORM CREDENTIALS
  ✅ Instagram: Credentials configured
  ✅ Twitter: Full credentials (media upload)
  ✅ Pinterest: Credentials configured

🎬 4. VIDEO GENERATION (HEYGEN)
  ✅ HeyGen credentials: HEYGEN_API_KEY set
  ✅ OpenAI (script generation): Configured

📝 5. GOOGLE SHEETS WRITEBACK
  ✅ Google Sheets writeback: Service account configured

🕐 6. POSTING WINDOWS & FILTERS
  ✅ Posting windows: Not enforced - posts anytime
  ✅ Dry run mode: Disabled - posts will be sent

📊 AUDIT SUMMARY
✅ ALL CHECKS PASSED
System appears to be configured correctly for posting.
```

**Translation:** Everything looks good! You can run `npm run dev` to start posting.

## Step-by-Step Debugging Process

### Step 1: Run the Audit

```bash
npm run audit
```

Write down any ❌ red X issues.

### Step 2: Fix Configuration Issues

Create or update your `.env` file:

```bash
# Copy example if you don't have .env
cp .env.example .env

# Edit with your favorite editor
nano .env
# or
code .env
```

**Minimum required configuration:**

```bash
# Data source
CSV_URL="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID"

# At least one platform (example: Instagram)
INSTAGRAM_ACCESS_TOKEN="your_token_here"
INSTAGRAM_IG_ID="your_ig_id_here"

# Video source (option 1: existing videos)
VIDEO_URL_TEMPLATE="https://example.com/videos/{jobId}.mp4"

# Video source (option 2: generate with HeyGen)
HEYGEN_API_KEY="your_heygen_key"
OPENAI_API_KEY="your_openai_key"

# Disable dry run (important!)
DRY_RUN_LOG_ONLY=false
```

### Step 3: Run Audit Again

```bash
npm run audit
```

Keep fixing issues until you see:
```
✅ Platform Credentials: PASSED
✅ Data Source: PASSED
```

### Step 4: Test with Dry Run

```bash
# Temporarily enable dry run
echo "DRY_RUN_LOG_ONLY=true" >> .env
echo "RUN_ONCE=true" >> .env

# Test the flow
npm run dev
```

Look for:
```
[DRY RUN] Would post to Instagram
[DRY RUN] Would post to Twitter
```

This confirms the system WOULD post if dry-run was disabled.

### Step 5: Enable Real Posting

```bash
# Edit .env - change to:
DRY_RUN_LOG_ONLY=false
RUN_ONCE=true

# Run for real
npm run dev
```

Look for:
```
✅ Posted to Instagram: media_id_12345
✅ Posted to Twitter: tweet_id_67890
✅ Posted to Pinterest: pin_id_11111
```

### Step 6: Verify on Social Media

Check your social media profiles:
- Instagram: Should see new video post
- Twitter: Should see new tweet
- Pinterest: Should see new pin

## Common Issues and Quick Fixes

### Issue: "No platform credentials configured"

**Quick Fix:**
```bash
# Add to .env - choose at least one:

# Instagram
INSTAGRAM_ACCESS_TOKEN="EAABwz..."
INSTAGRAM_IG_ID="1234567890"

# Twitter
TWITTER_API_KEY="abc123"
TWITTER_API_SECRET="def456"
TWITTER_ACCESS_TOKEN="789-xyz"
TWITTER_ACCESS_SECRET="uvw321"

# Pinterest
PINTEREST_ACCESS_TOKEN="pina_..."
PINTEREST_BOARD_ID="123456"
```

Then run `npm run audit` to verify.

### Issue: "CSV data source not accessible"

**Quick Fix:**
1. Open your Google Sheet
2. Get the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`
3. Get the gid: Look at the URL, it's the number after `#gid=`
4. Add to .env:
   ```bash
   CSV_URL="https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=GID"
   ```
5. Make sure the sheet is shared publicly or with viewing permission

### Issue: "DRY_RUN_LOG_ONLY: true - NO POSTS WILL BE SENT!"

**Quick Fix:**
```bash
# Edit .env, change to:
DRY_RUN_LOG_ONLY=false

# Or remove the line entirely
```

### Issue: "Outside posting window"

**Quick Fix Option 1 (for testing):**
```bash
# Edit .env
ENFORCE_POSTING_WINDOWS=false
```

**Quick Fix Option 2 (for production):**
- Run the system at 9:00 AM Eastern or 5:00 PM Eastern
- Or deploy to Google Cloud with automatic scheduling

### Issue: "No valid products found in sheet"

**Quick Fix:**
1. Check your Google Sheet has data rows (not just headers)
2. Make sure products have a jobId/ASIN/SKU value
3. If you have a "Posted" column, clear it (or set ALWAYS_GENERATE_NEW_VIDEO=true)
4. If you have a "Ready" column, set it to `1` or `TRUE`

## Platform-Specific Testing

Test each platform individually to identify which ones are working:

```bash
# Instagram
npm run test:instagram

# Twitter
npm run test:twitter

# Pinterest
npm run test:pinterest

# YouTube
npm run test:youtube
```

These will show specific error messages if credentials are invalid.

## Understanding the Logs

When you run `npm run dev`, you'll see detailed audit trail output:

```
ℹ️  [SYSTEM] Video posting system started
✅ [CSV] Fetched 5 products from sheet
ℹ️  [PLATFORM] Platforms ready for posting
    instagram: true, twitter: true, pinterest: true
ℹ️  [POSTING] Attempting Instagram post
✅ [POSTING] Instagram post successful
```

At the end:
```
📋 AUDIT TRAIL SUMMARY
⏱️  Run Duration: 45.23s
✅ SUCCESS: 8
❌ ERROR: 0
📱 Social Media Posts: 6
```

- If **Social Media Posts: 0** → Posts didn't happen, check errors above
- If **ERROR: 3** → Scroll up to see what failed
- If **SUCCESS: 8** → Everything worked!

## Next Steps After Debugging

Once `npm run audit` shows all green checkmarks:

1. **Test locally:** `npm run dev` with `RUN_ONCE=true`
2. **Verify posts:** Check social media profiles
3. **Deploy to production:** Follow PRODUCTION_DEPLOYMENT.md
4. **Set up monitoring:** Follow OPERATIONS_RUNBOOK.md

## Still Stuck?

If the audit tool doesn't solve your problem:

1. Save the audit output:
   ```bash
   npm run audit > audit-report.txt
   ```

2. Run with full logging:
   ```bash
   npm run dev > full-log.txt 2>&1
   ```

3. Review these guides:
   - AUDIT_TRAIL_GUIDE.md - Detailed troubleshooting
   - POSTING_CHECKLIST.md - Step-by-step checklist
   - TROUBLESHOOTING_NO_POSTS.md - Common issues
   - OPERATIONS_RUNBOOK.md - Day-to-day operations

4. Check platform-specific setup:
   - HEYGEN_SETUP.md - Video generation
   - PINTEREST_SETUP.md - Pinterest API

## Summary

**To find out why videos aren't posting:**

1. Run: `npm run audit`
2. Fix any ❌ red issues
3. Run: `npm run audit` again to verify
4. Test: `npm run dev` with `DRY_RUN_LOG_ONLY=true`
5. Post: `npm run dev` with `DRY_RUN_LOG_ONLY=false`

The audit tool will tell you exactly what needs to be fixed!
