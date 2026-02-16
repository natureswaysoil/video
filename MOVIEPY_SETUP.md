# MoviePy Free Video Generation Setup Guide

This guide explains how to set up and use the completely free video generation option using MoviePy, Pexels, and gTTS instead of HeyGen.

## Cost Comparison

| Service | HeyGen (Paid) | MoviePy + gTTS | MoviePy + ElevenLabs |
|---------|--------------|----------------|----------------------|
| **Monthly Cost** | $29-89/month | $0/month | $0/month (10k chars free) |
| **Video Generation** | AI Avatar + Voice | Stock video + TTS | Stock video + Natural TTS |
| **Voice Quality** | High (AI voice) | Low (robotic) | High (natural voice) |
| **Video Quality** | High (AI-generated) | Medium (stock footage) | Medium (stock footage) |
| **Customization** | Avatar/voice selection | Text overlays | Text + product images |
| **Setup Complexity** | Simple (API key) | Medium (multiple services) | Medium (multiple services) |
| **Video Limit** | Plan-based | Unlimited (free tier limits) | ~25 videos/month (10k chars) |

## Prerequisites

1. **Pexels API Key** (Free)
2. **Google Cloud Storage Bucket** (Free tier available)
3. **Python 3** with pip (included in Docker)
4. **FFmpeg** (included in Docker)
5. **ElevenLabs API Key** (Optional - Free 10k chars/month for natural voice)

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
# Free Video Generation Alternative (MoviePy + Pexels + ElevenLabs/gTTS)
USE_FREE_VIDEO_GENERATOR=true
PEXELS_API_KEY=your_pexels_api_key_here
GCS_BUCKET_NAME=natureswaysoil-videos

# ElevenLabs Voice (Optional - FREE 10k chars/month)
# Provides natural voice instead of robotic gTTS
# If not set, automatically falls back to gTTS
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL  # Optional: Sarah voice (default)

# Product Image Column (Optional)
# The column name in your Google Sheet that contains product image URLs
# If not set, auto-detects from: Image_URL, Product_Image, ASIN_Image, etc.
PRODUCT_IMAGE_COLUMN=Image_URL

# Google Sheets Configuration (reuses same service account)
GS_SERVICE_ACCOUNT_EMAIL=video-uploader@your-project.iam.gserviceaccount.com
GS_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

## Step 5: Get ElevenLabs API Key (Optional - Recommended)

ElevenLabs offers a **free tier with 10,000 characters per month** which is enough for approximately 25 product videos. The voice quality is **10x better** than gTTS (robotic).

### Why ElevenLabs?

- ✅ **Natural Voice**: Sounds like a real person, not robotic
- ✅ **Free Tier**: 10,000 characters/month (no credit card required)
- ✅ **Easy Setup**: Just an API key
- ✅ **Automatic Fallback**: If quota exceeded or key not set, automatically uses gTTS

### Setup Instructions

