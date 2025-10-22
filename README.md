# Nature's Way Soil - Automated Product Video Generator

## Features
- Fetch products from a Google Sheet (CSV export URL)
- Generate marketing scripts with OpenAI
- **Create videos with HeyGen AI** (avatar-based video generation with intelligent voice/avatar mapping)
- Posts generated video to Instagram, Twitter, Pinterest, and optionally YouTube
- Iterates through all CSV rows; skips those without a job ID or disabled status
- Skips rows marked as Posted; respects Ready/Enabled when present
- Video URL resolution is configurable: prefer a CSV "video_url" column, otherwise build from a template

## Architecture

```
Google Sheet (CSV) → OpenAI (script generation)
                    ↓
                HeyGen (video generation with avatars)
                    ↓
            Social Media Posts
            (Instagram, Twitter, Pinterest, YouTube)
```

## Setup

1. Copy `.env.example` to `.env` and fill in all required keys and tokens.
2. Install dependencies:
   ```
   npm install
   ```
3. Configure video generation:
   - **HeyGen**: Set `HEYGEN_API_KEY`
     - Or use GCP Secret Manager: `GCP_SECRET_HEYGEN_API_KEY`
4. Run the CLI:
   ```
   npm run dev
   ```
   Or process and post a single product directly:
   ```
   npx ts-node src/cli.ts
   ```

Note: For Google Sheets, use the CSV export URL form:
`https://docs.google.com/spreadsheets/d/<sheetId>/export?format=csv&gid=<gid>`. Example:
`https://docs.google.com/spreadsheets/d/1LU2ahpzMqLB5FLYqiyDbXOfjTxbdp8U8/export?format=csv&gid=1712974299`.

### Optional: YouTube Upload
### Optional: Google Sheets Writeback
- If you want rows to be marked as posted automatically, provide a service account:
   - `GS_SERVICE_ACCOUNT_EMAIL`, `GS_SERVICE_ACCOUNT_KEY` (key as a single-line string; newlines as \n)
   - The service account must have Editor access to the spreadsheet.
   - By default, sets `Posted=TRUE` and `Posted_At=<ISO timestamp>`. You can change the column headers via env: `CSV_COL_POSTED`, `CSV_COL_POSTED_AT`.

### CSV Defaults for Your Sheet
- Defaults assume columns: `Product_ID, Parent_ASIN, ASIN, SKU, Title, Short_Name`.
- Title is taken from `Title`; details/caption fallback to `Short_Name`.
- You can override with env vars: `CSV_COL_*`.
   - If your CSV has a direct video URL column, set `CSV_COL_VIDEO_URL` (comma-separated header names, first match wins).
   - Otherwise, the video URL is built from `VIDEO_URL_TEMPLATE` (defaults to `https://heygen.ai/jobs/{jobId}/video.mp4`).
   - The URL is preflight-checked via HEAD or a small ranged GET unless `SKIP_VIDEO_EXISTS_CHECK=true`.
- Set `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` from your Google Cloud OAuth2 client (Desktop or Web, with YouTube Data API v3 enabled).
- Optional `YT_PRIVACY_STATUS` (public | unlisted | private), default is `unlisted`.

## Security Notes

- **Never commit your real `.env` file or any secrets to GitHub.**
- Rotate keys if you ever leak them.

## Troubleshooting

- If social posts fail, check your tokens and permissions.
- Twitter: If you only set TWITTER_BEARER_TOKEN, tweets will be text with a link. Set TWITTER_API_KEY/SECRET and TWITTER_ACCESS_TOKEN/SECRET to upload video natively.

### HeyGen API (video generation)
- HeyGen is the primary video generation service. The system will:
  1. Generate a marketing script with OpenAI
  2. Map the product to the best avatar/voice combination based on product keywords
  3. Create a HeyGen video generation job
  4. Poll for video completion (up to 25 minutes)
  5. Write the video URL back to the Google Sheet
- Configure via environment variables or GCP Secret Manager:
  - Direct: `HEYGEN_API_KEY`
  - GCP Secret Manager: `GCP_SECRET_HEYGEN_API_KEY`
