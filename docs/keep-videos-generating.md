# Keep Videos Generating Plan

## Best Low-Cost Strategy
Do not generate unlimited random videos. Generate only the four proven product families and rotate angles.

Primary products:
1. Dog Urine Neutralizer & Lawn Revitalizer
2. Hay, Pasture & Lawn Fertilizer
3. Lawn Fertilizer / Lawn Soil Treatment
4. Fruit Tree Fertilizer

## Recommended Controls
Set these environment variables for the scheduler:

```bash
RUN_ONCE=true
ROWS_PER_RUN=1
ENABLE_PLATFORMS=youtube,instagram
DRY_RUN_LOG_ONLY=false
ALWAYS_GENERATE_NEW_VIDEO=true
```

Use Facebook carefully if the Facebook poster is configured and working:

```bash
ENABLE_PLATFORMS=youtube,instagram,facebook
```

## Why Not Unlimited Generation
Generating too many videos wastes HeyGen/OpenAI cost and can flood platforms with weak repeats. The better system is:

- 4 product families
- 4 angles per product
- 16 total core videos
- Post 5 times/day across platforms
- Review weekly results
- Regenerate only winners with new hooks or visuals

## Keep-Alive Behavior
The scheduler runs the existing pipeline automatically at these times:

- 8:15 AM
- 11:30 AM
- 1:00 PM
- 6:15 PM
- 7:30 PM

If the Google Sheet has unposted rows, it will keep processing them. If the sheet runs out, add new rows using the four product families and angle variations from `weekly-posting-calendar.md`.

## Sheet Setup
Recommended columns:

- Title
- Product Description
- Visual_Prompt
- Website_URL
- Platform
- Posted
- Posted_At
- Video_ID
- Video_URL
- Video_Status

## Landing Page Links
Use these in `Website_URL`:

Dog Urine:
https://natureswaysoil.com/dog-urine-lawn-repair

Hay/Pasture:
https://natureswaysoil.com/hay-pasture-fertilizer

Lawn Fertilizer:
https://natureswaysoil.com/lawn-fertilizer

Fruit Tree:
https://natureswaysoil.com/fruit-tree-fertilizer

## Weekly Review
Every Sunday, review:
- views
- watch time
- clicks
- checkout starts
- purchases

Then make more videos only for the top two product/angle combinations.
