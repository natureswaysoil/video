# Production Deployment Checklist

Use this checklist to ensure a smooth deployment of the video generation system to Google Cloud Platform.

## Pre-Deployment Checklist

### ✅ Environment Setup
- [ ] Google Cloud Project created and billing enabled
- [ ] `gcloud` CLI installed and authenticated (`gcloud auth login`)
- [ ] Project ID confirmed (e.g., `natureswaysoil-video`)
- [ ] Target region selected (default: `us-east1`)
- [ ] Repository cloned locally
- [ ] Dependencies installed (`npm install`)
- [ ] Project builds successfully (`npm run build`)

### ✅ Credentials Acquired

#### Required:
- [ ] **HeyGen API Key** - From https://heygen.com dashboard
- [ ] **OpenAI API Key** - From https://platform.openai.com
- [ ] **Instagram Access Token** - Facebook Graph API token
- [ ] **Instagram IG ID** - Numeric Instagram Business account ID
- [ ] **Google Sheets Service Account** - JSON key file downloaded
- [ ] **Google Sheets CSV URL** - Constructed from sheet ID and GID

#### Optional (per platform):
- [ ] **Twitter API Keys** - API Key, Secret, Access Token, Access Secret
- [ ] **Twitter Bearer Token** - For simple text-only posts
- [ ] **Pinterest Access Token** - From Pinterest Developer portal
- [ ] **Pinterest Board ID** - Target board for pins
- [ ] **YouTube OAuth Credentials** - Client ID, Secret, Refresh Token

### ✅ Google Sheet Prepared
- [ ] Sheet contains required columns: `ASIN`, `Title`, `Short_Name`
- [ ] Video tracking columns added: `Video URL`, `Posted`, `Posted_At`
- [ ] Optional HeyGen columns: `HEYGEN_AVATAR`, `HEYGEN_VOICE`, etc.
- [ ] Service account email shared with Editor permission
- [ ] CSV export URL tested and accessible
- [ ] At least one product row ready for testing

### ✅ Secrets Configured in GCP
- [ ] Secret Manager API enabled
- [ ] `HEYGEN_API_KEY` created
- [ ] `OPENAI_API_KEY` created
- [ ] `INSTAGRAM_ACCESS_TOKEN` created
- [ ] `INSTAGRAM_IG_ID` created
- [ ] `GS_SERVICE_ACCOUNT_EMAIL` created
- [ ] `GS_SERVICE_ACCOUNT_KEY` created (single-line JSON)
- [ ] Optional platform secrets created as needed
- [ ] All secrets have at least one ENABLED version

## Deployment Checklist

### ✅ Pre-Deployment Verification
- [ ] Review `scripts/deploy-gcp.sh` and update `CSV_URL_DEFAULT` if needed
- [ ] Confirm Dockerfile CMD points to `dist/cli.js`
- [ ] Verify `.dockerignore` excludes unnecessary files
- [ ] Check `package.json` scripts are correct
- [ ] Ensure no secrets in `.env` or code files

### ✅ Run Deployment
```bash
# Set environment variables
export PROJECT_ID=natureswaysoil-video
export REGION=us-east1
export TIME_ZONE=America/New_York

# Execute deployment
./scripts/deploy-gcp.sh
```

**Deployment Steps (automated by script):**
- [ ] Required APIs enabled (Run, Artifact Registry, Build, Scheduler, Secrets)
- [ ] Artifact Registry repository created
- [ ] Docker image built and pushed
- [ ] Job service account created with permissions
- [ ] Cloud Run Job created with secrets attached
- [ ] Scheduler service account created
- [ ] Cloud Scheduler job created (twice daily: 9am, 6pm ET)

### ✅ Post-Deployment Verification
```bash
# Run verification script
./scripts/verify-deployment.sh
```

**Verification Points:**
- [ ] All required APIs enabled
- [ ] All required secrets exist with enabled versions
- [ ] Cloud Run Job exists and is configured
- [ ] Environment variables set correctly (`RUN_ONCE`, `CSV_URL`, etc.)
- [ ] Secrets properly attached to job
- [ ] Cloud Scheduler job exists and is enabled
- [ ] Scheduler cron expression correct: `0 9,18 * * *`
- [ ] Timezone set correctly: `America/New_York`
- [ ] Service accounts exist with proper permissions
- [ ] Dockerfile and build artifacts valid

## Testing Checklist

### ✅ Manual Test Execution
```bash
# Execute job manually
gcloud run jobs execute natureswaysoil-video-job --region=us-east1
```

**Monitor test execution:**
- [ ] Job starts successfully
- [ ] Logs show "Processing Row X"
- [ ] Script generation with OpenAI succeeds
- [ ] HeyGen video creation initiated
- [ ] Video generation completes (10-25 minutes)
- [ ] Video URL written to Google Sheet
- [ ] Social media posts succeed (per enabled platforms)
- [ ] Posted status marked in sheet
- [ ] Job completes without errors

### ✅ Verify Each Component

#### Video Generation:
- [ ] Check logs: `🎬 Creating video with HeyGen...`
- [ ] Verify: `✅ HeyGen video ready: https://...`
- [ ] Confirm avatar/voice mapping logged
- [ ] Check sheet for HEYGEN_* column updates

#### Social Media Posting:
- [ ] Instagram: `✅ Posted to Instagram: {media_id}`
- [ ] Twitter: `✅ Posted to Twitter: {tweet_id}`
- [ ] Pinterest: `✅ Posted to Pinterest: {pin_id}`
- [ ] YouTube: `✅ Uploaded to YouTube: {video_id}` (if enabled)

