# Copilot Instructions - Nature's Way Soil Video Automation

## Repository Overview
Automated product video generation and social media posting for Nature's Way Soil products. Built with TypeScript, Node.js 20, deployed on Google Cloud Run Jobs.

**Tech Stack**: TypeScript 5.6.3 (strict), Node 20, HeyGen (primary video), OpenAI (scripts), Pictory/WaveSpeed (fallback), Google Sheets (products), Twitter/YouTube/Instagram/Pinterest APIs.

## Build Commands (ALWAYS RUN THESE)

### Before Any Code Changes
```bash
npm run typecheck    # MUST pass - strict TypeScript validation
npm run build        # MUST succeed - compiles to dist/*.js (18 files)
```

### After Code Changes - Full Validation
```bash
npm run typecheck                          # Must show "No errors"
npm run build                              # Must create dist/cli.js
bash scripts/verify-workflow.sh            # Must show all ✅
npx ts-node scripts/test-heygen-mapping.ts # Must pass 6/6 tests
```

**CRITICAL**: All four must pass before committing. Build failures block deployment.

### Known Build Issues & Solutions
1. **npm install fails**: Delete `package-lock.json` and `node_modules/`, run `npm install` again
2. **TypeScript errors**: Add explicit types; avoid `any`; strict mode catches all mismatches
3. **Regex fails silently**: Use `/\b.../i` NOT `/\\b.../i` in `src/heygen-adapter.ts` (lines 19-23)

## Architecture & Workflow (DO NOT CHANGE ORDER)

### Execution Flow
```
1. processCsvUrl() [src/core.ts]
   ↓ reads Google Sheets CSV export
2. Extract product (title, details, ASIN)
   ↓
3. generateScript(product) [src/openai.ts]
   ↓ creates marketing script using product data
4. Video Generation (3-tier fallback):
   - HeyGen [src/heygen.ts] + smart mapping [src/heygen-adapter.ts]
   - Pictory [src/pictory.ts] if HeyGen fails
   - WaveSpeed [src/wavespeed.ts] if Pictory fails
   ↓
5. Post to social [src/twitter.ts, youtube.ts, instagram.ts, pinterest.ts]
   ↓
6. writeBackToSheet() [src/sheets.ts] - mark Posted
```

**Script generation MUST use product data from sheet row** (verified in step 4 of verify-workflow.sh).

### Key Files
- **src/cli.ts** (644 lines) - Main orchestrator
  - Lines 60-520: Complete workflow in main()
  - Line 527: Error handling - MUST call `process.exit(1)` on failure for Cloud Run
  - Env: `RUN_ONCE=true` for serverless, `false` for continuous
  
- **src/heygen-adapter.ts** - Smart product mapping
  - `mapProductToHeyGenPayload()`: Maps keywords → avatars
  - Rules: kelp→garden_expert_01, bone meal→farm_expert_02, hay→pasture_specialist_01
  - **REGEX BUG**: Use `\b` NOT `\\b` (lines 19-23)

- **src/heygen.ts** - HeyGen client (primary video)
  - `createVideoJob()`, `pollJobForVideoUrl()` (15 min timeout)
  
- **src/pictory.ts** - Pictory client (fallback 1)
  - `createStoryboard()`, `renderVideo()` (20 min timeout)
  
- **src/wavespeed.ts** - WaveSpeed client (fallback 2)

- **src/openai.ts** - GPT-4o-mini script generation
  - Template: "Create a {length} second script for {title}. {details}"

- **Platform clients**: twitter.ts, youtube.ts, instagram.ts, pinterest.ts
  - Pattern: `postTo<Platform>(videoUrl, caption, ...auth)` returns ID

### Directory Structure
```
src/           # 19 TypeScript files
  cli.ts       # Entry point ⭐
  core.ts      # CSV processing
  heygen*.ts   # HeyGen integration (2 files)
  openai.ts    # Script generation
  pictory.ts, wavespeed.ts  # Fallbacks
  twitter.ts, youtube.ts, instagram.ts, pinterest.ts
  sheets.ts    # Writeback
scripts/       # 30+ utility scripts
  deploy-gcp.sh              # GCP deployment ⭐
  verify-workflow.sh         # Workflow validation ⭐
  test-heygen-mapping.ts     # HeyGen tests ⭐
dist/          # Compiled JS (gitignored)
Dockerfile     # Multi-stage build, CMD ["node", "dist/cli.js"]
.env           # Secrets (gitignored, NEVER commit)
```

