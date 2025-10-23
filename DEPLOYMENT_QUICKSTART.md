# Deployment Quick Start Guide

## Prerequisites (One-Time Setup)

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Clone repository
git clone https://github.com/natureswaysoil/video.git
cd video

# Install dependencies
npm install

# Build project
npm run build
```

## 1. Create Secrets in GCP

```bash
# Set project
export PROJECT_ID=natureswaysoil-video
gcloud config set project $PROJECT_ID

# Enable Secret Manager
gcloud services enable secretmanager.googleapis.com

# Create required secrets (replace YOUR_* with actual values)
echo -n "YOUR_HEYGEN_API_KEY" | gcloud secrets create HEYGEN_API_KEY --data-file=-
echo -n "YOUR_OPENAI_API_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=-
echo -n "YOUR_INSTAGRAM_TOKEN" | gcloud secrets create INSTAGRAM_ACCESS_TOKEN --data-file=-
echo -n "YOUR_INSTAGRAM_ID" | gcloud secrets create INSTAGRAM_IG_ID --data-file=-
echo -n "service-account@project.iam.gserviceaccount.com" | gcloud secrets create GS_SERVICE_ACCOUNT_EMAIL --data-file=-

# For service account key, convert to single-line JSON
cat service-account-key.json | tr -d '\n' | gcloud secrets create GS_SERVICE_ACCOUNT_KEY --data-file=-

# Optional: Twitter
echo -n "YOUR_TWITTER_API_KEY" | gcloud secrets create TWITTER_API_KEY --data-file=-
echo -n "YOUR_TWITTER_API_SECRET" | gcloud secrets create TWITTER_API_SECRET --data-file=-
echo -n "YOUR_TWITTER_ACCESS_TOKEN" | gcloud secrets create TWITTER_ACCESS_TOKEN --data-file=-
echo -n "YOUR_TWITTER_ACCESS_SECRET" | gcloud secrets create TWITTER_ACCESS_SECRET --data-file=-

# Optional: Pinterest
echo -n "YOUR_PINTEREST_TOKEN" | gcloud secrets create PINTEREST_ACCESS_TOKEN --data-file=-
echo -n "YOUR_BOARD_ID" | gcloud secrets create PINTEREST_BOARD_ID --data-file=-

# Optional: YouTube
echo -n "YOUR_YT_CLIENT_ID" | gcloud secrets create YT_CLIENT_ID --data-file=-
echo -n "YOUR_YT_CLIENT_SECRET" | gcloud secrets create YT_CLIENT_SECRET --data-file=-
echo -n "YOUR_YT_REFRESH_TOKEN" | gcloud secrets create YT_REFRESH_TOKEN --data-file=-
```

## 2. Update Configuration

```bash
# Edit deployment script with your Google Sheets CSV URL
nano scripts/deploy-gcp.sh
# Update CSV_URL_DEFAULT variable (line 16)
```

## 3. Deploy to Google Cloud

```bash
# Set deployment parameters
export PROJECT_ID=natureswaysoil-video
export REGION=us-east1
export TIME_ZONE=America/New_York

# Run deployment
./scripts/deploy-gcp.sh
```

Expected output:
```
Project: natureswaysoil-video | Region: us-east1 | Time zone: America/New_York
Enabling required services...
Creating Artifact Registry...
Building and pushing image...
Creating job service account...
Creating Cloud Run Job...
Creating Cloud Scheduler job...
Done.
```

## 4. Verify Deployment

```bash
./scripts/verify-deployment.sh
```

Expected output:
```
✅ System is ready for deployment!

Next steps:
  1. Review configuration
  2. Test manually
  3. Check logs
  4. Monitor scheduler
```

## 5. Test Manual Execution

```bash
# Execute job once
gcloud run jobs execute natureswaysoil-video-job --region=us-east1

# Check logs
gcloud run jobs executions logs read \
  --job=natureswaysoil-video-job \
  --region=us-east1 \
  --limit=100
```

## 6. Enable Automatic Schedule

The scheduler is automatically created and enabled with:
- **Schedule**: 9:00 AM and 6:00 PM Eastern Time
- **Frequency**: Twice daily

To manually trigger:
```bash
gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1
```

## Common Commands

### Monitoring

```bash
# View recent logs
gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 --limit=50

# Follow logs in real-time
gcloud run jobs executions logs tail --job=natureswaysoil-video-job --region=us-east1

