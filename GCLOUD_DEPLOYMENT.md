# How to Deploy to Google Cloud

**Quick Answer:** This system deploys to Google Cloud as a **scheduled Cloud Run Job** (not a Service). The application runs as a CLI batch process that exits after completion, triggered twice daily by Cloud Scheduler.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Google Cloud Platform                        │
│                                                                  │
│  ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │ Cloud Scheduler  │─triggers→│    Cloud Run Job            │  │
│  │ (cron schedule)  │         │  (CLI batch process)        │  │
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

## Key Deployment Characteristics

- **Deployment Type**: Cloud Run **Job** (not Service)
- **Execution Mode**: CLI batch process (`RUN_ONCE=true`)
- **No HTTP Server**: Container does not listen on PORT
- **Trigger**: Cloud Scheduler with authenticated OIDC
- **Schedule**: Configurable (default: 9 AM & 6 PM ET)
- **Exit Behavior**: Exits with code 0 after successful completion

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

# 3. Deploy everything (builds image, creates Cloud Run Job, sets up scheduler)
./scripts/deploy-gcp.sh

# 4. Verify deployment
PROJECT_ID=$PROJECT_ID ./scripts/verify-deployment.sh

# 5. Test manual execution (run the job once immediately)
gcloud run jobs execute video-job --region=us-east1 --wait

# Done! The job will now run automatically on schedule.
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

1. **Cloud Run Job** (`video-job`)
   - **Type**: Batch job (not a service)
   - **Entrypoint**: `node dist/cli.js` with `RUN_ONCE=true`
   - **Behavior**: Processes all products from CSV, then exits with code 0
   - **Timeout**: 60 minutes (configurable via `--task-timeout`)
   - **Secrets**: All API credentials mounted from Secret Manager
   - **No HTTP server**: Container runs CLI and exits (no PORT binding)

2. **Cloud Scheduler** (`natureswaysoil-video-2x`)
   - **Trigger**: HTTP POST to Cloud Run Jobs API
   - **Schedule**: Configurable cron expression (default: 9 AM & 6 PM ET)
   - **Authentication**: OIDC with service account
   - **Invocation**: Authenticated call to `jobs/{JOB_NAME}:run` endpoint

3. **Docker Image** in Artifact Registry
   - **Location**: `{REGION}-docker.pkg.dev/{PROJECT_ID}/{REPO_NAME}/app:latest`
   - **Built by**: Cloud Build (triggered by deployment script)
   - **Contents**: Node.js 20, compiled TypeScript (dist/), dependencies

4. **Service Accounts** with minimal required permissions
   - **Job SA** (`video-job-sa`):
     - `roles/artifactregistry.reader` - Pull container images
     - `roles/secretmanager.secretAccessor` - Read API credentials
     - `roles/logging.logWriter` - Write logs
     - `roles/monitoring.metricWriter` - Write metrics
   - **Scheduler SA** (`scheduler-invoker`):
     - `roles/run.developer` - Invoke Cloud Run Jobs
     - `roles/iam.serviceAccountTokenCreator` - Create OIDC tokens

---

## 🔧 Customizing the Schedule

The deployment script supports flexible scheduling via environment variables:

```bash
# Default: 9 AM and 6 PM Eastern Time
SCHEDULE="0 9,18 * * *" TIME_ZONE=America/New_York ./scripts/deploy-gcp.sh

# Midnight and noon UTC (as specified in requirements)
SCHEDULE="0 0,12 * * *" TIME_ZONE=UTC ./scripts/deploy-gcp.sh

# Once daily at midnight UTC
SCHEDULE="0 0 * * *" TIME_ZONE=UTC ./scripts/deploy-gcp.sh

# Every 6 hours
SCHEDULE="0 */6 * * *" TIME_ZONE=UTC ./scripts/deploy-gcp.sh

# Three times daily: 8 AM, 2 PM, 8 PM Pacific
SCHEDULE="0 8,14,20 * * *" TIME_ZONE=America/Los_Angeles ./scripts/deploy-gcp.sh
```

**Cron format**: `minute hour day-of-month month day-of-week`

### Common Schedules

| Schedule | Expression | Description |
|----------|------------|-------------|
| Twice daily (00:00, 12:00 UTC) | `0 0,12 * * *` | Midnight and noon UTC |
| Twice daily (9 AM, 6 PM ET) | `0 9,18 * * *` | Default - business hours |
| Once daily | `0 9 * * *` | 9 AM daily |
| Every 4 hours | `0 */4 * * *` | 00:00, 04:00, 08:00, etc. |
| Weekdays only | `0 9 * * 1-5` | 9 AM Monday-Friday |

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

