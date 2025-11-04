# Production Deployment Guide - Video Generation System

## Overview

This guide covers deploying the automated video generation system to Google Cloud Platform. The system uses Google Sheets as a data source, HeyGen for AI-powered video generation with avatars, and posts to multiple social media platforms (Instagram, Twitter, Pinterest, YouTube).

**System Architecture:**
```
Google Sheets (CSV) → Video Generation Pipeline → Social Media Distribution
                              ↓
                     OpenAI (Script Generation)
                              ↓
                     HeyGen (Avatar Videos)
                              ↓
              Instagram | Twitter | Pinterest | YouTube
```

## Prerequisites

### 1. Google Cloud Platform Setup

- **GCP Project**: Create or use an existing project (e.g., `natureswaysoil-video`)
- **Billing**: Ensure billing is enabled on the project
- **gcloud CLI**: Install and authenticate with `gcloud auth login`
- **Required APIs**: The deployment script will enable these automatically:
  - Cloud Run API
  - Artifact Registry API
  - Cloud Build API
  - Cloud Scheduler API
  - Secret Manager API

### 2. Required Credentials

#### Essential (Required for basic operation):

1. **HeyGen API Key**
   - Sign up at https://heygen.com
   - Navigate to API settings in dashboard
   - Generate an API key

2. **OpenAI API Key**
   - Create account at https://platform.openai.com
   - Generate API key in settings
   - Needed for script generation

3. **Google Sheets Service Account**
   - Create service account in GCP Console
   - Download JSON key file
   - Share Google Sheet with service account email (Editor permission)
   - Required for reading products and writing video URLs back to sheet

4. **Instagram Business Account**
   - Facebook Business account required
   - Instagram Business or Creator account
   - Access token with `instagram_basic` and `instagram_content_publish` permissions
   - Instagram account ID (numeric)

#### Optional (For additional platforms):

5. **Twitter/X Developer Account**
   - Apply at https://developer.twitter.com
   - Create app and generate API keys
   - For video upload: API Key, API Secret, Access Token, Access Secret
   - For simple text posts: Bearer Token

6. **Pinterest Developer Account**
   - Apply at https://developers.pinterest.com
   - Create app and get access token
   - Create or find Board ID to post to

7. **YouTube Data API v3**
   - Enable in GCP Console
   - Create OAuth 2.0 credentials
   - Get refresh token using `scripts/get-youtube-refresh-token.ts`

## Step-by-Step Deployment

### Step 1: Prepare Your Environment

```bash
# Clone repository
git clone https://github.com/natureswaysoil/video.git
cd video

# Install dependencies
npm install

# Build the project
npm run build
```

### Step 2: Configure Secrets in Google Cloud

Create secrets in Google Cloud Secret Manager for all your credentials:

```bash
# Set your project ID
export PROJECT_ID=natureswaysoil-video
gcloud config set project $PROJECT_ID

# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create required secrets
echo -n "YOUR_HEYGEN_API_KEY" | gcloud secrets create HEYGEN_API_KEY --data-file=-
echo -n "YOUR_OPENAI_API_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=-
echo -n "YOUR_INSTAGRAM_TOKEN" | gcloud secrets create INSTAGRAM_ACCESS_TOKEN --data-file=-
echo -n "YOUR_INSTAGRAM_ID" | gcloud secrets create INSTAGRAM_IG_ID --data-file=-
echo -n "service-account@project.iam.gserviceaccount.com" | gcloud secrets create GS_SERVICE_ACCOUNT_EMAIL --data-file=-

# For GS_SERVICE_ACCOUNT_KEY, use the full JSON key with newlines as \n
# Single-line format: {"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}
cat service-account-key.json | tr -d '\n' | gcloud secrets create GS_SERVICE_ACCOUNT_KEY --data-file=-

# Optional: Twitter secrets
echo -n "YOUR_TWITTER_BEARER" | gcloud secrets create TWITTER_BEARER_TOKEN --data-file=-
echo -n "YOUR_TWITTER_API_KEY" | gcloud secrets create TWITTER_API_KEY --data-file=-
echo -n "YOUR_TWITTER_API_SECRET" | gcloud secrets create TWITTER_API_SECRET --data-file=-
echo -n "YOUR_TWITTER_ACCESS_TOKEN" | gcloud secrets create TWITTER_ACCESS_TOKEN --data-file=-
echo -n "YOUR_TWITTER_ACCESS_SECRET" | gcloud secrets create TWITTER_ACCESS_SECRET --data-file=-

# Optional: Pinterest secrets
echo -n "YOUR_PINTEREST_TOKEN" | gcloud secrets create PINTEREST_ACCESS_TOKEN --data-file=-
echo -n "YOUR_BOARD_ID" | gcloud secrets create PINTEREST_BOARD_ID --data-file=-

# Optional: YouTube secrets
echo -n "YOUR_YT_CLIENT_ID" | gcloud secrets create YT_CLIENT_ID --data-file=-
echo -n "YOUR_YT_CLIENT_SECRET" | gcloud secrets create YT_CLIENT_SECRET --data-file=-
echo -n "YOUR_YT_REFRESH_TOKEN" | gcloud secrets create YT_REFRESH_TOKEN --data-file=-
```