1. Go to [https://elevenlabs.io/](https://elevenlabs.io/)
2. Click **Sign Up** (no credit card required)
3. Verify your email address
4. Go to your [Profile Settings](https://elevenlabs.io/speech-synthesis)
5. Click **API Keys** in the left sidebar
6. Copy your API key
7. Add to `.env`:
   ```bash
   ELEVENLABS_API_KEY=your_api_key_here
   ```

### Voice Selection (Optional)

ElevenLabs provides several pre-made voices. The default is **Sarah** (female voice).

To use a different voice:

1. Go to [Voice Library](https://elevenlabs.io/voice-library)
2. Browse available voices
3. Click on a voice and copy its **Voice ID**
4. Add to `.env`:
   ```bash
   ELEVENLABS_VOICE_ID=your_voice_id_here
   ```

Popular voices:
- `EXAVITQu4vr4xnSDxMaL` - Sarah (female, default)
- `21m00Tcm4TlvDq8ikWAM` - Rachel (female)
- `AZnzlk1XvdvUeBnXmlld` - Domi (female)
- `ErXwobaYiN019PkySvjV` - Antoni (male)
- `VR6AewLTigWG4xSOukaG` - Arnold (male)

### Free Tier Limits

- **10,000 characters/month** (resets monthly)
- Approximately **25-30 product videos** (based on typical ~350 character scripts)
  - **Note**: Monitor your actual character usage as script lengths vary significantly based on product descriptions
  - Check usage at [ElevenLabs Dashboard](https://elevenlabs.io/speech-synthesis)
- No credit card required
- No expiration

If you exceed the limit, the system automatically falls back to gTTS.

## Step 6: Add Product Images to Google Sheet (Optional)

To include product images in your videos (split-screen layout), add image URLs to your Google Sheet.

### Supported Column Names (Auto-Detected)

The system automatically checks for these column names (in order):

1. Value of `PRODUCT_IMAGE_COLUMN` env var (if set)
2. `Image_URL`
3. `Product_Image`
4. `ASIN_Image`
5. `Image`
6. `ProductImage`
7. `ImageURL`

### Image URL Format

URLs must be publicly accessible and start with `http://` or `https://`:

```
https://m.media-amazon.com/images/I/71ABC123DEF.jpg
https://yourdomain.com/images/product.png
https://storage.googleapis.com/bucket/image.jpg
```

### Video Layout with Product Images

When a product image is provided:

```
┌─────────────────────────────────┐
│  Product    │   Stock Video     │
│   Image     │   (Pexels)        │
│  (Left)     │   (Right)         │
│             │                   │
├─────────────────────────────────┤
│   Product Title (Bottom)        │
└─────────────────────────────────┘
```

Without product image:

```
┌─────────────────────────────────┐
│                                 │
│   Stock Video (Full Width)      │
│                                 │
├─────────────────────────────────┤
│   Product Title (Top)           │
└─────────────────────────────────┘
```

### Fallback Behavior

- If image URL is invalid or unreachable → Uses full-width stock video
- If image fails to load → Logs warning and continues without it
- System never fails video generation due to image issues

## How It Works

When `USE_FREE_VIDEO_GENERATOR=true`, the system follows this workflow:

1. **Script Generation** (existing): Uses OpenAI to generate marketing script
2. **Product Image Download** (new): If image URL exists in sheet, downloads product image
   - Checks columns: `Image_URL`, `Product_Image`, `ASIN_Image`, etc.
   - Falls back gracefully if image unavailable
3. **Stock Video Download**: Downloads HD video from Pexels matching product title
   - Searches Pexels API with product title as query
   - Falls back to "garden plants" if no results
   - Downloads HD quality MP4
4. **Voiceover Generation**: Uses ElevenLabs or gTTS
   - **First choice**: ElevenLabs (if `ELEVENLABS_API_KEY` set) - natural voice
   - **Fallback**: gTTS (if ElevenLabs unavailable or quota exceeded) - robotic voice
   - Converts script text to English speech MP3
5. **Video Composition**: Uses MoviePy Python library
   - **With product image**: Split-screen layout (image left, video right)
   - **Without image**: Full-width stock video
   - Adds generated voiceover as audio track
   - Adds text overlay with product title at bottom
   - Exports as MP4 (H.264 codec, AAC audio, 30 FPS)
6. **Upload to GCS**: Uploads final video to Google Cloud Storage
   - Makes file publicly accessible
   - Returns public URL: `https://storage.googleapis.com/[bucket]/[file]`
7. **Post to Platforms** (existing): Same social media posting logic

## Testing

### Test Free Video Generation

```bash
# Set environment variables
export USE_FREE_VIDEO_GENERATOR=true
export PEXELS_API_KEY=your_api_key
export GCS_BUCKET_NAME=your-bucket-name
export ELEVENLABS_API_KEY=your_elevenlabs_key  # Optional
export DRY_RUN_LOG_ONLY=true
export RUN_ONCE=true

# Run the application
npm run dev
```

### Verify Output

Check the logs for:
```
🎬 Creating video with FREE generator (MoviePy + Pexels + ElevenLabs/gTTS)...
📸 Product image found: https://... (if image URL in sheet)
✅ Free video generation complete: https://storage.googleapis.com/...
```

### Testing ElevenLabs Voice

To verify ElevenLabs is being used:

```bash
# Check logs for:
# "Generating voiceover with ElevenLabs" - ElevenLabs is working
# "ElevenLabs failed, falling back to gTTS" - Fallback triggered
# "Generating voiceover with gTTS" - Using gTTS (if no ElevenLabs key)
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

### Error: "ElevenLabs API quota exceeded"

**Solution**: You've exceeded the free 10,000 character limit.

Options:
1. **Wait until next month** (quota resets monthly)
2. **System auto-fallback**: Continues using gTTS automatically
3. **Upgrade to paid plan**: Visit [ElevenLabs Pricing](https://elevenlabs.io/pricing)

### Error: "Failed to download product image"

**Solutions**:
- Verify image URL is publicly accessible (not behind login)
- Check URL format starts with `http://` or `https://`
- Ensure image URL column name matches configuration
- System continues with full-width video if image fails

### Voice sounds robotic (not natural)

**Cause**: Using gTTS instead of ElevenLabs.

**Solutions**:
1. Add `ELEVENLABS_API_KEY` to `.env` file
2. Verify API key is valid
3. Check you haven't exceeded 10k character quota
4. Look for "Generating voiceover with ElevenLabs" in logs

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
| **ElevenLabs** | 10,000 chars/month (~25 videos) | $5/month for 30k chars |
| **Google Cloud Storage** | 5 GB storage, 1 GB egress/month | $0.020/GB storage, $0.12/GB egress |
| **gTTS** | Unlimited (Google Translate API) | Free |
| **MoviePy** | Unlimited (open source) | Free |

**Estimated monthly cost for 1000 videos:**
- Storage (1000 videos × 50MB avg): ~50GB = $1.00
- Bandwidth (1000 views × 50MB): ~50GB = $6.00
- ElevenLabs (if >25 videos): $0-5 (depends on usage)
- **Total**: ~$7-12/month vs HeyGen's $29-89/month

**Cost savings**: 58-85% cheaper than HeyGen

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
