# Operations Runbook

Quick reference guide for operating and maintaining the video generation system.

## Daily Operations

### Check System Health

```bash
# Set your project
export PROJECT_ID="your-project-id"
export REGION="us-east1"

# Quick health check
./scripts/verify-deployment.sh
```

**Expected:** All checks should pass (green ✅)

### View Recent Executions

```bash
# List last 5 executions
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=$REGION \
  --limit=5
```

**Look for:**
- Status: "Completed" (not "Failed")
- Duration: < 60 minutes
- Success count: 1+

### Check Logs

```bash
# View logs from last execution
gcloud logging read \
  'resource.type="cloud_run_job"
   resource.labels.job_name="natureswaysoil-video-job"
   timestamp>="2025-01-01T00:00:00Z"' \
  --limit=100 \
  --format="table(timestamp,severity,textPayload)"
```

**Look for:**
- ✅ "HeyGen video ready"
- ✅ "Posted to Instagram/Twitter/Pinterest"
- ✅ "Wrote video URL to sheet"
- ❌ No error messages (severity=ERROR)

### Verify Videos Posted

1. Open Google Sheet
2. Check Video URL column (default: AB)
3. Verify recent rows have URLs
4. Check social media accounts for posts

## Weekly Operations

### Review Error Logs

```bash
# Errors in last 7 days
gcloud logging read \
  'resource.type="cloud_run_job"
   severity>=ERROR
   timestamp>="$(date -u -d "7 days ago" +%Y-%m-%dT%H:%M:%SZ)"' \
  --limit=50
```

### Cleanup Analysis

```bash
# Analyze videos in sheet
SPREADSHEET_ID=your_id GID=your_gid ./scripts/cleanup-stray-files.sh
```

**Review:**
- Duplicate URLs
- Invalid URLs  
- Rows without videos

### Check Secret Expiry

```bash
# Instagram tokens expire every 60 days
# Twitter tokens don't expire unless revoked
# Pinterest tokens expire every year

# Check when secrets were last updated
gcloud secrets versions list INSTAGRAM_ACCESS_TOKEN --limit=1
gcloud secrets versions list PINTEREST_ACCESS_TOKEN --limit=1
```

## Monthly Operations

### Credential Rotation

Rotate social media credentials monthly for security:

```bash
# Update secret with new value
echo -n "new_token_value" | gcloud secrets versions add SECRET_NAME --data-file=-

# Job will automatically use new version on next run
```

### Review Costs

```bash
# Check Cloud Run costs
gcloud billing accounts list
# View in Console: Billing > Reports > Filter by Cloud Run

# Typical monthly costs:
# - Cloud Run: $5-10
# - Cloud Scheduler: $0.10
# - Secret Manager: $0.06 per secret
# - HeyGen: ~$30-120 (external)
# - OpenAI: ~$1-3 (external)
```

### Performance Review

```bash
# Get execution durations
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=$REGION \
  --limit=30 \
  --format="table(metadata.name,status.completionTime,metadata.creationTimestamp)"
```

**Analyze:**
- Average execution time
- Success rate
- Number of products processed per run

## Common Issues & Fixes

### Issue: Job Timeout

**Symptoms:**
- Execution fails after 60 minutes
- Log shows: "maximum timeout reached"

**Quick Fix:**
```bash
# Already set to 3600s, but if needed:
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --task-timeout=3600
```

### Issue: HeyGen API Errors

**Symptoms:**
- "HeyGen API key required"
- "HeyGen job failed"

**Quick Fix:**
```bash
# Verify secret exists
gcloud secrets versions access latest --secret=HEYGEN_API_KEY

# If invalid, update
echo -n "new_key" | gcloud secrets versions add HEYGEN_API_KEY --data-file=-
```

### Issue: Instagram Token Expired

**Symptoms:**
- Instagram posts fail
- Error: "invalid token"

**Quick Fix:**
1. Get new long-lived token from Facebook Graph API
2. Update secret:
   ```bash
   echo -n "new_token" | gcloud secrets versions add INSTAGRAM_ACCESS_TOKEN --data-file=-
   ```

### Issue: No Products Processed

**Symptoms:**
- "No valid products found in sheet"

