# Cloud Run Job Deployment - Implementation Summary

## Overview

Successfully converted the video automation system from a Cloud Run Service (requiring an HTTP server) to a **Cloud Run Job** triggered twice daily by Cloud Scheduler. This is the optimal deployment strategy for batch processing workloads.

## What Changed

### 1. Application Code (`src/cli.ts`)

**Before:**
- Health server always started on port 8080
- Needed to explicitly stop server in RUN_ONCE mode
- Could cause port binding issues in job environments

**After:**
- Health server only starts in continuous mode (`RUN_ONCE=false`)
- Clean exit without cleanup in job mode
- No PORT binding required

```typescript
// New behavior
if (!runOnce) {
  startHealthServer()  // Only start in continuous mode
}

if (runOnce) {
  await cycle()  // Run once and exit cleanly
  return
}
```

### 2. Deployment Script (`scripts/deploy-gcp.sh`)

**Added:**
- `SCHEDULE` environment variable for flexible cron expressions
- Default: `"0 9,18 * * *"` (9 AM & 6 PM in configured timezone)
- Supports any valid cron expression

**Usage:**
```bash
# Default (9 AM & 6 PM Eastern)
./scripts/deploy-gcp.sh

# Midnight and noon UTC
SCHEDULE="0 0,12 * * *" TIME_ZONE=UTC ./scripts/deploy-gcp.sh

# Once daily
SCHEDULE="0 9 * * *" ./scripts/deploy-gcp.sh

# Every 4 hours
SCHEDULE="0 */4 * * *" ./scripts/deploy-gcp.sh
```

### 3. Infrastructure Template (`infra/cloud-run-job.yaml`)

New YAML template for manual deployment with:
- Complete job specification
- Environment variable configuration
- Secret mounting examples
- Resource limits and timeouts

### 4. Documentation

**New Files:**
- `CLOUD_RUN_JOB_COMMANDS.md` - Quick reference with exact gcloud commands
  - Create, update, run Cloud Run Jobs
  - Set up Cloud Scheduler
  - Monitor executions
  - Troubleshoot issues
  - Complete setup script

**Updated Files:**
- `README.md` - Added 250+ line "Cloud Run Job + Scheduler" section
- `GCLOUD_DEPLOYMENT.md` - Updated architecture and commands for Jobs

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               Cloud Scheduler                       │
│          (Configurable Schedule)                    │
│         Default: 9 AM & 6 PM ET                     │
└────────────────────┬────────────────────────────────┘
                     │ HTTP POST (OIDC authenticated)
                     ↓
┌─────────────────────────────────────────────────────┐
│              Cloud Run Job                          │
│         (Batch Processing)                          │
│                                                     │
│  1. Reads products from Google Sheet CSV           │
│  2. Generates scripts with OpenAI                  │
│  3. Creates videos with HeyGen                     │
│  4. Posts to social media platforms                │
│  5. Writes results back to sheet                   │
│  6. Exits with code 0                              │
└─────────────────────────────────────────────────────┘
```

## Key Benefits

### 1. Cost Savings
- **Before:** Service runs 24/7, costs ~$10-15/month for idle time
- **After:** Job only runs during execution, costs ~$3-5/month
- **Savings:** ~$7-10/month on Cloud Run costs

### 2. Better Resource Utilization
- No idle resource consumption
- Fresh resources for each execution
- Automatic cleanup after completion

### 3. Simplified Operations
- No need to monitor service health
- No port binding issues
- Clear execution history
- Built-in retry support

### 4. Improved Reliability
- Each execution is independent
- Failed executions don't affect future runs
- Automatic timeout handling
- Better error visibility

## Deployment Options

### Option 1: Automated (Recommended)

```bash
# One command deploys everything
./scripts/deploy-gcp.sh
```

### Option 2: Manual with gcloud

```bash
# See CLOUD_RUN_JOB_COMMANDS.md for complete commands
gcloud run jobs create video-job \
  --image=... \
  --region=us-east1 \
  --set-env-vars="RUN_ONCE=true,..."
