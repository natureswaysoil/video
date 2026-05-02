# Test Video Automated Posting Guide (5 Posts/Day)

This guide configures the existing automation stack to post the 5 local test videos from:

- `/home/ubuntu/test_videos/`

and rotate through one product per slot, five times per day.

---

## 1) Current test campaign behavior

### Scheduler and automation flow

- **Scheduler entrypoint**: `src/scheduler.ts`
- **Campaign runner**: `scripts/run-test-video-campaign.ts`
- **NPM command**: `npm run run:test-campaign`
- **Default scheduled times (server-local)**:
  - `15 8 * * *`
  - `30 11 * * *`
  - `0 13 * * *`
  - `15 18 * * *`
  - `30 19 * * *`

### Platforms used by the test campaign

- ✅ Instagram
- ✅ Pinterest
- ✅ YouTube
- ❌ Twitter/X (**disabled intentionally**)

> Note: Twitter posting is hard-disabled in `run-test-video-campaign.ts` even if `ENABLE_PLATFORMS` includes `twitter` or `x`.

---

## 2) Credentials source (Google Secret Manager)

The test campaign now loads credentials from **Google Secret Manager** at runtime.

- No manual export of platform API credentials is required for normal runs.
- The script calls `loadSecretsToEnv(...)` with the campaign secret list.
- Any matching secret loaded from Google Secret Manager is injected into `process.env` for runtime use.

### Required Google Secret Manager secret names

Create these secret names in your GCP project used by the campaign (`GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` / `GCP_PROJECT`):

#### Instagram / Meta

- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_IG_ID`
- `INSTAGRAM_USER_ID`
- `INSTAGRAM_ACCOUNT_ID`
- `FACEBOOK_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ID`

#### Pinterest

- `PINTEREST_ACCESS_TOKEN`
- `PINTEREST_BOARD_ID`

#### YouTube

Supported naming (either convention):

- `YOUTUBE_CLIENT_ID` or `YT_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET` or `YT_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN` or `YT_REFRESH_TOKEN`

#### Cloudinary (only needed when `TEST_VIDEO_PUBLIC_BASE_URL` is not set)

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### Optional non-secret runtime variables

These are normal runtime env settings (not required to be in Secret Manager):

- `TEST_VIDEO_PUBLIC_BASE_URL` (if videos are already publicly hosted)
- `TEST_VIDEOS_DIR` (default: `/home/ubuntu/test_videos`)
- `ENABLE_PLATFORMS` (supported values for this script: `instagram,pinterest,youtube`)
- `DRY_RUN_LOG_ONLY=true` (preview mode)
- `YT_PRIVACY_STATUS=public|unlisted|private`

---

## 3) Campaign runner workflow

Each run of `scripts/run-test-video-campaign.ts` does the following:

1. Loads campaign credentials from Google Secret Manager
2. Loads the 5 test campaign seeds from `src/content-seed-bank.ts`
3. Picks the next seed by rotation index
4. Resolves a postable video URL from either:
   - `TEST_VIDEO_PUBLIC_BASE_URL`, or
   - Cloudinary upload from local `TEST_VIDEOS_DIR`
5. Builds caption text (title + product description + landing URL + hashtags)
6. Posts to available enabled platforms (Instagram, Pinterest, YouTube)
7. Writes updated rotation/cache state to:
   - `.runtime/test-video-campaign-state.json`

### Product/video/URL mapping used

- `pasture-revival-test.mp4` → `https://natureswaysoil.com/pasture-revival`
- `dog-urine-neutralizer-test.mp4` → `https://natureswaysoil.com/dog-urine-neutralizer`
- `garden-mix-test.mp4` → `https://natureswaysoil.com/garden-mix`
- `hydroponic-nutrients-test.mp4` → `https://natureswaysoil.com/hydroponic-nutrients`
- `fruit-tree-fertilizer-test.mp4` → `https://natureswaysoil.com/fruit-tree-fertilizer`

---

## 4) Start / stop / dry-run

### Start scheduler mode

```bash
TEST_VIDEO_CAMPAIGN_MODE=true \
SCHEDULER_PIPELINE_COMMAND="npm run run:test-campaign" \
npm run schedule
```

### Stop

- Stop the scheduler process (Ctrl+C if foreground)
- Or terminate the process in your process manager/container

### Run one slot manually

```bash
TEST_VIDEO_CAMPAIGN_MODE=true npm run run:test-campaign
```

### Dry run (no social posting)

```bash
DRY_RUN_LOG_ONLY=true TEST_VIDEO_CAMPAIGN_MODE=true npm run run:test-campaign
```

---

## 5) Monitoring and adjustments

### Monitoring

- Scheduler logs (stdout/stderr)
- Campaign runner logs from `run-test-video-campaign.ts`
- Rotation state file:
  - `.runtime/test-video-campaign-state.json`

### Adjustments

- Update captions/hashtags/products in:
  - `src/content-seed-bank.ts` (`TEST_VIDEO_CAMPAIGN_SEEDS`)
- Change schedule via:
  - `SCHEDULER_POST_TIMES`
- Restrict platforms via:
  - `ENABLE_PLATFORMS=instagram,youtube` (example)

---

## GitHub Actions schedule notes

Workflow file: `.github/workflows/video-automation.yml`

- Uses 5 scheduled triggers/day
- Supports feature flag:
  - `TEST_VIDEO_CAMPAIGN_MODE` secret
- In test campaign mode:
  - `npm run run:test-campaign`
- In standard mode:
  - `npm run run:once`
