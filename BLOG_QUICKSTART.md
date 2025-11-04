# Blog Automation - Quick Start Guide

## 🚀 Deploy in 5 Minutes

### Step 1: Setup Database (2 minutes)
```bash
# Go to Supabase Dashboard → SQL Editor
# Paste and run: scripts/create-blog-table.sql
```

### Step 2: Configure Secrets (1 minute)
Make sure these secrets exist in Google Cloud Secret Manager:
- `OPENAI_API_KEY`
- `HEYGEN_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Step 3: Deploy (2 minutes)
```bash
cd /workspaces/video
./scripts/deploy-blog-automation.sh
```

Done! Your blog system will now generate articles daily at 9 AM EST.

## 📊 What You Get

### Daily
- ✅ New 800-1200 word blog article
- ✅ Professional video with AI avatar (15-30 seconds)
- ✅ SEO-optimized content
- ✅ Auto-published to database

### Content Topics
Rotating through:
- Soil health tips
- Organic gardening guides
- Composting techniques
- Plant nutrition advice
- Sustainable farming practices
- And 10+ more topics!

## 🧪 Test It Now

### Run Manually
```bash
gcloud scheduler jobs run blog-generation-daily --location=us-east1
```

### View Results
```bash
# Check logs
gcloud run services logs read blog-generator --region=us-east1 --limit=50

# View generated blogs in Supabase
# Or check: generated-blogs/ folder
```

## 📈 Monitor

```bash
# Service status
gcloud run services describe blog-generator --region=us-east1

# Next scheduled run
gcloud scheduler jobs describe blog-generation-daily --location=us-east1

# Recent activity
gcloud run services logs read blog-generator --region=us-east1 --limit=20
```

## 🎯 Customization

### Change Frequency
Edit `scripts/deploy-blog-automation.sh`:
- Every day: `--schedule="0 9 * * *"`
- Weekly: `--schedule="0 9 * * 1"`
- Twice weekly: `--schedule="0 9 * * 1,4"`

### Add Topics
Edit `src/blog-generator.ts`:
```typescript
const BLOG_TOPICS = [
  'your custom topic',
  // ... add more
]
```

## 💰 Costs

~$61-136/month for:
- Cloud Run hosting
- OpenAI content generation  
- Cloud Scheduler
- HeyGen video generation

## 📞 Support

Full docs: `BLOG_AUTOMATION.md`

Questions? Check logs or file an issue!

---

**Status**: Production Ready ✅  
**Last Updated**: October 26, 2025
