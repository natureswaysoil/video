# Deployment Guide - Diagnostic Fix (PR #34)

## Overview

This guide covers deploying the diagnostic improvements from PR #34 to Google Cloud Platform. The fix enhances error messages when CSV processing finds no valid products by providing:
- Detailed skip reason counts (no jobId, already posted, not ready)
- Sample rows showing why they were skipped
- Configuration hints for troubleshooting
- Available column names from CSV headers

## Prerequisites

✅ **Already completed:**
- Code has been merged from PR #34
- TypeScript compilation successful (`npm run typecheck` ✓)
- Build successful (`npm run build` ✓)
- Docker build configuration verified

⚠️ **Required before deployment:**
- GCP credentials authenticated (`gcloud auth login`)
- Access to project `natureswaysoil-video`
- All required secrets configured in GCP Secret Manager (see below)

## Deployment Steps

### Step 1: Verify Build (Already Done)

The code has been built and is ready for deployment:
```bash
# Already executed successfully:
npm run typecheck  # ✓ Passed
npm run build      # ✓ Completed
```

### Step 2: Authenticate with GCP

```bash
# Login to Google Cloud
gcloud auth login

# Set project
export PROJECT_ID=natureswaysoil-video
gcloud config set project $PROJECT_ID

# Verify authentication
gcloud auth list
```

### Step 3: Verify Secrets (One-Time Setup)

Ensure all required secrets exist in Secret Manager:

```bash
# Check required secrets
gcloud secrets list --filter="name:(HEYGEN_API_KEY OR OPENAI_API_KEY OR INSTAGRAM_ACCESS_TOKEN OR INSTAGRAM_IG_ID OR GS_SERVICE_ACCOUNT_EMAIL OR GS_SERVICE_ACCOUNT_KEY)"

# If any are missing, create them:
# Example:
# echo -n "YOUR_VALUE" | gcloud secrets create SECRET_NAME --data-file=-
```

See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) Section 2 for detailed secret creation instructions.

### Step 4: Deploy to Google Cloud

```bash
# Navigate to repository root
cd /home/runner/work/video/video

# Set deployment parameters (optional, defaults shown)
export PROJECT_ID=natureswaysoil-video
export REGION=us-east1
export TIME_ZONE=America/New_York

# Run deployment script
./scripts/deploy-gcp.sh
```

**What the script does:**
1. Enables required GCP APIs
2. Creates Artifact Registry repository (if not exists)
3. Builds Docker image with latest code
4. Pushes image to Artifact Registry
5. Creates/updates Cloud Run Job with new image
6. Updates Cloud Scheduler for twice-daily execution

**Expected output:**
```
Project: natureswaysoil-video | Region: us-east1 | Time zone: America/New_York
Enabling required services...
Creating Artifact Registry (if not exists)...
Building and pushing image to us-east1-docker.pkg.dev/natureswaysoil-video/...
Creating job service account...
Creating Cloud Run Job...
Creating Cloud Scheduler job...
Done. Tip: Share your Google Sheet with video-job-sa@natureswaysoil-video.iam.gserviceaccount.com as Editor for writeback.
```

### Step 5: Verify Deployment

```bash
# Run verification script
./scripts/verify-deployment.sh

# Check job configuration
gcloud run jobs describe natureswaysoil-video-job --region=us-east1

# Check scheduler status
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1
```

### Step 6: Test the Fix

#### Option A: Manual Execution

```bash
# Execute the job manually to test
gcloud run jobs execute natureswaysoil-video-job --region=us-east1

# Wait a few moments, then check logs
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=100
```

#### Option B: Trigger Scheduler

```bash
# Manually trigger the scheduler
gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1

# Check logs after execution
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=100
```

### Step 7: Verify the Fix is Working

Look for the enhanced diagnostic messages in logs when no valid products are found:

**New diagnostic output includes:**
- `totalLines`: Total rows in CSV
- `skippedRows`: Number of rows skipped
- `skipReasons`: Breakdown by reason
  - `noJobId`: Missing product identifier
  - `alreadyPosted`: Already processed
  - `notReady`: Explicitly disabled
