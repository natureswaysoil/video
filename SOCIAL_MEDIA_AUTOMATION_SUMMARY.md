# Social Media Automation for Blog Videos - Implementation Summary

## ✅ What Was Done

### 1. Added YouTube, Instagram, Twitter, and Pinterest Posting to Blog Automation

**File Modified**: `src/blog-generator.ts`

**New Function**: `postBlogVideoToSocial(blogPost, videoUrl)`

This function automatically posts the generated blog video to all configured social media platforms:

- **YouTube**: Posts video with article title
- **Instagram**: Posts video reel with caption + blog link
- **Twitter**: Posts video with caption
- **Pinterest**: Posts video pin to "save my lawn" board

**Features**:
- ✅ Graceful handling when credentials missing (skips platform)
- ✅ Detailed logging for each platform
- ✅ Error handling with specific error messages
- ✅ Returns summary of posting results

### 2. Workflow

When the blog automation runs (every 2 days at 9 AM EST):

```
1. Generate blog article (GPT-4) ✅
2. Generate video (WaveSpeed) ✅
3. Save to Supabase database ✅
4. Post video to social media 🆕
   ├─ YouTube 🆕
   ├─ Instagram 🆕
   ├─ Twitter 🆕
   └─ Pinterest 🆕
```

---

## 📊 Current Configuration Status

### YouTube ✅ READY
- `YT_CLIENT_ID`: ✅ Configured
- `YT_CLIENT_SECRET`: ✅ Configured
- `YT_REFRESH_TOKEN`: ✅ Configured
- `YT_PRIVACY_STATUS`: ✅ Set to "public"

### Instagram ✅ READY
- `INSTAGRAM_ACCESS_TOKEN`: ✅ Configured
- `INSTAGRAM_IG_ID`: ✅ Configured

### Twitter ✅ READY
- `TWITTER_BEARER_TOKEN`: ✅ Configured
- `TWITTER_API_KEY`: ✅ Configured
- `TWITTER_API_SECRET`: ✅ Configured
- `TWITTER_ACCESS_TOKEN`: ✅ Configured
- `TWITTER_ACCESS_SECRET`: ✅ Configured

### Pinterest ⚠️ NEEDS SETUP
- `PINTEREST_ACCESS_TOKEN`: ⚠️ May be expired
- `PINTEREST_BOARD_ID`: ❌ Not configured
- **Target Board**: "save my lawn"

**Action Required**: See `PINTEREST_SETUP.md` for complete setup instructions

---

## 🚀 Deployment Steps

### Step 1: Update Google Cloud Secrets (Optional for Pinterest)

If you want Pinterest posting, first get a fresh token and board ID:

```bash
# See PINTEREST_SETUP.md for detailed instructions

# Once you have the values:
echo -n "your_pinterest_token" | gcloud secrets versions add PINTEREST_ACCESS_TOKEN --data-file=-
echo -n "your_board_id" | gcloud secrets versions add PINTEREST_BOARD_ID --data-file=-
```

### Step 2: Update Deployment Script

Edit `scripts/deploy-blog-automation.sh` and add Pinterest board ID secret:

```bash
--set-secrets="PINTEREST_BOARD_ID=PINTEREST_BOARD_ID:latest" \
```

### Step 3: Deploy to Cloud Run

```bash
cd /workspaces/video
./scripts/deploy-blog-automation.sh
```

This will:
- Build the Docker container with updated code
- Deploy to Cloud Run
- Configure all secrets (including new Pinterest board ID if added)
- Set up Cloud Scheduler to run every 2 days at 9 AM EST

---

## 🧪 Testing Locally

### Test Full Blog Generation with Social Posting

```bash
cd /workspaces/video
npm run build
node dist/blog-generator.js
```

**Expected Output**:
```
🚀 AUTOMATED BLOG & VIDEO GENERATION
====================================
🎯 Generating blog article about: [topic]
✅ Blog article generated successfully!
🎬 Generating video for: [title]
✅ Prediction created: [id]
✅ Video ready: [url]
💾 Saving blog post: [slug]
✅ Blog post saved to database

📱 Posting video to social media...
📺 Uploading to YouTube...
✅ Posted to YouTube: [video_id]
📸 Posting to Instagram...
✅ Posted to Instagram: [media_id]
🐦 Posting to Twitter...
✅ Posted to Twitter
📌 Posting to Pinterest...
✅ Posted to Pinterest

✅ Blog generation completed successfully!
====================================
Social Media:
  YouTube: ✅
  Instagram: ✅
  Twitter: ✅
  Pinterest: ✅ (or ❌ if not configured)
```

### Test Individual Platform

You can also test individual platforms using the CLI:

```bash
# Test with a specific product/video
npm run dev
```

---

## 📝 What Happens on Each Post

### YouTube
- **Video Title**: Blog article title
- **Description**: First 5000 characters of article content
- **Privacy**: Public (configurable via YT_PRIVACY_STATUS)
- **Returns**: Video ID

### Instagram
- **Format**: Video reel
- **Caption**: 
  ```
  [Title]
  
  [Excerpt]
  
  Read more: https://natureswaysoil.com/blog/[slug]
  
  #organicgardening #soilhealth #naturalgardening
  ```
- **Returns**: Media ID

### Twitter
- **Format**: Video tweet
- **Text**: Same caption as Instagram
- **Returns**: Tweet ID

### Pinterest
- **Format**: Video pin
- **Board**: "save my lawn" (or configured board)
- **Title & Description**: Same caption as Instagram
- **Returns**: Pin ID

---

## 🔍 Monitoring

### Check Logs in Cloud Run

```bash
gcloud run services logs read blog-generator --region=us-east1 --limit=50
```

Look for:
- ✅ Success indicators for each platform
- ❌ Error messages if posting fails
- ⏭️ Skip messages if credentials not configured

### Manual Trigger

Force a blog generation right now:

```bash
gcloud scheduler jobs run blog-generation-every-2-days --location=us-east1
```

---

## 📋 Files Created/Modified

### Modified
- ✅ `src/blog-generator.ts` - Added social media posting function

### Created
- ✅ `PINTEREST_SETUP.md` - Complete Pinterest setup guide
- ✅ `scripts/list-pinterest-boards.sh` - Script to find board IDs
- ✅ `SOCIAL_MEDIA_AUTOMATION_SUMMARY.md` - This file

---

## ⚠️ Important Notes

1. **Video Requirement**: Social posting only happens if video generation succeeds
2. **Token Expiry**: Pinterest tokens expire after ~30 days, may need refresh
3. **Rate Limits**: Each platform has rate limits, posting is throttled naturally by 2-day schedule
4. **Error Handling**: If one platform fails, others still post
5. **Supabase Update**: Remember to update Supabase secrets (see BLOG_FIXES_SUMMARY.md)

---

## 🎯 Next Steps

1. ✅ Code changes complete
2. ⚠️ Get fresh Pinterest token and board ID (see PINTEREST_SETUP.md)
3. ⚠️ Update Google Cloud secrets with Pinterest board ID
4. ⚠️ Update deploy script to include Pinterest board ID secret
5. ⚠️ Deploy to Cloud Run: `./scripts/deploy-blog-automation.sh`
6. ⚠️ Update Supabase secrets: `./scripts/update-supabase-secrets.sh`
7. ✅ Test next automated run (or trigger manually)

---

**Last Updated**: October 16, 2025  
**Status**: Ready to deploy (Pinterest setup optional)
