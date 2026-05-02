# Test Video Automated Posting Guide (5 Posts/Day)

This guide configures the existing automation stack to post the 5 local test videos from:

- `/home/ubuntu/test_videos/`

and rotate through one product per slot, five times per day.

---

## 1) What the current posting system is doing

### Scheduler and automation flow

- **Scheduler entrypoint**: `src/scheduler.ts`
- **Default scheduled times (server-local)**:
  - `15 8 * * *`
  - `30 11 * * *`
  - `0 13 * * *`
  - `15 18 * * *`
  - `30 19 * * *`
- **Standard pipeline command**: `npm run run:once`
- Optional row-generation (standard CSV mode): daily at `0 7 * * *`

### Platform integrations currently wired

From `src/cli.ts` and platform adapters:

- ✅ Instagram (`src/instagram.ts`)
- ✅ Twitter/X (`src/twitter.ts`)
- ✅ Pinterest (`src/pinterest.ts`)
- ✅ YouTube (`src/youtube.ts`)

Not implemented in the main posting pipeline:

- ❌ TikTok
- ❌ Facebook (there is related code in blog pipeline, but not part of the main `cli.ts` posting loop)

### Content-seed-bank integration

- Existing seed bank: `src/content-seed-bank.ts`
- Added a dedicated test campaign seed set:
  - `TEST_VIDEO_CAMPAIGN_SEEDS`
  - `getTestVideoCampaignSeeds()`

---

## 2) New test-video campaign configuration

### New campaign runner

- Script: `scripts/run-test-video-campaign.ts`
- NPM command: `npm run run:test-campaign`

What it does each run:

1. Loads the 5 test campaign seeds from `content-seed-bank`
2. Picks the next product in rotation (stateful index)
3. Resolves a postable video URL from one of:
   - `TEST_VIDEO_PUBLIC_BASE_URL` + file name, or
   - local upload to Cloudinary from `TEST_VIDEOS_DIR` (cached after first upload)
4. Builds optimized caption with:
   - product title
   - benefit-driven description
   - landing page URL
   - product hashtags
5. Posts to enabled platforms that have valid credentials

### Product/video/URL mapping used

- `pasture-revival-test.mp4` → `https://natureswaysoil.com/pasture-revival`
- `dog-urine-neutralizer-test.mp4` → `https://natureswaysoil.com/dog-urine-neutralizer`
- `garden-mix-test.mp4` → `https://natureswaysoil.com/garden-mix`
- `hydroponic-nutrients-test.mp4` → `https://natureswaysoil.com/hydroponic-nutrients`
- `fruit-tree-fertilizer-test.mp4` → `https://natureswaysoil.com/fruit-tree-fertilizer`

### Rotation state file

- `.runtime/test-video-campaign-state.json`

Stores:

- `nextIndex` (which product posts next)
- `uploadedVideoUrls` cache (if Cloudinary is used)
- `lastUpdatedAt`

---

## 3) Credentials/API keys required

### Instagram

- `INSTAGRAM_ACCESS_TOKEN`
- One of: `INSTAGRAM_IG_ID` / `INSTAGRAM_USER_ID` / `INSTAGRAM_ACCOUNT_ID`

### Twitter/X

One of:

- Full OAuth upload creds:
  - `TWITTER_API_KEY`
  - `TWITTER_API_SECRET`
  - `TWITTER_ACCESS_TOKEN`
  - `TWITTER_ACCESS_SECRET`
- OR fallback text posting:
  - `TWITTER_BEARER_TOKEN`

### Pinterest

- `PINTEREST_ACCESS_TOKEN`
- `PINTEREST_BOARD_ID`

### YouTube

One of naming formats is accepted by campaign runner:

- `YT_CLIENT_ID` / `YOUTUBE_CLIENT_ID`
- `YT_CLIENT_SECRET` / `YOUTUBE_CLIENT_SECRET`
- `YT_REFRESH_TOKEN` / `YOUTUBE_REFRESH_TOKEN`

Optional:

- `YT_PRIVACY_STATUS` (`public`, `unlisted`, `private`)

### Video hosting (required unless videos are already public)

If local test files are used directly:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Alternative (no Cloudinary needed):

- `TEST_VIDEO_PUBLIC_BASE_URL`

---

## 4) How to start/stop automated posting

## Start (scheduler mode)

```bash
TEST_VIDEO_CAMPAIGN_MODE=true \
SCHEDULER_PIPELINE_COMMAND="npm run run:test-campaign" \
npm run schedule
```

## Stop

- Stop the scheduler process (Ctrl+C if foreground)
- Or terminate the process in your process manager/container

## Run one slot manually

```bash
TEST_VIDEO_CAMPAIGN_MODE=true npm run run:test-campaign
```

## Dry run (no real posting)

```bash
DRY_RUN_LOG_ONLY=true TEST_VIDEO_CAMPAIGN_MODE=true npm run run:test-campaign
```

---

## 5) Schedule and monitoring

### Posting schedule

- 5 daily slots, one product per slot, rotating across all 5 products.
- Default cron list in `src/scheduler.ts` and `.env.example`:
  - `15 8 * * *`
  - `30 11 * * *`
  - `0 13 * * *`
  - `15 18 * * *`
  - `30 19 * * *`

Override using:

- `SCHEDULER_POST_TIMES` (comma-separated cron expressions)

### Monitoring

- Scheduler logs (stdout/stderr)
- Campaign runner logs from `run-test-video-campaign.ts`
- Rotation state + upload cache:
  - `.runtime/test-video-campaign-state.json`

### Adjustments

- Change captions/hashtags/products in:
  - `src/content-seed-bank.ts` (`TEST_VIDEO_CAMPAIGN_SEEDS`)
- Change cadence/times via env:
  - `SCHEDULER_POST_TIMES`
- Restrict platforms via env:
  - `ENABLE_PLATFORMS=instagram,youtube` (example)

---

## GitHub Actions schedule notes

Workflow file updated: `.github/workflows/video-automation.yml`

- Uses 5 scheduled triggers/day
- Supports feature flag:
  - `TEST_VIDEO_CAMPAIGN_MODE` secret
- In test campaign mode it runs:
  - `npm run run:test-campaign`
- In standard mode it runs:
  - `npm run run:once`
