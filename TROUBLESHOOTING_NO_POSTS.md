# Troubleshooting: No Social Media Posts

**Issue:** No social media posts observed this morning  
**Date:** October 28, 2025

---

## Important Note

**PR #8 has NOT been merged yet** - it is still in draft status. This means:

❌ The automated system is **NOT deployed to production**  
❌ Cloud Scheduler is **NOT running**  
❌ No automatic posts will occur until PR #8 is merged and deployed

---

## Current Status

### What Exists in PR #8 (Not Yet Deployed)

✅ **Code is ready:**
- Video generation system with HeyGen
- OpenAI script generation
- Multi-platform posting (Instagram, Twitter, Pinterest, YouTube)
- Automated scheduling (9 AM & 6 PM ET)

✅ **Documentation is complete:**
- Deployment guides
- Operations runbook
- Troubleshooting procedures

❌ **NOT deployed to production:**
- PR #8 is still in **draft** status
- Must be merged to main branch first
- Then deployed to Google Cloud Platform

---

## Why No Posts This Morning

The system is **not deployed** because:

1. **PR #8 is still in draft** - waiting for approval/merge
2. **Cloud Run Job doesn't exist** - needs deployment
3. **Cloud Scheduler is not configured** - needs deployment
4. **System is not running** - code only verified, not deployed

---

## How to Deploy and Start Posting

### Step 1: Merge PR #8

**Option A: Merge via GitHub UI**
1. Go to https://github.com/natureswaysoil/video/pull/8
2. Change status from "Draft" to "Ready for review"
3. Approve the PR
4. Click "Merge pull request"

**Option B: Merge via command line**
```bash
# Switch to main branch
git checkout main
git pull origin main

# Merge PR #8
git merge copilot/automate-video-generation-workflow
git push origin main
```

### Step 2: Deploy to Google Cloud

After merging, deploy the system:

```bash
# 1. Set your GCP project
export PROJECT_ID="your-gcp-project-id"
export REGION="us-east1"
export TIME_ZONE="America/New_York"

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your API keys:
# - HEYGEN_API_KEY
# - OPENAI_API_KEY
# - INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_IG_ID
# - TWITTER credentials
# - PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID

# 3. Create secrets in Google Cloud
source .env
./scripts/create-secrets-from-env.sh

# 4. Deploy the system
./scripts/deploy-gcp.sh

# 5. Verify deployment
PROJECT_ID=$PROJECT_ID ./scripts/verify-deployment.sh
```

**Expected deployment time:** 10-15 minutes

### Step 3: Verify Deployment

Check that everything is configured:

```bash
# Check Cloud Run Job exists
gcloud run jobs describe natureswaysoil-video-job --region=$REGION

# Check Cloud Scheduler is set up
gcloud scheduler jobs describe natureswaysoil-video-2x --location=$REGION

# Should show:
# - Schedule: "0 9,18 * * *" (9 AM and 6 PM)
# - Time zone: America/New_York
# - State: ENABLED
```

### Step 4: Manual Test Run (Optional)

Before waiting for the scheduled run, test manually:

```bash
# Trigger a manual execution
gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION

# Watch the logs
gcloud logging tail 'resource.type="cloud_run_job"'

# Expected to see:
# - "Fetching products from Google Sheets..."
# - "Generated script with OpenAI..."
# - "Creating video with HeyGen..."
# - "Posted to Instagram/Twitter/Pinterest..."
```

### Step 5: Wait for Scheduled Execution

Once deployed, the system will automatically run:
- **9:00 AM Eastern Time** (daily)
- **6:00 PM Eastern Time** (daily)

---

## Deployment Checklist

Before deployment, ensure you have:

- [ ] **Google Cloud Project** with billing enabled
- [ ] **HeyGen Account** with API key
- [ ] **OpenAI Account** with API key
- [ ] **Instagram Business Account** with access token
- [ ] **Twitter Developer Account** with API credentials
- [ ] **Pinterest Business Account** with access token
- [ ] **Google Sheets** with product data
- [ ] **Service Account** with Editor access to the Google Sheet

---

## Expected Behavior After Deployment

### Automatic Execution

**Morning Run (9 AM ET):**
1. Cloud Scheduler triggers Cloud Run Job at 9:00 AM
2. System fetches products from Google Sheets
3. For each product without a video:
   - Generate script with OpenAI (5-10 seconds)
   - Create video with HeyGen (10-15 minutes)
   - Write video URL to sheet
   - Post to social media platforms
4. Execution completes in ~15-20 minutes per product

**Evening Run (6 PM ET):**
- Same process repeats at 6:00 PM

### What You'll See

**In Google Sheets:**
- New video URLs in column AB (or configured column)
- Posted column marked as "TRUE"
- Posted_At timestamp

**On Social Media:**
- Instagram: New video post
- Twitter: New tweet with video
- Pinterest: New pin with video
- YouTube: New video upload (if enabled)

**In Cloud Logging:**
```
✅ Fetched 5 products from sheet
✅ Generated script: "How to use kelp fertilizer..."
🎬 Creating video with HeyGen...
✅ HeyGen video ready: https://...
✅ Wrote video URL to sheet
✅ Posted to Instagram: post_id_123
✅ Posted to Twitter: tweet_id_456
✅ Posted to Pinterest: pin_id_789
```

---

## Quick Troubleshooting After Deployment

If deployed but still no posts:

### Check 1: Is Cloud Scheduler Running?

```bash
gcloud scheduler jobs describe natureswaysoil-video-2x --location=$REGION

# Look for:
# - state: ENABLED (not PAUSED)
# - schedule: "0 9,18 * * *"
# - timeZone: "America/New_York"
```

### Check 2: Are Jobs Executing?

```bash
# List recent executions
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=$REGION \
  --limit=5

# Should show executions from today
```

### Check 3: Check for Errors

```bash
# View error logs
gcloud logging read \
  'resource.type="cloud_run_job"
   severity>=ERROR
   timestamp>="2025-10-28T00:00:00Z"' \
  --limit=50

# Common issues:
# - Missing credentials
# - Sheet access denied
# - API rate limits
```

### Check 4: Verify Credentials

```bash
# Check secrets exist
gcloud secrets list | grep -E "(HEYGEN|OPENAI|INSTAGRAM|TWITTER|PINTEREST)"

# Each should show:
# - Latest version enabled
# - Recent access time
```

---

## Summary

**Current Situation:**
- ❌ PR #8 is NOT merged
- ❌ System is NOT deployed
- ❌ No automatic posting is happening

**To Start Posting:**
1. Merge PR #8 to main branch
2. Deploy to Google Cloud using `./scripts/deploy-gcp.sh`
3. Verify deployment
4. Wait for next scheduled run (9 AM or 6 PM ET)

**Need Help?**
- See: [COMPLETE_AUTOMATION_GUIDE.md](../COMPLETE_AUTOMATION_GUIDE.md)
- See: [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md)
- See: [QUICKSTART.md](../QUICKSTART.md)

---

**Updated:** October 28, 2025  
**Status:** Awaiting PR merge and deployment
