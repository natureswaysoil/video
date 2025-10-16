#!/bin/bash
set -e

PROJECT_ID="natureswaysoil-video"

echo "🔐 Adding Supabase secrets to Google Cloud Secret Manager"
echo ""
echo "Please provide your Supabase credentials:"
echo "(Get these from: https://app.supabase.com/project/_/settings/api)"
echo ""

# Read Supabase URL
read -p "Enter SUPABASE_URL (e.g., https://xxxxx.supabase.co): " SUPABASE_URL

# Read Service Role Key (hide input)
read -sp "Enter SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_KEY
echo ""

# Create secrets
echo ""
echo "Creating secrets in Google Cloud..."

echo -n "$SUPABASE_URL" | gcloud secrets create NEXT_PUBLIC_SUPABASE_URL \
  --project="$PROJECT_ID" \
  --data-file=- \
  2>/dev/null || echo -n "$SUPABASE_URL" | gcloud secrets versions add NEXT_PUBLIC_SUPABASE_URL \
  --project="$PROJECT_ID" \
  --data-file=-

echo -n "$SUPABASE_KEY" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY \
  --project="$PROJECT_ID" \
  --data-file=- \
  2>/dev/null || echo -n "$SUPABASE_KEY" | gcloud secrets versions add SUPABASE_SERVICE_ROLE_KEY \
  --project="$PROJECT_ID" \
  --data-file=-

echo ""
echo "✅ Supabase secrets added successfully!"
echo ""
echo "Now you can deploy the blog automation:"
echo "  ./scripts/deploy-blog-automation.sh"
