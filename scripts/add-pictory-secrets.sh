#!/bin/bash
set -e

# Add Pictory secrets to Google Cloud Secret Manager
# Run this script to create/update Pictory API credentials in Secret Manager

echo "🔐 Adding Pictory secrets to Google Cloud Secret Manager"
echo ""

PROJECT_ID="${GCP_PROJECT_ID:-natureswaysoil-video}"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: GCP_PROJECT_ID not set"
  echo "Usage: GCP_PROJECT_ID=your-project-id ./scripts/add-pictory-secrets.sh"
  exit 1
fi

echo "📋 Project: $PROJECT_ID"
echo ""

# Function to create or update a secret
add_or_update_secret() {
  local SECRET_NAME=$1
  local SECRET_VALUE=$2
  
  if [ -z "$SECRET_VALUE" ]; then
    echo "⚠️  Skipping $SECRET_NAME (not provided)"
    return
  fi
  
  # Check if secret exists
  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo "📝 Updating existing secret: $SECRET_NAME"
    echo -n "$SECRET_VALUE" | gcloud secrets versions add "$SECRET_NAME" \
      --project="$PROJECT_ID" \
      --data-file=-
  else
    echo "✨ Creating new secret: $SECRET_NAME"
    echo -n "$SECRET_VALUE" | gcloud secrets create "$SECRET_NAME" \
      --project="$PROJECT_ID" \
      --replication-policy="automatic" \
      --data-file=-
  fi
  echo "✅ $SECRET_NAME configured"
  echo ""
}

# Prompt for Pictory credentials
echo "Enter your Pictory API credentials:"
echo "(Press Enter to skip any secret)"
echo ""

read -p "PICTORY_CLIENT_ID: " PICTORY_CLIENT_ID
read -sp "PICTORY_CLIENT_SECRET: " PICTORY_CLIENT_SECRET
echo ""
read -p "X_PICTORY_USER_ID: " X_PICTORY_USER_ID
echo ""

# Add secrets to Secret Manager
add_or_update_secret "PICTORY_CLIENT_ID" "$PICTORY_CLIENT_ID"
add_or_update_secret "PICTORY_CLIENT_SECRET" "$PICTORY_CLIENT_SECRET"
add_or_update_secret "X_PICTORY_USER_ID" "$X_PICTORY_USER_ID"

echo "✅ Pictory secrets configured successfully!"
echo ""
echo "📝 To use these secrets in your .env file for GCP deployment, add:"
echo "   GCP_SECRET_PICTORY_CLIENT_ID=projects/$PROJECT_ID/secrets/PICTORY_CLIENT_ID/versions/latest"
echo "   GCP_SECRET_PICTORY_CLIENT_SECRET=projects/$PROJECT_ID/secrets/PICTORY_CLIENT_SECRET/versions/latest"
echo "   GCP_SECRET_X_PICTORY_USER_ID=projects/$PROJECT_ID/secrets/X_PICTORY_USER_ID/versions/latest"
echo ""
echo "📝 For Cloud Run deployment, mount these secrets:"
echo "   --set-secrets=PICTORY_CLIENT_ID=PICTORY_CLIENT_ID:latest,\\"
echo "     PICTORY_CLIENT_SECRET=PICTORY_CLIENT_SECRET:latest,\\"
echo "     X_PICTORY_USER_ID=X_PICTORY_USER_ID:latest"