**Alternative**: Use the helper script to create secrets from a `.env` file:
```bash
# Copy and fill in your credentials
cp .env.example .env
# Edit .env with your actual values
nano .env

# Create all secrets from .env
./scripts/create-secrets-from-env.sh
```

### Step 3: Prepare Your Google Sheet

1. **Set up sheet structure**:
   - Your sheet should have columns for: `Product_ID`, `ASIN`, `Title`, `Short_Name`
   - Add columns for video tracking: `Video URL`, `Posted`, `Posted_At`
   - Optional: `HEYGEN_AVATAR`, `HEYGEN_VOICE`, `HEYGEN_LENGTH_SECONDS`, `HEYGEN_MAPPING_REASON`

2. **Get CSV Export URL**:
   - Open your Google Sheet
   - Note the sheet ID from URL: `docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid={GID}`
   - Construct CSV URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}`
   - Example: `https://docs.google.com/spreadsheets/d/1LU2ahpzMqLB5FLYqiyDbXOfjTxbdp8U8/export?format=csv&gid=1712974299`

3. **Share with service account**:
   - Share sheet with your service account email (from secret `GS_SERVICE_ACCOUNT_EMAIL`)
   - Grant "Editor" permission to allow writeback

4. **Update CSV URL in deployment script**:
   ```bash
   # Edit scripts/deploy-gcp.sh
   # Update CSV_URL_DEFAULT variable with your sheet's CSV export URL
   ```

### Step 4: Deploy to Google Cloud

Run the deployment script:

```bash
# Set environment variables (optional, defaults shown)
export PROJECT_ID=natureswaysoil-video
export REGION=us-east1
export TIME_ZONE=America/New_York

# Run deployment
./scripts/deploy-gcp.sh
```

The script will:
1. ✅ Enable required Google Cloud APIs
2. ✅ Create Artifact Registry repository
3. ✅ Build and push Docker container
4. ✅ Create service accounts with appropriate permissions
5. ✅ Create Cloud Run Job with secrets attached
6. ✅ Create Cloud Scheduler job for twice-daily execution (9:00 AM and 6:00 PM)

**Expected output:**
```
Project: natureswaysoil-video | Region: us-east1 | Time zone: America/New_York
Enabling required services...
Creating Artifact Registry (if not exists)...
Building and pushing image...
Creating job service account...
Creating Cloud Run Job...
Creating Cloud Scheduler job...
Done. Tip: Share your Google Sheet with video-job-sa@natureswaysoil-video.iam.gserviceaccount.com as Editor for writeback.
```

### Step 5: Verify Deployment

Run the verification script to check all components:

```bash
./scripts/verify-deployment.sh
```

This will check:
- ✅ gcloud authentication
- ✅ Project configuration
- ✅ Required APIs enabled
- ✅ All required secrets configured
- ✅ Cloud Run Job exists and is configured
- ✅ Cloud Scheduler job exists and is enabled
- ✅ Service accounts exist
- ✅ Dockerfile configuration
- ✅ Build artifacts

**Expected output:**
```
✅ System is ready for deployment!

Next steps:
  1. Review configuration: gcloud run jobs describe natureswaysoil-video-job --region=us-east1
  2. Test manually: gcloud run jobs execute natureswaysoil-video-job --region=us-east1
  3. Check logs: gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1
  4. Monitor scheduler: gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1
```

### Step 6: Test Manual Execution

Before relying on the scheduler, test a manual execution:

```bash
# Execute the job manually
gcloud run jobs execute natureswaysoil-video-job --region=us-east1

# Wait a few moments, then check the logs
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=100
```

**Look for these log messages:**
- `Processing Row X` - Row being processed
- `🎬 Creating video with HeyGen...` - Video generation started
- `✅ HeyGen video ready: https://...` - Video completed
- `✅ Posted to Instagram: ...` - Social media posts
- `✅ Wrote video URL to sheet` - Sheet writeback

### Step 7: Enable Automated Schedule

The scheduler is created by the deployment script with this schedule:
- **Schedule**: Twice daily at 9:00 AM and 6:00 PM Eastern Time
- **Cron**: `0 9,18 * * *`
- **Timezone**: `America/New_York`

