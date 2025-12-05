# How to Deploy to Google Cloud

**Quick Answer:** This system deploys to Google Cloud as a scheduled Cloud Run Job. Here's how to do it.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Google Cloud Platform                        │
│                                                                  │
│  ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │ Cloud Scheduler  │─triggers→│    Cloud Run Job            │  │
│  │ (9 AM & 6 PM ET) │         │  (natureswaysoil-video-job) │  │
│  └──────────────────┘         └─────────────────────────────┘  │
│                                          │                       │
│                                          │ uses                  │
│                                          ↓                       │
│                      ┌────────────────────────────┐             │
│                      │   Secret Manager           │             │
│                      │  (API keys & credentials)  │             │
│                      └────────────────────────────┘             │
│                                          │                       │
│                                          │ uses                  │
│                                          ↓                       │
│                      ┌────────────────────────────┐             │
│                      │   Artifact Registry        │             │
│                      │  (Docker container image)  │             │
│                      └────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 │ fetches data & posts
                                 ↓
        ┌────────────────────────────────────────────────┐
        │          External Services                     │
        ├────────────┬─────────────┬──────────┬─────────┤
        │ Google     │  HeyGen API │ OpenAI   │ Social  │
        │ Sheets CSV │  (Videos)   │ (Scripts)│ Media   │
        └────────────┴─────────────┴──────────┴─────────┘
```

---

## 🚀 5-Minute Deployment (Recommended)

### Prerequisites
1. A Google Cloud project with billing enabled
2. `gcloud` CLI installed and authenticated
3. Your API credentials ready (see [Required Credentials](#required-credentials) below)

### Steps

```bash
# 1. Set your project ID
export PROJECT_ID=your-gcp-project-id
export REGION=us-east1
gcloud config set project $PROJECT_ID

# 2. Create secrets from your credentials
cp .env.example .env
# Edit .env with your actual API keys
nano .env

# Create all secrets in one command
source .env && ./scripts/create-secrets-from-env.sh

# 3. Deploy everything (builds image, creates job, sets up scheduler)
./scripts/deploy-gcp.sh

# 4. Verify deployment
PROJECT_ID=$PROJECT_ID ./scripts/verify-deployment.sh

# 5. Test manual execution
gcloud run jobs execute natureswaysoil-video-job --region=$REGION

# Done! The job will now run automatically at 9 AM and 6 PM ET every day.
```

---

## 📋 Required Credentials

Before deploying, you'll need these API credentials:

### Essential (Required)
- **HeyGen API Key** - Get from https://heygen.com/api
- **OpenAI API Key** - Get from https://platform.openai.com/api-keys
- **Google Sheets Service Account** - Create in [GCP Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
  - Download JSON key file
  - Share your Google Sheet with the service account email (as Editor)

### Optional (For Social Media)
- **Instagram** - Access token + IG ID from [Facebook Developer Portal](https://developers.facebook.com/apps/)
- **Twitter/X** - API keys from [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
- **Pinterest** - Access token from [Pinterest Developers](https://developers.pinterest.com/)
- **YouTube** - OAuth credentials from [GCP Console](https://console.cloud.google.com/apis/credentials)

---

## 🎯 What This Deploys

Your deployment creates:

1. **Cloud Run Job** (`natureswaysoil-video-job`)
   - Runs the video generation pipeline
   - Configured with all your secrets
   - 60-minute timeout (adequate for video generation)

2. **Cloud Scheduler** (`natureswaysoil-video-2x`)
   - Triggers the job twice daily (9 AM & 6 PM ET)
   - Automatically invokes the Cloud Run Job

3. **Docker Image** in Artifact Registry
   - Contains your application code
   - Automatically rebuilt on each deploy

4. **Service Accounts** with minimal required permissions
   - Job service account (for running the job)
   - Scheduler service account (for triggering the job)

---

## 🔄 Updating After Changes

To deploy code changes:

```bash
# After making code changes and committing to git
./scripts/deploy-gcp.sh

# This will:
# - Rebuild the Docker image
# - Update the Cloud Run Job
# - No downtime (jobs run on schedule)
```

---

## 📊 Monitoring & Control

### View Logs
```bash
# Recent logs
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=50

# Follow logs in real-time
gcloud run jobs executions logs tail \
  --job=natureswaysoil-video-job \
  --region=us-east1
```

### Manual Execution
```bash
# Trigger a job run immediately
gcloud run jobs execute natureswaysoil-video-job --region=us-east1
```

### Pause/Resume Schedule
```bash
# Pause automatic runs
gcloud scheduler jobs pause natureswaysoil-video-2x --location=us-east1

