# Liquid Bone Meal: approved video upload and publication gate

Approved source: `Natures_Way_Soil_Liquid_Bone_Meal_29_99_Final.mp4` (owner's VEED edit plus genuine 32 fl oz / $29.99 label end card).
Do not substitute an AI-generated product bottle or automatically re-render this file.

## 1. Upload the actual MP4

1. Download the finished MP4 from the ChatGPT conversation to your computer.
2. Open **Google Cloud Console > Cloud Storage > Buckets > natureswaysoil-social-videos** in the `natureswaysoil-video` project.
3. Create/open the folder `campaigns/liquid-bone-meal/`.
4. Upload the MP4 as `campaigns/liquid-bone-meal/Natures_Way_Soil_Liquid_Bone_Meal_29_99_Final.mp4`.
5. Verify bucket object size is nonzero and note the generation number, and do not set public ACLs just to make the object accessible.

Expected object URI:
`gs://natureswaysoil-social-videos/campaigns/liquid-bone-meal/Natures_Way_Soil_Liquid_Bone_Meal_29_99_Final.mp4`

## 2. Publishing gate

Before enabling publication:
- Merge and verify this campaign's PR.
- Review the exact uploaded asset (30-second vertical MP4, actual label, $29.99).
- Confirm the web product price is also $29.99 or resolve the discrepancy before sending traffic.
- Review existing video posts and platform IDs to avoid duplicates.
- Ensure the publication step uses **the uploaded MP4 object** and not the normal `post:sheet-row` render pipeline. At present the workflow renders a different video.
- Record results for **each** Facebook, Instagram, YouTube target; handle partial successes without retrying successful destinations.

**Do not change launch.json or manually rerun soil-first-launch.yml to publish Liquid Bone Meal** until the upload and exact-asset publishing adapter are verified. Its current action is NOT wired to this MP4.
