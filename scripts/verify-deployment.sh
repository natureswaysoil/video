#!/usr/bin/env bash
set -euo pipefail

# Deployment Verification Script
# Checks all aspects of the automated video generation system

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ID=${PROJECT_ID:-""}
REGION=${REGION:-"us-east1"}
JOB_NAME=${JOB_NAME:-"natureswaysoil-video-job"}
SCHED_NAME=${SCHED_NAME:-"natureswaysoil-video-2x"}

if [[ -z "$PROJECT_ID" ]]; then
  echo -e "${RED}Error: PROJECT_ID not set${NC}"
  echo "Usage: PROJECT_ID=your-project-id ./scripts/verify-deployment.sh"
  exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Video Generation System - Deployment Verification   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Job: $JOB_NAME"
echo "Scheduler: $SCHED_NAME"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

check_pass() {
  echo -e "${GREEN}✅ PASS${NC} - $1"
  ((PASS_COUNT++))
}

check_fail() {
  echo -e "${RED}❌ FAIL${NC} - $1"
  ((FAIL_COUNT++))
}

check_warn() {
  echo -e "${YELLOW}⚠️  WARN${NC} - $1"
  ((WARN_COUNT++))
}

echo -e "${BLUE}=== 1. Google Cloud Project Configuration ===${NC}"
echo ""

# Check project exists
if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  check_pass "Project $PROJECT_ID exists and is accessible"
else
  check_fail "Cannot access project $PROJECT_ID"
  exit 1
fi

