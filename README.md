# Nature's Way Soil - Automated Product Video Generator

## 🚀 Deploy to Google Cloud

**Ready to deploy?** See **[GCLOUD_DEPLOYMENT.md](./GCLOUD_DEPLOYMENT.md)** for a 5-minute deployment guide.

```bash
# Quick deploy to Google Cloud
export PROJECT_ID=your-gcp-project-id
./scripts/deploy-gcp.sh
```

For complete details: [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)

---

## Features
- Fetch products from a Google Sheet (CSV export URL)
- Generate marketing scripts with OpenAI
- **Create videos with HeyGen AI** (avatar-based video generation with intelligent voice/avatar mapping)
- Posts generated video to Instagram, Twitter, Pinterest, and optionally YouTube
- Iterates through all CSV rows; skips those without a job ID or disabled status
- Skips rows marked as Posted; respects Ready/Enabled when present
- Video URL resolution is configurable: prefer a CSV "video_url" column, otherwise build from a template

## Quick Start - Verification

To verify the video posting system works correctly:

```bash
# Install dependencies
npm install

# Configure credentials (copy .env.example to .env and add your API keys)
cp .env.example .env

# Run verification for all platforms
npm run verify

# Or test individual platforms
npm run test:instagram
npm run test:twitter
npm run test:pinterest
npm run test:youtube
```

**📚 Detailed Guides:**
- **[VERIFICATION_QUICKSTART.md](./VERIFICATION_QUICKSTART.md)** - 5-minute quick start guide
- **[VERIFICATION_GUIDE.md](./VERIFICATION_GUIDE.md)** - Complete verification documentation

## Architecture

```
Google Sheet (CSV) → OpenAI (script generation)
                    ↓
                HeyGen (video generation with avatars)
                    ↓
            Social Media Posts
            (Instagram, Twitter, Pinterest, YouTube)
```

## Setup

1. Copy `.env.example` to `.env` and fill in all required keys and tokens.
2. Install dependencies:
   ```
   npm install
   ```
3. Configure video generation:
   - **HeyGen**: Set `HEYGEN_API_KEY`
     - Or use GCP Secret Manager: `GCP_SECRET_HEYGEN_API_KEY`
4. Run the CLI:
   ```
   npm run dev
   ```
   Or process and post a single product directly:
   ```
   npx ts-node src/cli.ts
   ```

Note: For Google Sheets, use the CSV export URL form:
`https://docs.google.com/spreadsheets/d/<sheetId>/export?format=csv&gid=<gid>`. Example:
`https://docs.google.com/spreadsheets/d/1LU2ahpzMqLB5FLYqiyDbXOfjTxbdp8U8/export?format=csv&gid=1712974299`.

### Optional: YouTube Upload
### Optional: Google Sheets Writeback
- If you want rows to be marked as posted automatically, provide a service account:
   - `GS_SERVICE_ACCOUNT_EMAIL`, `GS_SERVICE_ACCOUNT_KEY` (key as a single-line string; newlines as \n)
   - The service account must have Editor access to the spreadsheet.
   - By default, sets `Posted=TRUE` and `Posted_At=<ISO timestamp>`. You can change the column headers via env: `CSV_COL_POSTED`, `CSV_COL_POSTED_AT`.

### CSV Defaults for Your Sheet
- Defaults assume columns: `Product_ID, Parent_ASIN, ASIN, SKU, Title, Short_Name`.
- Title is taken from `Title`; details/caption fallback to `Short_Name`.
- You can override with env vars: `CSV_COL_*`.
   - If your CSV has a direct video URL column, set `CSV_COL_VIDEO_URL` (comma-separated header names, first match wins).
   - Otherwise, the video URL is built from `VIDEO_URL_TEMPLATE` (defaults to `https://heygen.ai/jobs/{jobId}/video.mp4`).
   - The URL is preflight-checked via HEAD or a small ranged GET unless `SKIP_VIDEO_EXISTS_CHECK=true`.
- Set `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` from your Google Cloud OAuth2 client (Desktop or Web, with YouTube Data API v3 enabled).
- Optional `YT_PRIVACY_STATUS` (public | unlisted | private), default is `unlisted`.

## Security Notes

- **Never commit your real `.env` file or any secrets to GitHub.**
- Rotate keys if you ever leak them.

## Troubleshooting

- If social posts fail, check your tokens and permissions.
- Twitter: If you only set TWITTER_BEARER_TOKEN, tweets will be text with a link. Set TWITTER_API_KEY/SECRET and TWITTER_ACCESS_TOKEN/SECRET to upload video natively.

