# Nature's Way Soil - Automated Product Video Generator

## Features
- Fetch products from a Google Sheet (CSV export URL)
- Generate marketing scripts with OpenAI
- **Primary**: Create videos with Pictory AI (storyboard → render flow)
- **Fallback**: Use WaveSpeed for video generation if Pictory fails or is unavailable
- Posts generated video to Instagram, Twitter, Pinterest, and optionally YouTube
- Iterates through all CSV rows; skips those without a job ID or disabled status
- Skips rows marked as Posted; respects Ready/Enabled when present
- Video URL resolution is configurable: prefer a CSV "video_url" column, otherwise build from a template

## Architecture

```
Google Sheet (CSV) → OpenAI (script generation)
                    ↓
                Pictory (PRIMARY video generation)
                    ↓ (fallback if Pictory fails)
                WaveSpeed (BACKUP video generation)
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
   - **Pictory (Primary)**: Set `PICTORY_CLIENT_ID`, `PICTORY_CLIENT_SECRET`, `X_PICTORY_USER_ID`
     - Or use GCP Secret Manager: `GCP_SECRET_PICTORY_CLIENT_ID`, etc.
   - **WaveSpeed (Fallback)**: Set `WAVE_SPEED_API_KEY` or `WAVESPEED_API_KEY`
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
   - Otherwise, the video URL is built from `WAVE_VIDEO_URL_TEMPLATE` (defaults to `https://wavespeed.ai/jobs/{jobId}/video.mp4`).
   - The URL is preflight-checked via HEAD or a small ranged GET unless `SKIP_VIDEO_EXISTS_CHECK=true`.
- Set `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` from your Google Cloud OAuth2 client (Desktop or Web, with YouTube Data API v3 enabled).
- Optional `YT_PRIVACY_STATUS` (public | unlisted | private), default is `unlisted`.

## Security Notes

- **Never commit your real `.env` file or any secrets to GitHub.**
- Rotate keys if you ever leak them.

## Troubleshooting

- If social posts fail, check your tokens and permissions.
- WaveSpeed job/video URL logic may require refinement based on latest API responses.
 - Twitter: If you only set TWITTER_BEARER_TOKEN, tweets will be text with a link. Set TWITTER_API_KEY/SECRET and TWITTER_ACCESS_TOKEN/SECRET to upload video natively.

### WaveSpeed API (fallback video generation)
- WaveSpeed is used as a fallback if Pictory fails or credentials are not configured.
- You can configure an API lookup to fetch the final video URL by `jobId` before posting.
- Env to set:
   - `WAVE_SPEED_API_KEY`
   - `WAVE_API_BASE_URL` (optional; defaults to `https://api.wavespeed.ai`)
   - `WAVE_VIDEO_LOOKUP_PATH` (e.g., `/v1/endpoint`)
   - `WAVE_VIDEO_LOOKUP_METHOD` (default `POST`)
   - `WAVE_VIDEO_LOOKUP_BODY_TEMPLATE` (JSON string, supports `{jobId}` substitution)
   - `WAVE_VIDEO_LOOKUP_JSON_POINTER` (JSON Pointer path to the URL field, default `/video_url`)
- This mirrors the cURL pattern:
   - POST to `${WAVE_API_BASE_URL}${WAVE_VIDEO_LOOKUP_PATH}`
   - Headers: `Authorization: Bearer <WAVE_SPEED_API_KEY>`, `Content-Type: application/json`
   - Body: rendered from the template with the jobId
   - Path can be templated with `{jobId}`/`{asin}` when the endpoint expects it.
   - You can also set `WAVESPEED_API_KEY` instead of `WAVE_SPEED_API_KEY`.

### Pictory API (primary video generation)
- Pictory is the primary video generation service. The system will:
  1. Generate a marketing script with OpenAI
  2. Create a Pictory storyboard from the script
  3. Wait for storyboard processing (up to 5 minutes)
  4. Request video render
  5. Poll for render completion (up to 20 minutes)
- Configure via environment variables or GCP Secret Manager:
  - Direct: `PICTORY_CLIENT_ID`, `PICTORY_CLIENT_SECRET`, `X_PICTORY_USER_ID`
  - GCP Secret Manager: `GCP_SECRET_PICTORY_CLIENT_ID`, `GCP_SECRET_PICTORY_CLIENT_SECRET`, `GCP_SECRET_X_PICTORY_USER_ID`
- If Pictory fails or credentials are missing, the system automatically falls back to WaveSpeed.

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