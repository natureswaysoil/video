#!/usr/bin/env bash
set -euo pipefail

# Deployment Verification Script for Video Generation System
# Verifies that all components are correctly configured for production deployment

PROJECT_ID=${PROJECT_ID:-natureswaysoil-video}
REGION=${REGION:-us-east1}
JOB_NAME=${JOB_NAME:-natureswaysoil-video-job}
SCHED_NAME=${SCHED_NAME:-natureswaysoil-video-2x}

echo "=========================================="
echo "🔍 Video Generation System - Deployment Verification"
echo "=========================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Job Name: $JOB_NAME"
echo "Scheduler: $SCHED_NAME"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0
warn_count=0

check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((pass_count++))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  ((fail_count++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((warn_count++))
}

# Check 1: gcloud authentication
echo "Checking gcloud authentication..."
if gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
  check_pass "gcloud is authenticated"
else
  check_fail "gcloud is not authenticated. Run: gcloud auth login"
  exit 1
fi

# Check 2: Project exists and is set
echo ""
echo "Checking project configuration..."
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [[ "$CURRENT_PROJECT" == "$PROJECT_ID" ]]; then
  check_pass "Project is set correctly: $PROJECT_ID"
else
  check_warn "Current project is '$CURRENT_PROJECT', expected '$PROJECT_ID'"
  gcloud config set project "$PROJECT_ID" 2>/dev/null || true
fi

# Check 3: Required APIs are enabled
echo ""
echo "Checking required Google Cloud APIs..."
REQUIRED_APIS=(
  "run.googleapis.com"
  "artifactregistry.googleapis.com"
  "cloudbuild.googleapis.com"
  "cloudscheduler.googleapis.com"
  "secretmanager.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
  if gcloud services list --enabled --filter="name:$api" --format="value(name)" 2>/dev/null | grep -q "$api"; then
    check_pass "API enabled: $api"
  else
    check_fail "API not enabled: $api (enable with: gcloud services enable $api)"
  fi
done

# Check 4: Required secrets exist
echo ""
echo "Checking required secrets in Secret Manager..."
REQUIRED_SECRETS=(
  "HEYGEN_API_KEY"
  "OPENAI_API_KEY"
  "INSTAGRAM_ACCESS_TOKEN"
  "INSTAGRAM_IG_ID"
  "GS_SERVICE_ACCOUNT_EMAIL"
  "GS_SERVICE_ACCOUNT_KEY"
)

OPTIONAL_SECRETS=(
  "TWITTER_BEARER_TOKEN"
  "TWITTER_API_KEY"
  "TWITTER_API_SECRET"
  "TWITTER_ACCESS_TOKEN"
  "TWITTER_ACCESS_SECRET"
  "PINTEREST_ACCESS_TOKEN"
  "PINTEREST_BOARD_ID"
  "YT_CLIENT_ID"
  "YT_CLIENT_SECRET"
  "YT_REFRESH_TOKEN"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
  if gcloud secrets describe "$secret" >/dev/null 2>&1; then
    # Check for enabled versions
    if gcloud secrets versions list "$secret" --filter="state=ENABLED" --format="value(name)" --limit=1 2>/dev/null | grep -q .; then
      check_pass "Required secret configured: $secret"
    else
      check_fail "Secret exists but has no enabled versions: $secret"
    fi
  else
    check_fail "Required secret missing: $secret"
  fi
done

echo ""
echo "Checking optional secrets (for additional platforms)..."
for secret in "${OPTIONAL_SECRETS[@]}"; do
  if gcloud secrets describe "$secret" >/dev/null 2>&1; then
    if gcloud secrets versions list "$secret" --filter="state=ENABLED" --format="value(name)" --limit=1 2>/dev/null | grep -q .; then
      check_pass "Optional secret configured: $secret"
    else
      check_warn "Secret exists but has no enabled versions: $secret"
    fi
  else
    check_warn "Optional secret not configured: $secret (platform will be skipped)"
  fi
done

# Check 5: Cloud Run Job exists
echo ""
echo "Checking Cloud Run Job deployment..."
if gcloud run jobs describe "$JOB_NAME" --region="$REGION" >/dev/null 2>&1; then
  check_pass "Cloud Run Job exists: $JOB_NAME"
  
  # Get job details
  JOB_IMAGE=$(gcloud run jobs describe "$JOB_NAME" --region="$REGION" --format="value(spec.template.spec.containers[0].image)" 2>/dev/null || echo "unknown")
  echo "  Image: $JOB_IMAGE"
  
  # Check environment variables
  ENV_VARS=$(gcloud run jobs describe "$JOB_NAME" --region="$REGION" --format="yaml(spec.template.spec.containers[0].env)" 2>/dev/null || true)
  if echo "$ENV_VARS" | grep -q "RUN_ONCE"; then
    check_pass "RUN_ONCE environment variable is set"
  else
    check_warn "RUN_ONCE environment variable not found"
  fi
  
  if echo "$ENV_VARS" | grep -q "CSV_URL"; then
    check_pass "CSV_URL environment variable is set"
  else
    check_fail "CSV_URL environment variable not found"
  fi
else
  check_fail "Cloud Run Job does not exist: $JOB_NAME"
  echo "  Deploy with: ./scripts/deploy-gcp.sh"
fi

# Check 6: Cloud Scheduler job exists
echo ""
echo "Checking Cloud Scheduler configuration..."
if gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" >/dev/null 2>&1; then
  check_pass "Scheduler job exists: $SCHED_NAME"
  
  # Get schedule details
  SCHEDULE=$(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(schedule)" 2>/dev/null || echo "unknown")
  TIMEZONE=$(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(timeZone)" 2>/dev/null || echo "unknown")
  STATE=$(gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" --format="value(state)" 2>/dev/null || echo "unknown")
  
  echo "  Schedule: $SCHEDULE"
  echo "  Timezone: $TIMEZONE"
  echo "  State: $STATE"
  
  if [[ "$STATE" == "ENABLED" ]]; then
    check_pass "Scheduler is enabled"
  else
    check_warn "Scheduler state is: $STATE"
  fi
else
  check_fail "Scheduler job does not exist: $SCHED_NAME"
fi

# Check 7: Service accounts exist
echo ""
echo "Checking service accounts..."
SA_NAME=${SA_NAME:-video-job-sa}
JOB_SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$JOB_SA" >/dev/null 2>&1; then
  check_pass "Job service account exists: $JOB_SA"
else
  check_fail "Job service account does not exist: $JOB_SA"
fi

SCHED_SA_NAME=${SCHED_SA_NAME:-scheduler-invoker}
SCHED_SA="${SCHED_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SCHED_SA" >/dev/null 2>&1; then
  check_pass "Scheduler service account exists: $SCHED_SA"
else
  check_fail "Scheduler service account does not exist: $SCHED_SA"
fi

# Check 8: Local build verification
echo ""
echo "Checking local build..."
if [[ -f "package.json" ]]; then
  check_pass "package.json exists"
  
  if [[ -d "node_modules" ]]; then
    check_pass "node_modules directory exists"
  else
    check_warn "node_modules not found (run: npm install)"
  fi
  
  if [[ -d "dist" ]] && [[ -f "dist/cli.js" ]]; then
    check_pass "Built distribution exists (dist/cli.js)"
  else
    check_warn "Built distribution not found (run: npm run build)"
  fi
else
  check_fail "package.json not found - are you in the project root?"
fi

# Check 9: Dockerfile verification
echo ""
echo "Checking Dockerfile configuration..."
if [[ -f "Dockerfile" ]]; then
  check_pass "Dockerfile exists"
  
  if grep -q "CMD.*dist/cli.js" Dockerfile; then
    check_pass "Dockerfile CMD points to cli.js (video generation)"
  else
    check_fail "Dockerfile CMD does not point to cli.js"
  fi
  
  if grep -q "RUN_ONCE=true" Dockerfile; then
    check_pass "Dockerfile sets RUN_ONCE=true by default"
  else
    check_warn "Dockerfile does not set RUN_ONCE=true"
  fi
else
  check_fail "Dockerfile not found"
fi

# Summary
echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo -e "${GREEN}✓ Passed:${NC} $pass_count"
if [[ $warn_count -gt 0 ]]; then
  echo -e "${YELLOW}⚠ Warnings:${NC} $warn_count"
fi
if [[ $fail_count -gt 0 ]]; then
  echo -e "${RED}✗ Failed:${NC} $fail_count"
fi
echo ""

if [[ $fail_count -eq 0 ]]; then
  echo -e "${GREEN}✅ System is ready for deployment!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Review configuration: gcloud run jobs describe $JOB_NAME --region=$REGION"
  echo "  2. Test manually: gcloud run jobs execute $JOB_NAME --region=$REGION"
  echo "  3. Check logs: gcloud run jobs executions logs read --job=$JOB_NAME --region=$REGION"
  echo "  4. Monitor scheduler: gcloud scheduler jobs describe $SCHED_NAME --location=$REGION"
  exit 0
else
  echo -e "${RED}❌ Deployment verification failed!${NC}"
  echo ""
  echo "Fix the issues above and run this script again."
  exit 1
fi
