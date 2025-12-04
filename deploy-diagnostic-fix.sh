#!/usr/bin/env bash
set -euo pipefail

# Deployment Script for Diagnostic Fix (PR #34)
# This script automates the deployment of the enhanced CSV diagnostics to GCP

echo "================================================"
echo "Deploying Diagnostic Fix (PR #34) to GCP"
echo "================================================"
echo ""

# Check if gcloud is installed
if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ Error: gcloud CLI not found"
  echo "   Install: https://cloud.google.com/sdk/install"
  exit 1
fi

# Check authentication
ACTIVE_ACCT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [[ -z "$ACTIVE_ACCT" ]]; then
  echo "❌ Error: Not authenticated with gcloud"
  echo "   Run: gcloud auth login"
  exit 1
fi

echo "✅ Authenticated as: $ACTIVE_ACCT"
echo ""

# Set project
PROJECT_ID=${PROJECT_ID:-natureswaysoil-video}
REGION=${REGION:-us-east1}
TIME_ZONE=${TIME_ZONE:-America/New_York}

echo "📋 Configuration:"
echo "   Project: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Time Zone: $TIME_ZONE"
echo ""

# Confirm deployment
read -p "Deploy to $PROJECT_ID? (yes/no): " -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy][Ee][Ss]$ ]]; then
  echo "Deployment cancelled"
  exit 0
fi

echo ""
echo "🔨 Step 1: Building project..."
npm run typecheck || {
  echo "❌ TypeScript check failed"
  exit 1
}

npm run build || {
  echo "❌ Build failed"
  exit 1
}
echo "✅ Build successful"
echo ""

echo "🚀 Step 2: Running GCP deployment script..."
./scripts/deploy-gcp.sh || {
  echo "❌ Deployment failed"
  exit 1
}
echo "✅ Deployment successful"
echo ""

echo "🔍 Step 3: Verifying deployment..."
JOB_NAME=${JOB_NAME:-natureswaysoil-video-job}

# Check job exists
if gcloud run jobs describe "$JOB_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "✅ Cloud Run Job exists"
  
  # Get image
  IMAGE=$(gcloud run jobs describe "$JOB_NAME" --region="$REGION" --format="value(spec.template.spec.containers[0].image)")
  echo "   Image: $IMAGE"
else
  echo "⚠️  Warning: Could not verify job"
fi

# Check scheduler
SCHED_NAME=${SCHED_NAME:-natureswaysoil-video-2x}
if gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" >/dev/null 2>&1; then
  echo "✅ Cloud Scheduler configured"
  
  # Get schedule
  SCHEDULE=$(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(schedule)")
  echo "   Schedule: $SCHEDULE ($TIME_ZONE)"
else
  echo "⚠️  Warning: Could not verify scheduler"
fi

echo ""
echo "================================================"
echo "✅ Deployment Complete!"
echo "================================================"
echo ""
echo "📊 What's New in This Deployment:"
echo "   • Enhanced diagnostics when no valid products found"
echo "   • Detailed skip reason counts (noJobId, alreadyPosted, notReady)"
echo "   • Sample rows showing why they were skipped"
echo "   • Configuration hints for troubleshooting"
echo "   • Available CSV column names in logs"
echo ""
echo "🧪 Testing the Fix:"
echo "   1. Manual execution:"
echo "      gcloud run jobs execute $JOB_NAME --region=$REGION"
echo ""
echo "   2. View logs:"
echo "      gcloud run jobs executions logs read --job=$JOB_NAME --region=$REGION --limit=100"
echo ""
echo "   3. Trigger scheduler:"
echo "      gcloud scheduler jobs run $SCHED_NAME --location=$REGION"
echo ""
echo "📖 Documentation:"
echo "   • Full guide: DEPLOY_FIX_GUIDE.md"
echo "   • Operations: OPERATIONS_RUNBOOK.md"
echo "   • Troubleshooting: TROUBLESHOOTING_NO_POSTS.md"
echo ""
echo "🔙 Rollback (if needed):"
echo "   See ROLLBACK.md for instructions"
echo ""
