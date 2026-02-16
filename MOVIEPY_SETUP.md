# MoviePy Free Video Generation Setup Guide

This guide explains how to set up and use the completely free video generation option using MoviePy, Pexels, and gTTS instead of HeyGen.

## Cost Comparison

| Service | HeyGen (Paid) | MoviePy (Free) |
|---------|--------------|----------------|
| **Monthly Cost** | $29-89/month | $0/month |
| **Video Generation** | AI Avatar + Voice | Stock video + TTS |
| **Video Quality** | High (AI-generated) | Medium (stock footage) |
| **Customization** | Avatar/voice selection | Text overlays |
| **Setup Complexity** | Simple (API key) | Medium (multiple services) |
| **Video Limit** | Plan-based | Unlimited (free tier limits) |

## Prerequisites

1. **Pexels API Key** (Free)
2. **Google Cloud Storage Bucket** (Free tier available)
3. **Python 3** with pip (included in Docker)
4. **FFmpeg** (included in Docker)

## Step 1: Get a Free Pexels API Key

Pexels offers a completely free API for stock videos with generous limits (200 requests/hour).

1. Visit [Pexels API](https://www.pexels.com/api/)
2. Click "Get Started" or "Sign Up"
3. Create a free account (no credit card required)
4. Go to your [API settings](https://www.pexels.com/api/new/)
5. Copy your API key

**Free Tier Limits:**
- 200 requests per hour
- 20,000 requests per month
- No cost, no credit card required

## Step 2: Create Google Cloud Storage Bucket

Google Cloud Storage provides free tier with 5GB storage and generous bandwidth.

### Option A: Using Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **Cloud Storage > Buckets**
4. Click **Create Bucket**
5. Bucket configuration:
   - **Name**: `natureswaysoil-videos` (or your custom name)
   - **Location type**: Region (choose closest to your users)
   - **Storage class**: Standard
   - **Access control**: Fine-grained (you'll set permissions per file)
6. Click **Create**

### Option B: Using gcloud CLI

```bash
# Set your project ID
gcloud config set project YOUR_PROJECT_ID

# Create bucket
gcloud storage buckets create gs://natureswaysoil-videos \
  --location=us-central1 \
  --uniform-bucket-level-access

# Grant public read access (optional, files will be made public individually)
gcloud storage buckets add-iam-policy-binding gs://natureswaysoil-videos \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

### Step 3: Set Up Service Account

The application needs credentials to upload to GCS.

1. Go to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Service account details:
   - **Name**: `video-uploader`
   - **Description**: "Upload videos to GCS bucket"
4. Click **Create and Continue**
5. Grant role: **Storage Object Admin**
6. Click **Done**
7. Click on the newly created service account
8. Go to **Keys** tab
9. Click **Add Key > Create New Key**
10. Select **JSON** format
11. Click **Create** (downloads JSON file)

### Step 4: Configure Application

Save the service account JSON key file securely and set these environment variables:

```bash
# Enable free video generation
USE_FREE_VIDEO_GENERATOR=true

# Pexels API key (from Step 1)
PEXELS_API_KEY=your_pexels_api_key_here

# GCS bucket name (from Step 2)
GCS_BUCKET_NAME=natureswaysoil-videos

# Google Cloud credentials
# Option 1: Set GOOGLE_APPLICATION_CREDENTIALS to path of JSON key file
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Option 2: Or set the key content directly (for Cloud Run/Docker)
GS_SERVICE_ACCOUNT_EMAIL=video-uploader@your-project.iam.gserviceaccount.com
GS_SERVICE_ACCOUNT_KEY='{...json key content...}'
```

Update your `.env` file:

```bash
# Free Video Generation Alternative (MoviePy + Pexels + gTTS)
USE_FREE_VIDEO_GENERATOR=true
PEXELS_API_KEY=your_pexels_api_key_here
GCS_BUCKET_NAME=natureswaysoil-videos

# Google Sheets Configuration (reuses same service account)
GS_SERVICE_ACCOUNT_EMAIL=video-uploader@your-project.iam.gserviceaccount.com
GS_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

## How It Works

When `USE_FREE_VIDEO_GENERATOR=true`, the system follows this workflow:

1. **Script Generation** (existing): Uses OpenAI to generate marketing script
2. **Stock Video Download**: Downloads HD video from Pexels matching product title
   - Searches Pexels API with product title as query
   - Falls back to "garden plants" if no results
   - Downloads HD quality MP4
3. **Voiceover Generation**: Uses gTTS (Google Text-to-Speech) CLI
   - Converts script text to natural English speech
   - Outputs MP3 file
4. **Video Composition**: Uses MoviePy Python library
   - Loads stock video
   - Adds generated voiceover as audio track
   - Adds text overlay with product title
   - Exports as MP4 (H.264 codec, AAC audio, 30 FPS)
5. **Upload to GCS**: Uploads final video to Google Cloud Storage
   - Makes file publicly accessible
   - Returns public URL: `https://storage.googleapis.com/[bucket]/[file]`
6. **Post to Platforms** (existing): Same social media posting logic

## Testing

### Test Free Video Generation

```bash
# Set environment variables
export USE_FREE_VIDEO_GENERATOR=true
export PEXELS_API_KEY=your_api_key
export GCS_BUCKET_NAME=your-bucket-name
export DRY_RUN_LOG_ONLY=true
export RUN_ONCE=true

# Run the application
npm run dev
```

### Verify Output

Check the logs for:
```
🎬 Creating video with FREE generator (MoviePy + Pexels + gTTS)...
✅ Free video generation complete: https://storage.googleapis.com/...
```

## Troubleshooting

### Error: "PEXELS_API_KEY not set"

**Solution**: Ensure you've set the `PEXELS_API_KEY` environment variable with your Pexels API key.

```bash
export PEXELS_API_KEY=your_pexels_api_key_here
```

### Error: "GCS_BUCKET_NAME not set"

**Solution**: Set the bucket name you created in Step 2.

```bash
export GCS_BUCKET_NAME=natureswaysoil-videos
```

### Error: "Permission denied" when uploading to GCS

**Solution**: Ensure your service account has the **Storage Object Admin** role on the bucket.

```bash
# Grant role to service account
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:video-uploader@your-project.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### Error: "No stock videos found from Pexels"

**Solution**: 
- Check your Pexels API key is valid
- Verify you haven't exceeded the rate limit (200/hour)
- The system will automatically fall back to "garden plants" search

### Error: "Failed to spawn gtts-cli"

**Solution**: Ensure gTTS is installed.

```bash
# Install gTTS
pip3 install gTTS

# Or with Docker, it's included in the Dockerfile
```

### Error: "MoviePy composition failed"

**Solution**: Ensure Python dependencies are installed.

```bash
# Install dependencies
pip3 install moviepy gTTS Pillow

# Verify FFmpeg is installed
ffmpeg -version
```

### Error: Video quality is poor

**Cause**: Free stock videos from Pexels vary in quality.

**Solutions**:
- Use more specific product titles for better search results
- Set custom search query in the code
- Consider upgrading to HeyGen for consistent quality

## Switching Between HeyGen and Free Generator

### Use HeyGen (Paid)

```bash
USE_FREE_VIDEO_GENERATOR=false
HEYGEN_API_KEY=your_heygen_api_key
```

### Use Free Generator

```bash
USE_FREE_VIDEO_GENERATOR=true
PEXELS_API_KEY=your_pexels_api_key
GCS_BUCKET_NAME=natureswaysoil-videos
```

Both can be configured in `.env` and switched by changing the `USE_FREE_VIDEO_GENERATOR` flag.

## Free Tier Limits Summary

| Service | Free Tier | Overage Cost |
|---------|-----------|--------------|
| **Pexels API** | 200 req/hour, 20k/month | N/A (hard limit) |
| **Google Cloud Storage** | 5 GB storage, 1 GB egress/month | $0.020/GB storage, $0.12/GB egress |
| **gTTS** | Unlimited (Google Translate API) | Free |
| **MoviePy** | Unlimited (open source) | Free |

**Estimated monthly cost for 1000 videos:**
- Storage (1000 videos × 50MB avg): ~50GB = $1.00
- Bandwidth (1000 views × 50MB): ~50GB = $6.00
- **Total**: ~$7/month vs HeyGen's $29-89/month

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review logs in `/tmp/audit.log`
3. Check GCS bucket permissions
4. Verify Pexels API key and quota

## Next Steps

After setup:
1. Test with `DRY_RUN_LOG_ONLY=true`
2. Verify videos are uploaded to GCS
3. Check video quality and adjust settings
4. Deploy to production
5. Monitor costs in Google Cloud Console