To manually trigger:
```bash
gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1
```

To pause:
```bash
gcloud scheduler jobs pause natureswaysoil-video-2x --location=us-east1
```

To resume:
```bash
gcloud scheduler jobs resume natureswaysoil-video-2x --location=us-east1
```

## Configuration Options

### Environment Variables

The Cloud Run Job is configured with these environment variables (set in `deploy-gcp.sh`):

| Variable | Default | Description |
|----------|---------|-------------|
| `RUN_ONCE` | `true` | Process once and exit (for scheduled jobs) |
| `CSV_URL` | *(from script)* | Google Sheets CSV export URL |
| `CSV_COL_JOB_ID` | `ASIN` | Column to use as job ID |
| `CSV_COL_DETAILS` | `Title` | Column for product details |
| `VIDEO_URL_TEMPLATE` | `https://heygen.ai/jobs/{jobId}/video.mp4` | Template for video URL |
| `HEYGEN_VIDEO_DURATION_SECONDS` | `30` | Default video duration |

### Secrets (from Secret Manager)

All secrets are automatically attached from Google Cloud Secret Manager:
- `HEYGEN_API_KEY` - HeyGen API credentials
- `OPENAI_API_KEY` - OpenAI GPT-4 API key
- `INSTAGRAM_ACCESS_TOKEN` - Instagram Graph API token
- `INSTAGRAM_IG_ID` - Instagram Business account ID
- `GS_SERVICE_ACCOUNT_EMAIL` - Service account email for Sheets
- `GS_SERVICE_ACCOUNT_KEY` - Service account JSON key for Sheets
- *(Optional)* Twitter, Pinterest, YouTube credentials

### Customizing the Schedule

Edit the schedule in `scripts/deploy-gcp.sh`:

```bash
# Current: Twice daily at 9 AM and 6 PM
--schedule="0 9,18 * * *"

# Examples:
# Once daily at 9 AM:
--schedule="0 9 * * *"

# Three times a day (9 AM, 1 PM, 5 PM):
--schedule="0 9,13,17 * * *"

# Every 4 hours:
--schedule="0 */4 * * *"
```

## Monitoring and Maintenance

### View Logs

**Recent logs:**
```bash
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=50
```

**Follow logs in real-time:**
```bash
gcloud run jobs executions logs tail \
  --job=natureswaysoil-video-job \
  --region=us-east1
```

**Filter for errors only:**
```bash
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=100 | grep -E "(ERROR|❌|Failed)"
```

### Check Job Status

```bash
# View job configuration
gcloud run jobs describe natureswaysoil-video-job --region=us-east1

# List recent executions
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=10
```

### Check Scheduler Status

```bash
# View scheduler configuration
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1

# Pause scheduler
gcloud scheduler jobs pause natureswaysoil-video-2x --location=us-east1

# Resume scheduler
gcloud scheduler jobs resume natureswaysoil-video-2x --location=us-east1
```

### Health Monitoring

The system includes a health check endpoint available during job execution:

- **Endpoint**: `http://localhost:8080/health` (internal)
- **Metrics**: 
  - Status (idle/processing/error)
  - Rows processed
  - Successful/failed posts
  - Recent errors
  - Uptime

For external monitoring, parse Cloud Run logs for health indicators:
- Look for: `✅ Posted to` (successful posts)
- Watch for: `❌` (errors)
- Monitor: `⏭️ Skipping row` (skipped items)

### Update Secrets

To rotate or update a secret:

```bash
# Update secret value
echo -n "NEW_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-

# Disable old version (optional)
gcloud secrets versions disable VERSION_NUMBER --secret=SECRET_NAME

# Cloud Run Job will automatically use the latest version
```

### Update Deployment

To deploy code changes:

```bash
# Make your code changes
# Commit to git

# Re-run deployment script
./scripts/deploy-gcp.sh

# This will rebuild the container and update the job
```

## Troubleshooting

### No Videos Generated

**Symptoms**: Job runs but no videos are created

**Checks**:
1. Verify HeyGen API key is valid:
   ```bash
   gcloud secrets versions access latest --secret=HEYGEN_API_KEY
   ```
2. Check logs for HeyGen errors:
   ```bash
   gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 | grep HeyGen
   ```
3. Verify OpenAI API key for script generation
4. Ensure products in sheet have required columns (`Title` or `Short_Name`)

### Posts Not Reaching Social Media

**Symptoms**: Videos created but not posted to platforms

**Checks**:
1. Verify platform credentials in Secret Manager
2. Check logs for posting errors:
   ```bash
   gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 | grep "Posted to"
   ```
3. Instagram: Verify account is Business/Creator and tokens are valid
4. Twitter: Ensure API app has read/write permissions
5. Pinterest: Verify board ID exists and is accessible

