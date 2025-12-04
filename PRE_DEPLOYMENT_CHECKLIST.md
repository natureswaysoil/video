# Pre-Deployment Checklist - Diagnostic Fix (PR #34)

Use this checklist before deploying the diagnostic improvements to production.

## ✅ Code Verification

- [x] **TypeScript compilation successful**
  - Command: `npm run typecheck`
  - Status: ✅ PASSED
  - Date: 2025-12-04

- [x] **Build successful**
  - Command: `npm run build`
  - Status: ✅ PASSED
  - Output: `dist/` directory populated with compiled JavaScript
  - Date: 2025-12-04

- [x] **Dockerfile valid**
  - Status: ✅ VERIFIED
  - Multi-stage build (node:20-slim)
  - Production dependencies only in final image

## 📋 Pre-Deployment Requirements

### GCP Authentication
- [ ] **gcloud CLI installed**
  - Check: `gcloud version`
  - Install: https://cloud.google.com/sdk/install

- [ ] **Authenticated to GCP**
  - Check: `gcloud auth list`
  - Login: `gcloud auth login`
  - Required: Active account shown

- [ ] **Project configured**
  - Check: `gcloud config get-value project`
  - Set: `gcloud config set project natureswaysoil-video`
  - Expected: `natureswaysoil-video`

- [ ] **Correct permissions**
  - Required roles:
    - `roles/run.admin` (Cloud Run administration)
    - `roles/iam.serviceAccountUser` (Service account usage)
    - `roles/cloudbuild.builds.builder` (Build images)
    - `roles/artifactregistry.writer` (Push to registry)

### GCP Secrets Configuration
- [ ] **Essential secrets exist**
  - Check: `gcloud secrets list`
  - Required:
    - `HEYGEN_API_KEY` ✅
    - `OPENAI_API_KEY` ✅
    - `INSTAGRAM_ACCESS_TOKEN` ✅
    - `INSTAGRAM_IG_ID` ✅
    - `GS_SERVICE_ACCOUNT_EMAIL` ✅
    - `GS_SERVICE_ACCOUNT_KEY` ✅

- [ ] **Optional secrets (if using platforms)**
  - Twitter: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`
  - Pinterest: `PINTEREST_ACCESS_TOKEN`, `PINTEREST_BOARD_ID`
  - YouTube: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`

### Google Sheets Configuration
- [ ] **CSV export URL configured**
  - Location: `scripts/deploy-gcp.sh` line 16 (`CSV_URL_DEFAULT`)
  - Format: `https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=GID`
  - Current: `https://docs.google.com/spreadsheets/d/1LU2ahpzMqLB5FLYqiyDbXOfjTxbdp8U8/export?format=csv&gid=1712974299`

- [ ] **Service account has access**
  - Service account email: `video-job-sa@natureswaysoil-video.iam.gserviceaccount.com`
  - Required permission: Editor
  - Check: Open sheet → Share → Verify service account email listed

### APIs Enabled
- [ ] **Required GCP APIs enabled**
  - Check: `gcloud services list --enabled`
  - Required APIs (auto-enabled by deploy script):
    - `run.googleapis.com` (Cloud Run)
    - `artifactregistry.googleapis.com` (Artifact Registry)
    - `cloudbuild.googleapis.com` (Cloud Build)
    - `cloudscheduler.googleapis.com` (Cloud Scheduler)
    - `secretmanager.googleapis.com` (Secret Manager)

## 🧪 Pre-Deployment Testing

### Local Tests (Optional)
- [ ] **Run local validation**
  ```bash
  npm run validate
  ```

- [ ] **Test CSV processing**
  ```bash
  npm run test:csv
  ```

- [ ] **Test platform connections (dry run)**
  ```bash
  DRY_RUN=true npm run test:platforms
  ```

## 📦 Deployment Readiness

### Environment Check
- [ ] **Node.js version**
  - Required: Node 20.x
  - Check: `node --version`
  - Current: Should match Dockerfile `FROM node:20-slim`

- [ ] **Dependencies installed**
  - Check: `npm list --depth=0`
  - Status: All dependencies should be installed

- [ ] **No uncommitted changes**
  - Check: `git status`
  - Status: Working tree should be clean (except new deployment docs)

### Backup & Rollback Plan
- [ ] **Current deployment documented**
  - Note current image digest:
    ```bash
    gcloud run jobs describe natureswaysoil-video-job \
      --region=us-east1 \
      --format="value(spec.template.spec.containers[0].image)"
    ```

- [ ] **Rollback procedure reviewed**
  - Document: See [ROLLBACK.md](./ROLLBACK.md)
  - Estimated rollback time: 5-10 minutes

## 🚀 Deployment Steps

Once all checklist items are complete:

1. **Run automated deployment**
   ```bash
   ./deploy-diagnostic-fix.sh
   ```

   Or manually:
   ```bash
   ./scripts/deploy-gcp.sh
   ```

2. **Verify deployment**
   ```bash
   ./scripts/verify-deployment.sh
   ```

3. **Test the fix**
   ```bash
   # Manual execution
   gcloud run jobs execute natureswaysoil-video-job --region=us-east1
   
   # Check logs
   gcloud run jobs executions logs read \
     --job=natureswaysoil-video-job \
     --region=us-east1 \
     --limit=100
   ```

## 🔍 Post-Deployment Verification

- [ ] **Job deployed successfully**
  - Check: `gcloud run jobs describe natureswaysoil-video-job --region=us-east1`
  - Verify: Image tag is latest

- [ ] **Scheduler configured**
  - Check: `gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1`
  - Verify: Schedule `0 9,18 * * *` (9 AM and 6 PM Eastern)

- [ ] **Manual execution succeeds**
  - Check: Job executes without errors
  - Verify: Logs show enhanced diagnostics (if no products found)

- [ ] **Enhanced diagnostics visible**
  - Check logs for new fields:
    - `skipReasons` object with counts
    - `skippedRowSamples` array with examples
    - `troubleshootingHints` array with suggestions
    - `envConfig` showing current configuration

## 📊 Success Criteria

✅ Deployment successful if:
- Cloud Run Job updated with new image
- Job executes without errors
- Logs show enhanced diagnostic information when appropriate
- Scheduler continues to function (twice daily at 9 AM and 6 PM)
- No regression in existing functionality

## 🆘 If Something Goes Wrong

1. **Check deployment logs**
   ```bash
   gcloud builds list --limit=5
   ```

2. **Review job logs**
   ```bash
   gcloud run jobs executions logs read \
     --job=natureswaysoil-video-job \
     --region=us-east1
   ```

3. **Rollback if necessary**
   - See [ROLLBACK.md](./ROLLBACK.md)
   - Use previous image digest from backup

4. **Get help**
   - Review [TROUBLESHOOTING_NO_POSTS.md](./TROUBLESHOOTING_NO_POSTS.md)
   - Check [HOW_TO_DEBUG.md](./HOW_TO_DEBUG.md)

---

**Checklist Created:** 2025-12-04
**For Deployment Of:** Diagnostic Fix (PR #34)
**Target Environment:** Production (natureswaysoil-video)
