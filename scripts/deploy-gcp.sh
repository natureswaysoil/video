#!/usr/bin/env bash
set -euo pipefail

# Usage: PROJECT_ID=natureswaysoil-video REGION=us-east1 TIME_ZONE=America/New_York ./scripts/deploy-gcp.sh

PROJECT_ID=${PROJECT_ID:-natureswaysoil-video}
REGION=${REGION:-us-east1}
TIME_ZONE=${TIME_ZONE:-America/New_York}
REPO_NAME=${REPO_NAME:-natureswaysoil-video}
IMAGE_NAME=${IMAGE_NAME:-app}
JOB_NAME=${JOB_NAME:-natureswaysoil-video-job}
SCHED_NAME=${SCHED_NAME:-natureswaysoil-video-2x}
SA_NAME=${SA_NAME:-video-job-sa}
SCHED_SA_NAME=${SCHED_SA_NAME:-scheduler-invoker}

CSV_URL_DEFAULT="https://docs.google.com/spreadsheets/d/1LU2ahpzMqLB5FLYqiyDbXOfjTxbdp8U8/export?format=csv&gid=1712974299"

echo "Project: $PROJECT_ID | Region: $REGION | Time zone: $TIME_ZONE"

# Ensure gcloud is installed
if ! command -v gcloud >/dev/null 2>&1; then
  echo "Error: gcloud CLI not found. Install the Google Cloud SDK and retry."
  exit 1
fi

# Ensure user is authenticated; if not, prompt for login
ACTIVE_ACCT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" || true)
if [[ -z "$ACTIVE_ACCT" ]]; then
  echo "No active gcloud account detected. Launching 'gcloud auth login'..."
  gcloud auth login || {
    echo "Login failed or aborted. Exiting.";
    exit 1;
  }
fi

gcloud config set project "$PROJECT_ID"

echo "Enabling required services..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com || {
  echo "Enabling services failed. Do you have the right permissions on project $PROJECT_ID?";
  exit 1;
}

echo "Creating Artifact Registry (if not exists)..."
gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" >/dev/null 2>&1 || \
gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location="$REGION" --description="Nature's Way Soil video poster"

IMG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"
echo "Building and pushing image to $IMG ..."
gcloud builds submit --tag "$IMG"

JOB_SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "Creating job service account (if not exists)..."
gcloud iam service-accounts describe "$JOB_SA" >/dev/null 2>&1 || \
gcloud iam service-accounts create "$SA_NAME" --display-name="Nature's Way Video Job SA"

echo "Granting roles to job SA..."
for role in roles/artifactregistry.reader roles/secretmanager.secretAccessor roles/logging.logWriter roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${JOB_SA}" --role="$role" >/dev/null
done

echo "Preparing secret mappings (only secrets with enabled versions will be attached)..."

# Build a comma-separated --set-secrets argument from existing secrets
maybe_secret() {
  local name="$1"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    # Check for at least one ENABLED version
    local v
    v=$(gcloud secrets versions list "$name" --filter="state=ENABLED" --format="value(name)" --limit=1 2>/dev/null || true)
    if [[ -n "$v" ]]; then
      echo -n "${name}=${name}:latest"
    else
      echo "Skipping $name (no enabled versions)" >&2
    fi
  fi
}

SECRETS_LIST=(
  INSTAGRAM_ACCESS_TOKEN
  INSTAGRAM_IG_ID
  TWITTER_BEARER_TOKEN
  TWITTER_API_KEY
  TWITTER_API_SECRET
  TWITTER_ACCESS_TOKEN
  TWITTER_ACCESS_SECRET
  PINTEREST_ACCESS_TOKEN
  PINTEREST_BOARD_ID
  YT_CLIENT_ID
  YT_CLIENT_SECRET
  YT_REFRESH_TOKEN
  HEYGEN_API_KEY
  OPENAI_API_KEY
  GS_SERVICE_ACCOUNT_EMAIL
  GS_SERVICE_ACCOUNT_KEY
)

