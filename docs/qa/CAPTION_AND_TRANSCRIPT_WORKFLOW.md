# Caption and Transcript Workflow

This workflow makes each generated video easier to review, repurpose, and publish with accessibility in mind.

## Folder convention

```text
content/
  captions/
    product-slug-platform-date.vtt
    product-slug-platform-date.srt
  transcripts/
    product-slug-platform-date.md
  metadata/
    product-slug-platform-date.json
```

## Required transcript format

```markdown
# Video Transcript: Product Name

- Product/SKU:
- Platform:
- Target buyer:
- CTA:
- Landing page:
- Date created:

## Plain transcript

Write the spoken words exactly as approved.

## Descriptive transcript

Add brief visual context where it helps the viewer understand the message.
Example: `[Opening shot: stressed yellow turf beside a green recovery area.]`

## Claim review notes

- Benefit claims checked:
- Directions checked:
- Compliance concerns:
```

## Caption QA rules

1. Correct auto-generated captions before publishing.
2. Keep each caption short enough to read on mobile.
3. Check spelling for all product and ingredient names.
4. Do not allow captions to cover important on-screen text.
5. Export captions as `.vtt` for web/YouTube and `.srt` when a platform requires it.

## Product-name pronunciation list

Use this list when reviewing AI voice output:

- Nature's Way Soil
- Liquid Biochar
- Humic Acid
- Fulvic Acid
- Kelp
- Yucca
- BM-1
- HUBZone
- Government Purchase Card

## Manual review checklist

- [ ] Transcript matches the final spoken audio.
- [ ] Captions match transcript after final edits.
- [ ] Captions are uploaded to the platform when supported.
- [ ] Transcript is saved for website reuse, email copy, and blog posts.
- [ ] Any compliance-sensitive claims are toned down before publishing.
