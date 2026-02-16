#!/bin/bash

echo "🎬 Video Generator Configuration Status"
echo "========================================"
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check which generator is active
if [ "$USE_FREE_VIDEO_GENERATOR" = "true" ]; then
    echo "✅ ACTIVE: Free Video Generator (MoviePy + Pexels + gTTS)"
    echo "   Cost: ~$7/month (GCS storage only)"
echo ""
    
echo "Configuration:"
echo "  📹 Pexels API: $([ ! -z "$PEXELS_API_KEY" ] && echo "✅ Configured" || echo "❌ Missing")"
echo "  ☁️  GCS Bucket: $([ ! -z "$GCS_BUCKET_NAME" ] && echo "✅ $GCS_BUCKET_NAME" || echo "❌ Missing")"
echo "  🔑 GCS Credentials: $([ ! -z "$GOOGLE_APPLICATION_CREDENTIALS" ] && echo "✅ Configured" || echo "❌ Missing")"
echo "  🎤 ElevenLabs: $([ ! -z "$ELEVENLABS_API_KEY" ] && echo "✅ Configured (premium voice)" || echo "⚪ Not set (using gTTS)")"
    
else
    echo "✅ ACTIVE: HeyGen Video Generator"
    echo "   Cost: $29-89/month subscription"
echo ""
    
echo "Configuration:"
echo "  🔑 HeyGen API Key: $([ ! -z "$HEYGEN_API_KEY" ] && echo "✅ Configured" || echo "❌ Missing")"
echo "  👤 HeyGen User ID: $([ ! -z "$HEYGEN_USER_ID" ] && echo "✅ Configured" || echo "❌ Missing")"
echo "  🎭 Default Avatar: $([ ! -z "$HEYGEN_DEFAULT_AVATAR" ] && echo "✅ $HEYGEN_DEFAULT_AVATAR" || echo "⚪ Using system default")"
echo "  🎤 Default Voice: $([ ! -z "$HEYGEN_DEFAULT_VOICE" ] && echo "✅ $HEYGEN_DEFAULT_VOICE" || echo "⚪ Using system default")"
fi
echo ""
echo "To switch generators:"
echo "  Free: export USE_FREE_VIDEO_GENERATOR=true"
echo "  HeyGen: export USE_FREE_VIDEO_GENERATOR=false"
echo ""
echo "Setup scripts:"
echo "  ./scripts/setup-free-video-generator.sh - Configure free generator"
echo "  ./scripts/test-free-generator.sh - Test free generator setup"