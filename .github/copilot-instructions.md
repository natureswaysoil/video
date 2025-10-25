## Copilot Instructions for Nature's Way Soil – Video Automation

Purpose: Automate product video generation with HeyGen and post to Instagram, Twitter, Pinterest, and optionally YouTube. Built with TypeScript (Node 20). This guide helps a coding agent make changes, validate locally, and ship updates safely.

## What’s in this repo
- Runtime: Node.js 20, TypeScript
- Entrypoint loop: `src/cli.ts` (reads a Google Sheet CSV, ensures a video URL exists via HeyGen, then posts to enabled platforms)
- Health/status server: `src/health-server.ts` exposes `GET /health` and `GET /status` on `PORT` (default 8080)
- Key modules:
	- Data: `src/core.ts` (reads CSV), `src/sheets.ts` (Google Sheets writeback)
	- Generation: `src/openai.ts` (script), `src/heygen.ts` + `src/heygen-adapter.ts` (avatar/voice mapping + job polling)
	- Platforms: `src/instagram.ts`, `src/twitter.ts`, `src/pinterest.ts`, `src/youtube.ts`
	- Utilities: `src/webhook-cache.ts`, `src/wavespeed.ts`, `src/pictory.ts`

## Run and validate locally
1) Install deps
	 - Ensure Node 20+
	 - Install: `npm ci` (or `npm install`)
2) Configure env
	 - Copy `.env.example` to `.env` and fill required values (see “Critical env vars”)
3) Build and typecheck
	 - `npm run typecheck`
	 - `npm run build`
4) Run
	 - Continuous loop: `npm run dev` (starts health server on `:8080`)
	 - Single pass: set `RUN_ONCE=true` in `.env` then `npm run dev`, or `npx ts-node src/cli.ts`
5) Quick health checks
	 - Open http://localhost:8080/health and http://localhost:8080/status

Notes
- Posting is gated by tokens; missing credentials for a platform means it’s skipped.
- Set `DRY_RUN_LOG_ONLY=true` to log intended actions without posting.
- Respect posting windows with `ENFORCE_POSTING_WINDOWS=true` (9:00 and 17:00 Eastern, adjustable via `EASTERN_UTC_OFFSET_HOURS`).

## Critical env vars
See `.env.example` for a full list. Most important:

- Input data
	- `CSV_URL` — Google Sheets CSV export URL (required)
	- `CSV_COL_*` — Optional CSV header overrides (e.g., `CSV_COL_VIDEO_URL`, `CSV_COL_ASIN`)
	- `VIDEO_URL_TEMPLATE` — Template for building a video URL when not provided (default: `https://heygen.ai/jobs/{jobId}/video.mp4`)
	- `SKIP_VIDEO_EXISTS_CHECK` — If true, skip HEAD/range probe when validating remote video URL
	- `SHEET_VIDEO_TARGET_COLUMN_LETTER` — Writeback column letter for video URL (default `AB`)

- Control
	- `RUN_ONCE` — Single cycle then exit (useful for Jobs)
	- `POLL_INTERVAL_MS` — Delay between cycles in continuous mode (default 60000)
	- `DRY_RUN_LOG_ONLY` — Don’t post; only log
	- `ENABLE_PLATFORMS` — Comma-separated allowlist (e.g., `twitter,youtube`); empty means “all available by credentials”
	- `ENFORCE_POSTING_WINDOWS`, `EASTERN_UTC_OFFSET_HOURS`

- HeyGen (video generation)
	- Direct: `HEYGEN_API_KEY`, `HEYGEN_API_ENDPOINT`, `HEYGEN_VIDEO_DURATION_SECONDS`
	- Webhook (optional): `HEYGEN_WEBHOOK_URL`
	- Or via GCP Secret Manager: `GCP_SECRET_HEYGEN_API_KEY`

- Google Sheets writeback (optional)
	- `GS_SERVICE_ACCOUNT_EMAIL`, `GS_SERVICE_ACCOUNT_KEY` (Editor access to the sheet required)

- Platforms
	- Instagram: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_IG_ID`
	- Twitter/X: simple link-tweet via `TWITTER_BEARER_TOKEN`; native upload prefers `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`
	- Pinterest: `PINTEREST_ACCESS_TOKEN`, `PINTEREST_BOARD_ID`
	- YouTube: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` (+ optional `YT_PRIVACY_STATUS`)

- Optional blog posting
	- `ENABLE_BLOG_POSTING=true`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`

## Behavior and contracts
- Input: CSV rows → `{ product, jobId, rowNumber, headers, record }`
- Video resolution:
	1) Use direct video URL column if present (`CSV_COL_VIDEO_URL` candidates)
	2) Else build from `VIDEO_URL_TEMPLATE` with `{jobId}`/`{asin}`
	3) Validate URL via HEAD or ranged GET (skip with `SKIP_VIDEO_EXISTS_CHECK=true`)
- Generation path:
	- If no video URL exists/reachable, generate with HeyGen using an OpenAI-produced script and avatar/voice mapping; poll for completion (up to ~25 min); write URL back to sheet
- Posting path:
	- For each enabled platform with credentials, attempt post with retries and exponential backoff
	- On at least one success and writeback configured, mark row as `Posted` and `Posted_At`
- Health endpoints:
	- `/health`: summary (uptime, env flags)
	- `/status`: last run status (rowsProcessed, successes, failures, recent errors)

## Extending
- New platform: add `src/<platform>.ts` exporting `postTo<Platform>(videoUrl, caption, ...auth): Promise<any>` and wire in `src/cli.ts`
- New generators/providers: mirror the HeyGen pattern (adapter + client + polling)
- Keep `cli.ts` orchestration-focused; isolate API details per module

## Common pitfalls (and fixes)
- 403/405 on HEAD: the reachability check accepts these as “likely exists”; falls back to ranged GET
- Twitter without upload creds: falls back to text tweet with link when only `TWITTER_BEARER_TOKEN` is set
- Posting windows block posts: set `ENFORCE_POSTING_WINDOWS=false` during testing
- Missing writeback permissions: ensure the service account has Editor on the spreadsheet

## Deploy (summary)
- Prefer Cloud Run Jobs with `RUN_ONCE=true` for scheduled posting; see `README.md` and `PRODUCTION_DEPLOYMENT.md` for full commands
- Health server can be exposed for liveness checks; adjust `PORT`
