# Complete Video Generation System Automation Guide

## Overview

This guide provides comprehensive instructions for automating the entire video generation workflow for Nature's Way Soil products. The system automatically:

1. **Fetches product data** from Google Sheets (Parent ASIN, product details)
2. **Generates marketing scripts** using OpenAI GPT
3. **Creates 30-second videos** using HeyGen AI with avatar/voice mapping
4. **Uploads videos** to Google Sheets for website integration
5. **Posts to social media** (Instagram, Twitter, Pinterest, YouTube)
6. **Runs on schedule** twice daily at 9 AM and 6 PM Eastern Time
7. **Cleans up** and maintains the system automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Google Cloud Scheduler                   │
│                 (9 AM & 6 PM Eastern, Daily)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloud Run Job Execution                   │
│                  (60-minute timeout per run)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌─────────────────────┐       ┌─────────────────────┐
│  Google Sheets CSV  │       │  Credentials from   │
│  (Product Data)     │       │  Secret Manager     │
└──────────┬──────────┘       └──────────┬──────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
           ┌──────────────────────────────┐
           │   Process Each Product Row   │
           └──────────┬───────────────────┘
                      │
          ┌───────────┴────────────┐
          ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐
│ OpenAI Script Gen   │  │  Check for Existing │
│ (5-10 seconds)      │  │  Video URL          │
└──────────┬──────────┘  └──────────┬──────────┘
           │                        │
           │                        │ (if none)
           └────────────┬───────────┘
                        ▼
           ┌────────────────────────────┐
           │  HeyGen Video Generation   │
           │  - Smart avatar mapping    │
           │  - 30-second videos        │
           │  - 10-15 min generation    │
           └────────────┬───────────────┘
                        │
                        ▼
           ┌────────────────────────────┐
           │  Write Video URL to Sheet  │
           │  (Column AB + mapping info)│
           └────────────┬───────────────┘
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
┌─────────────────────┐      ┌─────────────────────┐
│ Social Media Posts  │      │  Mark Row as Posted │
│ - Instagram         │      │  Update timestamp   │
│ - Twitter           │      └─────────────────────┘
│ - Pinterest         │
│ - YouTube (optional)│
└─────────────────────┘
```

## Prerequisites

### Required Accounts & Credentials

1. **Google Cloud Platform**
   - Project with billing enabled
   - Cloud Run, Artifact Registry, Cloud Scheduler, Secret Manager APIs enabled
   - Service account with appropriate permissions

2. **Google Sheets**
   - Spreadsheet with product data (ASIN, Title, Description)
   - CSV export URL available
   - Service account granted Editor access to the sheet

3. **HeyGen**
   - Active account at https://heygen.com
   - API key from dashboard
   - Sufficient credits for video generation

4. **OpenAI**
   - API key from https://platform.openai.com
   - GPT-4 or GPT-3.5-turbo access

5. **Social Media Platforms** (Optional but recommended)
   - **Instagram**: Business/Creator account, Access Token, IG User ID
   - **Twitter/X**: Developer account, API keys and tokens
   - **Pinterest**: Business account, Access Token, Board ID
   - **YouTube**: Google Cloud OAuth credentials, Channel access

## Step-by-Step Deployment

### Step 1: Clone Repository

```bash
git clone https://github.com/natureswaysoil/video.git
cd video
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Google Sheets - Product Data Source
CSV_URL="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID"

# CSV Column Mapping (adjust to match your sheet)
CSV_COL_JOB_ID="ASIN"
CSV_COL_TITLE="Title"
CSV_COL_DETAILS="Title"
CSV_COL_ASIN="ASIN,Parent_ASIN"

# Google Sheets Writeback (for marking posted)
GS_SERVICE_ACCOUNT_EMAIL="your-sa@project.iam.gserviceaccount.com"
GS_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# HeyGen (Required)
HEYGEN_API_KEY="your_heygen_api_key"
HEYGEN_VIDEO_DURATION_SECONDS=30

# OpenAI (Required for script generation)
OPENAI_API_KEY="your_openai_api_key"

# Instagram (Optional)
INSTAGRAM_ACCESS_TOKEN="your_instagram_token"
INSTAGRAM_IG_ID="your_ig_user_id"

