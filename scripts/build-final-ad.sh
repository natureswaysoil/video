#!/bin/bash

# Combine clips
ffmpeg -y \
  -i output/clip_0.mp4 \
  -i output/clip_1.mp4 \
  -i output/clip_2.mp4 \
  -i output/clip_3.mp4 \
  -filter_complex "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0,scale=1080:1920" \
  -r 30 \
  output/combined.mp4

# Overlay product image (edit filename based on product)
ffmpeg -y \
  -i output/combined.mp4 \
  -i assets/products/lawn-fertilizer.png \
  -filter_complex "[1:v]scale=420:-1[prod];[0:v][prod]overlay=W-w-40:H-h-80" \
  -r 30 \
  output/final_ad.mp4

echo "Final ad created at output/final_ad.mp4"
