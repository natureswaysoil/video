# Deployment Documentation Index

## For This Deployment (PR #34 - Enhanced Diagnostics)

**Start here:** [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md) - Overview and current status

### Deployment Documents (Created 2025-12-04)

| Document | Purpose | When to Use |
|----------|---------|-------------|
| 📋 [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md) | Executive summary, status, next steps | Read this first |
| 🚀 [DEPLOY_README.md](./DEPLOY_README.md) | Quick reference with commands | For fast deployment |
| 📘 [DEPLOY_FIX_GUIDE.md](./DEPLOY_FIX_GUIDE.md) | Complete step-by-step guide | For detailed walkthrough |
| ✅ [PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md) | Verification checklist | Before deployment |
| 🤖 [deploy-diagnostic-fix.sh](./deploy-diagnostic-fix.sh) | Automated deployment script | To deploy automatically |
| 📝 [DEPLOYMENT_LOG_TEMPLATE.md](./DEPLOYMENT_LOG_TEMPLATE.md) | Template for logging execution | During deployment |

### Quick Start

```bash
# 1. Review the summary
cat DEPLOYMENT_SUMMARY.md

# 2. Authenticate to GCP
gcloud auth login
gcloud config set project natureswaysoil-video

# 3. Run automated deployment
./deploy-diagnostic-fix.sh

# 4. Fill in the deployment log
cp DEPLOYMENT_LOG_TEMPLATE.md DEPLOYMENT_LOG_$(date +%Y%m%d).md
# Edit and complete the log
```

## General Deployment Documentation

### Production Deployment
| Document | Purpose |
|----------|---------|
| [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) | Main production deployment guide |
| [DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md) | Quick deployment steps |
| [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) | General deployment checklist |

### Historical/Reference
| Document | Status |
|----------|--------|
| [DEPLOYMENT_COMPLETE.md](./DEPLOYMENT_COMPLETE.md) | Previous deployment record |
| [DEPLOYMENT_REPORT.md](./DEPLOYMENT_REPORT.md) | Previous deployment report |
| [DEPLOYMENT_STATUS.md](./DEPLOYMENT_STATUS.md) | Historical status |
| [DEPLOYMENT_SUCCESS.md](./DEPLOYMENT_SUCCESS.md) | Previous success record |

## Operations & Maintenance

| Document | Purpose |
|----------|---------|
| [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) | Day-to-day operations guide |
| [VERIFICATION_GUIDE.md](./VERIFICATION_GUIDE.md) | System verification procedures |
| [ROLLBACK.md](./ROLLBACK.md) | How to rollback deployments |
| [HOW_TO_DEBUG.md](./HOW_TO_DEBUG.md) | Debugging guide |
| [TROUBLESHOOTING_NO_POSTS.md](./TROUBLESHOOTING_NO_POSTS.md) | Troubleshooting when posts don't appear |

## Deployment Scripts

| Script | Purpose |
|--------|---------|
| [deploy-diagnostic-fix.sh](./deploy-diagnostic-fix.sh) | Deploy PR #34 fix (automated) |
| [scripts/deploy-gcp.sh](./scripts/deploy-gcp.sh) | Main GCP deployment script |
| [scripts/verify-deployment.sh](./scripts/verify-deployment.sh) | Verify deployment status |
| [RESUME_DEPLOYMENT.sh](./RESUME_DEPLOYMENT.sh) | Resume interrupted deployment |

## What's Different About This Deployment

This deployment (PR #34) is specifically for enhanced CSV diagnostics:

### Changes
- **File Modified:** `src/core.ts` (processCsvUrl function)
- **Change Type:** Logging/diagnostics improvements only
- **Risk Level:** Low (no functional changes)
- **Rollback Time:** 5-10 minutes if needed

### New Diagnostic Fields
When no valid products are found, logs now include:
- `skipReasons` - Counts by reason (noJobId, alreadyPosted, notReady)
- `skippedRowSamples` - First 3 skipped rows with details
- `troubleshootingHints` - Actionable suggestions
- `envConfig` - Current configuration
- `availableHeaders` - CSV column names

### Testing This Deployment
After deployment, trigger a test run and check logs for enhanced diagnostics:
```bash
gcloud run jobs execute natureswaysoil-video-job --region=us-east1
gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 --limit=100
```

## Deployment Workflow

```
1. Review → DEPLOYMENT_SUMMARY.md
     ↓
2. Check → PRE_DEPLOYMENT_CHECKLIST.md
     ↓
3. Deploy → ./deploy-diagnostic-fix.sh
     ↓
4. Verify → Check logs and job status
     ↓
5. Document → DEPLOYMENT_LOG_TEMPLATE.md
     ↓
6. Monitor → First 24 hours
```

## Support

### Getting Help
1. Check the relevant documentation above
2. Review error logs: `gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1`
3. Verify deployment: `./scripts/verify-deployment.sh`
4. Rollback if needed: See [ROLLBACK.md](./ROLLBACK.md)

### Common Commands
```bash
# Check job status
gcloud run jobs describe natureswaysoil-video-job --region=us-east1

# View recent logs
gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1

# List executions
gcloud run jobs executions list --job=natureswaysoil-video-job --region=us-east1

# Check scheduler
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1

# Manual test
gcloud run jobs execute natureswaysoil-video-job --region=us-east1
```

## Status

**Code:** ✅ Built and verified  
**Documentation:** ✅ Complete  
**Deployment:** ⏳ Ready (awaiting GCP authentication)  
**Testing:** ⏳ Pending (post-deployment)

---

**Index Updated:** 2025-12-04  
**For Deployment:** PR #34 - Enhanced CSV Diagnostics  
**Environment:** Production (natureswaysoil-video)