# Twitter/X (Optional)
TWITTER_API_KEY="your_api_key"
TWITTER_API_SECRET="your_api_secret"
TWITTER_ACCESS_TOKEN="your_access_token"
TWITTER_ACCESS_SECRET="your_access_secret"

# Pinterest (Optional)
PINTEREST_ACCESS_TOKEN="your_pinterest_token"
PINTEREST_BOARD_ID="your_board_id"

# YouTube (Optional)
YT_CLIENT_ID="your_client_id"
YT_CLIENT_SECRET="your_client_secret"
YT_REFRESH_TOKEN="your_refresh_token"

# Execution Mode
RUN_ONCE=true  # Set to false for continuous polling in development
```

### Step 4: Test Locally

Before deploying to the cloud, test the system locally:

#### Dry Run (No Social Media Posting)

```bash
DRY_RUN_LOG_ONLY=true RUN_ONCE=true npm run dev
```

This will:
- ✅ Fetch products from Google Sheets
- ✅ Generate scripts with OpenAI
- ✅ Create videos with HeyGen
- ✅ Write video URLs to sheet
- ❌ Skip social media posting (just logs what would be posted)

#### Full Test (Single Product)

```bash
RUN_ONCE=true npm run dev
```

This processes one product end-to-end including social media posting.

**Expected output:**
```
🏥 Health check server running on port 8080
========== Processing Row 2 ==========
Product: { title: 'Product Name', ... }
No existing video found. Creating new video with HeyGen...
✅ Generated script with OpenAI: ...
🎬 Creating video with HeyGen...
📝 HeyGen mapping: { avatar: 'garden_expert_01', voice: 'en_us_warm_female_01', ... }
✅ Created HeyGen video job: abc123
⏳ Waiting for HeyGen video completion...
✅ HeyGen video ready: https://...
✅ Wrote video URL to sheet
✅ Posted to Instagram: { id: '...' }
✅ Posted to Twitter: { data: { id: '...' } }
✅ Posted to Pinterest: { id: '...' }
```

### Step 5: Deploy to Google Cloud

#### Set Environment Variables

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-east1"  # or your preferred region
export TIME_ZONE="America/New_York"
```

#### Create Secrets in Secret Manager

```bash
# From .env file
source .env
./scripts/create-secrets-from-env.sh

# Or interactively
./scripts/create-secrets-from-env.sh --interactive
```

#### Deploy Cloud Run Job

```bash
./scripts/deploy-gcp.sh
```

This script will:
1. Enable required Google Cloud APIs
2. Create Artifact Registry repository
3. Build and push Docker image
4. Create service accounts
5. Grant necessary permissions
6. Create Cloud Run Job with secrets
7. Set up Cloud Scheduler for twice-daily execution

**Expected output:**
```
Project: your-project | Region: us-east1 | Time zone: America/New_York
Enabling required services...
Creating Artifact Registry (if not exists)...
Building and pushing image...
Creating job service account...
Creating Cloud Run Job...
Creating Cloud Scheduler job...
Done. Tip: Share your Google Sheet with video-job-sa@... as Editor
```

#### Verify Deployment

```bash
# Check job status
gcloud run jobs describe natureswaysoil-video-job --region=$REGION

# Check scheduler status
gcloud scheduler jobs describe natureswaysoil-video-2x --location=$REGION

# List scheduled executions
gcloud scheduler jobs list --location=$REGION
```

### Step 6: Configure Google Sheets Access

The Cloud Run job needs write access to your Google Sheets:

1. Copy the service account email from deployment output:
   ```
   video-job-sa@your-project.iam.gserviceaccount.com
   ```

2. Open your Google Sheet

3. Click **Share** button

4. Paste the service account email

5. Set permission to **Editor**