- `skippedRowSamples`: First 3 skipped rows with details
- `troubleshootingHints`: Actionable suggestions
- `envConfig`: Current configuration

**Example log output:**
```json
{
  "level": "warn",
  "message": "No valid products found in CSV after filtering",
  "context": "Core",
  "totalLines": 150,
  "skippedRows": 149,
  "processedRows": 0,
  "skipReasons": {
    "noJobId": 0,
    "alreadyPosted": 149,
    "notReady": 0
  },
  "skippedRowSamples": [
    {
      "rowNumber": 2,
      "reason": "Already posted (Posted='TRUE')",
      "sample": { "jobId": "B0ABC123", "posted": "TRUE" }
    }
  ],
  "troubleshootingHints": [
    "149 rows already posted. Set ALWAYS_GENERATE_NEW_VIDEO=true to reprocess them"
  ]
}
```

## What Changed in This Fix

The diagnostic improvements from PR #34 provide better visibility when the system skips all products:

### Before (Limited Information):
```
No valid products found
```

### After (Detailed Diagnostics):
```
No valid products found in CSV after filtering
- Total rows: 150
- Skipped: 149 (alreadyPosted: 149)
- Sample: Row 2 already posted (Posted='TRUE', jobId='B0ABC123')
- Hint: Set ALWAYS_GENERATE_NEW_VIDEO=true to reprocess them
- Available columns: [Product_ID, ASIN, Title, Posted, ...]
```

## Rollback (If Needed)

If issues arise after deployment:

```bash
# Get previous image tag/digest
gcloud artifacts docker images list \
  us-east1-docker.pkg.dev/natureswaysoil-video/natureswaysoil-video/app \
  --format="table(version,CREATE_TIME)"

# Update job to previous image
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --image=us-east1-docker.pkg.dev/natureswaysoil-video/natureswaysoil-video/app@sha256:PREVIOUS_DIGEST
```

See [ROLLBACK.md](./ROLLBACK.md) for detailed rollback procedures.

## Monitoring Post-Deployment

### Check Job Executions
```bash
# List recent executions
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=10

# View logs for specific execution
gcloud run jobs executions logs read EXECUTION_ID \
  --region=us-east1
```

### Monitor Scheduled Runs

The scheduler runs twice daily at:
- 9:00 AM Eastern Time
- 6:00 PM Eastern Time

Check scheduler history:
```bash
gcloud scheduler jobs describe natureswaysoil-video-2x \
  --location=us-east1 \
  --format="yaml(state,lastAttemptTime,status)"
```

## Troubleshooting

### Deployment Fails - Authentication Error
```
ERROR: (gcloud.auth.login) There was a problem with web authentication.
```
**Solution:** Run `gcloud auth login` and complete browser authentication

### Deployment Fails - Permission Error
```
ERROR: (gcloud) User does not have permission
```
**Solution:** Ensure your account has roles: `roles/run.admin`, `roles/iam.serviceAccountUser`

### Build Fails in Cloud Build
```
ERROR: build step failed
```
**Solution:** 
1. Check Docker syntax: `docker build -t test .`
2. Verify package.json and tsconfig.json are valid
3. Check build logs: `gcloud builds list --limit=1 --format=json`

### Job Runs but No Logs Appear
```
No log entries found
```
**Solution:** Wait 30-60 seconds after execution, then retry log command

## Additional Resources

- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - Complete deployment guide
- [VERIFICATION_GUIDE.md](./VERIFICATION_GUIDE.md) - Testing and verification
- [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) - Daily operations
- [TROUBLESHOOTING_NO_POSTS.md](./TROUBLESHOOTING_NO_POSTS.md) - When no posts appear

## Support

For issues or questions:
1. Check logs: `gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1`
2. Review [HOW_TO_DEBUG.md](./HOW_TO_DEBUG.md)
3. Verify secrets: `gcloud secrets list`
4. Check job status: `gcloud run jobs describe natureswaysoil-video-job --region=us-east1`

---

**Deployment Status:** ⏳ Ready to Deploy
**Code Status:** ✅ Built and Verified
**Next Action:** Run `./scripts/deploy-gcp.sh` with GCP credentials authenticated
