#!/usr/bin/env python3
"""
MoviePy video generator script.
This script is called from TypeScript to generate videos using free tools.
"""
import sys
import json
import os

def main():
    """Main entry point for video generation."""
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: generate-video.py <config-file-path>"
        }))
        sys.exit(1)
    
    try:
        # Read configuration from file
        config_path = sys.argv[1]
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Extract configuration
        video_path = config.get('videoPath')
        audio_path = config.get('audioPath')
        output_path = config.get('outputPath')
        product_title = config.get('productTitle', '')
        product_image_path = config.get('productImagePath')
        
        if not all([video_path, audio_path, output_path]):
            raise ValueError("Missing required paths: videoPath, audioPath, or outputPath")
        
        # Import moviepy only when needed
        from moviepy.editor import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip, ImageClip
        
        # Load video and audio
        video = VideoFileClip(video_path)
        audio = AudioFileClip(audio_path)
        
        # Trim or loop video to match audio duration
        audio_duration = audio.duration
        if video.duration < audio_duration:
            # Loop video to match audio
            n_loops = int(audio_duration / video.duration) + 1
            video = video.loop(n=n_loops)
        
        # Trim to exact audio duration
        video = video.subclip(0, audio_duration)
        
        # Handle product image if provided (split-screen layout)
        if product_image_path and os.path.exists(product_image_path):
            try:
                # Save original video dimensions before resizing
                original_video_width = video.w
                original_video_height = video.h
                
                # Load product image
                product_img = ImageClip(product_image_path)
                
                # Resize product image to fit left half (maintain aspect ratio)
                target_height = original_video_height
                product_img = product_img.resize(height=target_height)
                
                # If image is too wide, resize to fit half width
                if product_img.w > original_video_width // 2:
                    product_img = product_img.resize(width=original_video_width // 2)
                
                product_img = product_img.set_position(('left', 'center'))
                product_img = product_img.set_duration(audio_duration)
                
                # Resize stock video to fit right half
                video = video.resize(width=original_video_width // 2)
                video = video.set_position(('right', 'center'))
                
                # Add audio to video
                video = video.set_audio(audio)
                
                # Create base composite with image and video
                clips = [product_img, video]
                
                # Add text overlay with product title at bottom
                if product_title:
                    txt_clip = TextClip(
                        product_title,
                        fontsize=40,
                        color='white',
                        font='Arial',
                        stroke_color='black',
                        stroke_width=2,
                        method='caption',
                        size=(original_video_width - 100, None)  # Full width minus margins
                    )
                    txt_clip = txt_clip.set_position(('center', original_video_height - txt_clip.h - 30)).set_duration(audio_duration)
                    clips.append(txt_clip)
                
                # Composite all clips
                final_video = CompositeVideoClip(clips, size=(original_video_width, original_video_height))
            except Exception as img_error:
                # If image processing fails, fall back to full-width video
                print(f"Warning: Failed to process product image, using fallback: {str(img_error)}", file=sys.stderr)
                video = video.set_audio(audio)
                
                if product_title:
                    txt_clip = TextClip(
                        product_title,
                        fontsize=50,
                        color='white',
                        font='Arial',
                        stroke_color='black',
                        stroke_width=2,
                        method='caption',
                        size=(video.w - 100, None)
                    )
                    txt_clip = txt_clip.set_position(('center', 50)).set_duration(audio_duration)
                    final_video = CompositeVideoClip([video, txt_clip])
                else:
                    final_video = video
        else:
            # No product image - use full-width stock video
            video = video.set_audio(audio)
            
            if product_title:
                txt_clip = TextClip(
                    product_title,
                    fontsize=50,
                    color='white',
                    font='Arial',
                    stroke_color='black',
                    stroke_width=2,
                    method='caption',
                    size=(video.w - 100, None)
                )
                txt_clip = txt_clip.set_position(('center', 50)).set_duration(audio_duration)
                final_video = CompositeVideoClip([video, txt_clip])
            else:
                final_video = video
        
        # Export final video
        final_video.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            fps=30,
            preset='medium',
            logger=None  # Suppress moviepy progress output
        )
        
        # Clean up
        final_video.close()
        audio.close()
        
        print(json.dumps({
            "success": True,
            "outputPath": output_path
        }))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
