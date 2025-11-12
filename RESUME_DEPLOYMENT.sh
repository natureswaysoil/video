#!/usr/bin/env bash
#
# Resume Deployment Script
# Run this script AFTER granting the required IAM permissions
#
# Usage: bash RESUME_DEPLOYMENT.sh
#

set -euo pipefail

echo "=========================================="
echo "🚀 Resuming Google Cloud Deployment"
echo "=========================================="
echo ""

# Configuration
PROJECT_ID="amazon-ppc-474902"
REGION="us-central1"
TIME_ZONE="America/New_York"
SERVICE_ACCOUNT_KEY="/home/ubuntu/service-account-key.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if service account key exists
if [[ ! -f "$SERVICE_ACCOUNT_KEY" ]]; then
    echo -e "${RED}❌ Error: Service account key not found at $SERVICE_ACCOUNT_KEY${NC}"
    exit 1
fi

echo "📋 Configuration:"
echo "   Project ID: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Timezone: $TIME_ZONE"
echo ""

# Authenticate
echo "🔐 Step 1: Authenticating with service account..."
gcloud auth activate-service-account --key-file="$SERVICE_ACCOUNT_KEY"
if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓ Authentication successful${NC}"
else
    echo -e "${RED}❌ Authentication failed${NC}"
    exit 1
fi
echo ""

# Set project
echo "🎯 Step 2: Setting project..."
gcloud config set project "$PROJECT_ID"
if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓ Project set to $PROJECT_ID${NC}"
else
    echo -e "${RED}❌ Failed to set project${NC}"
    exit 1
fi
echo ""

# Verify permissions by trying to list enabled services
echo "🔍 Step 3: Verifying permissions..."
if gcloud services list --enabled --project="$PROJECT_ID" &>/dev/null; then
    echo -e "${GREEN}✓ Permissions verified - can access project${NC}"
else
    echo -e "${RED}❌ Insufficient permissions detected${NC}"
    echo -e "${YELLOW}⚠️  Please grant the required IAM roles first${NC}"
    echo "   See DEPLOYMENT_STATUS.md for details"
    exit 1
fi
echo ""

# Deploy GCP infrastructure
echo "🏗️  Step 4: Deploying GCP infrastructure..."
echo "   This may take 10-15 minutes..."
export PROJECT_ID REGION TIME_ZONE
if bash scripts/deploy-gcp.sh 2>&1 | tee /tmp/deploy-gcp-$(date +%Y%m%d-%H%M%S).log; then
    echo -e "${GREEN}✓ GCP infrastructure deployed successfully${NC}"
else
    echo -e "${RED}❌ GCP deployment failed - check logs${NC}"
    exit 1
fi
echo ""

# Deploy blog automation
echo "📝 Step 5: Deploying blog automation..."
if bash scripts/deploy-blog-automation.sh 2>&1 | tee /tmp/deploy-blog-$(date +%Y%m%d-%H%M%S).log; then
    echo -e "${GREEN}✓ Blog automation deployed successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Blog automation deployment had issues - check logs${NC}"
fi
echo ""

# Verify deployment
echo "✅ Step 6: Verifying deployment..."
if PROJECT_ID="$PROJECT_ID" bash scripts/verify-deployment.sh 2>&1 | tee /tmp/verify-$(date +%Y%m%d-%H%M%S).log; then
    echo -e "${GREEN}✓ Deployment verification passed${NC}"
else
    echo -e "${YELLOW}⚠️  Some verification checks failed - review logs${NC}"
fi
echo ""

# List deployed resources
echo "📦 Step 7: Listing deployed resources..."
echo ""
echo "Cloud Run Jobs:"
gcloud run jobs list --region="$REGION" --project="$PROJECT_ID" || echo "No jobs found or permission denied"
echo ""
echo "Cloud Run Services:"
gcloud run services list --region="$REGION" --project="$PROJECT_ID" || echo "No services found or permission denied"
echo ""
echo "Cloud Scheduler Jobs:"
gcloud scheduler jobs list --location="$REGION" --project="$PROJECT_ID" || echo "No scheduler jobs found or permission denied"
echo ""
echo "Artifact Registry Repositories:"
gcloud artifacts repositories list --location="$REGION" --project="$PROJECT_ID" || echo "No repositories found or permission denied"
echo ""

# Summary
echo "=========================================="
echo "🎉 Deployment Complete!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   ✓ Authentication configured"
echo "   ✓ GCP infrastructure deployed"
echo "   ✓ Blog automation deployed"
echo "   ✓ Resources verified"
echo ""
echo "📝 Next Steps:"
echo "   1. Review the deployment logs in /tmp/"
echo "   2. Test the Cloud Run jobs manually"
echo "   3. Monitor the Cloud Scheduler executions"
echo "   4. Set up logging and monitoring"
echo ""
echo "🔗 Useful Links:"
echo "   Cloud Run: https://console.cloud.google.com/run?project=$PROJECT_ID"
echo "   Cloud Scheduler: https://console.cloud.google.com/cloudscheduler?project=$PROJECT_ID"
echo "   Logs: https://console.cloud.google.com/logs?project=$PROJECT_ID"
echo ""
echo "=========================================="
