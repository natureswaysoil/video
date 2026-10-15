# Soil-first three-channel campaign

Status: draft content, not scheduled or published. User selected Facebook, Instagram and YouTube on October 15, 2026.

## Deliverables

- `v01.json`: initial 30-second, five-scene video brief using the existing `ApprovedMarketingCampaign` input shape. The type name does not mean this draft has been approved for publishing.
- Separate Facebook, Instagram and YouTube copy.
- Proposed video export: 1080x1920, captions, natural deeper narration, consistent brand end card.
- Proposed still exports: 1080x1350 for Facebook and Instagram, based on the creative kit's Start with the soil concept.

## Proposed sequence

| Week | Video for all three channels | Still for Facebook and Instagram |
|---|---|---|
| 1 | Start with the soil | Hands and soil brand graphic |
| 2 | Meet Living Soil Revitalizer | Actual product photograph |
| 3 | What are you growing? | Container garden question |
| 4 | Plan your next garden project | Authentic owner-supplied farm photograph |

These are production slots, not added cron jobs. The existing sheet-row workflow already has daily posting windows; do not add a duplicate scheduler.

## Verified repository behavior

`.github/workflows/sheet-row-posting.yml` enables YouTube, Instagram and Facebook, plus other existing channels. It accepts a `marketing_campaign` base64url input. `scripts/lib/marketing-campaign.ts` reads the draft's fields and supports channel-specific captions. The scene adapter expects five scenes; this draft uses five sentences, five overlays and five B-roll queries.

`runExistingPoster` in `scripts/post-sheet-row.ts` explicitly selects `VIDEO_STYLE=broll_ken_burns` and `VIDEO_PROVIDER=openai_tts`. HeyGen integration files elsewhere do not establish that this production route uses HeyGen.

## Before activating this new campaign

1. Render and review the five-scene output with the current real product photo. Do not manufacture packaging or label text. Source footage must be licensed; illustrative scenery must not be presented as actual customer results or the actual farm.
2. Verify actual account destinations and per-platform post IDs. A successful workflow may include skipped platforms and is not proof of publication to all three.
3. Scope this campaign to `youtube,instagram,facebook` without inadvertently removing the existing campaign's other destinations. The existing workflow hardcodes a wider list; this JSON alone does not restrict it. Do not submit the draft to that workflow until this is resolved.
4. Check the deeper voice and natural speaking pace in a render. The current social route uses OpenAI TTS, not HeyGen; any switch should be tested separately.
5. Confirm the product image resolves for NWS_023. The current campaign adapter does not accept an image URL or a product-specific website URL; it supplies the homepage. The Facebook caption links directly to the product.
6. Record the resulting post IDs and URLs separately for each platform. Do not activate a second queue while the existing queue is posting.

## Validation performed

Inspected the current campaign decoder, scene mapper and production workflow. Checked JSON structure, three channel entries and five-scene arrays. No local execution environment was available for rendering, integration tests, runtime credential checks or publishing. No workflow, account setting, schedule or paid budget is changed by these files.
