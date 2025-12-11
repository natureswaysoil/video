# Cloud Run Job Quick Reference

This document provides exact gcloud commands for creating, updating, and running the Cloud Run Job, as well as setting up the Cloud Scheduler.

## Prerequisites

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-east1
export IMAGE=us-east1-docker.pkg.dev/${PROJECT_ID}/video-repo/app:latest
export JOB_NAME=video-job
export SERVICE_ACCOUNT=video-job-sa@${PROJECT_ID}.iam.gserviceaccount.com
```

## Create Cloud Run Job

### Option 1: Using gcloud CLI (Recommended)

```bash
# Create the job with all configuration
gcloud run jobs create ${JOB_NAME} \
  --image=${IMAGE} \
  --region=${REGION} \
  --service-account=${SERVICE_ACCOUNT} \
  --task-timeout=3600 \
  --max-retries=0 \
  --set-env-vars="RUN_ONCE=true,CSV_URL=https://docs.google.com/.../export?format=csv" \
  --set-secrets=HEYGEN_API_KEY=HEYGEN_API_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,GS_SERVICE_ACCOUNT_EMAIL=GS_SERVICE_ACCOUNT_EMAIL:latest,GS_SERVICE_ACCOUNT_KEY=GS_SERVICE_ACCOUNT_KEY:latest
```

### Option 2: Using YAML manifest

```bash
# Apply the YAML configuration (after editing with your values)
gcloud run jobs replace infra/cloud-run-job.yaml --region=${REGION}
```

## Update Cloud Run Job

```bash
# Update image (after rebuilding)
gcloud run jobs update ${JOB_NAME} \
  --image=${IMAGE} \
  --region=${REGION}

# Update environment variables
gcloud run jobs update ${JOB_NAME} \
  --region=${REGION} \
  --update-env-vars="CSV_URL=https://new-url/export?format=csv"

# Update timeout
gcloud run jobs update ${JOB_NAME} \
  --region=${REGION} \
  --task-timeout=7200

# Complete update with all settings
gcloud run jobs update ${JOB_NAME} \
  --image=${IMAGE} \
  --region=${REGION} \
  --service-account=${SERVICE_ACCOUNT} \
  --task-timeout=3600 \
  --set-env-vars="RUN_ONCE=true,CSV_URL=https://docs.google.com/.../export?format=csv"
```

## Run Cloud Run Job

```bash
# Execute job immediately (wait for completion)
gcloud run jobs execute ${JOB_NAME} \
  --region=${REGION} \
  --wait

# Execute job without waiting (returns execution ID)
gcloud run jobs execute ${JOB_NAME} \
  --region=${REGION}

# Execute and capture execution name
EXECUTION=$(gcloud run jobs execute ${JOB_NAME} \
  --region=${REGION} \
  --format="value(metadata.name)")
echo "Execution: ${EXECUTION}"
```

## Cloud Scheduler Setup

### Create Scheduler Invoker Service Account

```bash
export SCHEDULER_SA=scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com

# Create service account
gcloud iam service-accounts create scheduler-invoker \
  --display-name="Cloud Scheduler Invoker"

# Grant permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.developer"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/iam.serviceAccountTokenCreator"
```

### Create Cloud Scheduler Job (Twice Daily)

#### Schedule: 00:00 and 12:00 UTC

```bash
gcloud scheduler jobs create http video-job-scheduler \
  --location=${REGION} \
  --schedule="0 0,12 * * *" \
  --time-zone="UTC" \
  --http-method=POST \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --oidc-service-account-email="${SCHEDULER_SA}" \
  --oidc-token-audience="https://${REGION}-run.googleapis.com/"
```

#### Schedule: 9 AM and 6 PM Eastern Time

```bash
gcloud scheduler jobs create http video-job-scheduler \
  --location=${REGION} \
  --schedule="0 9,18 * * *" \
  --time-zone="America/New_York" \
  --http-method=POST \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --oidc-service-account-email="${SCHEDULER_SA}" \
  --oidc-token-audience="https://${REGION}-run.googleapis.com/"
```

### Update Cloud Scheduler

```bash
# Update schedule
gcloud scheduler jobs update http video-job-scheduler \
  --location=${REGION} \
  --schedule="0 0,12 * * *" \
  --time-zone="UTC"

# Pause scheduler
gcloud scheduler jobs pause video-job-scheduler --location=${REGION}

# Resume scheduler
gcloud scheduler jobs resume video-job-scheduler --location=${REGION}

# Trigger manually
gcloud scheduler jobs run video-job-scheduler --location=${REGION}
```

## Monitoring Commands

### View Logs

```bash
# Latest execution logs
gcloud run jobs executions logs read \
  --job=${JOB_NAME} \
  --region=${REGION} \
  --limit=100

# Specific execution logs
gcloud run jobs executions logs read \
  --execution=${EXECUTION_NAME} \
  --region=${REGION}

# Stream logs in real-time
gcloud alpha run jobs executions logs tail \
  --job=${JOB_NAME} \
  --region=${REGION}