### Manual Job Execution

```bash
# Execute job immediately (recommended: wait for completion)
gcloud run jobs execute video-job --region=us-east1 --wait

# Execute without waiting (returns execution ID)
gcloud run jobs execute video-job --region=us-east1

# Execute specific execution
EXECUTION_ID=$(gcloud run jobs execute video-job --region=us-east1 --format="value(metadata.name)")
echo "Started execution: $EXECUTION_ID"
```

### View Job Logs

```bash
# View logs from most recent execution
gcloud run jobs executions logs read \
  --job=video-job \
  --region=us-east1 \
  --limit=100

# View logs from specific execution
gcloud run jobs executions logs read \
  --execution=video-job-abc123 \
  --region=us-east1

# Stream logs in real-time (during execution)
gcloud alpha run jobs executions logs tail \
  --job=video-job \
  --region=us-east1

# Filter logs for errors
gcloud run jobs executions logs read \
  --job=video-job \
  --region=us-east1 \
  | grep -i "error\|failed"

# View logs with Cloud Logging query
gcloud logging read \
  'resource.type="cloud_run_job" resource.labels.job_name="video-job"' \
  --limit=50 \
  --format=json
```

### Job Status and History

```bash
# Get job details
gcloud run jobs describe video-job --region=us-east1

# List recent executions (with status)
gcloud run jobs executions list \
  --job=video-job \
  --region=us-east1 \
  --limit=10 \
  --format="table(name,status.completionTime,status.conditions[0].status,status.conditions[0].reason)"

# Get specific execution details
gcloud run jobs executions describe video-job-abc123 \
  --region=us-east1

# Check if latest execution succeeded
gcloud run jobs executions list \
  --job=video-job \
  --region=us-east1 \
  --limit=1 \
  --format="value(status.conditions[0].status)"
```

### Scheduler Management

```bash
# View scheduler configuration
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1

# Pause automatic executions
gcloud scheduler jobs pause natureswaysoil-video-2x --location=us-east1

# Resume automatic executions
gcloud scheduler jobs resume natureswaysoil-video-2x --location=us-east1

# Trigger scheduler manually (tests end-to-end)
gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1

# Update schedule
gcloud scheduler jobs update http natureswaysoil-video-2x \
  --location=us-east1 \
  --schedule="0 0,12 * * *" \
  --time-zone=UTC

# List all schedulers
gcloud scheduler jobs list --location=us-east1
```

### Health Checks

```bash
# Quick health check (should show "SUCCEEDED" for latest)
gcloud run jobs executions list \
  --job=video-job \
  --region=us-east1 \
  --limit=1 \
  --format="value(status.conditions[0].type,status.conditions[0].status)"

# Check if job configuration is valid
gcloud run jobs describe video-job \
  --region=us-east1 \
  --format="value(status.conditions)"

# Verify secrets are accessible
gcloud run jobs describe video-job \
  --region=us-east1 \
  --format="value(spec.template.spec.template.spec.containers[0].env)"
```

---

## 🛠️ Configuration

### Environment Variables

The job is configured with these environment variables (set in `scripts/deploy-gcp.sh`):

| Variable | Default | Description |
|----------|---------|-------------|
| `RUN_ONCE` | `true` | Exit after one cycle (required for Cloud Run Jobs) |
| `CSV_URL` | (your sheet) | Google Sheets CSV export URL |
| `CSV_COL_JOB_ID` | `ASIN` | Column to use as product ID |
| `CSV_COL_DETAILS` | `Title` | Column for product details |
| `HEYGEN_VIDEO_DURATION_SECONDS` | `30` | Video duration in seconds |
| `SHEET_VIDEO_TARGET_COLUMN_LETTER` | `AB` | Column to write video URLs |

To modify these, edit `scripts/deploy-gcp.sh` and search for the `ENV_VARS` variable, then redeploy.

### Deployment Script Variables

Control deployment behavior with environment variables:

```bash
PROJECT_ID=your-project        # GCP project ID
REGION=us-east1               # Cloud Run region
TIME_ZONE=UTC                 # Scheduler timezone
SCHEDULE="0 0,12 * * *"       # Cron expression
JOB_NAME=video-job            # Cloud Run Job name
REPO_NAME=video-repo          # Artifact Registry repo
```