### HeyGen API (video generation)
- HeyGen is the primary video generation service. The system will:
  1. Generate a marketing script with OpenAI
  2. Map the product to the best avatar/voice combination based on product keywords
  3. Create a HeyGen video generation job
  4. Poll for video completion (up to 25 minutes)
  5. Write the video URL back to the Google Sheet
- Configure via environment variables or GCP Secret Manager:
  - Direct: `HEYGEN_API_KEY`
  - GCP Secret Manager: `GCP_SECRET_HEYGEN_API_KEY`
- The system uses intelligent avatar/voice mapping based on product categories:
  - Kelp/seaweed products → garden expert avatar with warm female voice
  - Bone meal products → farm expert avatar with deep male voice
  - Hay/pasture products → pasture specialist with neutral voice
  - Humic/fulvic products → eco gardener with warm female voice
  - Compost/soil products → eco gardener with warm female voice
- Mappings are written back to the sheet in HEYGEN_* columns for tracking
- Video duration is configurable via `HEYGEN_VIDEO_DURATION_SECONDS` (default: 30)

## Testing

The system includes a comprehensive test suite to verify all components work correctly.

### Quick Start Testing

```bash
# 1. Validate system configuration
npm run validate

# 2. Test CSV processing (fast, free)
npm run test:csv

# 3. Test script generation (fast, ~$0.01)
npm run test:openai

# 4. Test complete workflow (10-20 min, ~$1-2)
npm run test:e2e:dry    # Dry run (no posting)
npm run test:e2e        # Full test with social media

# 5. Test social media posting (1-5 min, free)
npm run test:platforms
```

### Test Documentation

- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Complete testing instructions and troubleshooting
- **[SYSTEM_VERIFICATION_REPORT.md](SYSTEM_VERIFICATION_REPORT.md)** - Comprehensive verification results

### Available Tests

| Test | Script | Duration | Cost | What It Tests |
|------|--------|----------|------|---------------|
| System Validation | `npm run validate` | 10s | Free | Configuration check |
| CSV Processing | `npm run test:csv` | 10s | Free | Google Sheets fetch |
| OpenAI Scripts | `npm run test:openai` | 30s | $0.01 | Script generation |
| HeyGen Video | `npm run test:heygen` | 10-20m | $1-2 | Video creation |
| Platform Posting | `npm run test:platforms` | 1-5m | Free | Social media |
| End-to-End | `npm run test:e2e` | 10-25m | $1-2 | Complete workflow |

**See [TESTING_GUIDE.md](TESTING_GUIDE.md) for detailed testing instructions.**

## License

MIT

## Complete Automation Setup

**⭐ For comprehensive deployment and automation instructions, see [COMPLETE_AUTOMATION_GUIDE.md](./COMPLETE_AUTOMATION_GUIDE.md) ⭐**

The complete guide includes:
- 📋 Step-by-step deployment instructions
- ☁️ Google Cloud configuration with twice-daily scheduling (9 AM & 6 PM ET)
- 🔐 Security best practices and credential management
- 📊 Monitoring, maintenance, and troubleshooting
- 💰 Cost estimates and optimization tips
- ✅ Deployment verification procedures

### Quick Deploy

Automated deployment in 5 steps:

```bash
# 1. Set environment variables
export PROJECT_ID="your-gcp-project-id"
export REGION="us-east1"
export TIME_ZONE="America/New_York"

# 2. Configure credentials in .env file
cp .env.example .env
# Edit .env with your API keys (HeyGen, OpenAI, social media)

# 3. Create secrets in Google Secret Manager
source .env
./scripts/create-secrets-from-env.sh

# 4. Deploy to Google Cloud (builds image, creates job, sets up scheduler)
./scripts/deploy-gcp.sh

# 5. Verify deployment
PROJECT_ID=$PROJECT_ID ./scripts/verify-deployment.sh
```

This automatically:
- ✅ Builds and deploys Docker image to Cloud Run
- ✅ Sets up Cloud Scheduler for twice-daily execution (9 AM & 6 PM ET)
- ✅ Configures all secrets and IAM permissions
- ✅ Verifies deployment health and configuration

### Local Testing

Test locally before deploying to the cloud:

```bash
# Dry run (generates videos, skips social media posting)
DRY_RUN_LOG_ONLY=true RUN_ONCE=true npm run dev

# Full test (processes one product end-to-end)
RUN_ONCE=true npm run dev
```

### Monitoring & Maintenance

```bash
# View recent job executions
gcloud run jobs executions list --job=natureswaysoil-video-job --region=$REGION

# Stream logs in real-time
gcloud logging tail 'resource.type="cloud_run_job"'

# Verify deployment health
PROJECT_ID=$PROJECT_ID ./scripts/verify-deployment.sh

# Cleanup analysis
SPREADSHEET_ID=your_id GID=your_gid ./scripts/cleanup-stray-files.sh
```

