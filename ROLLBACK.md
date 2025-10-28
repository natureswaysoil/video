# Rollback Procedures

This guide covers how to safely rollback the video generation system in case of issues.

## Quick Rollback Decision Tree

```
Issue detected?
├─ Job failing? → Rollback to previous image
├─ Wrong schedule? → Update scheduler only
├─ Credential issue? → Revert secret version
├─ Config issue? → Update environment variables
└─ Critical failure? → Emergency stop → Investigate → Rollback
```

## Rollback Scenarios

### Scenario 1: Bad Deployment (Job Failing)

**Symptoms:**
- Job consistently fails after update
- New errors in logs
- Videos not generating

**Rollback Steps:**

1. **Get current image:**
   ```bash
   export PROJECT_ID="your-project-id"
   export REGION="us-east1"
   
   CURRENT_IMAGE=$(gcloud run jobs describe natureswaysoil-video-job \
     --region=$REGION \
     --format="value(spec.template.spec.template.spec.containers[0].image)")
   
   echo "Current image: $CURRENT_IMAGE"
   ```

2. **List available images:**
   ```bash
   gcloud artifacts docker images list \
     ${REGION}-docker.pkg.dev/${PROJECT_ID}/natureswaysoil-video/app \
     --sort-by=~CREATE_TIME \
     --limit=10 \
     --format="table(package,version,CREATE_TIME)"
   ```

3. **Select previous working version:**
   ```bash
   # Use the previous version's tag or digest
   PREVIOUS_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/natureswaysoil-video/app@sha256:PREVIOUS_DIGEST"
   
   # Or use a specific tag if you have them
   PREVIOUS_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/natureswaysoil-video/app:v1.0.0"
   ```

4. **Rollback:**
   ```bash
   gcloud run jobs update natureswaysoil-video-job \
     --region=$REGION \
     --image=$PREVIOUS_IMAGE
   ```

5. **Verify:**
   ```bash
   # Check current image
   gcloud run jobs describe natureswaysoil-video-job \
     --region=$REGION \
     --format="value(spec.template.spec.template.spec.containers[0].image)"
   
   # Manual test
   gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION
   
   # Watch logs
   gcloud logging tail 'resource.type="cloud_run_job"'
   ```

**Time to rollback:** ~2 minutes

### Scenario 2: Bad Configuration

**Symptoms:**
- Job runs but behaves incorrectly
- Wrong platforms posting
- Incorrect video settings

**Rollback Steps:**

1. **Get current env vars:**
   ```bash
   gcloud run jobs describe natureswaysoil-video-job \
     --region=$REGION \
     --format="yaml(spec.template.spec.template.spec.containers[0].env)"
   ```

2. **Identify problematic variable(s):**
   ```bash
   # Example: Wrong video duration
   # Current: HEYGEN_VIDEO_DURATION_SECONDS=120
   # Should be: HEYGEN_VIDEO_DURATION_SECONDS=30
   ```

3. **Update to correct value:**
   ```bash
   gcloud run jobs update natureswaysoil-video-job \
     --region=$REGION \
     --update-env-vars=HEYGEN_VIDEO_DURATION_SECONDS=30
   
   # Or remove problematic variable (revert to default)
   gcloud run jobs update natureswaysoil-video-job \
     --region=$REGION \
     --remove-env-vars=HEYGEN_VIDEO_DURATION_SECONDS
   ```

4. **Verify:**
   ```bash
   gcloud run jobs describe natureswaysoil-video-job \
     --region=$REGION \
     --format="value(spec.template.spec.template.spec.containers[0].env)"
   ```

**Time to rollback:** ~1 minute

### Scenario 3: Bad Secret (Credential Issue)

**Symptoms:**
- HeyGen API errors
- Social media posting fails
- Authentication errors

**Rollback Steps:**

1. **Check secret versions:**
   ```bash
   gcloud secrets versions list HEYGEN_API_KEY
   ```

2. **Identify working version:**
   ```bash
   # Versions are listed newest first
   # Version 2 (current) is broken
   # Version 1 (previous) was working
   ```

3. **Disable bad version:**
   ```bash
   gcloud secrets versions disable 2 --secret=HEYGEN_API_KEY
   ```

