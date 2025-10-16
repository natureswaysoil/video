# Pinterest Setup for Blog Video Automation

## Current Status
- ✅ Pinterest posting code integrated into blog automation
- ⚠️ Access token needs to be refreshed
- ⚠️ Board ID for "save my lawn" needs to be configured

## Step 1: Get a Fresh Pinterest Access Token

1. Go to https://developers.pinterest.com/apps/
2. Select your app (or create a new one)
3. Go to "Generate access token"
4. Copy the new access token

## Step 2: Find the "save my lawn" Board ID

Once you have a fresh access token, run:

```bash
cd /workspaces/video

# Set your access token
export PINTEREST_ACCESS_TOKEN="your_new_token_here"

# List all boards
./scripts/list-pinterest-boards.sh
```

This will output something like:
```
1234567890123 - save my lawn
9876543210987 - Other Board
...
```

Copy the ID for "save my lawn" (the numbers before the dash).

## Step 3: Update Configuration

### Local Development
Update `/workspaces/video/.env`:
```bash
PINTEREST_ACCESS_TOKEN=your_new_token
PINTEREST_BOARD_ID=your_board_id
```

### Google Cloud (Production)
Update the secrets:

```bash
# Update access token
echo -n "your_new_token" | gcloud secrets versions add PINTEREST_ACCESS_TOKEN --data-file=-

# Add board ID (if it doesn't exist yet)
gcloud secrets create PINTEREST_BOARD_ID --data-file=- <<< "your_board_id"

# Or update existing board ID
echo -n "your_board_id" | gcloud secrets versions add PINTEREST_BOARD_ID --data-file=-
```

### Update Cloud Run Deployment

Edit `scripts/deploy-blog-automation.sh` and add the board ID secret:

```bash
--set-secrets="PINTEREST_BOARD_ID=PINTEREST_BOARD_ID:latest" \
```

Then redeploy:
```bash
./scripts/deploy-blog-automation.sh
```

## Step 4: Test Pinterest Posting

```bash
cd /workspaces/video
npm run build
node dist/blog-generator.js
```

Watch for:
```
�� Posting to Pinterest...
✅ Posted to Pinterest
```

## Troubleshooting

### "Authentication failed"
- Your access token expired
- Get a new token from Pinterest Developer Portal

### "Board not found"
- Wrong board ID
- Run `list-pinterest-boards.sh` to get correct ID

### "Invalid video URL"
- WaveSpeed video URL not accessible
- Check that video generation completed successfully

## Pinterest API Documentation
- Boards API: https://developers.pinterest.com/docs/api/v5/#tag/boards
- Pins API: https://developers.pinterest.com/docs/api/v5/#tag/pins

---

**Note**: Pinterest access tokens typically last 30 days. You may need to refresh them periodically.
