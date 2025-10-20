# Pictory Integration Guide

## Overview

This project uses **Pictory** as the primary video generation service with **WaveSpeed** as a fallback. When a product needs a video, the system follows this flow:

1. **OpenAI**: Generate marketing script from product data
2. **Pictory (Primary)**: Create video from script using Pictory's storyboard → render API
3. **WaveSpeed (Fallback)**: If Pictory fails or credentials are missing, use WaveSpeed
4. **Social Distribution**: Post generated video to Instagram, Twitter, Pinterest, YouTube

## Architecture

```
Product Data → OpenAI Script
                    ↓
              Pictory Storyboard
                    ↓
              Pictory Render (20 min)
                    ↓ (on failure)
              WaveSpeed Video (25 min)
                    ↓
              Social Media Posts
```

## Configuration

### Option 1: Environment Variables (Development)

Add to your `.env` file:

```bash
# Pictory (Primary)
PICTORY_CLIENT_ID="your_client_id"
PICTORY_CLIENT_SECRET="your_client_secret"
X_PICTORY_USER_ID="your_user_id"
PICTORY_API_ENDPOINT="https://api.pictory.ai"

# WaveSpeed (Fallback)
WAVE_SPEED_API_KEY="your_wavespeed_key"
```

### Option 2: Google Secret Manager (Production - Recommended)

1. **Store secrets in Secret Manager:**

```bash
# Run the helper script
./scripts/add-pictory-secrets.sh

# Or manually with gcloud:
echo -n "your_client_id" | gcloud secrets create PICTORY_CLIENT_ID \
  --project=YOUR_PROJECT \
  --replication-policy=automatic \
  --data-file=-

echo -n "your_client_secret" | gcloud secrets create PICTORY_CLIENT_SECRET \
  --project=YOUR_PROJECT \
  --replication-policy=automatic \
  --data-file=-

echo -n "your_user_id" | gcloud secrets create X_PICTORY_USER_ID \
  --project=YOUR_PROJECT \
  --replication-policy=automatic \
  --data-file=-
```

2. **Configure environment to use secrets:**

```bash
# In .env or Cloud Run environment variables
GCP_SECRET_PICTORY_CLIENT_ID="projects/YOUR_PROJECT/secrets/PICTORY_CLIENT_ID/versions/latest"
GCP_SECRET_PICTORY_CLIENT_SECRET="projects/YOUR_PROJECT/secrets/PICTORY_CLIENT_SECRET/versions/latest"
GCP_SECRET_X_PICTORY_USER_ID="projects/YOUR_PROJECT/secrets/X_PICTORY_USER_ID/versions/latest"
```

3. **Grant Cloud Run service account access:**

