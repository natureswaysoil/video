# Copilot Instructions for this Repo

This repo automates product video generation and posting to Instagram, Twitter, and Pinterest. Use these notes to work effectively.

## Big picture
- Entrypoint: `src/cli.ts` loads `.env`, pulls a product from a Google Sheet CSV via `processCsvUrl`, derives `videoUrl` from a WaveSpeed job ID, then posts to platforms conditionally.
- Platform clients: `src/instagram.ts`, `src/twitter.ts`, `src/pinterest.ts` — each exports `postTo<Platform>(videoUrl, caption, ...auth)` and uses `axios` to call the API.
- Behavior is gated by env vars; if a token/ID is missing, that platform is skipped.

## Key files
- `src/cli.ts` — glue: CSV ➜ `{product, jobId}` ➜ `videoUrl` ➜ post to enabled platforms.
- `src/instagram.ts` — Graph API v19.0: create media container (VIDEO) then publish; returns the media ID.
- `src/twitter.ts` — creates a text tweet with `caption + "\n" + videoUrl` (no media upload flow yet).
- `src/pinterest.ts` — creates a pin using `media_source: { source_type: "video_url", url }` on a given board.

## Patterns to follow
- One-file-per-platform with a single export: `postTo<Platform>(videoUrl, caption, ...auth)` returning an ID/payload.
- Keep `cli.ts` thin: env detection, call `processCsvUrl`, compute `videoUrl`, call platform modules.
- WaveSpeed is indirect: `videoUrl = https://wavespeed.ai/jobs/${jobId}/video.mp4` (adjust in `cli.ts` if API changes).
- `processCsvUrl` comes from `./core` and is not in this repo; expect `{ skipped, product, jobId }`.

## Running locally
- This repo relies on `dotenv/config` at runtime. Populate `.env` first.
- Package metadata (package.json/tsconfig) are not present; add them if you need builds or scripts. Until then, assume use of `ts-node` to run `src/cli.ts`.
- Posting is optional per platform based on env presence.

## Required env vars (when posting)
- `CSV_URL`
- Instagram: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_IG_ID`
- Twitter/X: `TWITTER_BEARER_TOKEN`
- Pinterest: `PINTEREST_ACCESS_TOKEN`, `PINTEREST_BOARD_ID`

## API specifics (current usage)
- Instagram: POST `/{igId}/media` with `{ video_url, media_type: 'VIDEO', caption, access_token }` ➜ container ID; then POST `/{igId}/media_publish` with `{ creation_id, access_token }` ➜ media ID.
- Twitter v2: POST `/2/tweets` with `{ text: caption + "\n" + videoUrl }` and `Authorization: Bearer <token>`.
- Pinterest v5: POST `/v5/pins` with `Authorization: Bearer <token>`; body includes `board_id`, `media_source.video_url`, `title/description`.

## Extending the system
- Add a new platform module at `src/<platform>.ts` following the same function signature and using `axios`.
- Keep side effects isolated to the platform file; return the created ID/payload. Do not expand `cli.ts` with API details.

## Known gaps
- `./core` is missing; implement `processCsvUrl(csvUrl)` to return `{ skipped, product, jobId }` when needed.
- No `package.json`/scripts present; create minimal metadata if adding deps like `axios`/`ts-node`.