---

## Cloud Run Job + Scheduler Deployment

This application is designed to run as a **Cloud Run Job** triggered twice daily by **Cloud Scheduler**, rather than as a continuously running Cloud Run Service. This is the recommended deployment strategy for batch processing workloads.

### Why Cloud Run Job?

- **No HTTP server required**: The application runs as a CLI batch process with `RUN_ONCE=true`
- **Cost-effective**: Only pay for actual execution time (not idle time)
- **Scheduled execution**: Cloud Scheduler triggers jobs at specific times (e.g., 00:00 and 12:00 UTC)
- **Automatic retries**: Cloud Run Jobs can be configured to retry on failure
- **Resource optimization**: Each execution gets fresh resources

### Architecture

```
Cloud Scheduler (cron) → Cloud Run Job → Video Generation Pipeline → Social Media
     (twice daily)           (CLI exits)        (HeyGen + OpenAI)        (Posts)
```

### Quick Deploy

Deploy the complete system with one command:

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-east1
export TIME_ZONE=UTC
export SCHEDULE="0 0,12 * * *"  # 00:00 and 12:00 UTC

# Deploy (creates job, scheduler, secrets, etc.)
./scripts/deploy-gcp.sh
```

### Deployment Components

The deployment script (`scripts/deploy-gcp.sh`) automatically creates:

1. **Cloud Run Job** (`video-job`)
   - Runs `node dist/cli.js` as entrypoint
   - Configured with `RUN_ONCE=true` to exit after processing
   - 60-minute timeout (adjustable for large batches)
   - Attached to all required secrets from Secret Manager

2. **Cloud Scheduler** (`natureswaysoil-video-2x`)
   - Default: Runs at 9 AM and 6 PM Eastern Time
   - Customizable via `SCHEDULE` and `TIME_ZONE` environment variables
   - Uses authenticated OIDC to invoke the job securely

3. **Service Accounts**
   - Job service account: Runs the job with minimal permissions
   - Scheduler service account: Invokes the job on schedule

4. **IAM Permissions** (automatically configured)
   - `roles/artifactregistry.reader`: Pull Docker images
   - `roles/secretmanager.secretAccessor`: Access credentials
   - `roles/logging.logWriter`: Write logs
   - `roles/run.developer`: Scheduler can trigger jobs

### Required Permissions

Your GCP user account needs these roles to deploy:
- `roles/owner` or `roles/editor` on the project
- Or these specific roles:
  - `roles/run.admin`
  - `roles/iam.serviceAccountAdmin`
  - `roles/cloudscheduler.admin`
  - `roles/artifactregistry.admin`
  - `roles/cloudbuild.builds.editor`

### Configuration

#### Environment Variables (in deploy script)

```bash
PROJECT_ID=your-project-id       # GCP project ID
REGION=us-east1                  # Deployment region
TIME_ZONE=America/New_York       # Scheduler timezone
SCHEDULE="0 9,18 * * *"          # Cron expression (default: 9 AM & 6 PM)
JOB_NAME=video-job               # Cloud Run Job name
CSV_URL=https://...              # Google Sheets CSV export URL
```

#### Schedule Examples

```bash
# Midnight and noon UTC
SCHEDULE="0 0,12 * * *" TIME_ZONE=UTC ./scripts/deploy-gcp.sh

# 9 AM and 6 PM Eastern Time (default)
SCHEDULE="0 9,18 * * *" TIME_ZONE=America/New_York ./scripts/deploy-gcp.sh

# Every 6 hours
SCHEDULE="0 */6 * * *" TIME_ZONE=UTC ./scripts/deploy-gcp.sh

# Once daily at 9 AM Eastern
SCHEDULE="0 9 * * *" TIME_ZONE=America/New_York ./scripts/deploy-gcp.sh
```

### Manual Job Operations

```bash
# Execute job immediately (manual trigger)
gcloud run jobs execute video-job --region=us-east1

# View job details
gcloud run jobs describe video-job --region=us-east1

# List recent executions
gcloud run jobs executions list \
  --job=video-job \
  --region=us-east1 \
  --limit=10

# View logs from latest execution
gcloud run jobs executions logs read \
  --job=video-job \
  --region=us-east1 \
  --limit=100

# Update job configuration (after code changes)
./scripts/deploy-gcp.sh
```

### Scheduler Management

```bash
# View scheduler status
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1

# Pause automatic runs
gcloud scheduler jobs pause natureswaysoil-video-2x --location=us-east1

# Resume automatic runs
gcloud scheduler jobs resume natureswaysoil-video-2x --location=us-east1

# Trigger manually via scheduler
gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1

