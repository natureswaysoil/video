# Automated Blog & Video Generation System

## Overview

This system automatically generates high-quality blog articles with matching videos every 2 days using:
- **OpenAI GPT-4** for content generation
- **WaveSpeed AI** for video creation  
- **Cloud Run** for serverless execution
- **Cloud Scheduler** for automated scheduling
- **Supabase** for content storage

## Architecture

```
Cloud Scheduler (Every 2 days)
    ↓
Cloud Run Service (blog-generator)
    ↓
┌─────────────────────────────────┐
│ 1. Generate Blog Article (GPT-4)│
│ 2. Create Video (WaveSpeed)     │
│ 3. Save to Database (Supabase)  │
└─────────────────────────────────┘
    ↓
Nature's Way Soil Website
```

## Features

### 🎯 Automatic Content Generation
- **Blog Articles**: 800-1200 word SEO-optimized articles
- **Topics**: Rotating through 15+ gardening and soil science topics
- **Format**: Professional Markdown with headings and structure
- **SEO**: Includes keywords, meta descriptions, and tags

### 🎬 Video Creation
- **AI-Generated**: Creates matching videos for each article
- **WaveSpeed Integration**: Uses your existing video generation system
- **Professional Quality**: Cinematic garden and soil visuals
- **Auto-Storage**: Videos saved with article metadata

### ⏰ Scheduled Automation
- **Frequency**: Every 2 days at 9:00 AM EST
- **Unattended**: Fully automatic, no manual intervention
- **Reliable**: Cloud-based with automatic retries
- **Scalable**: Can adjust frequency as needed

## Setup Instructions

### 1. Prerequisites

Required API keys (add to Google Cloud Secret Manager):
- `OPENAI_API_KEY` - OpenAI API key for content generation
- `WAVE_SPEED_API_KEY` or `WAVESPEED_API_KEY` - WaveSpeed video generation
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

### 2. Database Setup

Run the SQL migration to create the blog_posts table:

```bash
# Connect to your Supabase database
psql $DATABASE_URL

# Run the migration
\i scripts/create-blog-table.sql
```

Or use Supabase dashboard:
1. Go to SQL Editor
2. Paste contents of `scripts/create-blog-table.sql`
3. Click "Run"

### 3. Deploy to Google Cloud

```bash
cd /workspaces/video

# Make sure you're authenticated
gcloud auth login

# Deploy the service and scheduler
./scripts/deploy-blog-automation.sh
```

This will:
- Deploy Cloud Run service to us-east1
- Create Cloud Scheduler job
- Configure IAM permissions
- Set up automatic triggers

### 4. Verify Deployment

```bash
# Check service status
gcloud run services describe blog-generator --region=us-east1

# Check scheduler status
gcloud scheduler jobs describe blog-generation-every-2-days --location=us-east1

# View logs
gcloud run services logs read blog-generator --region=us-east1 --limit=50
```

## Manual Testing

### Test Blog Generation Locally

```bash
cd /workspaces/video

# Set environment variables
export OPENAI_API_KEY="your-key"
export WAVE_SPEED_API_KEY="your-key"
export NEXT_PUBLIC_SUPABASE_URL="your-url"
export SUPABASE_SERVICE_ROLE_KEY="your-key"

# Run the generator
npx ts-node src/blog-generator.ts
```

### Test Cloud Run Service

```bash
# Trigger manually (requires authentication)
gcloud scheduler jobs run blog-generation-every-2-days --location=us-east1

# Or trigger via HTTP
SERVICE_URL=$(gcloud run services describe blog-generator --region=us-east1 --format="value(status.url)")
curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
     -X POST \
     "${SERVICE_URL}/generateBlog"
```

## File Structure

```
/workspaces/video/
├── src/
│   ├── blog-generator.ts          # Core blog generation logic
│   ├── blog-cloud-function.ts     # Cloud Function entry point
│   ├── openai.ts                  # OpenAI integration (existing)
│   └── wavespeed.ts               # WaveSpeed integration (existing)
├── scripts/
│   ├── deploy-blog-automation.sh  # Deployment script
│   └── create-blog-table.sql      # Database migration
└── generated-blogs/               # Fallback file storage
```

## Blog Topics

The system rotates through these topics:
1. Soil health
2. Organic gardening
3. Composting tips
4. Plant nutrition
5. Sustainable farming
6. Garden fertilizers
7. Soil amendments
8. Worm castings benefits
9. Biochar uses
10. Hydroponic gardening
11. Lawn care
12. Vegetable gardening
13. Indoor plants
14. Orchid care
15. Tomato growing tips

## Generated Content Format

### Blog Article Structure
```markdown
## Introduction
Brief overview of the topic

## Main Content
2-4 major sections with actionable advice

## Practical Tips
Numbered or bulleted list of tips

## Product Integration
Natural mention of Nature's Way Soil products

## Conclusion
Summary and call-to-action
```

### Video Content
- Duration: 15-30 seconds
- Style: Cinematic, professional
- Visuals: Gardens, soil close-ups, healthy plants
- Quality: HD (1280x720 or higher)

## Database Schema