4. **Update job to use specific version:**
   ```bash
   gcloud run jobs update natureswaysoil-video-job \
     --region=$REGION \
     --update-secrets=HEYGEN_API_KEY=HEYGEN_API_KEY:1
   ```

   Or re-enable old version as "latest":
   ```bash
   gcloud secrets versions enable 1 --secret=HEYGEN_API_KEY
   gcloud secrets versions disable 2 --secret=HEYGEN_API_KEY
   ```

5. **Verify:**
   ```bash
   # Check which version job is using
   gcloud run jobs describe natureswaysoil-video-job \
     --region=$REGION \
     --format="yaml(spec.template.spec.template.spec.containers[0].env)"
   ```

**Time to rollback:** ~2 minutes

### Scenario 4: Bad Schedule

**Symptoms:**
- Job running at wrong times
- Too frequent or infrequent execution
- Wrong timezone

**Rollback Steps:**

1. **Check current schedule:**
   ```bash
   gcloud scheduler jobs describe natureswaysoil-video-2x \
     --location=$REGION \
     --format="value(schedule,timeZone)"
   ```

2. **Update to correct schedule:**
   ```bash
   # Standard: Twice daily at 9 AM and 6 PM Eastern
   gcloud scheduler jobs update http natureswaysoil-video-2x \
     --location=$REGION \
     --schedule="0 9,18 * * *" \
     --time-zone="America/New_York"
   ```

3. **Verify:**
   ```bash
   gcloud scheduler jobs describe natureswaysoil-video-2x \
     --location=$REGION
   ```

**Time to rollback:** ~1 minute

### Scenario 5: Complete Rebuild

**When:** Catastrophic failure, need to start fresh

**Steps:**

1. **Backup current configuration:**
   ```bash
   mkdir -p backups
   
   # Job config
   gcloud run jobs describe natureswaysoil-video-job \
     --region=$REGION \
     --format=yaml > backups/job-$(date +%Y%m%d-%H%M%S).yaml
   
   # Scheduler config
   gcloud scheduler jobs describe natureswaysoil-video-2x \
     --location=$REGION \
     --format=yaml > backups/scheduler-$(date +%Y%m%d-%H%M%S).yaml
   
   # Secrets list
   gcloud secrets list --format=yaml > backups/secrets-$(date +%Y%m%d-%H%M%S).yaml
   ```

2. **Delete existing resources:**
   ```bash
   # Pause scheduler first
   gcloud scheduler jobs pause natureswaysoil-video-2x --location=$REGION
   
   # Delete job (scheduler will be orphaned but harmless)
   gcloud run jobs delete natureswaysoil-video-job \
     --region=$REGION \
     --quiet
   ```

3. **Redeploy from scratch:**
   ```bash
   # Use known good configuration
   ./scripts/deploy-gcp.sh
   ```

4. **Restore custom settings from backups:**
   Review backup YAML files and manually restore any custom env vars or settings.

**Time to rebuild:** ~10-15 minutes

## Emergency Stop

**Use when:** Need to immediately stop all processing

```bash
# 1. Pause scheduler (no new executions)
gcloud scheduler jobs pause natureswaysoil-video-2x \
  --location=$REGION

# 2. Cancel any running execution
RUNNING_EXEC=$(gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=$REGION \
  --filter="status.completionTime:NULL" \
  --format="value(metadata.name)" \
  --limit=1)

if [[ -n "$RUNNING_EXEC" ]]; then
  echo "Cancelling execution: $RUNNING_EXEC"
  gcloud run jobs executions delete "$RUNNING_EXEC" \
    --region=$REGION \
    --quiet
fi

echo "✅ System stopped. To resume:"
echo "   gcloud scheduler jobs resume natureswaysoil-video-2x --location=$REGION"
```

**Time to stop:** ~30 seconds

## Verification After Rollback

After any rollback, run these checks:

### 1. Verify Configuration

```bash
# Check job settings
./scripts/verify-deployment.sh

# Expected: All checks pass
```

### 2. Manual Test

```bash
# Trigger manual execution
gcloud scheduler jobs run natureswaysoil-video-2x \
  --location=$REGION

# Watch logs
gcloud logging tail 'resource.type="cloud_run_job"'
```

### 3. Check Results

- [ ] Video generated successfully
- [ ] Video URL written to sheet
- [ ] Social media posts (if enabled)
- [ ] No errors in logs
- [ ] Execution completed in < 45 minutes

### 4. Monitor Next Scheduled Run

