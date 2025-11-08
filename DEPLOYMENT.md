# Video Processor Service - Environment Variables

This document lists all required environment variables for the video processor service.

## Required Environment Variables

### Core Functionality
- **`CSV_URL`** *(required)*: Google Sheets CSV export URL containing product data
  - Example: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/export?format=csv`

### API Keys

#### OpenAI (for script generation)
- **`OPENAI_API_KEY`** *(optional)*: OpenAI API key for generating marketing scripts
  - If not provided, the product description will be used as the script
  - Get your key at: https://platform.openai.com/api-keys

#### WaveSpeed (for video generation)
- **`WAVESPEED_API_KEY`** *(optional)*: WaveSpeed API key for video generation
  - If not provided, no video will be generated
  - Get your key at: https://wavespeed.ai/

### Social Media Posting

#### Instagram
- **`INSTAGRAM_ACCESS_TOKEN`** *(optional)*: Instagram Graph API access token
- **`INSTAGRAM_IG_ID`** *(optional)*: Instagram account ID
  - Both required for Instagram posting
  - Get tokens at: https://developers.facebook.com/

#### Twitter
- **`TWITTER_BEARER_TOKEN`** *(optional)*: Twitter API Bearer token
  - Required for Twitter posting
  - Get tokens at: https://developer.twitter.com/

#### Pinterest
- **`PINTEREST_ACCESS_TOKEN`** *(optional)*: Pinterest API access token
- **`PINTEREST_BOARD_ID`** *(optional)*: Pinterest board ID
  - Both required for Pinterest posting
  - Get tokens at: https://developers.pinterest.com/

## Setting Environment Variables in Cloud Run

```bash
gcloud run services update video-processor \
  --region us-central1 \
  --project natureswaysoil-video \
  --set-env-vars="CSV_URL=your_csv_url,OPENAI_API_KEY=your_key,WAVESPEED_API_KEY=your_key"
```

Or use the Cloud Console:
1. Go to Cloud Run → video-processor
2. Click "Edit & Deploy New Revision"
3. Go to "Variables & Secrets" tab
4. Add your environment variables
5. Click "Deploy"

## API Endpoints

### Health Check
- **GET** `/` or `/health`
- Returns: `OK - Video Processor Service`

### Run Job
- **POST** `/run`
- Triggers video processing pipeline
- Requires `CSV_URL` to be set
- Returns JSON with success status and results

Example:
```bash
curl -X POST https://video-processor-993533990327.us-central1.run.app/run
```

## CSV Format

Your Google Sheet should have columns like:
- `name` or `title` - Product name
- `details` or `description` - Product description
- `imageUrl` - Optional product image URL for video generation

Example:
```csv
name,details,imageUrl
"Product 1","Amazing product description","https://example.com/image1.jpg"
"Product 2","Another great product","https://example.com/image2.jpg"
```
