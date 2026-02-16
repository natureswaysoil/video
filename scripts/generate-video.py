#!/usr/bin/env python3
"""
MoviePy video generator script.
This script is called from TypeScript to generate videos using free tools.
"""
import sys
import json
import os
import tempfile
from pathlib import Path

def main():
    """Main entry point for video generation."""
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: generate-video.py <config-json>"
        }))
        sys.exit(1)
    
    try:
        config = json.loads(sys.argv[1])
        
        # Extract configuration
        video_path = config.get('videoPath')
        audio_path = config.get('audioPath')
        output_path = config.get('outputPath')
        product_title = config.get('productTitle', '')
        
        if not all([video_path, audio_path, output_path]):
            raise ValueError("Missing required paths: videoPath, audioPath, or outputPath")
        
        # Import moviepy only when needed
        from moviepy.editor import VideoFileClip, AudioFileClip, TextClip, CompositeVideoClip
        
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
        
        # Add audio to video
        video = video.set_audio(audio)
        
        # Add text overlay with product title
        if product_title:
            # Create text clip with styling
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
            
            # Composite video with text overlay
            video = CompositeVideoClip([video, txt_clip])
        
        # Export final video
        video.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            fps=30,
            preset='medium',
            logger=None  # Suppress moviepy progress output
        )
        
        # Clean up
        video.close()
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