```sql
blog_posts {
  id: UUID (primary key)
  title: TEXT
  slug: TEXT (unique)
  excerpt: TEXT
  content: TEXT (Markdown)
  category: TEXT
  tags: TEXT[]
  seo_keywords: TEXT[]
  video_url: TEXT
  featured_image: TEXT
  author: TEXT
  status: TEXT (draft|published|archived)
  published_at: TIMESTAMPTZ
  created_at: TIMESTAMPTZ
  updated_at: TIMESTAMPTZ
  view_count: INTEGER
}
```

## Monitoring & Maintenance

### Check Logs

```bash
# View recent logs
gcloud run services logs read blog-generator --region=us-east1 --limit=50

# Follow logs in real-time
gcloud run services logs tail blog-generator --region=us-east1

# Filter for errors
gcloud run services logs read blog-generator --region=us-east1 --limit=100 \
  | grep -i error
```

### View Generated Blogs

```bash
# Query Supabase
psql $DATABASE_URL -c "SELECT title, slug, published_at FROM blog_posts ORDER BY published_at DESC LIMIT 10;"

# Or check file fallback
ls -la generated-blogs/
```

### Scheduler Status

```bash
# List all scheduler jobs
gcloud scheduler jobs list --location=us-east1

# Describe specific job
gcloud scheduler jobs describe blog-generation-every-2-days --location=us-east1

# Pause scheduler
gcloud scheduler jobs pause blog-generation-every-2-days --location=us-east1

# Resume scheduler
gcloud scheduler jobs resume blog-generation-every-2-days --location=us-east1
```

## Customization

### Change Schedule

Edit the cron expression in `scripts/deploy-blog-automation.sh`:

```bash
# Every 2 days at 9 AM
--schedule="0 9 */2 * *"

# Daily at 8 AM
--schedule="0 8 * * *"

# Weekly on Monday at 10 AM
--schedule="0 10 * * 1"

# Twice per week (Monday and Thursday at 9 AM)
--schedule="0 9 * * 1,4"
```

### Modify Topics

Edit `BLOG_TOPICS` array in `src/blog-generator.ts`:

```typescript
const BLOG_TOPICS = [
  'your custom topic 1',
  'your custom topic 2',
  // ... add more topics
]
```

### Adjust Content Length

Modify the prompt in `generateBlogArticle()`:

```typescript
// Change from 800-1200 to 1500-2000 words
"Content: 1500-2000 words, well-structured with headings"
```

## Troubleshooting

### Blog Not Generating

1. **Check OpenAI API Key**
   ```bash
   gcloud secrets versions access latest --secret="OPENAI_API_KEY"
   ```

2. **Check Service Logs**
   ```bash
   gcloud run services logs read blog-generator --region=us-east1 --limit=100
   ```

3. **Verify Permissions**
   ```bash
   # Service account should have invoker role
   gcloud run services get-iam-policy blog-generator --region=us-east1
   ```

### Video Not Creating

1. **Check WaveSpeed API Key**
   ```bash
   gcloud secrets versions access latest --secret="WAVE_SPEED_API_KEY"
   ```

2. **Test Video Generation Manually**
   ```bash
   npx ts-node src/blog-generator.ts
   ```

3. **Check WaveSpeed Service Status**
   ```bash
   curl https://n1212-993533990327.us-east1.run.app/health
   ```

### Database Errors

1. **Verify Supabase Connection**
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM blog_posts;"
   ```

2. **Check Table Exists**
   ```bash
   psql $DATABASE_URL -c "\dt blog_posts"
   ```

3. **Verify RLS Policies**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'blog_posts';
   ```

## Cost Estimates

### Monthly Costs (Every 2 days = ~15 generations/month)

- **Cloud Run**: ~$0.50/month (minimal usage)
- **Cloud Scheduler**: $0.10/month
- **OpenAI GPT-4**: ~$15-20/month (15 articles × $1-1.50)
- **WaveSpeed Videos**: Varies by plan
- **Supabase**: Free tier (< 500MB storage)

**Total**: ~$16-21/month + WaveSpeed costs

## Scaling

### Increase Frequency

To generate more content:

1. **Multiple schedules**: Create additional scheduler jobs
2. **Multiple topics**: Run parallel Cloud Run instances
3. **Batch generation**: Generate 2-3 articles per run

### Reduce Costs

1. **Use GPT-3.5**: Change model to `gpt-3.5-turbo`
2. **Disable videos**: Skip video generation temporarily
3. **File storage**: Use file system instead of database

## Support

### Resources
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [Cloud Scheduler Docs](https://cloud.google.com/scheduler/docs)
- [Supabase Docs](https://supabase.com/docs)

### Contact
- GitHub Issues: [natureswaysoil/video](https://github.com/natureswaysoil/video/issues)
- Email: natureswaysoil@gmail.com

## Changelog

### Version 1.0.0 (2025-10-16)
- Initial release
- Automated blog generation with GPT-4
- Video creation with WaveSpeed
- Cloud Run deployment
- Every 2 days scheduling
- Supabase integration

---

**Last Updated**: October 16, 2025  
**Status**: Production Ready ✅  
**Next Scheduled Run**: Check with `gcloud scheduler jobs describe blog-generation-every-2-days --location=us-east1`
