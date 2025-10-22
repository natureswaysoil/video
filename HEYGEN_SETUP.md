# HeyGen Integration Guide

## Overview

This project uses **HeyGen** as the primary and only video generation service. HeyGen provides AI-powered avatar-based video generation with intelligent voice synthesis and customizable avatars.

## Architecture

```
Product Data → OpenAI Script Generation
                    ↓
         Smart Avatar/Voice Mapping (heygen-adapter)
                    ↓
              HeyGen Video Generation
                    ↓
              Social Media Posts
         (Instagram, Twitter, Pinterest, YouTube)
```

## Features

- **Intelligent Avatar/Voice Mapping**: Automatically selects the best avatar and voice based on product keywords
- **Category-Based Customization**: Different products get different avatars and voices for variety
- **Google Sheets Integration**: Writes mapping decisions back to the sheet for tracking
- **Configurable Video Duration**: Control video length via environment variables
- **GCP Secret Manager Support**: Secure credential storage for production deployments

## Configuration

### Option 1: Environment Variables (Development)

Add to your `.env` file:

```bash
# HeyGen API Key (Required)
HEYGEN_API_KEY="your_api_key_here"

# HeyGen API Endpoint (Optional - defaults to https://api.heygen.com)
HEYGEN_API_ENDPOINT="https://api.heygen.com"

# Video Configuration
HEYGEN_VIDEO_DURATION_SECONDS=30

# Optional: Override default avatar and voice
HEYGEN_DEFAULT_AVATAR="garden_expert_01"
HEYGEN_DEFAULT_VOICE="en_us_warm_female_01"

# Optional: Webhook for completion notifications
HEYGEN_WEBHOOK_URL="https://your-domain.com/heygen-webhook"
```

### Option 2: Google Secret Manager (Production - Recommended)

1. **Store secrets in Secret Manager:**

```bash
# Using gcloud CLI
echo -n "your_api_key" | gcloud secrets create HEYGEN_API_KEY \
  --project=YOUR_PROJECT \
  --replication-policy=automatic \
  --data-file=-
```

2. **Configure environment to use secrets:**

```bash
# In .env or Cloud Run environment variables
GCP_SECRET_HEYGEN_API_KEY="projects/YOUR_PROJECT/secrets/HEYGEN_API_KEY/versions/latest"
```

3. **Grant Cloud Run service account access:**

```bash
# Get your Cloud Run service account
SA=$(gcloud run services describe YOUR_SERVICE \
  --region=YOUR_REGION \
  --format='value(spec.template.spec.serviceAccountName)')

# Grant Secret Manager access
gcloud secrets add-iam-policy-binding HEYGEN_API_KEY \
  --project=YOUR_PROJECT \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor"
```

## How It Works

### 1. Product to HeyGen Mapping

The system automatically selects avatars and voices based on product keywords:

| Product Type | Keywords | Avatar | Voice | Duration |
|-------------|----------|--------|-------|----------|
| Kelp/Seaweed | kelp, seaweed, algae | garden_expert_01 | en_us_warm_female_01 | 30s |
| Bone Meal | bone meal, bonemeal, bone | farm_expert_02 | en_us_deep_male_01 | 35s |
| Hay/Pasture | hay, pasture, forage | pasture_specialist_01 | en_us_neutral_mx_01 | 40s |
| Humic/Fulvic | humic, fulvic, humate | eco_gardener_01 | en_us_warm_female_02 | 30s |
| Compost/Soil | compost, tea, soil conditioner | eco_gardener_01 | en_us_warm_female_02 | 30s |
| Default | (any other) | garden_expert_01 | en_us_warm_female_01 | 30s |

**Customization**: You can override the default avatar and voice by setting `HEYGEN_DEFAULT_AVATAR` and `HEYGEN_DEFAULT_VOICE` in your environment.

### 2. Code Flow

