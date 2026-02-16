#!/bin/bash
set -e

echo "🎬 Nature's Way Soil - Free Video Generator Setup"
echo "================================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env from template${NC}"
    else
        touch .env
        echo -e "${GREEN}✅ Created empty .env${NC}"
    fi
fi

# Function to update or add env var
update_env_var() {
    local key=$1
    local value=$2
    local file=".env"
    
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        # Update existing
        if [[ "$OSTYPE" == "darwin'*" ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        fi
    else
        # Add new
        echo "${key}=${value}" >> "$file"
    fi
}

echo ""
echo "📝 Step 1: Configure Environment Variables"
echo "=========================================="

# Pexels API Key
echo ""
echo -e "${YELLOW}Pexels API Key${NC}"
echo "Get your free API key at: https://www.pexels.com/api/"
read -p "Enter your Pexels API key: " PEXELS_KEY
if [ -z "$PEXELS_KEY" ]; then
    echo -e "${RED}❌ Pexels API key is required${NC}"
    exit 1
fi
update_env_var "PEXELS_API_KEY" "$PEXELS_KEY"
echo -e "${GREEN}✅ Pexels API key saved${NC}"

# GCS Bucket Name
echo ""
echo -e "${YELLOW}Google Cloud Storage Bucket${NC}"
read -p "Enter GCS bucket name [natureswaysoil-videos]: " GCS_BUCKET
GCS_BUCKET=${GCS_BUCKET:-natureswaysoil-videos}
update_env_var "GCS_BUCKET_NAME" "$GCS_BUCKET"
echo -e "${GREEN}✅ GCS bucket name saved${NC}"

# Service Account Key Path
echo ""
echo -e "${YELLOW}Google Cloud Service Account${NC}"
echo "You need a service account JSON key file"
echo "Default location: ./gcp-service-account-key.json"
read -p "Enter path to service account key [./gcp-service-account-key.json]: " SA_KEY_PATH
SA_KEY_PATH=${SA_KEY_PATH:-./gcp-service-account-key.json}

if [ ! -f "$SA_KEY_PATH" ]; then
    echo -e "${RED}❌ Service account key not found at: $SA_KEY_PATH${NC}"
echo ""
echo "To create one:"
echo "1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts"
echo "2. Select your project"
echo "3. Click 'Create Service Account'"
echo "4. Grant 'Storage Object Creator' role"
echo "5. Create and download JSON key"
echo "6. Save it to: $SA_KEY_PATH"
echo ""
read -p "Press Enter when you've placed the key file, or Ctrl+C to exit..."
    
    if [ ! -f "$SA_KEY_PATH" ]; then
        echo -e "${RED}❌ Still not found. Exiting.${NC}"
        exit 1
    fi
fi

chmod 600 "$SA_KEY_PATH"
update_env_var "GOOGLE_APPLICATION_CREDENTIALS" "$SA_KEY_PATH"
echo -e "${GREEN}✅ Service account key configured${NC}"

# Enable free video generator
update_env_var "USE_FREE_VIDEO_GENERATOR" "true"
echo -e "${GREEN}✅ Free video generator ENABLED${NC}"

# Optional: ElevenLabs
echo ""
echo -e "${YELLOW}ElevenLabs API (Optional - for better voice quality)${NC}"
read -p "Do you have an ElevenLabs API key? (y/n): " HAS_ELEVENLABS
if [ "$HAS_ELEVENLABS" = "y" ]; then
    read -p "Enter ElevenLabs API key: " ELEVENLABS_KEY
    if [ ! -z "$ELEVENLABS_KEY" ]; then
        update_env_var "ELEVENLABS_API_KEY" "$ELEVENLABS_KEY"
        echo -e "${GREEN}✅ ElevenLabs API key saved${NC}"
    fi
fi

echo ""
echo "☁️  Step 2: Setup Google Cloud Storage Bucket"
echo "============================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${YELLOW}⚠️  gcloud CLI not found${NC}"
echo "Install from: https://cloud.google.com/sdk/docs/install"
echo ""
read -p "Skip GCS bucket creation? (y/n): " SKIP_GCS
if [ "$SKIP_GCS" != "y" ]; then
        exit 1
    fi
else
    # Authenticate with service account
    echo "Authenticating with service account..."
    gcloud auth activate-service-account --key-file="$SA_KEY_PATH" || {
        echo -e "${YELLOW}⚠️  Could not authenticate. Continuing anyway...${NC}"
    }
    
    # Check if bucket exists
    if gcloud storage buckets describe "gs://$GCS_BUCKET" &> /dev/null; then
        echo -e "${GREEN}✅ Bucket gs://$GCS_BUCKET already exists${NC}"
    else
        echo "Creating bucket gs://$GCS_BUCKET..."
        read -p "Choose region [us-east1]: " GCS_REGION
        GCS_REGION=${GCS_REGION:-us-east1}
        
gcloud storage buckets create "gs://$GCS_BUCKET" \
            --location="$GCS_REGION" \
            --uniform-bucket-level-access || {
            echo -e "${RED}❌ Failed to create bucket${NC}"
            exit 1
        }
        echo -e "${GREEN}✅ Bucket created${NC}"
    fi
    
    # Make bucket public
    echo "Making bucket publicly readable..."
gcloud storage buckets add-iam-policy-binding "gs://$GCS_BUCKET" \
        --member=allUsers \
        --role=roles/storage.objectViewer || {
        echo -e "${YELLOW}⚠️  Could not set public access. You may need to do this manually.${NC}"
    }
echo -e "${GREEN}✅ Bucket configured for public access${NC}"
fi
echo ""
echo "📦 Step 3: Install Dependencies"
echo "================================"

if [ -f package.json ]; then
    echo "Installing Node.js dependencies..."
    npm install
    echo -e "${GREEN}✅ Node.js dependencies installed${NC}"
fi

echo ""
echo "🔍 Step 4: Verify Setup"
echo "======================="

echo ""
echo "Environment variables:"
grep -E "(USE_FREE_VIDEO_GENERATOR|PEXELS_API_KEY|GCS_BUCKET_NAME|GOOGLE_APPLICATION_CREDENTIALS)" .env | sed 's/=.*/=***/' || true
echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Test the generator:"
echo "   npm run test:moviepy"
echo ""
echo "2. Run video generation:"
echo "   npm run dev"
echo ""
echo "3. Deploy to Cloud Run:"
echo "   ./scripts/deploy-gcp.sh"
echo ""
echo "Documentation:"
echo "- Free generator setup: MOVIEPY_SETUP.md"
echo "- HeyGen setup (paid): HEYGEN_SETUP.md"
echo ""
echo -e "${YELLOW}Note: To switch back to HeyGen, set USE_FREE_VIDEO_GENERATOR=false${NC}