See [Customizing the Schedule](#-customizing-the-schedule) section above for schedule configuration.

---

## 🚨 Troubleshooting

### Common Issues

**Job fails to start or is stuck in "Pending":**
- Check service account has required roles:
  ```bash
  gcloud run jobs describe video-job --region=us-east1 --format="value(spec.template.spec.serviceAccountName)"
  ```
- Verify image exists:
  ```bash
  gcloud artifacts docker images list us-east1-docker.pkg.dev/$PROJECT_ID/video-repo
  ```
- Check logs for errors:
  ```bash
  gcloud run jobs executions logs read --job=video-job --region=us-east1
  ```

**Job times out (exceeds 60 minutes):**
HeyGen video generation can take up to 25 minutes per video. If processing many videos:
1. Edit `scripts/deploy-gcp.sh` and increase `--task-timeout`:
   ```bash
   --task-timeout=7200  # 2 hours
   ```
2. Redeploy: `./scripts/deploy-gcp.sh`
3. Or reduce batch size by filtering CSV rows

**Scheduler not triggering job:**
- Check scheduler status (should not be paused):
  ```bash
  gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1 --format="value(state)"
  ```
- Verify scheduler service account has permissions:
  ```bash
  gcloud projects get-iam-policy $PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:scheduler-invoker@*"
  ```
- Test manual trigger:
  ```bash
  gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1
  ```

**Videos not being generated:**
- Verify HeyGen API key is set:
  ```bash
  gcloud secrets versions access latest --secret=HEYGEN_API_KEY
  ```
- Check job logs for HeyGen errors:
  ```bash
  gcloud run jobs executions logs read --job=video-job --region=us-east1 | grep -i heygen
  ```

**Posts not reaching social media:**
- Verify platform secrets exist and are enabled:
  ```bash
  gcloud secrets list | grep -E "INSTAGRAM|TWITTER|PINTEREST|YT"
  ```
- Check logs for posting errors:
  ```bash
  gcloud run jobs executions logs read --job=video-job --region=us-east1 | grep "Posted to"
  ```
- Test with dry run mode locally:
  ```bash
  DRY_RUN_LOG_ONLY=true RUN_ONCE=true npm run dev
  ```

**Exit code 1 (failure):**
- Check logs for the specific error:
  ```bash
  gcloud run jobs executions logs read --job=video-job --region=us-east1 --limit=200
  ```
- Common causes:
  - Missing required environment variables
  - Invalid CSV_URL or CSV format
  - Missing Google Sheets permissions
  - API rate limits exceeded

### Getting More Help

1. **Enable debug logging** (add to job env vars in deploy script):
   ```bash
   ENV_VARS="...,LOG_LEVEL=debug"
   ```

2. **Test locally** before deploying:
   ```bash
   RUN_ONCE=true npm run dev
   ```

3. **Check Cloud Build logs** if image build fails:
   ```bash
   gcloud builds list --limit=5
   gcloud builds log [BUILD_ID]
   ```

4. **Verify deployment** with verification script:
   ```bash
   PROJECT_ID=$PROJECT_ID ./scripts/verify-deployment.sh
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
   gcloud run jobs executions logs read --job=video-job --region=us-east1 | grep -E "ERROR|Failed"
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

1. ✅ **Job exists and is configured:**
   ```bash
   gcloud run jobs describe video-job --region=us-east1
   ```

2. ✅ **Scheduler exists and is enabled:**
   ```bash
   gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1 --format="value(state)"
   # Should show: ENABLED
   ```

3. ✅ **Secrets are configured:**
   ```bash
   gcloud secrets list | grep -E "HEYGEN|OPENAI"
   ```

4. ✅ **Manual execution succeeds:**
   ```bash
   gcloud run jobs execute video-job --region=us-east1 --wait
   # Should complete with exit code 0
   ```

5. ✅ **Logs show successful processing:**
   ```bash
   gcloud run jobs executions logs read --job=video-job --region=us-east1 | grep "Processing Row"
   gcloud run jobs executions logs read --job=video-job --region=us-east1 | grep "Posted to"
   ```

6. ✅ **Image exists in Artifact Registry:**
   ```bash
   gcloud artifacts docker images list us-east1-docker.pkg.dev/$PROJECT_ID/natureswaysoil-video
   ```

---

**Last Updated:** December 2025  
**Status:** ✅ Production Ready - Cloud Run Job Deployment
