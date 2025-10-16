#!/usr/bin/env bash
set -euo pipefail

# Fix the Cloud Scheduler timeout to allow long-running video generation

PROJECT_ID=${PROJECT_ID:-natureswaysoil-video}
REGION=${REGION:-us-east1}
SCHED_NAME=${SCHED_NAME:-natureswaysoil-video-2x}
JOB_NAME=${JOB_NAME:-natureswaysoil-video-job}
TIME_ZONE=${TIME_ZONE:-America/New_York}
SCHED_SA_NAME=${SCHED_SA_NAME:-scheduler-invoker}

echo "Updating Cloud Scheduler job: $SCHED_NAME"
echo "Project: $PROJECT_ID | Region: $REGION"

gcloud config set project "$PROJECT_ID"

SCHED_SA="${SCHED_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SCHED_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run"

echo "Updating scheduler with 30-minute timeout (Cloud Scheduler max)..."
gcloud scheduler jobs update http "$SCHED_NAME" \
  --location="$REGION" \
  --schedule="0 9,18 * * *" \
  --time-zone="$TIME_ZONE" \
  --http-method=POST \
  --uri="$SCHED_URI" \
  --oidc-service-account-email="$SCHED_SA" \
  --oidc-token-audience="https://${REGION}-run.googleapis.com/" \
  --attempt-deadline=1800s

echo ""
echo "✅ Scheduler updated successfully!"
echo ""
echo "New configuration:"
echo "  - Schedule: 9am & 6pm Eastern Time (twice daily)"
echo "  - Attempt Deadline: 1800s (30 minutes - Cloud Scheduler maximum)"
echo "  - WaveSpeed polling: 25 minutes (slightly less to ensure job completes)"
echo ""
echo "Next execution: $(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(scheduleTime)")"
