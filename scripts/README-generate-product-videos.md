# Generate Product Videos Script

This script (`generate-product-videos.mjs`) generates videos for products using HeyGen AI.

## Key Features

✅ **Processes ONE product per run** - Not all products at once
✅ **Loads HeyGen API key from Google Secret Manager** - Secure credential management
✅ **Uses HeyGen only** - No FFmpeg fallback
✅ **Proper error handling** - Clear error messages and status updates

## Requirements

### Required Environment Variables

```bash
# CSV data source (Google Sheets export URL)
CSV_URL="https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=..."

# HeyGen API key (one of these required)
HEYGEN_API_KEY="your-key"  # Direct env var
# OR
GCP_SECRET_HEYGEN_API_KEY="projects/PROJECT/secrets/heygen-api-key/versions/latest"  # From Secret Manager (recommended)

# HeyGen API configuration (optional)
HEYGEN_API_ENDPOINT="https://api.heygen.com"  # Default
HEYGEN_VIDEO_DURATION_SECONDS=30  # Default
HEYGEN_DEFAULT_AVATAR="garden_expert_01"  # Default
HEYGEN_DEFAULT_VOICE="en_us_warm_female_01"  # Default
```

### Optional Environment Variables

```bash
# OpenAI for script generation (recommended)
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"  # Default

# Google Sheets writeback (recommended)
GS_SERVICE_ACCOUNT_EMAIL="service-account@project.iam.gserviceaccount.com"
GS_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SHEET_VIDEO_TARGET_COLUMN_LETTER="AB"  # Default

# CSV column overrides (optional)
CSV_COL_JOB_ID="ASIN,SKU"
CSV_COL_TITLE="Title,Short_Name"
CSV_COL_DETAILS="Short_Name,Title"
CSV_COL_POSTED="Posted"
CSV_STATUS_TRUE_VALUES="1,true,yes,y,on,post,enabled"

# Control flags
ALWAYS_GENERATE_NEW_VIDEO=false  # Set to true to ignore Posted column
```

## Usage

### Basic Usage

```bash
# Set required environment variables
export CSV_URL="https://docs.google.com/spreadsheets/d/.../export?format=csv"
export GCP_SECRET_HEYGEN_API_KEY="projects/PROJECT/secrets/heygen-api-key/versions/latest"

# Run the script
node scripts/generate-product-videos.mjs
```

### With Docker/Cloud Run

```bash
docker build -t video-generator .
docker run \
  -e CSV_URL="..." \
  -e GCP_SECRET_HEYGEN_API_KEY="..." \
  video-generator \
  node scripts/generate-product-videos.mjs
```

### With Cloud Run Jobs

```bash
gcloud run jobs create video-generator \
  --image=gcr.io/PROJECT/video \
  --set-env-vars CSV_URL="..." \
  --set-secrets GCP_SECRET_HEYGEN_API_KEY=heygen-api-key:latest \
  --max-retries 0
```

## How It Works

1. **Load HeyGen API Key**
   - Checks `HEYGEN_API_KEY` environment variable
   - Falls back to Google Secret Manager if `GCP_SECRET_HEYGEN_API_KEY` is set
   - Fails if neither is available

2. **Find First Eligible Product**
   - Loads CSV from `CSV_URL`
   - Filters rows:
     - Skips if `Posted` column is truthy (unless `ALWAYS_GENERATE_NEW_VIDEO=true`)
     - Skips if `Ready`/`Status` column is falsy
   - Returns FIRST eligible product (not all products)

3. **Generate Video Script**
   - Uses OpenAI to generate a 20-25 second marketing script
   - Falls back to product description if OpenAI key not available

4. **Create HeyGen Video**
   - Maps product to appropriate avatar/voice based on keywords
   - Creates video generation job via HeyGen API
   - Returns job ID

5. **Poll for Completion**
   - Checks job status every 15 seconds
   - Waits up to 25 minutes for completion
   - Returns video URL when ready

6. **Write Back to Sheet**
   - Updates the configured column (default: `AB`) with video URL
   - Uses service account credentials for access

## Expected Output

### Success

```
🎬 Starting HeyGen AI Video Generation for Products
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Loading products from CSV...
📝 Found 1 product to process
   Product: Nature's Way Kelp Meal
   Job ID: B08XYZABC
   Row: 3

🔐 Loading HeyGen API key from Google Secret Manager...
✓ Loaded HeyGen API key from Secret Manager
✍️  Generating video script...
✓ Script: Transform your garden naturally with premium organic kelp meal...

🎬 Creating HeyGen video (30s, avatar: garden_expert_01, voice: en_us_warm_female_01)...
✅ Created HeyGen video job: heygen-abc123

⏳ Waiting for HeyGen video completion...
...........
✅ Video ready: https://heygen.ai/videos/heygen-abc123.mp4

✅ Wrote video URL to Sheet1!AB3

✅ Video generation complete!
```

### Error - No HeyGen Key

```
🎬 Starting HeyGen AI Video Generation for Products
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Loading products from CSV...
📝 Found 1 product to process
   Product: Nature's Way Kelp Meal
   Job ID: B08XYZABC
   Row: 3

❌ Error: HeyGen API key not found. Set HEYGEN_API_KEY or GCP_SECRET_HEYGEN_API_KEY
```

### Error - No Eligible Products

```
🎬 Starting HeyGen AI Video Generation for Products
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Loading products from CSV...

❌ Error: No eligible products found in CSV
```

## Testing

Run the test script to validate the implementation:

```bash
node scripts/test-generate-product-videos.mjs
```

Expected output:
```
🧪 Testing generate-product-videos.mjs...

Test 1: Script file existence
✓ Script file exists and is readable

Test 2: Required features
✓ Google Secret Manager support
✓ Single product processing
✓ HeyGen video creation
✓ No FFmpeg installation/fallback code
...

==================================================
✅ All tests passed!
```

## Troubleshooting

### "CSV_URL environment variable not set"
- Set the `CSV_URL` to your Google Sheets CSV export URL
- Format: `https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=GID`

### "HeyGen API key not found"
- Check that `HEYGEN_API_KEY` is set, OR
- Check that `GCP_SECRET_HEYGEN_API_KEY` is set and accessible
- Verify Secret Manager permissions if using GCP secrets

### "No eligible products found"
- Check that your CSV has at least one row where:
  - `Posted` column is not truthy (or `ALWAYS_GENERATE_NEW_VIDEO=true`)
  - `Ready`/`Status` column is truthy (if present)
  - Has a valid job ID in supported columns

### "HeyGen job timed out"
- HeyGen can take up to 25 minutes to generate a video
- Check HeyGen dashboard for job status
- Verify the job ID is correct

## Differences from Previous Implementation

This script differs from the main `src/cli.ts` in that it:

1. **Processes only 1 product** instead of all products
2. **Exits after completion** instead of running continuously
3. **Focuses only on video generation** without social media posting
4. **Uses direct HeyGen integration** without FFmpeg fallback

This makes it ideal for:
- GitHub Actions workflows
- Cloud Run Jobs
- Scheduled batch processing
- Manual video generation
