# Social Media Posting - Quick Checklist

Use this checklist to ensure videos will post to social media.

## ✅ Pre-Flight Checklist

Run the audit tool first:
```bash
npm run audit
```

Then verify each item below:

### 1. Configuration File
- [ ] `.env` file exists in project root
- [ ] Copy from `.env.example` if needed: `cp .env.example .env`

### 2. Data Source
- [ ] `CSV_URL` is set in `.env`
- [ ] Google Sheet is accessible (check by opening CSV URL in browser)
- [ ] Sheet has products with:
  - [ ] jobId/ASIN/SKU column
  - [ ] Title or Name column
  - [ ] Ready=1 (if Ready column exists)
  - [ ] Posted is empty or false (unless ALWAYS_GENERATE_NEW_VIDEO=true)

### 3. Platform Credentials (At Least One Required)

#### Instagram
- [ ] `INSTAGRAM_ACCESS_TOKEN` set
- [ ] `INSTAGRAM_IG_ID` set
- [ ] Verify with: `npm run test:instagram`

#### Twitter
- [ ] `TWITTER_API_KEY` set (for media upload)
- [ ] `TWITTER_API_SECRET` set
- [ ] `TWITTER_ACCESS_TOKEN` set
- [ ] `TWITTER_ACCESS_SECRET` set
- [ ] OR `TWITTER_BEARER_TOKEN` set (for link-only posts)
- [ ] Verify with: `npm run test:twitter`

#### Pinterest
- [ ] `PINTEREST_ACCESS_TOKEN` set
- [ ] `PINTEREST_BOARD_ID` set
- [ ] Verify with: `npm run test:pinterest`

#### YouTube (Optional)
- [ ] `YT_CLIENT_ID` set
- [ ] `YT_CLIENT_SECRET` set
- [ ] `YT_REFRESH_TOKEN` set
- [ ] Verify with: `npm run test:youtube`

### 4. Posting Configuration
- [ ] `DRY_RUN_LOG_ONLY=false` (or not set)
- [ ] `ENFORCE_POSTING_WINDOWS=false` (for testing) or run at 9AM/5PM ET
- [ ] If selective posting: `ENABLE_PLATFORMS` set correctly

### 5. Video Source (One Required)

**Option A: Existing Videos**
- [ ] CSV has video URL column
- [ ] OR `VIDEO_URL_TEMPLATE` is set
- [ ] Videos are publicly accessible

**Option B: Generate Videos with HeyGen**
- [ ] `HEYGEN_API_KEY` set (or `GCP_SECRET_HEYGEN_API_KEY`)
- [ ] `OPENAI_API_KEY` set (optional, for better scripts)

### 6. Google Sheets Writeback (Optional but Recommended)
- [ ] `GS_SERVICE_ACCOUNT_EMAIL` set
- [ ] `GS_SERVICE_ACCOUNT_KEY` set
- [ ] Service account has Editor access to the Google Sheet

## 🚀 Ready to Post

### Test Run (Dry Run)
```bash
# In .env
DRY_RUN_LOG_ONLY=true
RUN_ONCE=true

# Run test
npm run dev
```

**Expected output:**
```
✅ [CSV] Fetched X products from sheet
✅ Video URL validated successfully
[DRY RUN] Would post to Instagram
[DRY RUN] Would post to Twitter
[DRY RUN] Would post to Pinterest
```

### Actual Posting (Single Run)
```bash
# In .env
DRY_RUN_LOG_ONLY=false
RUN_ONCE=true
ENFORCE_POSTING_WINDOWS=false

# Post to social media
npm run dev
```

**Expected output:**
```
✅ Posted to Instagram: media_id_123
✅ Posted to Twitter: tweet_id_456
✅ Posted to Pinterest: pin_id_789
```

### Continuous Mode
```bash
# In .env
DRY_RUN_LOG_ONLY=false
RUN_ONCE=false
ENFORCE_POSTING_WINDOWS=false

# Run continuously
npm run dev
```

System will poll every 60 seconds (default) and post new products.

## 🔍 Troubleshooting

If posts aren't happening, run diagnostics:

```bash
npm run audit
```

Look for:
- ❌ Red X marks = Critical issues that block posting
- ⚠️  Warning symbols = Optional features not configured
- ✅ Green checks = Everything OK

Common issues:
1. **No platform credentials** → Add at least Instagram, Twitter, or Pinterest credentials
2. **CSV_URL not accessible** → Check Google Sheets permissions
3. **DRY_RUN_LOG_ONLY=true** → Set to false to enable posting
4. **Outside posting window** → Set ENFORCE_POSTING_WINDOWS=false or run at correct time
5. **No products found** → Check Ready column and Posted column in sheet

## 📱 Verify Posts

After successful run, check:
- [ ] Instagram profile for new video post
- [ ] Twitter profile for new tweet
- [ ] Pinterest board for new pin
- [ ] YouTube channel for new video (if enabled)
- [ ] Google Sheet shows Posted=TRUE in the row
- [ ] Google Sheet shows Posted_At timestamp

## 🎯 Production Deployment

For scheduled automatic posting:

1. Deploy to Google Cloud Run:
   ```bash
   ./scripts/deploy-gcp.sh
   ```

2. Verify deployment:
   ```bash
   npm run verify
   ```

3. Check scheduled jobs:
   ```bash
   gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1
   ```

See PRODUCTION_DEPLOYMENT.md for full deployment guide.

## 📊 Monitoring

View audit trail in real-time:
```bash
npm run dev
```

At the end of each cycle, you'll see:
```
📋 AUDIT TRAIL SUMMARY
⏱️  Run Duration: 45.23s
✅ SUCCESS: 8
❌ ERROR: 0
📱 Social Media Posts: 6
```

## ✅ Success Criteria

Your system is working correctly when:
- ✅ `npm run audit` shows all green checks for enabled platforms
- ✅ `npm run dev` completes without errors
- ✅ Social media profiles show new posts
- ✅ Google Sheet shows Posted=TRUE for processed rows
- ✅ Audit summary shows "Social Media Posts: X" where X > 0

## 🆘 Still Need Help?

1. Review complete audit trail: `npm run audit > audit.txt`
2. Check detailed guides:
   - AUDIT_TRAIL_GUIDE.md - Detailed troubleshooting
   - TROUBLESHOOTING_NO_POSTS.md - Common issues
   - OPERATIONS_RUNBOOK.md - Day-to-day operations
3. Review platform setup:
   - HEYGEN_SETUP.md
   - PINTEREST_SETUP.md
4. Test platforms individually:
   - `npm run test:instagram`
   - `npm run test:twitter`
   - `npm run test:pinterest`
