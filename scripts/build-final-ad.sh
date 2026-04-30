#!/bin/bash
set -euo pipefail

PRODUCT_IMAGE="${1:-}"
OUTPUT_DIR="output"
NORMALIZED_DIR="$OUTPUT_DIR/normalized"
HOOK_TEXT="${HOOK_TEXT:-NATURE'S WAY SOIL}"
CTA_TEXT="${CTA_TEXT:-Order Direct at natureswaysoil.com}"

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

if [ -n "$PRODUCT_IMAGE" ] && [ -f "$PRODUCT_IMAGE" ]; then
  echo "Overlaying product image: $PRODUCT_IMAGE"
  ffmpeg -y \
    -i "$OUTPUT_DIR/combined.mp4" \
    -i "$PRODUCT_IMAGE" \
    -filter_complex "[1:v]scale=420:-1[prod];[0:v][prod]overlay=W-w-40:H-h-80:format=auto,drawbox=x=0:y=0:w=iw:h=190:color=black@0.45:t=fill,drawtext=text='$HOOK_TEXT':fontcolor=white:fontsize=58:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:x=(w-text_w)/2:y=60,drawbox=x=0:y=1650:w=iw:h=270:color=black@0.55:t=fill,drawtext=text='$CTA_TEXT':fontcolor=white:fontsize=44:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:x=(w-text_w)/2:y=1740,format=yuv420p" \
    -c:v libx264 \
    -pix_fmt yuv420p \
    -r 30 \
    "$OUTPUT_DIR/final_ad.mp4"
else
  if [ -n "$PRODUCT_IMAGE" ]; then
    echo "Product image not found: $PRODUCT_IMAGE"
    echo "Continuing with text/brand overlay only."
  else
    echo "No product image provided. Creating text/brand overlay only."
  fi

  ffmpeg -y \
    -i "$OUTPUT_DIR/combined.mp4" \
    -vf "drawbox=x=0:y=0:w=iw:h=190:color=black@0.45:t=fill,drawtext=text='$HOOK_TEXT':fontcolor=white:fontsize=58:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:x=(w-text_w)/2:y=60,drawbox=x=0:y=1650:w=iw:h=270:color=black@0.55:t=fill,drawtext=text='$CTA_TEXT':fontcolor=white:fontsize=44:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:x=(w-text_w)/2:y=1740,format=yuv420p" \
    -c:v libx264 \
    -pix_fmt yuv420p \
    -r 30 \
    "$OUTPUT_DIR/final_ad.mp4"
fi

echo "Final ad created at $OUTPUT_DIR/final_ad.mp4"
