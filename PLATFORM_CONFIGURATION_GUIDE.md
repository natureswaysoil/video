# Platform Configuration Guide

## Overview

This guide explains how to configure specific social media platforms when your credentials are stored in Google Secret Manager. The system supports posting to Instagram, Twitter/X, Pinterest, and YouTube, and you can enable/disable platforms individually.

## How Platform Selection Works

The system uses two mechanisms to determine which platforms to post to:

1. **Credential Availability**: The system checks if credentials exist for each platform (from Google Secrets or environment variables)
2. **Platform Selection**: The `ENABLE_PLATFORMS` environment variable allows you to explicitly control which platforms to use

### Default Behavior (No ENABLE_PLATFORMS Set)

When `ENABLE_PLATFORMS` is not set or empty:
- **All platforms with valid credentials will be used**
- If Instagram credentials exist → posts to Instagram
- If Twitter credentials exist → posts to Twitter
- If Pinterest credentials exist → posts to Pinterest  
- If YouTube credentials exist → posts to YouTube

### Selective Platform Posting

Set `ENABLE_PLATFORMS` to a comma-separated list to post only to specific platforms:

```bash
# Instagram only
ENABLE_PLATFORMS=instagram

# Instagram and Twitter only
ENABLE_PLATFORMS=instagram,twitter

# All four platforms (explicit)
ENABLE_PLATFORMS=instagram,twitter,pinterest,youtube
```

## Google Secret Manager Setup

### Step 1: Create Secrets for Your Platforms

Only create secrets for the platforms you want to use. The system will automatically skip platforms without credentials.

#### Essential Secrets (Required for all deployments)

```bash
# HeyGen (video generation)
echo -n "YOUR_HEYGEN_API_KEY" | gcloud secrets create HEYGEN_API_KEY --data-file=-

# OpenAI (script generation)
echo -n "YOUR_OPENAI_API_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=-

# Google Sheets (product data and writeback)
echo -n "service-account@project.iam.gserviceaccount.com" | gcloud secrets create GS_SERVICE_ACCOUNT_EMAIL --data-file=-
cat service-account-key.json | jq -r '.private_key' | gcloud secrets create GS_SERVICE_ACCOUNT_KEY --data-file=-
```

#### Instagram Secrets (Optional)

```bash
echo -n "YOUR_INSTAGRAM_ACCESS_TOKEN" | gcloud secrets create INSTAGRAM_ACCESS_TOKEN --data-file=-
echo -n "YOUR_INSTAGRAM_USER_ID" | gcloud secrets create INSTAGRAM_IG_ID --data-file=-
```

**How to get Instagram credentials:**
1. Create a Facebook Developer account
2. Create an app with Instagram Basic Display or Instagram Graph API
3. Get access token with `instagram_basic` and `instagram_content_publish` permissions
4. Find your Instagram User ID (numeric value)

#### Twitter/X Secrets (Optional)

For native video upload (recommended):
```bash
echo -n "YOUR_TWITTER_API_KEY" | gcloud secrets create TWITTER_API_KEY --data-file=-
echo -n "YOUR_TWITTER_API_SECRET" | gcloud secrets create TWITTER_API_SECRET --data-file=-
echo -n "YOUR_TWITTER_ACCESS_TOKEN" | gcloud secrets create TWITTER_ACCESS_TOKEN --data-file=-
echo -n "YOUR_TWITTER_ACCESS_SECRET" | gcloud secrets create TWITTER_ACCESS_SECRET --data-file=-
```

For text-only posts with video link (fallback):
```bash
echo -n "YOUR_TWITTER_BEARER_TOKEN" | gcloud secrets create TWITTER_BEARER_TOKEN --data-file=-
```

**How to get Twitter credentials:**
1. Apply for Twitter Developer account at https://developer.twitter.com
2. Create an app
3. Generate API keys and access tokens
4. For video upload, you need all four credentials (API Key, API Secret, Access Token, Access Secret)

#### Pinterest Secrets (Optional)

```bash
echo -n "YOUR_PINTEREST_ACCESS_TOKEN" | gcloud secrets create PINTEREST_ACCESS_TOKEN --data-file=-
echo -n "YOUR_PINTEREST_BOARD_ID" | gcloud secrets create PINTEREST_BOARD_ID --data-file=-
```

**How to get Pinterest credentials:**
1. Apply for Pinterest Developer account at https://developers.pinterest.com
2. Create an app
3. Generate access token
4. Find your Board ID (from the board URL or API)

#### YouTube Secrets (Optional)

```bash
echo -n "YOUR_YT_CLIENT_ID" | gcloud secrets create YT_CLIENT_ID --data-file=-
echo -n "YOUR_YT_CLIENT_SECRET" | gcloud secrets create YT_CLIENT_SECRET --data-file=-
echo -n "YOUR_YT_REFRESH_TOKEN" | gcloud secrets create YT_REFRESH_TOKEN --data-file=-
```