```typescript
// 1. Load HeyGen client with credentials
const heygenClient = await createClientWithSecrets()

// 2. Map product to best avatar/voice
const mapping = mapProductToHeyGenPayload(product)

// 3. Create video job
const jobId = await heygenClient.createVideoJob({
  script: "Your marketing script here",
  avatar: mapping.avatar,
  voice: mapping.voice,
  lengthSeconds: mapping.lengthSeconds,
  title: "Product Video Title",
  subtitles: { enabled: true }
})

// 4. Poll for completion
const videoUrl = await heygenClient.pollJobForVideoUrl(jobId, {
  timeoutMs: 25 * 60_000,  // 25 minutes
  intervalMs: 15_000       // Check every 15 seconds
})

// 5. Post to social media
await postToInstagram(videoUrl, caption, ...)
```

### 3. Google Sheets Integration

When configured with a service account, the system writes mapping information back to your Google Sheet:

- `HEYGEN_AVATAR`: The avatar used (e.g., "garden_expert_01")
- `HEYGEN_VOICE`: The voice used (e.g., "en_us_warm_female_01")
- `HEYGEN_LENGTH_SECONDS`: Video duration (e.g., "30")
- `HEYGEN_MAPPING_REASON`: Why this avatar was chosen (e.g., "matched keyword: kelp")
- `HEYGEN_MAPPED_AT`: Timestamp of mapping (ISO 8601 format)

**Setup**: Set `GCP_SA_JSON` (raw JSON) or `GCP_SECRET_SA_JSON` (Secret Manager resource name) in your environment.

## Timeouts & Polling

- **Video Generation**: 25 minutes max, polls every 15 seconds
- **Status Checks**: Automatic retry with exponential backoff on temporary failures

> **Note**: Cloud Scheduler has a 30-minute timeout. The 25-minute limit keeps margin for HTTP overhead and social posting.

## Error Handling

The system provides comprehensive error handling:

1. **Missing Credentials** → Skips row with clear error message
2. **Script Generation Fails** → Uses product description as fallback
3. **Video Generation Fails** → Logs error, skips row, continues with next
4. **Social Post Fails** → Retries 3× with exponential backoff per platform

All errors are logged and tracked via the health server endpoint (`/health`).

## Testing

### Dry Run Mode

Test without posting to social media:

```bash
DRY_RUN_LOG_ONLY=true npm run dev
```

This will:
- ✅ Generate scripts with OpenAI
- ✅ Create videos with HeyGen
- ✅ Write video URLs to sheet
- ❌ Skip posting to social platforms
- ✅ Log what would have been posted

### Test Single Product

Process a single product from your CSV:

```bash
# Set up .env with credentials
export CSV_URL="https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=..."
export HEYGEN_API_KEY="your_key"
export OPENAI_API_KEY="your_key"

# Run once and exit
RUN_ONCE=true npm run dev
```

## Monitoring

### Logs

Check Cloud Run logs for video generation:

```bash
gcloud run services logs read YOUR_SERVICE \
  --region=YOUR_REGION \
  --limit=100 | grep -E "(HeyGen|video|🎬)"
```