```

### Check Status

```bash
# Job configuration
gcloud run jobs describe ${JOB_NAME} --region=${REGION}

# List recent executions
gcloud run jobs executions list \
  --job=${JOB_NAME} \
  --region=${REGION} \
  --limit=10

# Check latest execution status
gcloud run jobs executions list \
  --job=${JOB_NAME} \
  --region=${REGION} \
  --limit=1 \
  --format="table(name,status.completionTime,status.conditions[0].type,status.conditions[0].status)"

# Scheduler status
gcloud scheduler jobs describe video-job-scheduler --location=${REGION}
```

## Complete Setup Script

Here's a complete script to set up everything from scratch:

```bash
#!/bin/bash
set -euo pipefail

# Configuration
export PROJECT_ID=your-gcp-project-id
export REGION=us-east1
export JOB_NAME=video-job
export SCHEDULER_NAME=video-job-scheduler
export REPO_NAME=video-repo
export IMAGE_NAME=app
export CSV_URL="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv"

# Set project
gcloud config set project ${PROJECT_ID}

# Enable APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create Artifact Registry
gcloud artifacts repositories create ${REPO_NAME} \
  --repository-format=docker \
  --location=${REGION} \
  --description="Video automation container images" \
  || echo "Repository already exists"

# Build and push image
IMAGE=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest
gcloud builds submit --tag ${IMAGE}

# Create job service account
export JOB_SA=video-job-sa@${PROJECT_ID}.iam.gserviceaccount.com
gcloud iam service-accounts create video-job-sa \
  --display-name="Video Job Service Account" \
  || echo "Service account already exists"

# Grant roles to job service account
for ROLE in roles/artifactregistry.reader roles/secretmanager.secretAccessor roles/logging.logWriter roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${JOB_SA}" \
    --role="${ROLE}"
done

# Create Cloud Run Job
gcloud run jobs create ${JOB_NAME} \
  --image=${IMAGE} \
  --region=${REGION} \
  --service-account=${JOB_SA} \
  --task-timeout=3600 \
  --max-retries=0 \
  --set-env-vars="RUN_ONCE=true,CSV_URL=${CSV_URL}" \
  --set-secrets=HEYGEN_API_KEY=HEYGEN_API_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest

# Create scheduler service account
export SCHEDULER_SA=scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com
gcloud iam service-accounts create scheduler-invoker \
  --display-name="Scheduler Invoker" \
  || echo "Service account already exists"

# Grant roles to scheduler service account
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.developer"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/iam.serviceAccountTokenCreator"

# Create scheduler (twice daily at 00:00 and 12:00 UTC)
gcloud scheduler jobs create http ${SCHEDULER_NAME} \
  --location=${REGION} \
  --schedule="0 0,12 * * *" \
  --time-zone="UTC" \
  --http-method=POST \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --oidc-service-account-email="${SCHEDULER_SA}" \
  --oidc-token-audience="https://${REGION}-run.googleapis.com/"

echo "✅ Setup complete!"
echo "Test execution: gcloud run jobs execute ${JOB_NAME} --region=${REGION} --wait"
```

## Required IAM Permissions

Your GCP user account needs these roles to deploy:

```bash
# Check your permissions
gcloud projects get-iam-policy ${PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.members:user:YOUR_EMAIL"

# Required roles (one of):
# - roles/owner
# - roles/editor
# Or these specific roles:
# - roles/run.admin
# - roles/iam.serviceAccountAdmin
# - roles/cloudscheduler.admin
# - roles/artifactregistry.admin
# - roles/cloudbuild.builds.editor
```

## Verification Commands

```bash
# Verify job exists
gcloud run jobs describe ${JOB_NAME} --region=${REGION}

# Verify scheduler exists and is enabled
gcloud scheduler jobs describe ${SCHEDULER_NAME} --location=${REGION} \
  --format="value(state)"

# Test manual execution
gcloud run jobs execute ${JOB_NAME} --region=${REGION} --wait

# Check logs
gcloud run jobs executions logs read \
  --job=${JOB_NAME} \
  --region=${REGION} \
  --limit=50
```

## Cleanup Commands

```bash
# Delete scheduler
gcloud scheduler jobs delete ${SCHEDULER_NAME} --location=${REGION} --quiet

# Delete job
gcloud run jobs delete ${JOB_NAME} --region=${REGION} --quiet

# Delete service accounts
gcloud iam service-accounts delete ${JOB_SA} --quiet
gcloud iam service-accounts delete ${SCHEDULER_SA} --quiet

# Delete image repository
gcloud artifacts repositories delete ${REPO_NAME} --location=${REGION} --quiet
```

## See Also

- **[README.md](./README.md)** - Complete Cloud Run Job + Scheduler section
- **[GCLOUD_DEPLOYMENT.md](./GCLOUD_DEPLOYMENT.md)** - Comprehensive deployment guide
- **[scripts/deploy-gcp.sh](./scripts/deploy-gcp.sh)** - Automated deployment script
- **[infra/cloud-run-job.yaml](./infra/cloud-run-job.yaml)** - YAML manifest template