**How to get YouTube credentials:**
1. Enable YouTube Data API v3 in Google Cloud Console
2. Create OAuth 2.0 credentials
3. Use the helper script: `npx ts-node scripts/get-youtube-refresh-token.ts`
4. Save the refresh token

### Step 2: Deploy with Platform Selection

The deployment script automatically reads secrets from Google Secret Manager and makes them available to your application.

#### Option A: Use All Platforms (Default)

Deploy without setting `ENABLE_PLATFORMS` to use all platforms with credentials:

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-east1
./scripts/deploy-gcp.sh
```

This will post to any platform that has valid credentials in Secret Manager.

#### Option B: Deploy with Specific Platforms

Set `ENABLE_PLATFORMS` before deploying to restrict which platforms to use:

```bash
# Deploy with Instagram and Twitter only
export PROJECT_ID=your-gcp-project-id
export REGION=us-east1
export ENABLE_PLATFORMS=instagram,twitter
./scripts/deploy-gcp.sh
```

#### Option C: Update Existing Deployment

To change platform selection on an already-deployed job:

```bash
# Update to use only Instagram
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=instagram

# Update to use Instagram and Pinterest
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=instagram,pinterest

# Update to use all platforms (empty value)
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=
```

## Common Scenarios

### Scenario 1: Instagram Only (Most Common)

**Setup:**
1. Create Instagram secrets only (skip Twitter, Pinterest, YouTube)
2. Deploy without setting `ENABLE_PLATFORMS`

```bash
# Create secrets
echo -n "YOUR_INSTAGRAM_TOKEN" | gcloud secrets create INSTAGRAM_ACCESS_TOKEN --data-file=-
echo -n "YOUR_INSTAGRAM_ID" | gcloud secrets create INSTAGRAM_IG_ID --data-file=-

# Deploy (automatically uses only Instagram since no other credentials exist)
./scripts/deploy-gcp.sh
```

### Scenario 2: Instagram + Twitter

**Setup:**
1. Create Instagram and Twitter secrets
2. Deploy without setting `ENABLE_PLATFORMS` (or explicitly set it)

```bash
# Create secrets for both platforms
echo -n "YOUR_INSTAGRAM_TOKEN" | gcloud secrets create INSTAGRAM_ACCESS_TOKEN --data-file=-
echo -n "YOUR_INSTAGRAM_ID" | gcloud secrets create INSTAGRAM_IG_ID --data-file=-
echo -n "YOUR_TWITTER_API_KEY" | gcloud secrets create TWITTER_API_KEY --data-file=-
echo -n "YOUR_TWITTER_API_SECRET" | gcloud secrets create TWITTER_API_SECRET --data-file=-
echo -n "YOUR_TWITTER_ACCESS_TOKEN" | gcloud secrets create TWITTER_ACCESS_TOKEN --data-file=-
echo -n "YOUR_TWITTER_ACCESS_SECRET" | gcloud secrets create TWITTER_ACCESS_SECRET --data-file=-

# Deploy (uses both platforms)
./scripts/deploy-gcp.sh

# OR explicitly set platforms
export ENABLE_PLATFORMS=instagram,twitter
./scripts/deploy-gcp.sh
```

### Scenario 3: All Platforms

**Setup:**
1. Create secrets for all four platforms
2. Deploy without setting `ENABLE_PLATFORMS`

```bash
# Create all platform secrets (commands above)
# Deploy (uses all platforms)
./scripts/deploy-gcp.sh
```

### Scenario 4: Video Generation Only (No Social Posting)

**Setup:**
1. Create only essential secrets (HeyGen, OpenAI, Google Sheets)
2. Skip all social media secrets
3. Videos will be generated and URLs written to sheet, but no posting occurs

```bash
# Only create essential secrets
echo -n "YOUR_HEYGEN_API_KEY" | gcloud secrets create HEYGEN_API_KEY --data-file=-
echo -n "YOUR_OPENAI_API_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=-
# ... Google Sheets secrets

# Deploy (no social posting since no platform credentials exist)
./scripts/deploy-gcp.sh
```

### Scenario 5: Testing with Dry Run

**Setup:**
1. Set `DRY_RUN_LOG_ONLY=true` to generate videos without posting

```bash
# Update job to use dry run mode
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=DRY_RUN_LOG_ONLY=true

# Run the job
gcloud run jobs execute natureswaysoil-video-job --region=us-east1

# Check logs to see what would have been posted
gcloud logging read "resource.type=cloud_run_job" --limit=50
```

## Verifying Your Configuration

### Check Which Secrets Exist

```bash
# List all secrets
gcloud secrets list

