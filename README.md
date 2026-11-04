# natureswaysoil/video

**AI-Powered Automated Video Marketing Engine for Nature's Way Soil**

Turns your Google Sheet product catalog into reviewable product videos using:

- OpenAI for conversion-focused scripts
- D-ID for avatar/talking product videos
- Product-specific templates for Dog Urine, Hay/Pasture, Biochar, Kelp, Bone Meal, and Fruit & Bloom
- Claim-safety checks before scripts and captions are used
- Google Sheets writeback for video status and posted status

## D-ID is the only video generator

This repository is standardized on D-ID. Do not add HeyGen configuration, tests, or documentation back into the main workflow unless the project intentionally changes video vendors later.

Use D-ID talks with a source image URL or D-ID clips with a presenter ID.

## Correct platform variable names

Use the names defined in `src/config-validator.ts`. In particular:

- Instagram uses `INSTAGRAM_USER_ID`.
- YouTube uses `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN`.
- Facebook Page posting uses `FACEBOOK_PAGE_ACCESS_TOKEN` and `FACEBOOK_PAGE_ID`.

## Run and deploy

- Vercel builds with `npm run build`.
- Local development: `npm run dev`
- One video: `npm run one:video`
- Type check: `npm run typecheck`
- Build: `npm run build`

### Scheduled sheet-row narration

`npm run post:sheet-row` uses OpenAI TTS for narration. If OpenAI is unavailable
(including exhausted API credits), it tries ElevenLabs using `ELEVENLABS_API_KEY`
and optional `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID`. These values can be
provided through the environment or Google Secret Manager (including the existing
`ElevenLabs_Key` alias). If neither provider produces audio, the command fails
before rendering; the pre-upload audio quality gate remains enabled. Restore
OpenAI billing or configure a funded ElevenLabs account to resolve quota failures.

Run the offline narration regression checks with `npx ts-node scripts/test-narration.ts`.

## Quality control and commercialization

The system should operate as a repeatable video marketing engine, not just a code repository. Current priorities:

1. Clear product offer and buyer segment.
2. Human-reviewed captions and transcripts.
3. Safer claim review before publishing.
4. Strong thumbnail and metadata standards.
5. B2B offer structure for public-sector and commercial grounds buyers.
6. Product-specific script templates for the major Nature's Way Soil product lines.

## Repository cleanup note

Amazon PPC optimizer folders should be moved to a separate repository, such as `natureswaysoil/amazon-ppc-optimizer`, or retained only as archived reference material. The production video deployment should stay focused on the video engine.

**Status**: D-ID-only video generation with stronger CSV parsing, claim-safety module, product-specific templates, and Vercel build correction.
