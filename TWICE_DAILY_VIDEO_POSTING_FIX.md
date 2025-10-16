# Twice-Daily Video Posting System - Diagnosis & Fix

## 🔍 System Overview

**Google Cloud Project**: `natureswaysoil-video` (Project #993533990327)

**Cloud Scheduler Job**: `natureswaysoil-video-2x`
- Schedule: `0 9,18 * * *` (9 AM and 6 PM Eastern)
- Target: Cloud Run Job `natureswaysoil-video-job`
- Status: ✅ ENABLED but ❌ FAILING

## ❌ Problem Identified

The Cloud Run job is **timing out** after 10 minutes, but WaveSpeed video generation typically takes **longer than 10 minutes** to complete.

### Evidence from Logs:
```
2025-10-14 18:06:47 - ✅ Created WaveSpeed prediction: 5b20e0b0d4b745fca566131c631b36a0
2025-10-14 18:16:36 - ❌ Terminating task because it has reached the maximum timeout of 600 seconds
```

The job:
1. Generated OpenAI script ✅
2. Created WaveSpeed video ✅
3. Started waiting for video completion ⏳
4. Hit 10-minute timeout after 600 seconds ❌
5. Retried 3 times (total 41 minutes) ❌ All failed

### Current Configuration:
- **Task Timeout**: `600 seconds` (10 minutes) ❌ TOO SHORT
- **Max Retries**: 3
- **WaveSpeed Poll Timeout**: 30 minutes (from cli.ts line 110)
- **Actual Video Generation Time**: ~15-25 minutes typically

## 🛠️ Solution

**Increase the Cloud Run job task timeout to 60 minutes** to allow WaveSpeed enough time to complete.

### Commands to Fix:

```bash
# Update the job timeout to 60 minutes (3600 seconds)
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --task-timeout=3600

# Verify the update
gcloud run jobs describe natureswaysoil-video-job \
  --region=us-east1 \
  --format="value(spec.template.spec.template.spec.timeoutSeconds)"
```

### Alternative: Update via YAML

Create `job-config-update.yaml`:
```yaml
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: natureswaysoil-video-job
spec:
  template:
    spec:
      template:
        spec:
          timeoutSeconds: 3600  # 60 minutes
```

Apply:
```bash
gcloud run jobs replace job-config-update.yaml --region=us-east1
```

## 📊 System Architecture

### CSV Data Source
- **URL**: `https://docs.google.com/spreadsheets/d/1LU2ahpzMqLB5FLYqiyDbXOfjTxbdp8U8/export?format=csv&gid=1712974299`
- **Job ID Column**: `ASIN`
- **Details Column**: `Title`
- **Video URL Column**: Written back to sheet after generation

### Workflow (from `src/cli.ts`):
1. **Fetch CSV** from Google Sheets
2. **For each row**:
   - Check if video already exists
   - If not, generate **OpenAI script** (~5 sec)
   - Create **WaveSpeed video** with script (~15-25 min)
   - Poll WaveSpeed every 15 seconds until ready
   - Write video URL back to Google Sheet
3. **Post to social media**:
   - Instagram (with retry)
   - Twitter (with retry)
   - Pinterest (with retry)
   - YouTube (with retry)
4. **Mark row as posted** in sheet

### Environment Variables (Secrets):
- `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_IG_ID`
- `TWITTER_BEARER_TOKEN`, `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`
- `PINTEREST_ACCESS_TOKEN` (no board ID configured)
- `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`
- `WAVE_SPEED_API_KEY`
- `OPENAI_API_KEY`
- `GS_SERVICE_ACCOUNT_EMAIL`, `GS_SERVICE_ACCOUNT_KEY`

## ⚠️ Additional Issues Found

### 1. Missing Pinterest Board ID
The job has `PINTEREST_ACCESS_TOKEN` but **no `PINTEREST_BOARD_ID`** configured in secrets.

**Impact**: Pinterest posting will be skipped (not attempted)

**To Fix**:
```bash
# After getting board ID from Pinterest
echo -n "your-board-id-here" | gcloud secrets create PINTEREST_BOARD_ID --data-file=-

# Update job to use the secret
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --set-secrets="PINTEREST_BOARD_ID=PINTEREST_BOARD_ID:latest"
```

### 2. Video Generation Polling Strategy
Current polling in `cli.ts`:
- **Timeout**: 30 minutes (good ✅)
- **Interval**: 15 seconds (good ✅)
- **Max attempts**: 120 checks (good ✅)

But the **task timeout** was cutting it off at 10 minutes before polling could complete.

## 🧪 Testing the Fix

After updating the timeout, manually trigger a test run:

```bash
# Trigger the scheduler job manually
gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1

# Watch the execution in real-time
gcloud run jobs executions list \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=1

# Get the execution name (e.g., natureswaysoil-video-job-xxxxx) and check logs
gcloud logging read \
  'resource.type="cloud_run_job" 
   resource.labels.job_name="natureswaysoil-video-job"
   labels."run.googleapis.com/execution_name"="<execution-name>"' \
  --limit=100 \
  --format="table(timestamp,severity,textPayload)"
```

## ✅ Expected Successful Flow

After fix, the logs should show:
1. ✅ Generated script with OpenAI
2. ✅ Created WaveSpeed prediction
3. ⏳ Polling WaveSpeed... (15-25 minutes)
4. ✅ Video ready: [URL]
5. ✅ Wrote video URL to sheet
6. ✅ Posted to Instagram
7. ✅ Posted to Twitter
8. ✅ Posted to Pinterest (if board ID configured)
9. ✅ Uploaded to YouTube
10. ✅ Marked row as posted

## 📝 Related Systems

This is a **separate system** from the blog automation (`blog-generator` service) we worked on earlier:

| System | Purpose | Schedule | Service |
|--------|---------|----------|---------|
| **Blog Automation** | Generate blog articles + videos | Every 2 days at 9 AM | `blog-generator` |
| **Product Video Posting** | Post product videos from CSV | 9 AM & 6 PM daily | `natureswaysoil-video-job` |

Both use WaveSpeed for videos, but serve different purposes.

## 🚀 Deployment Steps

1. **Update timeout** (required):
   ```bash
   gcloud run jobs update natureswaysoil-video-job \
     --region=us-east1 \
     --task-timeout=3600
   ```

2. **Configure Pinterest board ID** (optional but recommended):
   ```bash
   # Get fresh token from https://developers.pinterest.com/apps/
   # List boards to find ID
   curl -X GET "https://api.pinterest.com/v5/boards" \
     -H "Authorization: Bearer YOUR_TOKEN"
   
   # Create secret
   echo -n "BOARD_ID_HERE" | gcloud secrets create PINTEREST_BOARD_ID --data-file=-
   
   # Update job
   gcloud run jobs update natureswaysoil-video-job \
     --region=us-east1 \
     --set-secrets="PINTEREST_BOARD_ID=PINTEREST_BOARD_ID:latest"
   ```

3. **Test manually**:
   ```bash
   gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1
   ```

4. **Monitor next scheduled run**:
   - Next run: Every day at 9 AM and 6 PM Eastern
   - Check status: Cloud Console > Cloud Run Jobs > natureswaysoil-video-job

## 📞 Monitoring & Health

The system includes a health check server (from `health-server` module):
- Tracks successful/failed posts
- Records errors by platform
- Updates status during processing

Health metrics are internal to the job execution (not exposed externally).

## 🎯 Success Criteria

System is working when:
- ✅ Job completes within 60 minutes (not timing out)
- ✅ Videos are generated and written to Google Sheet
- ✅ Videos are posted to Instagram, Twitter, and YouTube
- ✅ (Optional) Videos are posted to Pinterest if board ID configured
- ✅ Runs successfully at 9 AM and 6 PM Eastern daily
