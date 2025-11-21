# Process Fix Summary

## Date: 2025-11-21

## Issues Identified and Fixed

### Issue #1: Dockerfile CMD Was Incorrect (Historical)

**Problem:**
- The previously deployed Docker container was running `blog-server.js` instead of `cli.js`
- This meant the video posting automation was never executing
- Evidence: deploy.log line 115 shows `CMD ["node", "dist/blog-server.js"]`

**Root Cause:**
- The Dockerfile had been incorrectly configured in a previous deployment
- The blog server was running instead of the main CLI process

**Fix:**
- Dockerfile now correctly specifies: `CMD ["node", "dist/cli.js"]`
- This change ensures the video posting process runs when deployed
- **Action Required:** Rebuild and redeploy the Docker image using `scripts/deploy-gcp.sh`

**Verification:**
```bash
# Check current Dockerfile (should show cli.js)
grep CMD Dockerfile

# After redeployment, verify the job is running cli.js
gcloud logging read 'resource.type="cloud_run_job"' --limit=10
```

---

### Issue #2: Config Validator Too Strict

**Problem:**
- `OPENAI_API_KEY` was marked as required in config validator
- The system has fallback logic to use product description when OpenAI is not configured
- This caused the process to crash immediately, even when OpenAI wasn't needed

**Root Cause:**
- File: `src/config-validator.ts` line 11
- Validation: `OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required')`
- Conflict with cli.ts logic that allows optional OpenAI usage

**Fix:**
- Changed line 11 to: `OPENAI_API_KEY: z.string().optional()`
- Added comment explaining it's optional with fallback
- System can now run without OpenAI (uses product description as script)

**Code Reference:**
```typescript
// cli.ts lines 125-135
if (process.env.OPENAI_API_KEY) {
  script = await generateScript(product)
} else {
  console.log('⚠️  OPENAI_API_KEY not set, using product description as script')
  script = (product?.details ?? product?.title ?? product?.name ?? '').toString()
}
```

**Verification:**
```bash
# Test without OPENAI_API_KEY
unset OPENAI_API_KEY
CSV_URL=... RUN_ONCE=true npm run dev

# Should see: "⚠️  OPENAI_API_KEY not set, using product description as script"
# Process should continue without crashing
```

---

## Impact

### Before Fixes:
1. **Deployment:** Docker container ran wrong process (blog-server instead of cli)
2. **Runtime:** Even if correct process ran, it would crash due to missing OPENAI_API_KEY
3. **Result:** Zero videos posted, zero social media automation

### After Fixes:
1. **Deployment:** Docker container runs correct process (cli)
2. **Runtime:** Process starts successfully, can run with or without OpenAI
3. **Result:** Video posting automation works as designed

---

## Deployment Steps

To apply these fixes to production:

```bash
# 1. Ensure you're on the branch with fixes
git status

# 2. Build and redeploy to Google Cloud
export PROJECT_ID=natureswaysoil-video
export REGION=us-east1
export TIME_ZONE=America/New_York

# 3. Run deployment script (will rebuild with correct Dockerfile)
./scripts/deploy-gcp.sh

# 4. Verify deployment
gcloud run jobs describe natureswaysoil-video-job --region=$REGION

# 5. Test manual execution
gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION

# 6. Monitor logs
gcloud logging tail 'resource.type="cloud_run_job"'
```

---

## Testing

### Local Testing:

```bash
# Test with minimal config (no OpenAI)
CSV_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET/export?format=csv&gid=0
DRY_RUN_LOG_ONLY=true
RUN_ONCE=true
npm run dev

# Test with full config (with OpenAI)
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### Cloud Testing:

```bash
# Trigger manual job execution
gcloud scheduler jobs run natureswaysoil-video-2x --location=$REGION

# Watch logs in real-time
gcloud logging tail 'resource.type="cloud_run_job"'

# Check job execution status
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=$REGION \
  --limit=5
```

---

## Expected Behavior After Fixes

1. **Process starts successfully** without requiring OPENAI_API_KEY
2. **CSV processing works** and fetches products from Google Sheet
3. **Video generation**:
   - With OPENAI_API_KEY: Generates AI-powered marketing scripts
   - Without OPENAI_API_KEY: Uses product description as script
4. **Social media posting** proceeds if platform credentials are configured
5. **Graceful degradation**: Missing credentials for a platform = that platform is skipped

---

## Monitoring

After deployment, monitor for:

1. **Job executions**: Should run twice daily (9 AM and 6 PM ET)
2. **Success rate**: Check logs for "✅ Posted to..." messages
3. **Error logs**: Look for any remaining configuration issues
4. **Google Sheet**: Verify video URLs and Posted status are updated

```bash
# Check recent executions
gcloud run jobs executions list --job=natureswaysoil-video-job --region=$REGION

# View success/error counts
gcloud logging read 'resource.type="cloud_run_job" severity>=ERROR' --limit=20

# Check scheduler status
gcloud scheduler jobs describe natureswaysoil-video-2x --location=$REGION
```

---

## Related Documentation

- **Operations Runbook:** `OPERATIONS_RUNBOOK.md`
- **Deployment Guide:** `PRODUCTION_DEPLOYMENT.md`
- **Troubleshooting:** `HOW_TO_DEBUG.md`
- **Testing Guide:** `TESTING_GUIDE.md`

---

## Summary

**Two critical issues were blocking the video posting process:**

1. ✅ **Dockerfile CMD fixed** - Now runs `cli.js` instead of `blog-server.js`
2. ✅ **Config validator fixed** - OPENAI_API_KEY is now optional

**Next step:** Redeploy using `./scripts/deploy-gcp.sh` to apply these fixes.