**Check:**
1. CSV_URL is correct
2. Sheet has data
3. Rows have Ready=TRUE (if using Ready column)
4. Rows don't have Posted=TRUE (unless ALWAYS_GENERATE_NEW_VIDEO=true)

**Quick Fix:**
```bash
# Process all rows regardless of Posted status
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --update-env-vars=ALWAYS_GENERATE_NEW_VIDEO=true
```

### Issue: Videos Not Written to Sheet

**Symptoms:**
- Videos generated but URLs missing from sheet

**Check:**
1. Service account has Editor access to sheet
2. GS_SERVICE_ACCOUNT_EMAIL and GS_SERVICE_ACCOUNT_KEY secrets exist

**Quick Fix:**
```bash
# Re-share sheet with SA
# 1. Get SA email
gcloud secrets versions access latest --secret=GS_SERVICE_ACCOUNT_EMAIL

# 2. Share sheet with this email (Editor permission)
```

### Issue: Scheduler Not Running

**Symptoms:**
- No executions at scheduled times

**Check:**
```bash
# Check scheduler status
gcloud scheduler jobs describe natureswaysoil-video-2x \
  --location=$REGION \
  --format="value(state)"
```

**Quick Fix:**
```bash
# If paused, resume
gcloud scheduler jobs resume natureswaysoil-video-2x \
  --location=$REGION

# Manually trigger to test
gcloud scheduler jobs run natureswaysoil-video-2x \
  --location=$REGION
```

## Emergency Procedures

### Stop All Processing

```bash
# Pause scheduler (prevents new executions)
gcloud scheduler jobs pause natureswaysoil-video-2x \
  --location=$REGION

# Cancel running execution (if any)
EXEC_NAME=$(gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=$REGION \
  --filter="status.completionTime:*" \
  --limit=1 \
  --format="value(metadata.name)")

if [[ -n "$EXEC_NAME" ]]; then
  gcloud run jobs executions delete "$EXEC_NAME" \
    --region=$REGION \
    --quiet
fi

echo "System stopped. Resume with: gcloud scheduler jobs resume ..."
```

### Rollback to Previous Version

See [ROLLBACK.md](./ROLLBACK.md) for detailed instructions.

**Quick rollback:**
```bash
# Get previous image
PREV_IMAGE=$(gcloud run jobs describe natureswaysoil-video-job \
  --region=$REGION \
  --format="value(spec.template.spec.template.spec.containers[0].image)")

echo "Current image: $PREV_IMAGE"

# List available images
gcloud artifacts docker images list \
  us-east1-docker.pkg.dev/$PROJECT_ID/natureswaysoil-video/app \
  --limit=5

# Update to specific version
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --image=us-east1-docker.pkg.dev/$PROJECT_ID/natureswaysoil-video/app:PREVIOUS_TAG
```

### Emergency Contacts

- **HeyGen Support:** support@heygen.com
- **OpenAI Support:** help.openai.com
- **Google Cloud Support:** Console > Support > Create case
- **GitHub Issues:** https://github.com/natureswaysoil/video/issues

## Maintenance Windows

### Planned Maintenance

Schedule maintenance during low-traffic times:

1. **Pause scheduler:**
   ```bash
   gcloud scheduler jobs pause natureswaysoil-video-2x --location=$REGION
   ```

2. **Perform maintenance** (updates, testing, etc.)

3. **Resume scheduler:**
   ```bash
   gcloud scheduler jobs resume natureswaysoil-video-2x --location=$REGION
   ```

### Update Deployment

```bash
# 1. Build new image
gcloud builds submit --tag $IMAGE_URL

# 2. Update job
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --image=$IMAGE_URL

# 3. Test manually
gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION

# 4. Monitor logs
gcloud logging tail 'resource.type="cloud_run_job"'
```

## Monitoring & Alerts

### Set Up Alerts (Cloud Monitoring)

```bash
# Create alert for job failures
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Video Job Failures" \
  --condition-display-name="Job Failed" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=60s \
  --condition-filter='resource.type="cloud_run_job"
    AND resource.labels.job_name="natureswaysoil-video-job"
    AND severity="ERROR"'
```

### Dashboard Metrics