# Check required APIs
echo ""
echo -e "${BLUE}Checking required APIs...${NC}"
REQUIRED_APIS=(
  "run.googleapis.com"
  "cloudbuild.googleapis.com"
  "artifactregistry.googleapis.com"
  "cloudscheduler.googleapis.com"
  "secretmanager.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
  if gcloud services list --enabled --project="$PROJECT_ID" --filter="name:$api" --format="value(name)" | grep -q "$api"; then
    check_pass "API enabled: $api"
  else
    check_fail "API not enabled: $api"
  fi
done

echo ""
echo -e "${BLUE}=== 2. Cloud Run Job Configuration ===${NC}"
echo ""

# Check job exists
if gcloud run jobs describe "$JOB_NAME" --region="$REGION" >/dev/null 2>&1; then
  check_pass "Cloud Run Job exists: $JOB_NAME"
  
  # Check job configuration
  JOB_IMAGE=$(gcloud run jobs describe "$JOB_NAME" --region="$REGION" --format="value(spec.template.spec.template.spec.containers[0].image)")
  JOB_TIMEOUT=$(gcloud run jobs describe "$JOB_NAME" --region="$REGION" --format="value(spec.template.spec.template.spec.timeoutSeconds)")
  JOB_SA=$(gcloud run jobs describe "$JOB_NAME" --region="$REGION" --format="value(spec.template.spec.template.spec.serviceAccountName)")
  
  echo ""
  echo "  Image: $JOB_IMAGE"
  echo "  Timeout: $JOB_TIMEOUT seconds"
  echo "  Service Account: $JOB_SA"
  echo ""
  
  # Check timeout is adequate (should be 3600 seconds = 60 minutes)
  if [[ "$JOB_TIMEOUT" -ge 3600 ]]; then
    check_pass "Job timeout is adequate: ${JOB_TIMEOUT}s (60 min)"
  elif [[ "$JOB_TIMEOUT" -ge 1800 ]]; then
    check_warn "Job timeout is marginal: ${JOB_TIMEOUT}s (may timeout during video generation)"
  else
    check_fail "Job timeout is too short: ${JOB_TIMEOUT}s (need 3600s minimum)"
  fi
  
  # Check service account
  if [[ -n "$JOB_SA" ]]; then
    check_pass "Service account configured: $JOB_SA"
  else
    check_warn "No custom service account (using default)"
  fi
else
  check_fail "Cloud Run Job not found: $JOB_NAME"
fi

echo ""
echo -e "${BLUE}=== 3. Cloud Scheduler Configuration ===${NC}"
echo ""

# Check scheduler exists
if gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" >/dev/null 2>&1; then
  check_pass "Cloud Scheduler job exists: $SCHED_NAME"
  
  # Check scheduler configuration
  SCHED_STATUS=$(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(state)")
  SCHED_SCHEDULE=$(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(schedule)")
  SCHED_TZ=$(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(timeZone)")
  SCHED_NEXT=$(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(scheduleTime)" 2>/dev/null || echo "Not scheduled")
  
  echo ""
  echo "  Status: $SCHED_STATUS"
  echo "  Schedule: $SCHED_SCHEDULE ($SCHED_TZ)"
  echo "  Next run: $SCHED_NEXT"
  echo ""
  
  if [[ "$SCHED_STATUS" == "ENABLED" ]]; then
    check_pass "Scheduler is enabled"
  else
    check_fail "Scheduler is not enabled: $SCHED_STATUS"
  fi
  
  # Check schedule is twice daily
  if [[ "$SCHED_SCHEDULE" == "0 9,18 * * *" ]]; then
    check_pass "Schedule is correct: 9 AM and 6 PM daily"
  else
    check_warn "Schedule differs from expected: $SCHED_SCHEDULE"
  fi
  
  # Check timezone
  if [[ "$SCHED_TZ" == "America/New_York" ]]; then
    check_pass "Timezone is Eastern Time"
  else
    check_warn "Timezone is not Eastern Time: $SCHED_TZ"
  fi
else
  check_fail "Cloud Scheduler job not found: $SCHED_NAME"
fi

echo ""
echo -e "${BLUE}=== 4. Secrets Configuration ===${NC}"
echo ""

# Check required secrets
REQUIRED_SECRETS=(
  "HEYGEN_API_KEY"
  "OPENAI_API_KEY"
)

OPTIONAL_SECRETS=(
  "INSTAGRAM_ACCESS_TOKEN"
  "INSTAGRAM_IG_ID"
  "TWITTER_API_KEY"
  "TWITTER_API_SECRET"
  "TWITTER_ACCESS_TOKEN"
  "TWITTER_ACCESS_SECRET"
  "PINTEREST_ACCESS_TOKEN"
  "PINTEREST_BOARD_ID"
  "YT_CLIENT_ID"
  "YT_CLIENT_SECRET"
  "YT_REFRESH_TOKEN"
  "GS_SERVICE_ACCOUNT_EMAIL"
  "GS_SERVICE_ACCOUNT_KEY"
)

echo "Checking required secrets..."
for secret in "${REQUIRED_SECRETS[@]}"; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    # Check for enabled version
    VERSION=$(gcloud secrets versions list "$secret" --filter="state=ENABLED" --format="value(name)" --limit=1 2>/dev/null || echo "")
    if [[ -n "$VERSION" ]]; then
      check_pass "Secret exists with enabled version: $secret"
    else
      check_fail "Secret exists but no enabled version: $secret"
    fi
  else
    check_fail "Required secret missing: $secret"
  fi
done

echo ""
echo "Checking optional secrets..."
OPTIONAL_PRESENT=0
for secret in "${OPTIONAL_SECRETS[@]}"; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    VERSION=$(gcloud secrets versions list "$secret" --filter="state=ENABLED" --format="value(name)" --limit=1 2>/dev/null || echo "")
    if [[ -n "$VERSION" ]]; then
      ((OPTIONAL_PRESENT++))
    fi
  fi
done

if [[ $OPTIONAL_PRESENT -gt 0 ]]; then
  check_pass "$OPTIONAL_PRESENT optional secrets configured"
else
  check_warn "No optional secrets configured (social media posting will be skipped)"
fi

echo ""
echo -e "${BLUE}=== 5. Recent Executions ===${NC}"
echo ""

# Check recent executions
RECENT_EXEC=$(gcloud run jobs executions list \
  --job="$JOB_NAME" \
  --region="$REGION" \
  --limit=1 \
  --format="value(metadata.name,status.completionTime,status.succeededCount,status.failedCount)" 2>/dev/null || echo "")

if [[ -n "$RECENT_EXEC" ]]; then
  EXEC_NAME=$(echo "$RECENT_EXEC" | awk '{print $1}')
  EXEC_TIME=$(echo "$RECENT_EXEC" | awk '{print $2}')
  EXEC_SUCCESS=$(echo "$RECENT_EXEC" | awk '{print $3}')
  EXEC_FAILED=$(echo "$RECENT_EXEC" | awk '{print $4}')
  
  echo "Most recent execution:"
  echo "  Name: $EXEC_NAME"
  echo "  Completed: $EXEC_TIME"
  echo "  Success: $EXEC_SUCCESS"
  echo "  Failed: $EXEC_FAILED"
  echo ""
  
  if [[ "$EXEC_SUCCESS" -gt 0 ]]; then
    check_pass "Recent execution completed successfully"
  elif [[ "$EXEC_FAILED" -gt 0 ]]; then
    check_fail "Recent execution failed"
  else
    check_warn "Recent execution status unclear"
  fi
else
  check_warn "No recent executions found (job may not have run yet)"
fi

echo ""
echo -e "${BLUE}=== 6. Error Logs Check ===${NC}"
echo ""

# Check for recent errors
RECENT_ERRORS=$(gcloud logging read \
  "resource.type=\"cloud_run_job\"
   resource.labels.job_name=\"$JOB_NAME\"
   severity>=ERROR
   timestamp>\"$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%S')\"" \
  --limit=5 \
  --format="value(textPayload)" 2>/dev/null || echo "")

if [[ -z "$RECENT_ERRORS" ]]; then
  check_pass "No errors in last 24 hours"
else
  ERROR_COUNT=$(echo "$RECENT_ERRORS" | wc -l)
  check_warn "$ERROR_COUNT error(s) in last 24 hours"
  echo ""
  echo "Recent errors:"
  echo "$RECENT_ERRORS" | head -3
  if [[ $ERROR_COUNT -gt 3 ]]; then
    echo "... (and $((ERROR_COUNT - 3)) more)"
  fi
fi

echo ""
echo -e "${BLUE}=== 7. Service Account Permissions ===${NC}"
echo ""

if [[ -n "$JOB_SA" ]]; then
  # Check key IAM roles
  ROLES_TO_CHECK=(
    "roles/secretmanager.secretAccessor"
    "roles/logging.logWriter"
  )
  
  for role in "${ROLES_TO_CHECK[@]}"; do
    if gcloud projects get-iam-policy "$PROJECT_ID" \
      --flatten="bindings[].members" \
      --filter="bindings.role:$role AND bindings.members:serviceAccount:$JOB_SA" \
      --format="value(bindings.role)" | grep -q "$role"; then
      check_pass "Service account has role: $role"
    else
      check_warn "Service account missing role: $role"
    fi
  done
else
  check_warn "Cannot check service account permissions (no custom SA configured)"
fi

echo ""
echo -e "${BLUE}=== 8. Artifact Registry ===${NC}"
echo ""

# Check if image exists
if [[ -n "$JOB_IMAGE" ]]; then
  # Extract repository from image
  REPO=$(echo "$JOB_IMAGE" | cut -d'/' -f4)
  
  if gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
    check_pass "Artifact Registry repository exists: $REPO"
    
    # Check if image exists
    if gcloud artifacts docker images list "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}" --filter="package:${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app" --limit=1 >/dev/null 2>&1; then
      check_pass "Docker image exists in registry"
    else
      check_warn "Docker image may not exist in registry"
    fi
  else
    check_fail "Artifact Registry repository not found: $REPO"
  fi
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  Verification Summary                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}✅ Passed: $PASS_COUNT${NC}"
echo -e "  ${YELLOW}⚠️  Warnings: $WARN_COUNT${NC}"
echo -e "  ${RED}❌ Failed: $FAIL_COUNT${NC}"
echo ""

if [[ $FAIL_COUNT -eq 0 ]] && [[ $WARN_COUNT -eq 0 ]]; then
  echo -e "${GREEN}🎉 All checks passed! System is ready for production.${NC}"
  exit 0
elif [[ $FAIL_COUNT -eq 0 ]]; then
  echo -e "${YELLOW}⚠️  System is functional but has warnings. Review recommended.${NC}"
  exit 0
else
  echo -e "${RED}❌ System has failures that need to be addressed.${NC}"
  exit 1
fi
