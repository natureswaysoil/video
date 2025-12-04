# Deploy the Diagnostic Fix - Quick Reference

This directory contains everything needed to deploy PR #34 (enhanced CSV diagnostics) to production.

## What's Being Deployed

**PR #34: Enhanced CSV Diagnostics**
- Better error messages when no valid products are found
- Detailed skip reason breakdown (noJobId, alreadyPosted, notReady)
- Sample rows showing why they were skipped
- Configuration hints and troubleshooting suggestions
- Available CSV column names in diagnostics

## Quick Deploy (2 minutes)

```bash
# 1. Authenticate with GCP
gcloud auth login
gcloud config set project natureswaysoil-video

# 2. Run automated deployment
./deploy-diagnostic-fix.sh
```

## Step-by-Step Deploy (5 minutes)

```bash
# 1. Verify prerequisites
./scripts/verify-deployment.sh

# 2. Deploy to GCP
./scripts/deploy-gcp.sh

# 3. Test the deployment
gcloud run jobs execute natureswaysoil-video-job --region=us-east1

# 4. Check logs
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=100
```

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[DEPLOY_FIX_GUIDE.md](./DEPLOY_FIX_GUIDE.md)** | Complete deployment guide with all details |
| **[PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md)** | Checklist to verify before deploying |
| **[deploy-diagnostic-fix.sh](./deploy-diagnostic-fix.sh)** | Automated deployment script |
| **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** | General production deployment guide |
| **[ROLLBACK.md](./ROLLBACK.md)** | How to rollback if needed |

## Prerequisites

✅ **Already completed:**
- [x] Code merged from PR #34
- [x] TypeScript compilation successful
- [x] Build successful (`npm run build`)
- [x] Dockerfile verified

⚠️ **Required before deployment:**
- [ ] GCP authentication (`gcloud auth login`)
- [ ] Access to project `natureswaysoil-video`
- [ ] Required GCP secrets configured

## Verification Commands

```bash
# Check authentication
gcloud auth list

# Check project
gcloud config get-value project

# Check secrets
gcloud secrets list

# Check current deployment
gcloud run jobs describe natureswaysoil-video-job --region=us-east1

# Check scheduler
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1
```

## What to Look For After Deployment

When viewing logs, you should see enhanced diagnostics if no products are found:

```json
{
  "level": "warn",
  "message": "No valid products found in CSV after filtering",
  "skipReasons": {
    "noJobId": 0,
    "alreadyPosted": 149,
    "notReady": 0
  },
  "skippedRowSamples": [
    {
      "rowNumber": 2,
      "reason": "Already posted (Posted='TRUE')",
      "sample": { "jobId": "B0ABC123", "posted": "TRUE" }
    }
  ],
  "troubleshootingHints": [
    "149 rows already posted. Set ALWAYS_GENERATE_NEW_VIDEO=true to reprocess them"
  ],
  "availableHeaders": ["Product_ID", "ASIN", "Title", "Posted", ...]
}
```

## Common Issues

### Not Authenticated
```
ERROR: (gcloud.auth.login) There was a problem with web authentication.
```
**Fix:** Run `gcloud auth login` and complete browser authentication

### Missing Permissions
```
ERROR: (gcloud) User does not have permission
```
**Fix:** Ensure your account has required roles (see PRE_DEPLOYMENT_CHECKLIST.md)

### Build Fails
```
ERROR: build step failed
```
**Fix:** Check build logs: `gcloud builds list --limit=1`

## Rollback

If you need to rollback after deployment:

```bash
# Get previous image digest
gcloud artifacts docker images list \
  us-east1-docker.pkg.dev/natureswaysoil-video/natureswaysoil-video/app \
  --limit=5

# Update job to previous image
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --image=us-east1-docker.pkg.dev/natureswaysoil-video/natureswaysoil-video/app@sha256:PREVIOUS_DIGEST
```

See [ROLLBACK.md](./ROLLBACK.md) for detailed instructions.

## Support

- **Logs:** `gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1`
- **Debug Guide:** [HOW_TO_DEBUG.md](./HOW_TO_DEBUG.md)
- **Operations:** [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
- **Troubleshooting:** [TROUBLESHOOTING_NO_POSTS.md](./TROUBLESHOOTING_NO_POSTS.md)

## Timeline

- **Code Ready:** ✅ Built and verified
- **Deployment Time:** ~5-10 minutes
- **Testing Time:** ~5 minutes
- **Total:** ~10-15 minutes

## Next Steps After Deployment

1. ✅ Verify job executes successfully
2. ✅ Check logs show enhanced diagnostics
3. ✅ Monitor first scheduled run (next 9 AM or 6 PM Eastern)
4. ✅ Review any new diagnostic messages
5. ✅ Update team on deployment status

---

**Status:** 🟢 Ready to Deploy
**Version:** PR #34 - Enhanced CSV Diagnostics
**Target:** Production (natureswaysoil-video)
**Date:** 2025-12-04