# Resume automatic runs
gcloud scheduler jobs resume natureswaysoil-video-2x --location=us-east1
```

### Check Status
```bash
# Job status
gcloud run jobs describe natureswaysoil-video-job --region=us-east1

# Scheduler status
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1

# Recent executions
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=5
```

---

## 🛠️ Configuration

### Environment Variables

The job is configured with these environment variables (edit in `scripts/deploy-gcp.sh` if needed):

| Variable | Default | Description |
|----------|---------|-------------|
| `RUN_ONCE` | `true` | Exit after one cycle (for scheduled jobs) |
| `CSV_URL` | (your sheet) | Google Sheets CSV export URL |
| `CSV_COL_JOB_ID` | `ASIN` | Column to use as product ID |
| `CSV_COL_DETAILS` | `Title` | Column for product details |
| `HEYGEN_VIDEO_DURATION_SECONDS` | `30` | Video duration |

### Changing the Schedule

Edit `scripts/deploy-gcp.sh` line 173:

```bash
# Current: 9 AM and 6 PM daily
--schedule="0 9,18 * * *"

# Examples:
# Once daily at 9 AM:
--schedule="0 9 * * *"

# Three times daily (9 AM, 1 PM, 5 PM):
--schedule="0 9,13,17 * * *"

# Every 4 hours:
--schedule="0 */4 * * *"
```

Then redeploy: `./scripts/deploy-gcp.sh`

---

## 🚨 Troubleshooting

### Deployment fails with "permission denied"
```bash
# Make sure you're authenticated
gcloud auth login

# Ensure you have owner/editor role on the project
gcloud projects get-iam-policy $PROJECT_ID
```

### Videos not being generated
1. Check HeyGen API key is valid:
   ```bash
   gcloud secrets versions access latest --secret=HEYGEN_API_KEY
   ```
2. Check logs for errors:
   ```bash
   gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 | grep -i error
   ```

### Posts not reaching social media
1. Verify platform secrets exist:
   ```bash
   gcloud secrets list | grep -E "INSTAGRAM|TWITTER|PINTEREST|YT"
   ```
2. Check logs for posting errors:
   ```bash
   gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 | grep "Posted to"
   ```

### Job times out
HeyGen video generation can take up to 25 minutes per video. The default timeout is 60 minutes (3600 seconds).

If you process many videos, increase the timeout in `scripts/deploy-gcp.sh`:
```bash
--task-timeout=7200  # 2 hours
```

---

## 💰 Cost Estimate

**Monthly costs** for twice-daily execution with ~5 products per run:

| Service | Estimated Cost |
|---------|----------------|
| Google Cloud (Run, Scheduler, Build, Secrets) | $4-7 |
| HeyGen API (300 videos/month) | Variable* |
| OpenAI GPT-4 (300 scripts/month) | $15-20 |
| Social Media APIs | $0-100 |
| **Total** | **$20-130/month** |

\* Check current HeyGen pricing at https://heygen.com/pricing

---

## 📚 Additional Documentation

- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** - Comprehensive deployment guide (18KB, all details)
- **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** - Quick reference commands
- **[README.md](./README.md)** - Project overview and features
- **[OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)** - Day-to-day operations
- **[HOW_TO_DEBUG.md](./HOW_TO_DEBUG.md)** - Debugging guide

---

## 🆘 Getting Help

1. **Check deployment status:**
   ```bash
   PROJECT_ID=your-project-id ./scripts/verify-deployment.sh
   ```

2. **View recent errors:**
   ```bash
   gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 | grep -E "ERROR|Failed"
   ```

3. **Test individual components:**
   ```bash
   npm run validate        # Validate configuration
   npm run test:csv        # Test CSV fetching
   npm run test:openai     # Test script generation
   npm run test:platforms  # Test social media posting
   ```

4. **Full documentation:** See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)

---

## ✅ Success Indicators

After deployment, you should see:

1. ✅ Job exists: `gcloud run jobs list | grep natureswaysoil-video-job`
2. ✅ Scheduler exists: `gcloud scheduler jobs list | grep natureswaysoil-video-2x`
3. ✅ Secrets configured: `gcloud secrets list | grep -E "HEYGEN|OPENAI"`
4. ✅ Manual execution succeeds: `gcloud run jobs execute natureswaysoil-video-job --region=us-east1`
5. ✅ Logs show processing: Check logs for `Processing Row` and `Posted to` messages

---

**Last Updated:** December 2025  
**Status:** ✅ Production Ready