# Check job status
gcloud run jobs describe natureswaysoil-video-job --region=us-east1

# Check scheduler status
gcloud scheduler jobs describe natureswaysoil-video-2x --location=us-east1
```

### Control

```bash
# Pause scheduler
gcloud scheduler jobs pause natureswaysoil-video-2x --location=us-east1

# Resume scheduler
gcloud scheduler jobs resume natureswaysoil-video-2x --location=us-east1

# Manual trigger
gcloud scheduler jobs run natureswaysoil-video-2x --location=us-east1

# Manual job execution
gcloud run jobs execute natureswaysoil-video-job --region=us-east1
```

### Updates

```bash
# Update a secret
echo -n "NEW_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-

# Redeploy after code changes
git pull
npm run build
./scripts/deploy-gcp.sh
```

## Troubleshooting

### Deployment fails

```bash
# Check if all APIs are enabled
gcloud services list --enabled | grep -E "run|build|scheduler|artifactregistry|secretmanager"

# Verify secrets exist
gcloud secrets list

# Check authentication
gcloud auth list
```

### Job execution fails

```bash
# View detailed logs
gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 --limit=200

# Check job configuration
gcloud run jobs describe natureswaysoil-video-job --region=us-east1 --format=yaml

# Verify secrets are attached
gcloud run jobs describe natureswaysoil-video-job --region=us-east1 --format="yaml(spec.template.spec.containers[0].env)"
```

### Videos not generated

```bash
# Check HeyGen secret
gcloud secrets versions access latest --secret=HEYGEN_API_KEY

# Check OpenAI secret
gcloud secrets versions access latest --secret=OPENAI_API_KEY

# Test HeyGen locally (create test script)
```

### Posts not reaching platforms

```bash
# Check platform secrets
gcloud secrets versions access latest --secret=INSTAGRAM_ACCESS_TOKEN
gcloud secrets versions access latest --secret=TWITTER_API_KEY
gcloud secrets versions access latest --secret=PINTEREST_ACCESS_TOKEN

# Filter logs for posting
gcloud run jobs executions logs read --job=natureswaysoil-video-job --region=us-east1 | grep "Posted to"
```

## Architecture Overview

```
┌─────────────────────┐
│  Cloud Scheduler    │  ← Triggers twice daily (9am, 6pm ET)
│  (natureswaysoil-   │
│   video-2x)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Cloud Run Job      │  ← Executes video generation pipeline
│  (natureswaysoil-   │
│   video-job)        │
└──────────┬──────────┘
           │
           ├─────────────────┐
           │                 │
           ▼                 ▼
┌──────────────────┐  ┌──────────────┐
│  Google Sheets   │  │  HeyGen API  │
│  (CSV export)    │  │  (Videos)    │
└──────────────────┘  └──────────────┘
           │
           ▼
    ┌──────────────┐
    │   OpenAI     │
    │  (Scripts)   │
    └──────────────┘
           │
           ▼
    ┌──────────────────────────────────┐
    │  Social Media Distribution       │
    ├──────────┬──────────┬────────────┤
    │Instagram │ Twitter  │ Pinterest  │
    │          │          │ YouTube    │
    └──────────┴──────────┴────────────┘
```

## Cost Estimate

**Monthly costs** (assuming twice-daily execution, 5 products per run):

| Service | Cost |
|---------|------|
| Google Cloud (Run, Scheduler, Build, Secrets) | $4-7 |
| HeyGen API (300 videos/month) | Variable* |
| OpenAI GPT-4 (300 scripts) | $15-20 |
| Social Media APIs | $0-100 |
| **Total** | **$20-130/month** |

\* Check HeyGen pricing: https://heygen.com/pricing

## Next Steps

1. ✅ Review full deployment guide: [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)
2. ✅ Complete deployment checklist: [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
3. ✅ Set up monitoring and alerts
4. ✅ Test all social media platforms
5. ✅ Schedule regular maintenance

## Support

- **Full Documentation**: [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)
- **Troubleshooting**: See PRODUCTION_DEPLOYMENT.md, section "Troubleshooting"
- **HeyGen Setup**: [HEYGEN_SETUP.md](./HEYGEN_SETUP.md)
- **Main README**: [README.md](./README.md)

---

**Quick Links:**
- [Google Cloud Console](https://console.cloud.google.com)
- [Cloud Run Jobs](https://console.cloud.google.com/run/jobs)
- [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)
- [Secret Manager](https://console.cloud.google.com/security/secret-manager)