Look for:
- `🎬 Creating video with HeyGen...`
- `✅ Created HeyGen video job: <job_id>`
- `✅ HeyGen video ready: https://...`
- `❌ HeyGen video generation failed: ...`

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
  "rowsProcessed": 42,
  "successfulPosts": 120,
  "failedPosts": 3,
  "lastErrors": [
    "HeyGen: Product ABC - API timeout after 25 minutes"
  ]
}
```

## Troubleshooting

### HeyGen fails with "API key required"

- **Check**: `HEYGEN_API_KEY` is set in `.env` or environment
- **Verify**: If using Secret Manager, check `GCP_SECRET_HEYGEN_API_KEY` path is correct
- **Permissions**: Ensure service account has `roles/secretmanager.secretAccessor`

### Video generation timeout

- **Increase timeout** in `src/cli.ts`:
  ```typescript
  await heygenClient.pollJobForVideoUrl(jobId, {
    timeoutMs: 30 * 60_000  // 30 minutes
  })
  ```
- **Note**: Cloud Scheduler jobs have 30 min hard limit
- **Check**: HeyGen API status and your account quotas

### Wrong avatar/voice selected

- **Review mappings**: Check `HEYGEN_MAPPING_REASON` column in your sheet
- **Override defaults**: Set `HEYGEN_DEFAULT_AVATAR` and `HEYGEN_DEFAULT_VOICE`
- **Custom rules**: Edit avatar/voice mapping rules in `src/heygen-adapter.ts`

### Videos not appearing in Google Sheet

- **Check**: `GS_SERVICE_ACCOUNT_EMAIL` and `GS_SERVICE_ACCOUNT_KEY` are set
- **Verify**: Service account has Editor access to the spreadsheet
- **Column**: Check `CSV_COL_VIDEO_URL` matches your sheet column name
- **Alternative**: Use `SHEET_VIDEO_TARGET_COLUMN_LETTER` (e.g., "AB") for fixed column

### Mapping info not written to sheet

- **Check**: `GCP_SA_JSON` or `GCP_SECRET_SA_JSON` is set
- **Verify**: Service account JSON is valid
- **Permissions**: Service account needs Editor access to spreadsheet
- **Columns**: System creates `HEYGEN_*` columns automatically if missing

## API Documentation

- **HeyGen API**: https://docs.heygen.com/
- **Supported Avatars**: Contact HeyGen support for available avatar IDs
- **Voice IDs**: Check HeyGen dashboard for voice library

## Advanced Configuration

### Custom Avatar Mapping Rules

Edit `src/heygen-adapter.ts` to add custom rules:

```typescript
const CATEGORY_MAP = [
  // Add your custom rule
  {
    pattern: /\b(organic|natural)\b/i,
    avatar: 'organic_specialist_01',
    voice: 'en_us_friendly_female_01',
    lengthSeconds: 25,
    reason: 'matched keyword: organic'
  },
  // ... existing rules
]
```

### Video Quality Settings

HeyGen quality is controlled by your account settings. Contact HeyGen support to:
- Upgrade video resolution (720p, 1080p, 4K)
- Enable premium voices
- Access custom avatars

### Webhook Integration

If you host a webhook endpoint, HeyGen can notify you when videos complete:

1. Set `HEYGEN_WEBHOOK_URL` in `.env`
2. Implement webhook handler at your endpoint
3. Verify webhook signature (see HeyGen docs)

## Migration from Pictory/WaveSpeed

This repository previously used Pictory (primary) and WaveSpeed (fallback). HeyGen is now the only video generator.

**Migration steps**:
1. Remove old environment variables: `PICTORY_*`, `WAVE_*`
2. Add `HEYGEN_API_KEY` to your environment
3. Update Cloud Run/Scheduler environment variables
4. Test with `DRY_RUN_LOG_ONLY=true` first

**Advantages of HeyGen**:
- 🎭 Multiple avatars for variety
- 🗣️ Natural-sounding voices
- ⚡ Faster generation times
- 🎨 Better video quality
- 🔧 Simpler configuration (single API key)

## Support

For issues with:
- **HeyGen integration**: Check `src/heygen.ts` and `src/cli.ts`
- **Avatar/voice mapping**: Review `src/heygen-adapter.ts`
- **Secret Manager**: Verify IAM permissions and secret paths
- **Video generation flow**: Enable debug logs with `HEYGEN_DEBUG=true`

## Additional Resources

- [HeyGen Documentation](https://docs.heygen.com/)
- [Google Secret Manager Docs](https://cloud.google.com/secret-manager/docs)
- [Cloud Run Environment Variables](https://cloud.google.com/run/docs/configuring/environment-variables)