6. Uncheck "Notify people" (it's a service account, not a person)

7. Click **Share**

### Step 7: Verify Scheduled Execution

The Cloud Scheduler will automatically run the job twice daily at 9 AM and 6 PM Eastern Time.

#### Manually Trigger Test Run

```bash
gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION
```

#### Monitor Execution

```bash
# Watch job executions
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=$REGION \
  --limit=5

# View logs for latest execution
gcloud logging read \
  'resource.type="cloud_run_job"
   resource.labels.job_name="natureswaysoil-video-job"' \
  --limit=200 \
  --format="table(timestamp,severity,textPayload)"
```

## System Configuration

### Video Generation Settings

#### HeyGen Avatar/Voice Mapping

The system intelligently maps products to avatars based on keywords:

| Product Keywords | Avatar | Voice | Duration |
|-----------------|--------|-------|----------|
| kelp, seaweed, algae | garden_expert_01 | en_us_warm_female_01 | 30s |
| bone meal, bonemeal | farm_expert_02 | en_us_deep_male_01 | 35s |
| hay, pasture, forage | pasture_specialist_01 | en_us_neutral_mx_01 | 40s |
| humic, fulvic, humate | eco_gardener_01 | en_us_warm_female_02 | 30s |
| compost, tea, soil | eco_gardener_01 | en_us_warm_female_02 | 30s |
| (default) | garden_expert_01 | en_us_warm_female_01 | 30s |

**Override defaults:**
```bash
# In .env or Cloud Run environment
HEYGEN_DEFAULT_AVATAR=your_preferred_avatar
HEYGEN_DEFAULT_VOICE=your_preferred_voice
```

**Custom mappings:**
Edit `src/heygen-adapter.ts` to add your own rules.

### Posting Schedule Configuration

The system runs twice daily at specific times:

```bash
# Default: 9 AM and 6 PM Eastern
# Cron: 0 9,18 * * *
```

**Change schedule:**

```bash
# Update scheduler
gcloud scheduler jobs update http natureswaysoil-video-2x \
  --location=$REGION \
  --schedule="0 9,21 * * *" \  # 9 AM and 9 PM
  --time-zone="America/New_York"
```

### Video URL Storage

Videos are written to column AB by default:

```bash
SHEET_VIDEO_TARGET_COLUMN_LETTER=AB
```

**Change target column:**
```bash
# Update in .env or Cloud Run environment
SHEET_VIDEO_TARGET_COLUMN_LETTER=AC  # or any column
```

### Social Media Platform Selection

Control which platforms to post to:

```bash
# Post to all configured platforms (default)
ENABLE_PLATFORMS=

# Post to specific platforms only
ENABLE_PLATFORMS=instagram,twitter

# Disable all social posting (video generation only)
ENABLE_PLATFORMS=none
```

### Processing Behavior

```bash
# Process only new products (skip Posted=TRUE rows)
ALWAYS_GENERATE_NEW_VIDEO=false

# Always generate new videos (ignore Posted column)
ALWAYS_GENERATE_NEW_VIDEO=true

# Enforce posting windows (only post during scheduled times)
ENFORCE_POSTING_WINDOWS=true

# Allow posting anytime
ENFORCE_POSTING_WINDOWS=false
```

## Monitoring & Maintenance

### Health Check Endpoint

The system exposes health metrics at `/health`:

```bash
# Local testing
curl http://localhost:8080/health

# Cloud Run (requires authentication)
curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  https://YOUR_SERVICE_URL/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "video-automation",
  "version": "2.0.0",
  "uptime": 1234,
  "uptimeFormatted": "20m 34s",
  "timestamp": "2025-10-22T20:00:00.000Z",
  "lastRun": {
    "timestamp": "2025-10-22T19:45:00.000Z",
    "status": "idle",
    "rowsProcessed": 5,
    "successfulPosts": 15,
    "failedPosts": 0,
    "errors": []
  }
}
```

### Log Analysis

#### Filter by Severity

```bash
# Errors only
gcloud logging read \
  'resource.type="cloud_run_job"
   resource.labels.job_name="natureswaysoil-video-job"
   severity>=ERROR' \
  --limit=50

# HeyGen-specific logs
gcloud logging read \
  'resource.type="cloud_run_job"
   resource.labels.job_name="natureswaysoil-video-job"
   textPayload=~"HeyGen"' \
  --limit=50
```

#### Track Video Generation

```bash
# Find video generation logs
gcloud logging read \
  'resource.type="cloud_run_job"
   textPayload=~"🎬|✅ HeyGen video ready"' \
  --limit=20 \
  --format="table(timestamp,textPayload)"
```

### Common Issues & Solutions

#### Issue: Job Timeout (600 seconds)

**Symptom:** Job terminates with "maximum timeout reached"

**Solution:**
```bash
# Increase task timeout to 60 minutes (3600 seconds)
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --task-timeout=3600
```

#### Issue: HeyGen Video Generation Fails

**Symptoms:** 
- "HeyGen API key required"
- "HeyGen job failed"
- Videos not generated

**Solutions:**

1. **Check API key:**
   ```bash
   # Verify secret exists
   gcloud secrets versions access latest --secret=HEYGEN_API_KEY
   
   # Update if needed
   echo -n "new_api_key" | gcloud secrets versions add HEYGEN_API_KEY --data-file=-
   ```

2. **Check HeyGen account:**
   - Verify credits available
   - Check API key is active
   - Review rate limits

3. **Increase timeout:**
   Update polling timeout in environment:
   ```bash
   HEYGEN_POLL_TIMEOUT_MS=1800000  # 30 minutes
   ```

#### Issue: Google Sheets Write Fails

**Symptom:** "Failed to write video URL to sheet"

**Solutions:**

1. **Verify service account access:**
   - Ensure SA has Editor access to sheet
   - Check SA email is correct in secrets

2. **Check credentials:**
   ```bash
   # Test GS_SERVICE_ACCOUNT_KEY format
   gcloud secrets versions access latest --secret=GS_SERVICE_ACCOUNT_KEY | jq .
   ```

3. **Verify spreadsheet ID:**
   Extract from CSV_URL and ensure it's correct

#### Issue: Social Media Posting Fails

**Symptoms:**
- "Instagram post failed after 3 retries"
- "Twitter post failed"

**Solutions:**

1. **Instagram:**
   - Verify token hasn't expired (tokens expire every 60 days)
   - Check IG_ID is correct
   - Ensure account is Business/Creator type

2. **Twitter:**
   - Verify all 4 credentials are set (API Key, Secret, Access Token, Access Secret)
   - Check app permissions include write access
   - Verify account isn't suspended

3. **Pinterest:**
   - Ensure PINTEREST_BOARD_ID is set
   - Verify token is valid
   - Check board exists and isn't deleted

#### Issue: No Products Processed

**Symptom:** "No valid products found in sheet"

**Solutions:**

1. **Check CSV URL:**
   ```bash
   # Test CSV download
   curl "$CSV_URL" | head -20
   ```

2. **Verify column mappings:**
   Ensure CSV_COL_* variables match your sheet headers

3. **Check Ready/Posted columns:**
   - Rows with Posted=TRUE are skipped (unless ALWAYS_GENERATE_NEW_VIDEO=true)
   - Rows need Ready=TRUE or similar status

### Cleanup & Maintenance

#### Stray Video Cleanup

Videos are stored in HeyGen's cloud and referenced in Google Sheets. To clean up:

1. **Identify stray videos:**
   - Videos not referenced in sheet
   - Failed generation attempts
   - Test videos

2. **Manual cleanup:**
   Currently, cleanup is manual through HeyGen dashboard. Future enhancement could automate this.

#### Sheet Column Cleanup

The system writes to these columns:
- Video URL (column AB by default)
- HEYGEN_AVATAR
- HEYGEN_VOICE
- HEYGEN_LENGTH_SECONDS
- HEYGEN_MAPPING_REASON
- HEYGEN_MAPPED_AT
- Posted
- Posted_At

To reset/cleanup:
1. Clear Posted column to reprocess rows
2. Clear Video URL column to regenerate videos
3. Archive old data to another sheet

#### Secret Rotation

Regularly rotate credentials:

```bash
# Update a secret
echo -n "new_value" | gcloud secrets versions add SECRET_NAME --data-file=-

# Redeploy job to use new version
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --update-secrets=SECRET_NAME=SECRET_NAME:latest
```

## Performance & Reliability

### Expected Performance

**Per Product:**
- Script generation: 5-10 seconds
- Video generation: 10-15 minutes
- Social media posts: 5-30 seconds total
- Sheet writeback: 1-2 seconds

**Total Time (10 products):**
- ~2-3 hours with sequential processing
- Job timeout: 60 minutes (processes as many as possible)

### Reliability Features

1. **Retry Logic:**
   - Social media posts: 3 retries with exponential backoff
   - YouTube uploads: 2 retries (longer operations)

2. **Error Handling:**
   - Failures on one product don't stop others
   - Comprehensive error logging
   - Health metrics tracking

3. **Idempotency:**
   - Skips already-posted rows (when ALWAYS_GENERATE_NEW_VIDEO=false)
   - Won't duplicate posts

4. **Timeout Management:**
   - HeyGen polling: 25 minutes max
   - Task timeout: 60 minutes
   - Scheduler timeout: 30 minutes (per attempt)

### Cost Estimation

**Google Cloud (monthly, US East):**
- Cloud Run Job executions: ~$5-10
- Cloud Scheduler: $0.10
- Secret Manager: $0.06 per secret
- Artifact Registry: ~$0.10
- Logging: ~$1-5
- **Total:** ~$6-15/month

**HeyGen:**
- $0.50-2.00 per video (varies by plan)
- 60 videos/month (2 per day) = $30-120/month

**OpenAI:**
- GPT-4: ~$0.01-0.05 per script
- 60 scripts/month = $0.60-3/month

**Total estimated cost:** ~$37-138/month depending on usage and plans

## Verification & Testing

### Pre-Production Checklist

- [ ] Repository cloned and dependencies installed
- [ ] `.env` file configured with all credentials
- [ ] Local dry run successful
- [ ] Local full run processes one product successfully
- [ ] Build passes: `npm run build`
- [ ] Type check passes: `npm run typecheck`
- [ ] Google Cloud project created with billing
- [ ] APIs enabled (Cloud Run, Scheduler, Secret Manager, Artifact Registry)
- [ ] Secrets created in Secret Manager
- [ ] Deployment script executed successfully
- [ ] Service account granted Editor access to Google Sheet
- [ ] Manual scheduler trigger successful
- [ ] Logs show successful execution
- [ ] Video URL written to sheet
- [ ] Social media posts successful (if enabled)

### Post-Deployment Verification

1. **Immediate Test:**
   ```bash
   # Trigger manual execution
   gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION
   
   # Watch logs
   gcloud logging tail \
     'resource.type="cloud_run_job"
      resource.labels.job_name="natureswaysoil-video-job"'
   ```

2. **Check Results:**
   - Open Google Sheet
   - Verify Video URL column populated
   - Check HeyGen mapping columns
   - Verify Posted column updated
   - Check social media accounts for posts

3. **Monitor Next Scheduled Run:**
   - Wait for next 9 AM or 6 PM execution
   - Verify automatic execution
   - Check logs for any errors
   - Confirm products processed

### Reliability Testing

Run these tests to verify system reliability:

1. **Dry Run Test:**
   ```bash
   DRY_RUN_LOG_ONLY=true RUN_ONCE=true npm run dev
   ```
   Expected: Videos generated, no social posts

2. **Single Platform Test:**
   ```bash
   ENABLE_PLATFORMS=twitter RUN_ONCE=true npm run dev
   ```
   Expected: Only Twitter posts

3. **Retry Test:**
   Temporarily use invalid credentials for one platform
   Expected: 3 retries, then skip, continue with other platforms

4. **Timeout Test:**
   Set very short timeout
   Expected: Graceful timeout handling

5. **Large Dataset Test:**
   Use sheet with 20+ products
   Expected: Processes as many as possible within 60 min

## Troubleshooting Guide

### Debug Mode

Enable verbose logging:

```bash
# In .env or Cloud Run environment
LOG_LEVEL=debug
HEYGEN_DEBUG=true
```

### Step-by-Step Diagnosis

1. **Check Scheduler Status:**
   ```bash
   gcloud scheduler jobs describe natureswaysoil-video-2x --location=$REGION
   ```
   Should show: `state: ENABLED`

2. **Check Recent Executions:**
   ```bash
   gcloud run jobs executions list \
     --job=natureswaysoil-video-job \
     --region=$REGION \
     --limit=5
   ```

3. **Check Logs for Errors:**
   ```bash
   gcloud logging read \
     'resource.type="cloud_run_job"
      severity>=ERROR' \
     --limit=50
   ```

4. **Verify Secrets:**
   ```bash
   # List all secrets
   gcloud secrets list
   
   # Check secret has versions
   gcloud secrets versions list SECRET_NAME
   ```

5. **Test CSV Access:**
   ```bash
   curl "$CSV_URL" | head -20
   ```

6. **Verify Service Account Permissions:**
   ```bash
   # Check IAM bindings
   gcloud projects get-iam-policy $PROJECT_ID \
     --filter="bindings.members:serviceAccount:video-job-sa@*"
   ```

### Getting Help

1. **Check Documentation:**
   - This guide
   - `HEYGEN_SETUP.md` - HeyGen integration details
   - `README.md` - General usage
   - `.env.example` - Configuration options

2. **Review Logs:**
   - Cloud Run logs in GCP Console
   - Look for emoji markers: 🎬 🏥 ✅ ❌ ⚠️

3. **Health Endpoint:**
   Check `/health` for status and recent errors

4. **GitHub Issues:**
   Open an issue in the repository with:
   - Error logs
   - Configuration (redact secrets)
   - Steps to reproduce

## Security Best Practices

1. **Never commit secrets:**
   - Keep `.env` out of version control (already in .gitignore)
   - Use Secret Manager for production
   - Rotate credentials regularly

2. **Principle of least privilege:**
   - Service accounts have minimal necessary permissions
   - Review IAM bindings periodically

3. **Audit logs:**
   - Enable Cloud Audit Logs
   - Review Secret Manager access logs
   - Monitor for unusual activity

4. **Network security:**
   - Cloud Run uses HTTPS only
   - All external API calls use TLS
   - No public endpoints (except health check)

5. **Credential management:**
   - Use Secret Manager (not env vars) in production
   - Enable secret versioning
   - Set up secret expiration alerts

## Appendix

### Environment Variables Reference

See `.env.example` for complete list with descriptions.

**Required:**
- `CSV_URL` - Google Sheets CSV export URL
- `HEYGEN_API_KEY` - HeyGen API key
- `OPENAI_API_KEY` - OpenAI API key

**Recommended:**
- `GS_SERVICE_ACCOUNT_EMAIL` - For sheet writeback
- `GS_SERVICE_ACCOUNT_KEY` - Service account credentials
- Social media credentials (at least one platform)

### Column Names Reference

**Input Columns (from your sheet):**
- ASIN or Parent_ASIN - Product identifier
- Title - Product name/title
- (Any other columns mapped via CSV_COL_* variables)

**Output Columns (written by system):**
- Video URL (column AB) - HeyGen video URL
- HEYGEN_AVATAR - Avatar used
- HEYGEN_VOICE - Voice used
- HEYGEN_LENGTH_SECONDS - Video duration
- HEYGEN_MAPPING_REASON - Why this avatar was chosen
- HEYGEN_MAPPED_AT - Timestamp
- Posted - TRUE when posted to social media
- Posted_At - ISO timestamp of posting

### Scheduler Cron Reference

```
0 9,18 * * *
│ │   │ │ │
│ │   │ │ └─── Day of week (0-7, 0 and 7 are Sunday)
│ │   │ └───── Month (1-12)
│ │   └─────── Day of month (1-31)
│ └─────────── Hour (0-23) - 9 AM and 6 PM
└───────────── Minute (0-59) - Top of the hour
```

**Time zone:** America/New_York (Eastern Time, adjusts for DST)

### Useful Commands

```bash
# View all scheduler jobs
gcloud scheduler jobs list --location=$REGION

# Pause scheduler
gcloud scheduler jobs pause natureswaysoil-video-2x --location=$REGION

# Resume scheduler
gcloud scheduler jobs resume natureswaysoil-video-2x --location=$REGION

# Update schedule
gcloud scheduler jobs update http natureswaysoil-video-2x \
  --location=$REGION \
  --schedule="0 10,20 * * *"

# View job configuration
gcloud run jobs describe natureswaysoil-video-job \
  --region=$REGION \
  --format=yaml

# Delete execution
gcloud run jobs executions delete EXECUTION_NAME \
  --region=$REGION

# Export logs to file
gcloud logging read \
  'resource.type="cloud_run_job"' \
  --format=json > logs.json
```

## Summary

This guide provides everything needed to deploy and maintain a fully automated video generation system. The system reliably processes products twice daily, generates high-quality videos with HeyGen, and posts to multiple social media platforms with comprehensive error handling and monitoring.

**Key Features:**
- ✅ Fully automated workflow
- ✅ Scheduled execution (9 AM & 6 PM Eastern)
- ✅ Intelligent avatar/voice mapping
- ✅ Multi-platform social media posting
- ✅ Comprehensive error handling and retry logic
- ✅ Health monitoring and logging
- ✅ Secure credential management
- ✅ Google Sheets integration

**Next Steps:**
1. Follow deployment steps
2. Run verification tests
3. Monitor first few scheduled executions
4. Adjust configuration as needed

For questions or issues, refer to the Troubleshooting section or open a GitHub issue.
