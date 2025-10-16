# Using Product Images in Videos

## Quick Setup

### 1. Add Image URLs to Your Google Sheet

Add a new column called `Image_URL` to your Google Sheet and fill it with product image URLs:

| Product_ID | ASIN | Title | Image_URL |
|---|---|---|---|
| NWS_001 | B0822RH5L3 | Organic Liquid Fertilizer | https://example.com/product1.jpg |

### 2. Image URL Sources

You can get product images from:

**Option A: Amazon Product Images (Recommended for your ASINs)**
- Format: `https://m.media-amazon.com/images/I/{IMAGE_ID}.jpg`
- Example: `https://m.media-amazon.com/images/I/71ABC123XYZ._AC_SL1500_.jpg`
- Find by visiting your product page and right-clicking the main image

**Option B: Your Own Website**
- Upload images to https://natureswaysoil.com and link them
- Recommended size: 1200x1200px or larger

**Option C: Cloud Storage**
- Upload to Google Drive, Dropbox, or AWS S3
- Make sure the URLs are publicly accessible

### 3. Video Configuration

The system now creates:
- ✅ **15-second videos** (was 5 seconds)
- ✅ **1280x720 resolution** (HD ready)
- ✅ **References product images** in the AI-generated script

Current settings in `.env`:
```
WAVE_VIDEO_DURATION=15
WAVE_VIDEO_SIZE=1280*720
CSV_COL_IMAGE_URL=Image_URL
```

### 4. How It Works

1. **Script Generation**: OpenAI reads the product info + image URL and creates a script that references visual elements
2. **Video Creation**: WaveSpeed generates a video based on the script (image URL is included in the prompt for context)
3. **Posting**: Video posts to Twitter and YouTube automatically

### 5. Testing

To test with a product that has an image URL:

```bash
cd /workspaces/video
npx ts-node scripts/run-once.ts
```

### 6. Example: Getting Amazon Images for Your Products

For ASIN `B0822RH5L3`:
1. Go to: https://www.amazon.com/dp/B0822RH5L3
2. Right-click the main product image → "Copy Image Address"
3. Paste that URL into your Google Sheet's `Image_URL` column

## Need Help?

- **Want longer videos?** Change `WAVE_VIDEO_DURATION=15` to `30` for 30-second videos
- **Different resolution?** Try `WAVE_VIDEO_SIZE=1920*1080` for Full HD
- **Image not working?** Make sure the URL is publicly accessible (try opening it in an incognito browser)

## Next Steps

1. Add the `Image_URL` column to your Google Sheet
2. Fill in image URLs for your products (start with 1-2 to test)
3. The next automated run will use them automatically!
