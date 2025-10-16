#!/bin/bash

# Deploy Blog Automation to Google Cloud
# Runs every 2 days to generate blog articles and videos

set -e

PROJECT_ID="natureswaysoil-video"
REGION="us-east1"
SERVICE_NAME="blog-generator"
SCHEDULER_JOB="blog-generation-every-2-days"

echo "=========================================="
echo "🚀 Deploying Blog Automation System"
echo "=========================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Check if gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Not authenticated with gcloud. Please run: gcloud auth login"
    exit 1
fi

# Set project
gcloud config set project $PROJECT_ID

# Deploy to Cloud Run
echo "📦 Deploying Cloud Run service..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region=$REGION \
  --memory=1Gi \
  --cpu=1 \
  --timeout=540s \
  --max-instances=1 \
  --no-allow-unauthenticated \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest" \
  --set-secrets="WAVE_SPEED_API_KEY=WAVE_SPEED_API_KEY:latest" \
  --set-secrets="WAVESPEED_API_KEY=WAVESPEED_API_KEY:latest" \
  --set-secrets="NEXT_PUBLIC_SUPABASE_URL=NEXT_PUBLIC_SUPABASE_URL:latest" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"

echo "✅ Cloud Run service deployed!"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")
echo "   Service URL: $SERVICE_URL"

# Create service account for Cloud Scheduler if it doesn't exist
SA_NAME="blog-scheduler"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe $SA_EMAIL &>/dev/null; then
    echo ""
    echo "📝 Creating service account for Cloud Scheduler..."
    gcloud iam service-accounts create $SA_NAME \
        --display-name="Blog Generation Scheduler" \
        --description="Service account for triggering blog generation every 2 days"
    
    # Grant Cloud Run Invoker role
    gcloud run services add-iam-policy-binding $SERVICE_NAME \
        --region=$REGION \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="roles/run.invoker"
    
    echo "✅ Service account created and configured"
else
    echo "✅ Service account already exists: $SA_EMAIL"
fi

# Delete existing scheduler job if it exists
if gcloud scheduler jobs describe $SCHEDULER_JOB --location=$REGION &>/dev/null; then
    echo ""
    echo "🗑️  Deleting existing scheduler job..."
    gcloud scheduler jobs delete $SCHEDULER_JOB --location=$REGION --quiet
fi

# Create Cloud Scheduler job (every 2 days at 9 AM)
echo ""
echo "⏰ Creating Cloud Scheduler job (every 2 days at 9 AM)..."
gcloud scheduler jobs create http $SCHEDULER_JOB \
    --location=$REGION \
    --schedule="0 9 */2 * *" \
    --time-zone="America/New_York" \
    --uri="${SERVICE_URL}/generateBlog" \
    --http-method=POST \
    --oidc-service-account-email=$SA_EMAIL \
    --oidc-token-audience=$SERVICE_URL \
    --description="Generate blog article and video every 2 days"

echo "✅ Cloud Scheduler job created!"
echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "📋 Summary:"
echo "   Service URL: $SERVICE_URL"
echo "   Schedule: Every 2 days at 9:00 AM EST"
echo "   Next run: Check with 'gcloud scheduler jobs describe $SCHEDULER_JOB --location=$REGION'"
echo ""
echo "🧪 Test the service manually:"
echo "   gcloud scheduler jobs run $SCHEDULER_JOB --location=$REGION"
echo ""
echo "📊 View logs:"
echo "   gcloud run services logs read $SERVICE_NAME --region=$REGION --limit=50"
echo ""
echo "=========================================="
