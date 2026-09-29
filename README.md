# natureswaysoil/video

**AI-Powered Automated Video Marketing Engine for Nature's Way Soil**

Turns your Google Sheet product catalog into reviewable product videos using:

- OpenAI for conversion-focused scripts
- HeyGen for higher-quality avatar/talking product videos
- Product-specific templates for Dog Urine, Hay/Pasture, Biochar, Kelp, Bone Meal, and Fruit & Bloom
- Claim-safety checks before scripts and captions are used
- Google Sheets writeback for video status and posted status

## Video generation providers

The main workflow now prefers HeyGen when credentials are available and falls back to D-ID only when explicitly selected or when HeyGen is not configured.

Use `VIDEO_PROVIDER=heygen` for the higher-quality multi-scene avatar path. The default avatar is `Plowman` unless a sheet row or environment override provides a different HeyGen avatar.

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

**Status**: HeyGen-first video generation with stronger CSV parsing, claim-safety module, product-specific templates, and Vercel build correction.
