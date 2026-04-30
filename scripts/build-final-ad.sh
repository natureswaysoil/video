#!/bin/bash
set -euo pipefail

PRODUCT_IMAGE="${1:-assets/products/lawn-fertilizer.png}"
OUTPUT_DIR="output"
NORMALIZED_DIR="$OUTPUT_DIR/normalized"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg is not installed."
  echo "Install it with: sudo apt-get update && sudo apt-get install -y ffmpeg"
  exit 1
fi

mkdir -p "$OUTPUT_DIR" "$NORMALIZED_DIR"

for i in 0 1 2 3; do
  if [ ! -f "$OUTPUT_DIR/clip_${i}.mp4" ]; then
    echo "Missing b-roll clip: $OUTPUT_DIR/clip_${i}.mp4"
    echo "Run npm run build:broll first."
    exit 1
  fi

done

if [ ! -f "$PRODUCT_IMAGE" ]; then
  echo "Missing product image: $PRODUCT_IMAGE"
  echo "Use one of these examples:"
  echo "  assets/products/dog-urine.png"
  echo "  assets/products/lawn-fertilizer.png"
  echo "  assets/products/hay-pasture.png"
  echo "  assets/products/fruit-tree.png"
  exit 1
fi

# Normalize each clip individually so concat does not fail on mixed sizes, SAR, or frame rates.
for i in 0 1 2 3; do
  echo "Normalizing clip_${i}.mp4..."
  ffmpeg -y \
    -i "$OUTPUT_DIR/clip_${i}.mp4" \
    -t 4 \
    -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p" \
    -an \
    "$NORMALIZED_DIR/clip_${i}.mp4"
done

cat > "$NORMALIZED_DIR/concat.txt" <<EOF
file 'clip_0.mp4'
file 'clip_1.mp4'
file 'clip_2.mp4'
file 'clip_3.mp4'
EOF

echo "Combining normalized clips..."
ffmpeg -y \
  -f concat \
  -safe 0 \
  -i "$NORMALIZED_DIR/concat.txt" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -r 30 \
  "$OUTPUT_DIR/combined.mp4"

echo "Overlaying product image..."
ffmpeg -y \
  -i "$OUTPUT_DIR/combined.mp4" \
  -i "$PRODUCT_IMAGE" \
  -filter_complex "[1:v]scale=420:-1[prod];[0:v][prod]overlay=W-w-40:H-h-80:format=auto,format=yuv420p" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -r 30 \
  "$OUTPUT_DIR/final_ad.mp4"

echo "Final ad created at $OUTPUT_DIR/final_ad.mp4"
