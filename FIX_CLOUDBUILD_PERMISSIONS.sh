#!/bin/bash

PROJECT_ID="amazon-ppc-474902"
SERVICE_ACCOUNT="video-job-sa@amazon-ppc-474902.iam.gserviceaccount.com"

echo "=========================================="
echo "🔧 Fixing Cloud Build Permissions"
echo "=========================================="
echo ""

# Grant Cloud Build Service Account User role
echo "📝 Granting Cloud Build Service Account User role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/cloudbuild.builds.builder" \
    --condition=None

# Grant Storage Admin for Cloud Build bucket
echo "📝 Granting Storage Admin role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/storage.admin" \
    --condition=None

# Grant Service Usage Admin
echo "📝 Granting Service Usage Admin role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/serviceusage.serviceUsageAdmin" \
    --condition=None

echo ""
echo "✅ Additional permissions granted!"
echo ""
echo "⏳ Waiting 30 seconds for IAM propagation..."
sleep 30
echo "✅ Ready to retry deployment"
