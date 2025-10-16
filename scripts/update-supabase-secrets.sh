#!/bin/bash

# Update Supabase secrets in Google Cloud Secret Manager
# Run this to fix the blog automation database connection

set -e

PROJECT_ID="natureswaysoil-video"

echo "=========================================="
echo "🔐 Updating Supabase Secrets"
echo "=========================================="
echo "Project: $PROJECT_ID"
echo ""

# Set project
gcloud config set project $PROJECT_ID

# Update NEXT_PUBLIC_SUPABASE_URL
echo "📝 Updating NEXT_PUBLIC_SUPABASE_URL..."
echo -n "https://gixjfavlefeldoostsij.supabase.co" | \
  gcloud secrets versions add NEXT_PUBLIC_SUPABASE_URL --data-file=-

echo "✅ NEXT_PUBLIC_SUPABASE_URL updated!"

# Update SUPABASE_SERVICE_ROLE_KEY
echo ""
echo "📝 Updating SUPABASE_SERVICE_ROLE_KEY..."
echo -n "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeGpmYXZsZWZlbGRvb3N0c2lqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTY0MDI1NywiZXhwIjoyMDcxMjE2MjU3fQ.L0UTWXCJMA1dcacPHkh4_Ow7WQ0_AKXpPry5bcNR4u8" | \
  gcloud secrets versions add SUPABASE_SERVICE_ROLE_KEY --data-file=-

echo "✅ SUPABASE_SERVICE_ROLE_KEY updated!"

echo ""
echo "=========================================="
echo "✅ All secrets updated successfully!"
echo "=========================================="
echo ""
echo "Next step: Redeploy the blog automation service"
echo "Run: ./scripts/deploy-blog-automation.sh"
echo ""