SECRETS_CLAUSE=""
for s in "${SECRETS_LIST[@]}"; do
  m=$(maybe_secret "$s" || true)
  if [[ -n "$m" ]]; then
    if [[ -z "$SECRETS_CLAUSE" ]]; then
      SECRETS_CLAUSE="$m"
    else
      SECRETS_CLAUSE="$SECRETS_CLAUSE,$m"
    fi
  fi
done

SET_SECRETS_FLAG=()
if [[ -n "$SECRETS_CLAUSE" ]]; then
  SET_SECRETS_FLAG=("--set-secrets=${SECRETS_CLAUSE}")
else
  echo "No attachable secrets (none with enabled versions); proceeding without secrets. Platforms will be skipped unless envs are set elsewhere."
fi

echo "Creating Cloud Run Job (or updating if exists)..."
# Environment variables for HeyGen-based video generation
ENV_VARS="RUN_ONCE=true,CSV_URL=${CSV_URL_DEFAULT},CSV_COL_JOB_ID=ASIN,CSV_COL_DETAILS=Title,HEYGEN_VIDEO_DURATION_SECONDS=30,SHEET_VIDEO_TARGET_COLUMN_LETTER=AB"

if gcloud run jobs describe "$JOB_NAME" --region="$REGION" >/dev/null 2>&1; then
  if ! gcloud run jobs update "$JOB_NAME" \
    --image="$IMG" \
    --region="$REGION" \
    --service-account="$JOB_SA" \
    --task-timeout=3600 \
    --set-env-vars="${ENV_VARS}" \
    "${SET_SECRETS_FLAG[@]}"; then
      echo "Update failed (likely due to stale secret references). Recreating job without secrets..."
      gcloud run jobs delete "$JOB_NAME" --region="$REGION" --quiet || true
      gcloud run jobs create "$JOB_NAME" \
        --image="$IMG" \
        --region="$REGION" \
        --service-account="$JOB_SA" \
        --task-timeout=3600 \
        --set-env-vars="${ENV_VARS}"
  fi
else
  if ! gcloud run jobs create "$JOB_NAME" \
    --image="$IMG" \
    --region="$REGION" \
    --service-account="$JOB_SA" \
    --task-timeout=3600 \
    --set-env-vars="${ENV_VARS}" \
    "${SET_SECRETS_FLAG[@]}"; then
      echo "Create with secrets failed. Retrying without secrets..."
      gcloud run jobs create "$JOB_NAME" \
        --image="$IMG" \
        --region="$REGION" \
        --service-account="$JOB_SA" \
        --task-timeout=3600 \
        --set-env-vars="${ENV_VARS}"
  fi
fi

echo "Creating Scheduler invoker service account (if not exists)..."
SCHED_SA="${SCHED_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$SCHED_SA" >/dev/null 2>&1 || \
gcloud iam service-accounts create "$SCHED_SA_NAME" --display-name="Scheduler Invoker"

echo "Granting invoker roles..."
for role in roles/run.developer roles/iam.serviceAccountTokenCreator; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SCHED_SA}" --role="$role" >/dev/null
done

echo "Creating or updating Cloud Scheduler job ($SCHED_NAME) for 9:00 and 18:00 Eastern..."
SCHED_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run"
if gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$SCHED_NAME" \
    --location="$REGION" \
    --schedule="0 9,18 * * *" \
    --time-zone="$TIME_ZONE" \
    --http-method=POST \
    --uri="$SCHED_URI" \
    --oidc-service-account-email="$SCHED_SA" \
    --oidc-token-audience="https://${REGION}-run.googleapis.com/"
else
  gcloud scheduler jobs create http "$SCHED_NAME" \
    --location="$REGION" \
    --schedule="0 9,18 * * *" \
    --time-zone="$TIME_ZONE" \
    --http-method=POST \
    --uri="$SCHED_URI" \
    --oidc-service-account-email="$SCHED_SA" \
    --oidc-token-audience="https://${REGION}-run.googleapis.com/"
fi

echo "Done. Tip: Share your Google Sheet with ${JOB_SA} as Editor for writeback."