```

### Option 3: YAML Manifest

```bash
# Edit infra/cloud-run-job.yaml then:
gcloud run jobs replace infra/cloud-run-job.yaml --region=us-east1
```

## Testing

### Local Testing
```bash
# Test the CLI exits properly
RUN_ONCE=true npm run dev

# Verify exit code
echo $?  # Should be 0 on success
```

### Cloud Testing
```bash
# Manual execution
gcloud run jobs execute video-job --region=us-east1 --wait

# Check logs
gcloud run jobs executions logs read --job=video-job --region=us-east1

# Verify status
gcloud run jobs executions list --job=video-job --region=us-east1 --limit=1
```

## Monitoring

### View Executions
```bash
# List recent runs
gcloud run jobs executions list \
  --job=video-job \
  --region=us-east1 \
  --limit=10

# Get execution details
gcloud run jobs executions describe EXECUTION_ID --region=us-east1
```

### Check Scheduler
```bash
# Scheduler status
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1

# Pause/resume
gcloud scheduler jobs pause natureswaysoil-video-2x --location=us-east1
gcloud scheduler jobs resume natureswaysoil-video-2x --location=us-east1
```

## Customization

### Change Schedule
```bash
# Update to midnight and noon UTC
SCHEDULE="0 0,12 * * *" TIME_ZONE=UTC ./scripts/deploy-gcp.sh

# Or update existing scheduler
gcloud scheduler jobs update http natureswaysoil-video-2x \
  --schedule="0 0,12 * * *" \
  --time-zone=UTC \
  --location=us-east1
```

### Adjust Timeout
```bash
# Edit scripts/deploy-gcp.sh
--task-timeout=7200  # 2 hours for larger batches

# Then redeploy
./scripts/deploy-gcp.sh
```

### Change Region
```bash
# Deploy to different region
REGION=us-central1 ./scripts/deploy-gcp.sh
```

## Troubleshooting

### Job Fails to Start
- Check service account permissions
- Verify image exists in Artifact Registry
- Review job logs for errors

### Scheduler Not Triggering
- Ensure scheduler is not paused
- Verify scheduler SA has `roles/run.developer`
- Check scheduler logs in Cloud Logging

### Job Times Out
- Increase `--task-timeout` in deploy script
- Reduce batch size by filtering CSV
- Check HeyGen API response times

## Migration from Service to Job

If you previously deployed as a Cloud Run Service:

1. **Delete the old service:**
   ```bash
   gcloud run services delete video-service --region=us-east1
   ```

2. **Deploy as job:**
   ```bash
   ./scripts/deploy-gcp.sh
   ```

3. **Verify scheduler is configured:**
   ```bash
   gcloud scheduler jobs list --location=us-east1
   ```

No data migration needed - the system reads from the same Google Sheet.

## Success Criteria

After deployment, verify:

- ✅ Job exists: `gcloud run jobs describe video-job --region=us-east1`
- ✅ Scheduler configured: `gcloud scheduler jobs describe ... --location=us-east1`
- ✅ Manual execution succeeds: `gcloud run jobs execute video-job --region=us-east1 --wait`
- ✅ Logs show processing: Check for "Processing Row" and "Posted to" messages
- ✅ Exit code 0: Job completes successfully

## Documentation

Complete documentation available in:

1. **[CLOUD_RUN_JOB_COMMANDS.md](./CLOUD_RUN_JOB_COMMANDS.md)** - Quick command reference
2. **[README.md](./README.md)** - Cloud Run Job + Scheduler section
3. **[GCLOUD_DEPLOYMENT.md](./GCLOUD_DEPLOYMENT.md)** - Comprehensive deployment guide
4. **[infra/cloud-run-job.yaml](./infra/cloud-run-job.yaml)** - YAML template

## Questions?

- Review troubleshooting section in GCLOUD_DEPLOYMENT.md
- Check execution logs: `gcloud run jobs executions logs read ...`
- Test locally: `RUN_ONCE=true npm run dev`
- Verify deployment: `./scripts/verify-deployment.sh`

---

**Status:** ✅ Production Ready  
**Last Updated:** December 2025  
**Deployment Type:** Cloud Run Job (Batch Processing)