#### Google Sheets Writeback:
- [ ] Video URL appears in sheet
- [ ] `Posted` column marked TRUE
- [ ] `Posted_At` timestamp recorded
- [ ] HEYGEN mapping columns populated

### ✅ Review Logs
```bash
# View recent logs
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=100
```

**Check for:**
- [ ] No ERROR messages
- [ ] No ❌ failure indicators
- [ ] All ✅ success indicators present
- [ ] Processing completed within timeout
- [ ] No credential/permission errors

## Monitoring Setup

### ✅ Logging and Alerts
- [ ] Set up log-based metrics for failures
- [ ] Create alert for job execution failures
- [ ] Create alert for repeated API errors
- [ ] Set up notification channel (email/Slack)
- [ ] Test alert by triggering condition

### ✅ Regular Monitoring Tasks
- [ ] Bookmark Cloud Run Jobs console page
- [ ] Bookmark Cloud Scheduler console page
- [ ] Bookmark Secret Manager console page
- [ ] Add log query shortcuts for common searches
- [ ] Document log filter patterns for errors

### ✅ Health Check
- [ ] Verify scheduler triggers on schedule
- [ ] Check logs after scheduled execution
- [ ] Monitor video generation success rate
- [ ] Track social media posting success rate
- [ ] Review Google Sheet for completeness

## Maintenance Checklist

### Weekly:
- [ ] Review execution logs for errors
- [ ] Check video generation success rate
- [ ] Verify social media posts appearing
- [ ] Confirm sheet is being updated

### Monthly:
- [ ] Review API usage and costs
- [ ] Check API rate limits and quotas
- [ ] Verify all secrets are still valid
- [ ] Review IAM permissions
- [ ] Check for software updates

### Quarterly:
- [ ] Rotate API keys and tokens
- [ ] Review and optimize costs
- [ ] Update dependencies (`npm update`)
- [ ] Review and update documentation
- [ ] Perform security audit

## Rollback Plan

### If Deployment Fails:
1. Check deployment logs for specific error
2. Verify all prerequisites are met
3. Confirm secrets are properly configured
4. Review IAM permissions
5. Re-run deployment script after fixes

### If Job Execution Fails:
1. Check job execution logs
2. Verify credentials are valid
3. Test individual components (HeyGen, social media)
4. Update secrets if expired/invalid
5. Re-execute job manually

### If Continuous Failures:
1. Pause scheduler: `gcloud scheduler jobs pause natureswaysoil-video-2x --location=us-east1`
2. Review and fix root cause
3. Test with manual execution
4. Resume scheduler: `gcloud scheduler jobs resume natureswaysoil-video-2x --location=us-east1`

### Emergency Contacts:
- Google Cloud Support: https://cloud.google.com/support
- HeyGen Support: support@heygen.com
- OpenAI Support: https://help.openai.com

## Security Checklist

### ✅ Access Control
- [ ] Limit GCP project access to necessary personnel
- [ ] Use separate service accounts for different functions
- [ ] Review IAM permissions regularly
- [ ] Enable audit logging
- [ ] Set up secret access notifications

### ✅ Secrets Management
- [ ] All secrets stored in Secret Manager (not code/env files)
- [ ] No secrets in version control
- [ ] Service account keys rotated quarterly
- [ ] API tokens rotated quarterly
- [ ] Old secret versions disabled/deleted

### ✅ Runtime Security
- [ ] Job runs with minimal required permissions
- [ ] Container uses non-root user (if applicable)
- [ ] Network access restricted to required APIs only
- [ ] No sensitive data in logs
- [ ] Environment variables sanitized

## Success Criteria

### Deployment Success:
✅ All checklist items above completed
✅ Verification script passes with 0 failures
✅ Manual test execution succeeds
✅ Video generated and posted to all enabled platforms
✅ Google Sheet updated correctly
✅ Scheduler configured and enabled
✅ Logs show no errors

### Operational Success (After 1 Week):
✅ Scheduler executes twice daily at 9am and 6pm ET
✅ Videos generated successfully (>90% success rate)
✅ Social media posts succeed (>95% success rate)
✅ Google Sheet stays current
✅ No manual intervention required
✅ Costs within expected range ($20-130/month)

## Documentation

### ✅ Update Project Documentation
- [ ] Record deployed configuration details
- [ ] Document any custom modifications
- [ ] Note any platform-specific settings
- [ ] Update team wiki/knowledge base
- [ ] Share deployment guide with team

### ✅ Operational Runbooks
- [ ] How to view logs
- [ ] How to manually trigger job
- [ ] How to pause/resume scheduler
- [ ] How to update secrets
- [ ] How to redeploy after code changes
- [ ] How to troubleshoot common issues

## Sign-Off

- [ ] Deployment completed successfully
- [ ] All tests passed
- [ ] Monitoring configured
- [ ] Team trained on operations
- [ ] Documentation complete
- [ ] Stakeholders notified

**Deployed By:** _________________  
**Date:** _________________  
**Version:** _________________  
**Sign-Off:** _________________  

---

**Reference Documentation:**
- [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)
- [HeyGen Setup Guide](./HEYGEN_SETUP.md)
- [README](./README.md)

**Deployment Scripts:**
- `./scripts/deploy-gcp.sh` - Main deployment script
- `./scripts/verify-deployment.sh` - Verification script
- `./scripts/create-secrets-from-env.sh` - Create secrets from .env

**Support:**
- See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) Troubleshooting section
- Check project logs in GCP Console
- Review execution history in Cloud Run Jobs console