```bash
# Get your Cloud Run service account
gcloud run services describe YOUR_SERVICE \
  --region=YOUR_REGION \
  --format='value(spec.template.spec.serviceAccountName)'

# Grant Secret Manager access
for SECRET in PICTORY_CLIENT_ID PICTORY_CLIENT_SECRET X_PICTORY_USER_ID; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --project=YOUR_PROJECT \
    --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

## How It Works

### Code Flow (`src/cli.ts`)

1. **Check for existing video:**
   - Check CSV for video URL column
   - Check via WaveSpeed API lookup
   - Check template-based URL

2. **If no video exists, generate with Pictory:**
   ```typescript
   // Generate script
   const script = await generateScript(product)
   
   // Create Pictory client (auto-loads from env or Secret Manager)
   const pictoryClient = await createClientWithSecrets()
   const token = await pictoryClient.getAccessToken()
   
   // Create storyboard
   const storyboardJobId = await pictoryClient.createStoryboard(token, {
     title: product.title,
     scenes: [{ type: 'text', text: script }]
   })
   
   // Wait for storyboard processing (up to 5 min)
   await pictoryClient.pollJobForRenderParams(storyboardJobId, token)
   
   // Request render
   const renderJobId = await pictoryClient.renderVideo(token, storyboardJobId)
   
   // Wait for render completion (up to 20 min)
   const result = await pictoryClient.pollRenderJob(renderJobId, token)
   videoUrl = result.videoUrl
   ```

3. **Fallback to WaveSpeed if Pictory fails:**
   ```typescript
   if (!videoUrl) {
     const { id } = await createWaveSpeedPrediction({ script, jobId })
     videoUrl = await pollWaveSpeedUntilReady(id)
   }
   ```

4. **Post to social media:**
   - Instagram, Twitter, Pinterest, YouTube
   - Write video URL back to Google Sheet

### Pictory Client (`src/pictory.ts`)

The Pictory client provides:

- **`getAccessToken()`**: OAuth2 authentication
- **`createStoryboard(token, payload)`**: Create video storyboard
- **`pollJobForRenderParams(jobId, token)`**: Wait for storyboard ready
- **`renderVideo(token, storyboardJobId)`**: Start render
- **`pollRenderJob(renderJobId, token)`**: Wait for video completion

Features:
- ✅ Automatic retry with exponential backoff
- ✅ Configurable timeouts
- ✅ GCP Secret Manager integration
- ✅ Lazy loading of Secret Manager client (optional dependency)

## Timeouts & Polling

### Pictory
- **Storyboard processing**: 5 minutes max, poll every 3 seconds
- **Video render**: 20 minutes max, poll every 5 seconds

### WaveSpeed (Fallback)
- **Video generation**: 25 minutes max, poll every 15 seconds

> **Note**: Cloud Scheduler has a 30-minute timeout. Keep margin for HTTP overhead and social posting.

## Error Handling

The system is designed to gracefully degrade:

1. **Pictory unavailable** → Falls back to WaveSpeed
2. **WaveSpeed unavailable** → Skips video generation, logs error
3. **Script generation fails** → Cannot create video, skips row
4. **Social post fails** → Retries 3× with exponential backoff

All errors are logged and tracked via the health server endpoint.

## Testing

### Dry Run Mode
Test without actually posting to social media:

```bash
DRY_RUN_LOG_ONLY=true npm run dev
```

This will:
- ✅ Generate scripts
- ✅ Create videos (Pictory or WaveSpeed)
- ❌ Skip posting to social platforms
- ✅ Log what would have been posted

### Test Script
Use the runner to test Pictory API directly:

```bash
# Set credentials
export PICTORY_CLIENT_ID="..."
export PICTORY_CLIENT_SECRET="..."
export X_PICTORY_USER_ID="..."

# Run test
npx ts-node scripts/run-pictory.ts
```

## Monitoring

### Logs

Check Cloud Run logs for video generation:

```bash
gcloud run services logs read YOUR_SERVICE \
  --region=YOUR_REGION \
  --limit=100 | grep -E "(Pictory|WaveSpeed|video)"
```

Look for:
- `🎬 Creating video with Pictory (primary)...`
- `✅ Pictory video ready: https://...`
- `🌊 Creating video with WaveSpeed (fallback)...`
- `❌ Pictory video generation failed: ...`

### Health Endpoint

Check service health:

```bash
curl https://YOUR_SERVICE_URL/health
```

Returns:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "successfulPosts": 42,
  "failedPosts": 3,
  "errors": [...]
}
```

## Troubleshooting

### Pictory fails with "401 Unauthorized"
- Check `PICTORY_CLIENT_ID` and `PICTORY_CLIENT_SECRET` are correct
- Verify `X_PICTORY_USER_ID` matches your account
- Check Secret Manager permissions if using GCP secrets

### Pictory timeout during storyboard
- Storyboard processing taking > 5 minutes
- Increase timeout in `src/cli.ts`:
  ```typescript
  await pictoryClient.pollJobForRenderParams(storyboardJobId, token, {
    timeoutMs: 10 * 60_000  // 10 minutes
  })
  ```

### Pictory timeout during render
- Video render taking > 20 minutes (complex scenes)
- Increase timeout in `src/cli.ts`:
  ```typescript
  await pictoryClient.pollRenderJob(renderJobId, token, {
    timeoutMs: 30 * 60_000  // 30 minutes
  })
  ```
- **Note**: Cloud Scheduler jobs have 30 min hard limit

### Falling back to WaveSpeed too often
- Check Pictory API status: https://status.pictory.ai
- Review logs for specific Pictory errors
- Verify account quotas/limits not exceeded

### Videos not appearing in Google Sheet
- Check `GS_SERVICE_ACCOUNT_EMAIL` and `GS_SERVICE_ACCOUNT_KEY` are set
- Verify service account has Editor access to spreadsheet
- Check `CSV_COL_VIDEO_URL` matches your sheet column name

## API Documentation

- **Pictory API**: https://docs.pictory.ai
- **WaveSpeed API**: https://docs.wavespeed.ai (fallback)

## Support

For issues with:
- **Pictory integration**: Check `src/pictory.ts` and `src/cli.ts`
- **Secret Manager**: Review `scripts/add-pictory-secrets.sh`
- **Video generation flow**: See logs with `WAVE_DEBUG=true`