- The system uses intelligent avatar/voice mapping based on product categories:
  - Kelp/seaweed products → garden expert avatar with warm female voice
  - Bone meal products → farm expert avatar with deep male voice
  - Hay/pasture products → pasture specialist with neutral voice
  - Humic/fulvic products → eco gardener with warm female voice
  - Compost/soil products → eco gardener with warm female voice
- Mappings are written back to the sheet in HEYGEN_* columns for tracking
- Video duration is configurable via `HEYGEN_VIDEO_DURATION_SECONDS` (default: 30)

## License

MIT

## Deploying on Google Cloud

### Cloud Run (container, long-running or on-demand)
1. Build and push the image:
   - Ensure you’re authenticated with `gcloud` and have Artifact Registry/Cloud Run enabled.
   - Build and submit:
     ```
     gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/repo/naturesway-video:latest
     ```
2. Deploy:
   ```
   gcloud run deploy naturesway-video \
     --image=REGION-docker.pkg.dev/PROJECT_ID/repo/naturesway-video:latest \
     --region=REGION \
     --memory=512Mi --cpu=1 \
     --no-allow-unauthenticated \
     --set-env-vars=RUN_ONCE=false,POLL_INTERVAL_MS=60000 \
     --set-env-vars=CSV_URL=...,CSV_COL_JOB_ID=ASIN,CSV_COL_DETAILS=Title \
     --set-secrets=INSTAGRAM_ACCESS_TOKEN=...,INSTAGRAM_IG_ID=... \
     --set-secrets=TWITTER_BEARER_TOKEN=... \
     --set-secrets=TWITTER_API_KEY=...,TWITTER_API_SECRET=...,TWITTER_ACCESS_TOKEN=...,TWITTER_ACCESS_SECRET=... \
     --set-secrets=PINTEREST_ACCESS_TOKEN=...,PINTEREST_BOARD_ID=... \
     --set-secrets=YT_CLIENT_ID=...,YT_CLIENT_SECRET=...,YT_REFRESH_TOKEN=... \
     --set-secrets=GS_SERVICE_ACCOUNT_EMAIL=...,GS_SERVICE_ACCOUNT_KEY=...
   ```
   Notes:
   - Prefer Cloud Secrets for the credentials referenced above.
   - If you don’t want a continuously running service, see Cloud Run Jobs below.

### Cloud Run Jobs (serverless, scheduled or ad-hoc)
1. Use the same image as above. Ensure `RUN_ONCE=true` (default in Dockerfile) so it exits after one pass.
2. Create the job:
   ```
   gcloud run jobs create naturesway-video-job \
     --image=REGION-docker.pkg.dev/PROJECT_ID/repo/naturesway-video:latest \
     --region=REGION \
     --set-env-vars=RUN_ONCE=true \
     --set-env-vars=CSV_URL=...,CSV_COL_JOB_ID=ASIN,CSV_COL_DETAILS=Title \
     --set-secrets=... # same secrets as above
   ```
3. Trigger on a schedule via Cloud Scheduler (HTTP target to the job execution endpoint), or run on demand:
   ```
   gcloud run jobs execute naturesway-video-job --region=REGION
   ```
---

## 🚀 Quick Deployment Guide

The system is production-ready and designed to run on Google Cloud Platform as a scheduled Cloud Run Job.

### Automated Deployment

```bash
# 1. Configure secrets in Google Cloud Secret Manager
# 2. Run automated deployment script
export PROJECT_ID=natureswaysoil-video
export REGION=us-east1
./scripts/deploy-gcp.sh

# 3. Verify deployment
./scripts/verify-deployment.sh
```

### Comprehensive Documentation

- **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** - Essential commands and rapid deployment
- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** - Complete deployment guide (18KB)
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Step-by-step verification checklist

### System Status

✅ **Production Ready** - Fully tested and validated for live deployment
- HeyGen AI video generation with intelligent avatar/voice mapping
- Multi-platform social media distribution
- Automated twice-daily scheduling (9am, 6pm ET)
- Google Sheets integration with writeback
- Comprehensive monitoring and logging
- Cost: ~$20-130/month

See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) for complete deployment instructions.