# Check if a specific secret exists and has enabled versions
gcloud secrets describe INSTAGRAM_ACCESS_TOKEN
gcloud secrets versions list INSTAGRAM_ACCESS_TOKEN --filter="state=ENABLED"
```

### Check Current Job Configuration

```bash
# View environment variables
gcloud run jobs describe natureswaysoil-video-job --region=us-east1 --format=json | jq '.template.template.containers[0].env'

# View attached secrets
gcloud run jobs describe natureswaysoil-video-job --region=us-east1 --format=json | jq '.template.template.containers[0].env[] | select(.valueSource)'
```

### Test Locally with Secrets

You can test locally by manually setting environment variables:

```bash
# Get secret values
export INSTAGRAM_ACCESS_TOKEN=$(gcloud secrets versions access latest --secret=INSTAGRAM_ACCESS_TOKEN)
export INSTAGRAM_IG_ID=$(gcloud secrets versions access latest --secret=INSTAGRAM_IG_ID)
export HEYGEN_API_KEY=$(gcloud secrets versions access latest --secret=HEYGEN_API_KEY)
export OPENAI_API_KEY=$(gcloud secrets versions access latest --secret=OPENAI_API_KEY)

# Test with specific platforms
ENABLE_PLATFORMS=instagram RUN_ONCE=true npm run dev
```

## Troubleshooting

### "No platforms enabled with valid credentials"

**Problem:** The system logs show no platforms are enabled.

**Solution:**
1. Verify secrets exist: `gcloud secrets list`
2. Check secrets have enabled versions: `gcloud secrets versions list SECRET_NAME`
3. Ensure job service account has `secretmanager.secretAccessor` role
4. Verify secrets are attached to the job (check job description)

### Platform credentials exist but not being used

**Problem:** You created secrets but the platform isn't posting.

**Solution:**
1. Check if `ENABLE_PLATFORMS` is set and includes your platform
2. Verify secret names match exactly (case-sensitive):
   - `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_IG_ID`
   - `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`
   - `PINTEREST_ACCESS_TOKEN` and `PINTEREST_BOARD_ID`
   - `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`
3. Check job logs for specific error messages

### Want to disable a platform temporarily

**Problem:** You want to skip one platform without deleting credentials.

**Solution:**
```bash
# Set ENABLE_PLATFORMS to exclude the platform
# Example: Use Instagram and Pinterest, but skip Twitter and YouTube
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=instagram,pinterest
```

### Secret updates not taking effect

**Problem:** You updated a secret but the job still uses old value.

**Solution:**
1. Secret Manager uses the `latest` version automatically
2. Create a new secret version: `echo -n "NEW_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-`
3. Restart the job: `gcloud run jobs execute natureswaysoil-video-job --region=us-east1`

## Best Practices

1. **Start Small**: Begin with one platform (Instagram recommended) and add more later
2. **Use Secrets for Production**: Always use Google Secret Manager for production deployments
3. **Test Locally First**: Use `.env` file and `npm run dev` to test before deploying
4. **Monitor Logs**: Check Cloud Run logs after deployment to verify platforms are working
5. **Selective Posting**: Use `ENABLE_PLATFORMS` during testing to limit platforms
6. **Dry Run Testing**: Use `DRY_RUN_LOG_ONLY=true` to test without actually posting

## Summary

The platform configuration system is flexible and secure:

- ✅ **Credential Storage**: All secrets stored in Google Secret Manager
- ✅ **Automatic Detection**: System automatically uses platforms with credentials
- ✅ **Selective Control**: Use `ENABLE_PLATFORMS` to control which platforms post
- ✅ **No Code Changes**: Configuration via environment variables only
- ✅ **Safe Testing**: Dry run mode to test without posting

### Quick Reference

| Want to... | Solution |
|------------|----------|
| Use only Instagram | Create only Instagram secrets, deploy normally |
| Add Twitter later | Create Twitter secrets, redeploy (no config change needed) |
| Disable YouTube temporarily | Set `ENABLE_PLATFORMS=instagram,twitter,pinterest` |
| Test without posting | Set `DRY_RUN_LOG_ONLY=true` |
| Use all platforms | Create all secrets, leave `ENABLE_PLATFORMS` empty |
| Post to specific platform today | Update `ENABLE_PLATFORMS` before scheduler runs |

## Related Documentation

- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** - Complete deployment guide
- **[QUICKSTART.md](./QUICKSTART.md)** - Quick start guide
- **[COMPLETE_AUTOMATION_GUIDE.md](./COMPLETE_AUTOMATION_GUIDE.md)** - Full automation setup
- **[OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)** - Day-to-day operations