# Update schedule
gcloud scheduler jobs update http natureswaysoil-video-2x \
  --location=us-east1 \
  --schedule="0 0,12 * * *" \
  --time-zone=UTC
```

### Infrastructure as Code

For reference, a Cloud Run Job YAML template is available at `infra/cloud-run-job.yaml`. However, we recommend using the automated deployment script (`scripts/deploy-gcp.sh`) which handles all configuration automatically.

To use the YAML template directly:

```bash
# Edit infra/cloud-run-job.yaml with your values
# Then apply:
gcloud run jobs replace infra/cloud-run-job.yaml --region=us-east1
```

### Monitoring & Debugging

```bash
# Check if job is healthy
gcloud run jobs describe video-job --region=us-east1 --format="value(status.conditions)"

# Stream logs in real-time (during execution)
gcloud alpha run jobs executions logs tail \
  --job=video-job \
  --region=us-east1

# View recent errors
gcloud run jobs executions logs read \
  --job=video-job \
  --region=us-east1 \
  | grep -i "error\|failed"

# Check execution history
gcloud run jobs executions list \
  --job=video-job \
  --region=us-east1 \
  --format="table(name,status,startTime,completionTime)"
```

### Troubleshooting

**Job fails to start:**
- Check service account has required IAM roles
- Verify secrets are created in Secret Manager
- Ensure image exists in Artifact Registry

**Job times out:**
- Default timeout is 3600s (1 hour)
- Increase in deploy script: `--task-timeout=7200`
- Or reduce batch size by filtering CSV

**Scheduler not triggering:**
- Verify scheduler is not paused: `gcloud scheduler jobs describe ...`
- Check scheduler service account has `roles/run.developer`
- Review scheduler logs in Cloud Logging

**Posts not reaching social media:**
- Verify platform credentials in Secret Manager
- Check job logs for specific platform errors
- Test with `DRY_RUN_LOG_ONLY=true` first

### Local Testing

Test the job behavior locally before deploying:

```bash
# Install dependencies and build
npm install
npm run build

# Test with dry run (no posting)
RUN_ONCE=true DRY_RUN_LOG_ONLY=true node dist/cli.js

# Test full execution (will post)
RUN_ONCE=true node dist/cli.js

# Verify it exits with code 0
echo "Exit code: $?"
```

### Cost Optimization

Cloud Run Jobs pricing:
- **CPU**: $0.00002400 per vCPU-second
- **Memory**: $0.00000250 per GiB-second
- **Free tier**: 180,000 vCPU-seconds/month, 360,000 GiB-seconds/month

Example costs for twice-daily execution:
- Job runtime: ~15 minutes per execution
- Resources: 2 vCPU, 2 GiB memory
- Monthly executions: 60 (2/day × 30 days)
- Total time: 900 minutes = 54,000 seconds
- **Cost**: ~$3-5/month for Cloud Run Jobs

Total system cost (including APIs): **$20-130/month**

### Next Steps

1. **Deploy**: Run `./scripts/deploy-gcp.sh`
2. **Verify**: Check logs and execution history
3. **Monitor**: Set up alerts in Cloud Monitoring (optional)
4. **Optimize**: Adjust schedule and batch size as needed

For complete deployment documentation, see:
- **[GCLOUD_DEPLOYMENT.md](./GCLOUD_DEPLOYMENT.md)** - Comprehensive guide
- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** - Production checklist

---

## Deploying on Google Cloud

**🎯 For deployment instructions, see [GCLOUD_DEPLOYMENT.md](./GCLOUD_DEPLOYMENT.md)**

Quick automated deployment:

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-east1

# Create secrets and deploy
./scripts/create-secrets-from-env.sh
./scripts/deploy-gcp.sh
```

---

## 🚀 Quick Deployment Guide

The system is production-ready and designed to run on Google Cloud Platform as a scheduled Cloud Run Job.

### Automated Deployment

```bash
# 1. Configure secrets in Google Cloud Secret Manager
# 2. Run automated deployment script
export PROJECT_ID=natureswaysoil-video
export REGION=us-east1
./scripts/deploy-gcp.sh

# 3. Verify deployment
./scripts/verify-deployment.sh
```

### Comprehensive Documentation

- **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** - Essential commands and rapid deployment
- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** - Complete deployment guide (18KB)
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Step-by-step verification checklist

### System Status

✅ **Production Ready** - Fully tested and validated for live deployment
- HeyGen AI video generation with intelligent avatar/voice mapping
- Multi-platform social media distribution
- Automated twice-daily scheduling (9am, 6pm ET)
- Google Sheets integration with writeback
- Comprehensive monitoring and logging
- Cost: ~$20-130/month

See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) for complete deployment instructions.