Key metrics to monitor:
- **Execution success rate:** Target: >95%
- **Execution duration:** Target: <45 minutes
- **Error count:** Target: <5 per day
- **Video generation success:** Target: >90%
- **Social post success:** Target: >85% per platform

### Log-Based Metrics

```bash
# Count HeyGen successes
gcloud logging read \
  'textPayload=~"✅ HeyGen video ready"
   timestamp>=TODAY' \
  --format="value(timestamp)" | wc -l

# Count errors
gcloud logging read \
  'severity=ERROR
   timestamp>=TODAY' \
  --format="value(timestamp)" | wc -l
```

## Backup & Recovery

### Backup Configuration

```bash
# Export job configuration
gcloud run jobs describe natureswaysoil-video-job \
  --region=$REGION \
  --format=yaml > job-backup-$(date +%Y%m%d).yaml

# Export scheduler configuration
gcloud scheduler jobs describe natureswaysoil-video-2x \
  --location=$REGION \
  --format=yaml > scheduler-backup-$(date +%Y%m%d).yaml

# Export secrets list
gcloud secrets list --format="table(name)" > secrets-list-$(date +%Y%m%d).txt
```

### Restore from Backup

```bash
# Restore job
gcloud run jobs replace job-backup-YYYYMMDD.yaml --region=$REGION

# Restore scheduler
gcloud scheduler jobs update http natureswaysoil-video-2x \
  --location=$REGION \
  --schedule="0 9,18 * * *" \
  --time-zone="America/New_York" \
  --uri=... # from backup file
```

## Performance Optimization

### Reduce Execution Time

1. **Reduce video duration:**
   ```bash
   gcloud run jobs update natureswaysoil-video-job \
     --region=$REGION \
     --update-env-vars=HEYGEN_VIDEO_DURATION_SECONDS=25
   ```

2. **Skip optional platforms:**
   ```bash
   gcloud run jobs update natureswaysoil-video-job \
     --region=$REGION \
     --update-env-vars=ENABLE_PLATFORMS=instagram,twitter
   ```

3. **Process fewer products per run:**
   - Reduce Ready products in sheet
   - Or add more scheduling windows

### Reduce Costs

1. **Remove unused secrets** (saves $0.06/month per secret)
2. **Reduce log retention** (Console > Logging > Logs Storage)
3. **Optimize HeyGen usage** (shorter videos, reuse content)

## Testing

### Dry Run Test

```bash
# Test without posting to social media
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --update-env-vars=DRY_RUN_LOG_ONLY=true

gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION

# Watch logs
gcloud logging tail 'resource.type="cloud_run_job"'

# Re-enable posting
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --update-env-vars=DRY_RUN_LOG_ONLY=false
```

### Single Platform Test

```bash
# Test Instagram only
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --update-env-vars=ENABLE_PLATFORMS=instagram

# Run and verify
gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION

# Re-enable all platforms
gcloud run jobs update natureswaysoil-video-job \
  --region=$REGION \
  --update-env-vars=ENABLE_PLATFORMS=
```

## Useful Commands

```bash
# Quick status check
gcloud run jobs describe natureswaysoil-video-job --region=$REGION

# Last execution details
gcloud run jobs executions describe $(gcloud run jobs executions list \
  --job=natureswaysoil-video-job --region=$REGION --limit=1 \
  --format="value(metadata.name)") --region=$REGION

# Stream logs in real-time
gcloud logging tail 'resource.type="cloud_run_job"' --format=json

# Count successful executions today
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=$REGION \
  --filter="status.completionTime>=TODAY AND status.succeededCount>0" \
  --format="value(metadata.name)" | wc -l

# Get next scheduled run time
gcloud scheduler jobs describe natureswaysoil-video-2x \
  --location=$REGION \
  --format="value(scheduleTime)"
```

## References

- [Complete Automation Guide](./COMPLETE_AUTOMATION_GUIDE.md)
- [Quickstart Guide](./QUICKSTART.md)
- [Rollback Procedures](./ROLLBACK.md)
- [HeyGen Setup](./HEYGEN_SETUP.md)
- [README](./README.md)

## Version History

- **v1.0** - Initial automation with HeyGen
- **Current** - Twice-daily scheduling (9 AM & 6 PM ET)
