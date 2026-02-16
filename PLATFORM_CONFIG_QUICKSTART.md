# Platform Configuration with Google Secrets - Quick Start

## Your Question Answered

**Q: How do I configure specific social media platforms when credentials are in Google Secrets?**

**A: The system now has full support for selective platform configuration!** You can:

1. **Store only the credentials you need** in Google Secret Manager
2. **Use ENABLE_PLATFORMS** to control which platforms post
3. **Update platform selection** without redeploying

## Quick Examples

### Example 1: Instagram Only

**What you want:** Post to Instagram only, credentials stored in Google Secrets.

**Steps:**
```bash
# 1. Create Instagram secrets
echo -n "YOUR_INSTAGRAM_TOKEN" | gcloud secrets create INSTAGRAM_ACCESS_TOKEN --data-file=-
echo -n "YOUR_INSTAGRAM_ID" | gcloud secrets create INSTAGRAM_IG_ID --data-file=-

# 2. Deploy (automatically uses only Instagram)
export PROJECT_ID=your-project-id
./scripts/deploy-gcp.sh
```

That's it! The system automatically detects you only have Instagram credentials.

### Example 2: Instagram + Twitter

**What you want:** Post to both Instagram and Twitter.

**Steps:**
```bash
# 1. Create secrets for both platforms
echo -n "YOUR_INSTAGRAM_TOKEN" | gcloud secrets create INSTAGRAM_ACCESS_TOKEN --data-file=-
echo -n "YOUR_INSTAGRAM_ID" | gcloud secrets create INSTAGRAM_IG_ID --data-file=-
echo -n "YOUR_TWITTER_API_KEY" | gcloud secrets create TWITTER_API_KEY --data-file=-
echo -n "YOUR_TWITTER_API_SECRET" | gcloud secrets create TWITTER_API_SECRET --data-file=-
echo -n "YOUR_TWITTER_ACCESS_TOKEN" | gcloud secrets create TWITTER_ACCESS_TOKEN --data-file=-
echo -n "YOUR_TWITTER_ACCESS_SECRET" | gcloud secrets create TWITTER_ACCESS_SECRET --data-file=-

# 2. Deploy (uses both platforms automatically)
./scripts/deploy-gcp.sh
```

### Example 3: Explicit Platform Control

**What you want:** You have credentials for multiple platforms but only want to use Instagram today.

**Steps:**
```bash
# Option A: Set during deployment
export ENABLE_PLATFORMS=instagram
./scripts/deploy-gcp.sh

# Option B: Update existing deployment
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=instagram
```

### Example 4: Switch Platforms Without Redeploying

**What you want:** Test different platform combinations.

**Steps:**
```bash
# Try Instagram only
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=instagram

# Try Instagram + Twitter
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=instagram,twitter

# Use all platforms with credentials
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=
```

## How It Works

### Automatic Platform Detection

The system checks for credentials and automatically enables platforms:

```
Has Instagram secrets? → Posts to Instagram ✓
Has Twitter secrets? → Posts to Twitter ✓
Has Pinterest secrets? → Posts to Pinterest ✓
Has YouTube secrets? → Posts to YouTube ✓
```

### Manual Override with ENABLE_PLATFORMS

Override automatic detection to be explicit:

```bash
ENABLE_PLATFORMS=instagram        # Instagram only
ENABLE_PLATFORMS=instagram,twitter # Instagram and Twitter only
ENABLE_PLATFORMS=                  # All platforms with credentials (default)
```

## Required Secrets by Platform

### Instagram
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_IG_ID`

### Twitter/X
- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_SECRET`

Or for simple text posts:
- `TWITTER_BEARER_TOKEN`

### Pinterest
- `PINTEREST_ACCESS_TOKEN`
- `PINTEREST_BOARD_ID`

### YouTube
- `YT_CLIENT_ID`
- `YT_CLIENT_SECRET`
- `YT_REFRESH_TOKEN`

### Always Required (For Video Generation)
- `HEYGEN_API_KEY`
- `OPENAI_API_KEY`
- `GS_SERVICE_ACCOUNT_EMAIL`
- `GS_SERVICE_ACCOUNT_KEY`

## Common Workflows

### Workflow 1: Start with One Platform, Add More Later

```bash
# Week 1: Instagram only
echo -n "TOKEN" | gcloud secrets create INSTAGRAM_ACCESS_TOKEN --data-file=-
echo -n "ID" | gcloud secrets create INSTAGRAM_IG_ID --data-file=-
./scripts/deploy-gcp.sh

# Week 2: Add Twitter (no need to redeploy, just add secrets)
echo -n "KEY" | gcloud secrets create TWITTER_API_KEY --data-file=-
echo -n "SECRET" | gcloud secrets create TWITTER_API_SECRET --data-file=-
echo -n "TOKEN" | gcloud secrets create TWITTER_ACCESS_TOKEN --data-file=-
echo -n "SECRET" | gcloud secrets create TWITTER_ACCESS_SECRET --data-file=-

# Twitter will be automatically used on next scheduled run!
```

### Workflow 2: Test Before Full Rollout

```bash
# Deploy with all platform credentials but restrict to Instagram
export ENABLE_PLATFORMS=instagram
./scripts/deploy-gcp.sh

# After testing Instagram, enable Twitter too
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=instagram,twitter

# After more testing, enable all platforms
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=
```

### Workflow 3: Emergency Platform Disable

```bash
# Something wrong with Twitter? Disable it immediately
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=instagram,pinterest,youtube

# Fixed? Re-enable Twitter
gcloud run jobs update natureswaysoil-video-job \
  --region=us-east1 \
  --update-env-vars=ENABLE_PLATFORMS=
```

## Verification Commands

### Check What Secrets Exist
```bash
gcloud secrets list | grep -E "INSTAGRAM|TWITTER|PINTEREST|YT_"
```

### Check Current Platform Configuration
```bash
gcloud run jobs describe natureswaysoil-video-job --region=us-east1 \
  --format=json | jq '.template.template.containers[0].env[] | select(.name=="ENABLE_PLATFORMS")'
```

### View Logs to See Which Platforms Posted
```bash
gcloud logging read "resource.type=cloud_run_job" --limit=50 | grep -E "Posted to|Instagram|Twitter|Pinterest|YouTube"
```

## Documentation

For complete details, see:
- **[PLATFORM_CONFIGURATION_GUIDE.md](./PLATFORM_CONFIGURATION_GUIDE.md)** - Comprehensive guide (full details)
- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** - Deployment instructions
- **[QUICKSTART.md](./QUICKSTART.md)** - Getting started guide

## Summary

✅ **You can now:**
- Configure specific platforms using Google Secret Manager
- Control platforms with `ENABLE_PLATFORMS` environment variable
- Add/remove platforms without code changes
- Test platforms individually before full rollout
- Change platform selection without redeploying

✅ **The deployment script (`scripts/deploy-gcp.sh`) now:**
- Automatically includes `ENABLE_PLATFORMS` in job configuration
- Reads from environment variable or defaults to empty (all platforms)
- Properly configures Cloud Run Job with platform selection

✅ **No code changes required** - everything is configuration-based!