### Video URLs Not Written to Sheet

**Symptoms**: Videos created but sheet not updated

**Checks**:
1. Verify service account email in secrets matches sheet sharing
2. Check service account has Editor permission on sheet
3. Verify `GS_SERVICE_ACCOUNT_KEY` secret is valid JSON
4. Check logs for writeback errors:
   ```bash
   gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 | grep "Wrote.*to sheet"
   ```

### Job Execution Timeout

**Symptoms**: Job terminates before completing

**Solution**: Increase timeout in deployment script:
```bash
# In scripts/deploy-gcp.sh, add to job creation/update:
--task-timeout=3600s  # 1 hour timeout
```

HeyGen video generation can take up to 25 minutes per video. Budget accordingly:
- 1 video: ~30 minutes
- 3 videos: ~90 minutes
- 5+ videos: Consider splitting into multiple runs

### Scheduler Not Triggering

**Symptoms**: Scheduled time passes but job doesn't run

**Checks**:
1. Verify scheduler is enabled:
   ```bash
   gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1
   ```
2. Check scheduler service account has permissions:
   ```bash
   gcloud projects get-iam-policy natureswaysoil-video \
     --flatten="bindings[].members" \
     --filter="bindings.members:scheduler-invoker"
   ```
3. Manually trigger to test:
   ```bash
   gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1
   ```

## Cost Estimation

### Google Cloud Platform

**Per Month** (assuming twice-daily execution, 5 products per run):

| Service | Usage | Estimated Cost |
|---------|-------|----------------|
| Cloud Run Jobs | ~60 executions × 30min | $2-5 |
| Cloud Scheduler | 60 jobs/month | $0.30 |
| Cloud Build | ~5 builds/month | $0.50 |
| Artifact Registry | Storage + pulls | $0.50 |
| Secret Manager | ~20 secrets | $0.36 |
| **Total GCP** | | **~$4-7/month** |

### External Services

| Service | Usage | Estimated Cost |
|---------|-------|----------------|
| HeyGen API | 300 videos/month (30sec each) | Variable* |
| OpenAI GPT-4 | 300 scripts/month | $15-20 |
| Instagram API | Free with Business account | $0 |
| Twitter API | Free tier (limited) | $0-100 |
| Pinterest API | Free | $0 |
| YouTube API | Free (quota limits) | $0 |
| **Total External** | | **$15-120/month** |

\* HeyGen pricing varies by plan. Check https://heygen.com/pricing

**Total Estimated Monthly Cost**: $20-130

## Security Best Practices

### Secrets Management

✅ **DO**:
- Store all credentials in Google Cloud Secret Manager
- Use service accounts with minimal required permissions
- Rotate API keys and tokens regularly (quarterly)
- Enable secret version history for rollback capability

❌ **DON'T**:
- Commit secrets to version control
- Share secrets via email or chat
- Use personal accounts for service integrations
- Hardcode credentials in code or scripts

### Access Control

- Limit who can view/modify secrets in GCP
- Use separate service accounts for different jobs
- Enable audit logging for secret access
- Review IAM permissions quarterly

### Monitoring

- Set up alerts for job failures
- Monitor API rate limits and quotas
- Track secret access in audit logs
- Review execution logs regularly for anomalies

## Support and Resources

### Documentation
- [HeyGen API Docs](https://docs.heygen.com)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)
- [Twitter API v2](https://developer.twitter.com/en/docs/twitter-api)
- [Pinterest API](https://developers.pinterest.com/docs)
- [YouTube Data API](https://developers.google.com/youtube/v3)

### Google Cloud Resources
- [Cloud Run Jobs Documentation](https://cloud.google.com/run/docs/create-jobs)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)

### Getting Help

1. Check logs for error messages
2. Review troubleshooting section above
3. Verify all secrets are configured correctly
4. Test components individually (see Testing section)
5. Check external API status pages for outages

## Appendix: Testing Components

### Test HeyGen Integration

```bash
# Create a test script
npx ts-node scripts/test-heygen.ts
```

### Test Social Media Posts

```bash
# Instagram
npx ts-node scripts/test-instagram.ts

# YouTube  
npx ts-node scripts/test-youtube.ts
```

### Test Google Sheets Access

```bash
# Verify service account can read/write
npx ts-node scripts/fill-video-urls.ts
```

### Dry Run (No Posting)

```bash
# Test video generation without posting to social media
gcloud run jobs execute natureswaysoil-video-job \
  --region=us-east1 \
  --set-env-vars=DRY_RUN_LOG_ONLY=true
```

---

**Last Updated**: October 22, 2025
**Version**: 1.0.0
**Status**: ✅ Production Ready
