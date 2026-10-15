# Soil-first three-channel campaign

Authorized for launch by the owner on October 15, 2026.

`v01.json` supplies a 30-second video, five scene briefs, and separate Facebook, Instagram and YouTube captions. The matching launch workflow renders on the campaign branch without publishing, then renders and publishes to these three channels when `launch.json` reaches main. It adds no recurring schedule. Do not modify the launch marker or rerun a successful production run: that would publish again.

The workflow uses the existing production Google Cloud secrets, B-roll renderer, OpenAI narration and publishing integrations. All three platform results are mandatory. The dedicated deeper voice is onyx. The existing daily product schedule remains separate and unchanged.

The end card uses the generated Start with the soil brand graphic from this conversation, stored as `assets/products/NWS_023.jpg` for the existing asset resolver. It is illustrative brand artwork, not a product packaging photograph. The website packaging illustration has a weight typo and obscured text, so it was excluded. The product destination is preserved through the campaign adapter.

Validate the branch render before merge. Each run uploads the rendered output as the soil-first-video artifact; production logs and step summary record per-platform results. If publishing partially fails, inspect successful IDs before retrying to avoid duplicate posts.

Source: user-supplied creative kit and transcript; product identity from https://www.natureswaysoil.com/product/NWS_023. No testimonial, price, coupon or numerical performance claim is included.
