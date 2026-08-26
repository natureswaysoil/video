#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-natureswaysoil-video}"
REGION="${QBO_REGION:-us-east1}"
SERVICE="${QBO_SERVICE_NAME:-natureswaysoil-quickbooks}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE}"

cd "$(dirname "$0")"

gcloud config set project "$PROJECT_ID"
gcloud builds submit --tag "$IMAGE" .
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "QBO_ENV=${QBO_ENV:-sandbox},QBO_WRITE_ENABLED=false,GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "Cloud Run URL: $URL"
echo "Set your Intuit redirect URI to: $URL/oauth/callback"
echo "Then configure QBO_CLIENT_ID, QBO_CLIENT_SECRET, and QBO_REDIRECT_URI for the Cloud Run service."