## Deployment

### Google Cloud Run Jobs (Production)
```bash
PROJECT_ID=natureswaysoil-video \
REGION=us-east1 \
TIME_ZONE=America/New_York \
bash scripts/deploy-gcp.sh
```

Creates:
- Job: `natureswaysoil-video-job`
- Scheduler: 9 AM & 6 PM Eastern
- Service account: `video-job-sa@natureswaysoil-video.iam.gserviceaccount.com`

Required secrets in Secret Manager: `HEYGEN_API_KEY`, `OPENAI_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `TWITTER_BEARER_TOKEN`, etc.

### Local Development
```bash
cp .env.example .env  # Edit with your API keys
npm install
npm run dev           # Run single cycle
```

### Testing
```bash
# HeyGen mapping (must pass 6/6)
npx ts-node scripts/test-heygen-mapping.ts

# Workflow validation (must show all ✅)
bash scripts/verify-workflow.sh

# Full local test
npm run dev
```

## Critical Patterns

### Error Handling for Cloud Run
```typescript
// CORRECT ✅ - exits with failure code
main().catch(e => {
  console.error('❌ Fatal error:', e)
  process.exit(1)  // Required for Cloud Run failure detection
})

// WRONG ❌ - silent failure
main().catch(e => console.error(e))
```

### HeyGen Smart Mapping
```typescript
// CORRECT ✅ - use adapter
const mapping = mapProductToHeyGenPayload(record)
const payload = {
  avatar: mapping.avatar,  // Auto-selected by keywords
  voice: mapping.voice
}

// WRONG ❌ - hardcoded
const payload = { avatar: 'some_id' }
```

### Async Retry Pattern
```typescript
const result = await retryWithBackoff(
  () => postToTwitter(videoUrl, caption),
  { maxRetries: 3, operation: 'Twitter post' }
)
```

## Environment Variables

### Required Core
```bash
CSV_URL="https://docs.google.com/spreadsheets/d/{id}/export?format=csv&gid={gid}"
OPENAI_API_KEY="sk-..."
HEYGEN_API_KEY="..."
```

### Social Media
```bash
# Twitter (option 1: text + link)
TWITTER_BEARER_TOKEN="..."

# Twitter (option 2: native upload - PREFERRED)
TWITTER_API_KEY="..."
TWITTER_API_SECRET="..."
TWITTER_ACCESS_TOKEN="..."
TWITTER_ACCESS_SECRET="..."

# YouTube
YT_CLIENT_ID="..."
YT_CLIENT_SECRET="..."
YT_REFRESH_TOKEN="..."

# Instagram
INSTAGRAM_ACCESS_TOKEN="..."
INSTAGRAM_IG_ID="..."

# Pinterest
PINTEREST_ACCESS_TOKEN="..."
PINTEREST_BOARD_ID="..."
```

### Behavior
```bash
RUN_ONCE=true                 # Cloud Run Jobs mode
ALWAYS_GENERATE_NEW_VIDEO=true
ENABLE_PLATFORMS="twitter,youtube"  # Filter platforms
```

## Validation

### Pre-Commit Checklist
1. ✅ `npm run typecheck` - No errors
2. ✅ `npm run build` - 18 files in dist/
3. ✅ `bash scripts/verify-workflow.sh` - All ✅
4. ✅ `npx ts-node scripts/test-heygen-mapping.ts` - 6/6 pass
5. ✅ No `.env` in git diff

### Deployment Verification
```bash
# Job status
gcloud run jobs describe natureswaysoil-video-job --region=us-east1

# Recent executions
gcloud run jobs executions list --job=natureswaysoil-video-job --region=us-east1 --limit=5

# Error logs
gcloud logging read "resource.type=cloud_run_job AND severity>=ERROR" --limit=50

# Manual test
gcloud run jobs execute natureswaysoil-video-job --region=us-east1 --wait
```

## Special Notes

- **Dockerfile entry**: `CMD ["node", "dist/cli.js"]` NOT `blog-server.js`
- **CSV columns**: Flexible mapping via `CSV_COL_*` env vars (see .env.example)
- **Video URL priority**: CSV column → WaveSpeed API → template → preflight check
- **Timeouts**: HeyGen 15 min, Pictory 20 min, Cloud Run Jobs 1 hour max

## Trust These Instructions
This document is validated (last verified: Oct 2025). Only search if instructions conflict with observed behavior. Run verification scripts first—they are the source of truth.
