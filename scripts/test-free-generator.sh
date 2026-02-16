#!/bin/bash
set -e

echo "🧪 Testing Free Video Generator"
echo "==============================="
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check required environment variables
echo "Checking configuration..."
MISSING=""

if [ -z "$USE_FREE_VIDEO_GENERATOR" ]; then
    MISSING="${MISSING}\n- USE_FREE_VIDEO_GENERATOR"
fi

if [ -z "$PEXELS_API_KEY" ]; then
    MISSING="${MISSING}\n- PEXELS_API_KEY"
fi

if [ -z "$GCS_BUCKET_NAME" ]; then
    MISSING="${MISSING}\n- GCS_BUCKET_NAME"
fi

if [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    MISSING="${MISSING}\n- GOOGLE_APPLICATION_CREDENTIALS"
fi

if [ ! -z "$MISSING" ]; then
    echo "❌ Missing required environment variables:"
    echo -e "$MISSING"
    echo ""
    echo "Run: ./scripts/setup-free-video-generator.sh"
    exit 1
fi

echo "✅ All required environment variables set"
echo ""

# Test Pexels API
echo "Testing Pexels API..."
PEXELS_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: $PEXELS_API_KEY" \
    "https://api.pexels.com/videos/search?query=garden&per_page=1")

if [ "$PEXELS_TEST" = "200" ]; then
    echo "✅ Pexels API working"
else
    echo "❌ Pexels API failed (HTTP $PEXELS_TEST)"
    exit 1
fi

# Test GCS bucket
echo "Testing GCS bucket..."
if gcloud storage ls "gs://$GCS_BUCKET_NAME" &> /dev/null; then
    echo "✅ GCS bucket accessible"
else
    echo "❌ GCS bucket not accessible"
    echo "Run: gcloud auth activate-service-account --key-file=$GOOGLE_APPLICATION_CREDENTIALS"
    exit 1
fi

# Test service account permissions
echo "Testing GCS write permissions..."
TEST_FILE="/tmp/test-$(date +%s).txt"
echo "test" > "$TEST_FILE"
if gcloud storage cp "$TEST_FILE" "gs://$GCS_BUCKET_NAME/test.txt" &> /dev/null; then
    echo "✅ GCS write permissions OK"
    gcloud storage rm "gs://$GCS_BUCKET_NAME/test.txt" &> /dev/null || true
else
    echo "❌ No write permission to GCS bucket"
    exit 1
fi
rm -f "$TEST_FILE"

# Check if Python dependencies are installed
echo "Checking Python dependencies..."
if command -v python3 &> /dev/null; then
    echo "✅ Python 3 found"
    
    # Check for required packages
    python3 -c "import moviepy" 2>/dev/null && echo "✅ moviepy installed" || echo "⚠️  moviepy not installed"
    python3 -c "import gtts" 2>/dev/null && echo "✅ gTTS installed" || echo "⚠️  gTTS not installed"
    python3 -c "from PIL import Image" 2>/dev/null && echo "✅ Pillow installed" || echo "⚠️  Pillow not installed"
else
    echo "⚠️  Python 3 not found"
fi

echo ""
echo "🎉 All tests passed!"
echo ""
echo "Ready to generate videos with the free generator."
echo ""
echo "To generate a test video, run:"
echo "  npm run dev"