```bash
# Get next run time
gcloud scheduler jobs describe natureswaysoil-video-2x \
  --location=$REGION \
  --format="value(scheduleTime)"

# Wait for scheduled execution and verify
```

## Rollback Best Practices

### Before Making Changes

1. **Document current state:**
   ```bash
   ./scripts/verify-deployment.sh > pre-change-state.txt
   ```

2. **Test in development first** (if you have a dev environment)

3. **Notify team** about planned changes

4. **Have rollback plan ready** before applying changes

### During Rollback

1. **Don't panic** - system is designed to be resilient
2. **Document issue** before changing anything
3. **One change at a time** - easier to identify what fixed it
4. **Keep team informed** of rollback progress

### After Rollback

1. **Document root cause** in incident log
2. **Update runbook** if new scenario discovered
3. **Fix underlying issue** before redeploying
4. **Test thoroughly** before next deployment

## Common Rollback Scenarios Matrix

| Issue | Rollback Type | Time | Difficulty |
|-------|--------------|------|------------|
| Job won't start | Image rollback | 2 min | Easy |
| Wrong videos generated | Config rollback | 1 min | Easy |
| API authentication fails | Secret rollback | 2 min | Easy |
| Wrong posting times | Schedule rollback | 1 min | Easy |
| Social posts failing | Config/Secret rollback | 2-3 min | Easy |
| Total system failure | Complete rebuild | 15 min | Medium |

## Version Control Strategy

To make rollbacks easier in the future:

### Tag Docker Images

```bash
# When deploying new version
VERSION="v$(date +%Y.%m.%d)-$(git rev-parse --short HEAD)"

gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/natureswaysoil-video/app:latest \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/natureswaysoil-video/app:$VERSION

# This creates both 'latest' and versioned tags
```

### Document Deployments

Keep a log file:

```bash
# After each deployment
echo "$(date): Deployed version $VERSION - $CHANGE_DESCRIPTION" >> deployments.log

# Example:
# 2025-01-15: Deployed v2025.01.15-abc123 - Updated HeyGen timeout to 30 minutes
# 2025-01-20: Deployed v2025.01.20-def456 - Added Pinterest posting
```

### Git Tags

```bash
# Tag each production deployment
git tag -a "prod-v2025.01.15" -m "Production deployment: HeyGen timeout update"
git push origin --tags

# To rollback to specific code version
git checkout prod-v2025.01.15
./scripts/deploy-gcp.sh
```

## Contact & Escalation

If rollback doesn't resolve the issue:

1. **Check documentation:**
   - [Operations Runbook](./OPERATIONS_RUNBOOK.md)
   - [Complete Automation Guide](./COMPLETE_AUTOMATION_GUIDE.md)
   - [Troubleshooting](./COMPLETE_AUTOMATION_GUIDE.md#troubleshooting-guide)

2. **Review logs thoroughly:**
   ```bash
   gcloud logging read 'resource.type="cloud_run_job"' \
     --limit=500 \
     --format=json > debug-logs.json
   ```

3. **Open GitHub issue:**
   - Include error logs
   - Describe rollback attempts
   - Configuration snapshot

4. **External service issues:**
   - **HeyGen:** support@heygen.com
   - **OpenAI:** help.openai.com
   - **Google Cloud:** Console > Support

## Rollback Checklist

- [ ] Document current issue and error messages
- [ ] Identify which component needs rollback
- [ ] Backup current configuration
- [ ] Execute rollback procedure
- [ ] Verify rollback successful
- [ ] Test with manual execution
- [ ] Monitor next scheduled run
- [ ] Document incident and resolution
- [ ] Update runbook if needed
- [ ] Plan fix for original issue

## Lessons Learned

After each rollback, document:

1. **What happened:** Brief description of issue
2. **Root cause:** Why did it happen
3. **Resolution:** How was it fixed
4. **Prevention:** How to prevent in future
5. **Rollback effectiveness:** Did procedure work as expected

Save in: `incidents/YYYY-MM-DD-description.md`

## Related Documentation

- [Operations Runbook](./OPERATIONS_RUNBOOK.md) - Daily operations
- [Complete Automation Guide](./COMPLETE_AUTOMATION_GUIDE.md) - Full system guide
- [Quickstart](./QUICKSTART.md) - Quick setup guide
- [Verification Script](./scripts/verify-deployment.sh) - Automated checks
