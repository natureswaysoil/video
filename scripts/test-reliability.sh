#!/usr/bin/env bash
set -euo pipefail

# Reliability Testing Script
# Runs a series of tests to verify system reliability

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Video Generation System - Reliability Tests     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

TEST_PASS=0
TEST_FAIL=0
TEST_SKIP=0

test_pass() {
  echo -e "${GREEN}✅ PASS${NC} - $1"
  ((TEST_PASS++))
}

test_fail() {
  echo -e "${RED}❌ FAIL${NC} - $1"
  ((TEST_FAIL++))
}

test_skip() {
  echo -e "${YELLOW}⏭️  SKIP${NC} - $1"
  ((TEST_SKIP++))
}

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

if [[ ! -f ".env" ]]; then
  echo -e "${RED}Error: .env file not found${NC}"
  echo "Run: cp .env.example .env"
  exit 1
fi

if [[ ! -f "package.json" ]]; then
  echo -e "${RED}Error: Not in project root${NC}"
  exit 1
fi

# Load environment
set -a
source .env
set +a

# Check required variables
REQUIRED_VARS=(
  "CSV_URL"
  "HEYGEN_API_KEY"
  "OPENAI_API_KEY"
)

echo "Checking required environment variables..."
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    test_fail "Required variable not set: $var"
  else
    test_pass "Variable set: $var"
  fi
done
echo ""

# Check optional social media credentials
echo "Checking optional social media credentials..."
SOCIAL_VARS=(
  "INSTAGRAM_ACCESS_TOKEN"
  "TWITTER_API_KEY"
  "PINTEREST_ACCESS_TOKEN"
)

SOCIAL_COUNT=0
for var in "${SOCIAL_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    ((SOCIAL_COUNT++))
  fi
done

if [[ $SOCIAL_COUNT -gt 0 ]]; then
  test_pass "$SOCIAL_COUNT social media platform(s) configured"
else
  test_skip "No social media platforms configured (will skip posting)"
fi
echo ""

if [[ $TEST_FAIL -gt 0 ]]; then
  echo -e "${RED}Prerequisites check failed. Fix errors above before running tests.${NC}"
  exit 1
fi

# Test 1: Build
echo -e "${BLUE}=== Test 1: TypeScript Build ===${NC}"
echo ""

if npm run build >/dev/null 2>&1; then
  test_pass "TypeScript compilation successful"
else
  test_fail "TypeScript compilation failed"
  echo "Run: npm run build"
  exit 1
fi
echo ""

# Test 2: CSV Access
echo -e "${BLUE}=== Test 2: CSV Data Access ===${NC}"
echo ""

CSV_DATA=$(curl -s "$CSV_URL" 2>/dev/null || echo "")
if [[ -n "$CSV_DATA" ]]; then
  LINE_COUNT=$(echo "$CSV_DATA" | wc -l)
  if [[ $LINE_COUNT -gt 1 ]]; then
    test_pass "CSV accessible with $LINE_COUNT rows"
  else
    test_fail "CSV accessible but empty"
  fi
else
  test_fail "Cannot access CSV_URL"
fi
echo ""

# Test 3: Dry Run
echo -e "${BLUE}=== Test 3: Dry Run (No Social Posting) ===${NC}"
echo ""
echo "This will generate videos but skip social media posting..."
echo "Expected duration: 10-20 minutes"
echo ""

read -p "Run dry run test? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Running dry run..."
  echo ""
  
  export DRY_RUN_LOG_ONLY=true
  export RUN_ONCE=true
  
  if timeout 1800 npm run dev 2>&1 | tee /tmp/test-dryrun.log; then
    # Check for success indicators in log
    if grep -q "✅ HeyGen video ready" /tmp/test-dryrun.log; then
      test_pass "Video generated successfully"
    else
      test_fail "No video generation success message found"
    fi
    
    if grep -q "\[DRY RUN\]" /tmp/test-dryrun.log; then
      test_pass "Dry run mode activated correctly"
    else
      test_fail "Dry run mode not detected"
    fi
    
    if grep -q "❌" /tmp/test-dryrun.log; then
      test_fail "Errors detected in dry run (check log)"
    else
      test_pass "No errors in dry run"
    fi
  else
    test_fail "Dry run timed out or failed"
  fi
  
  rm -f /tmp/test-dryrun.log
else
  test_skip "Dry run test skipped by user"
fi
echo ""

# Test 4: Error Handling
echo -e "${BLUE}=== Test 4: Error Handling ===${NC}"
echo ""
echo "Testing error handling with invalid credentials..."

# Save original values
ORIG_HEYGEN_KEY="$HEYGEN_API_KEY"

# Test with invalid HeyGen key
export HEYGEN_API_KEY="invalid_key"
export RUN_ONCE=true

echo "Running with invalid HeyGen key..."
if npm run dev 2>&1 | grep -q "HeyGen.*failed"; then
  test_pass "Error handling works for invalid credentials"
else
  test_fail "Error handling may not work correctly"
fi

# Restore
export HEYGEN_API_KEY="$ORIG_HEYGEN_KEY"
echo ""

# Test 5: Health Endpoint
echo -e "${BLUE}=== Test 5: Health Endpoint ===${NC}"
echo ""

echo "Starting health server..."
npm run dev &
SERVER_PID=$!

# Wait for server to start
sleep 5

if curl -s http://localhost:8080/health | jq . >/dev/null 2>&1; then
  test_pass "Health endpoint accessible and returns valid JSON"
  
  # Check response structure
  HEALTH_RESPONSE=$(curl -s http://localhost:8080/health)
  if echo "$HEALTH_RESPONSE" | jq -e '.status' >/dev/null 2>&1; then
    test_pass "Health response has status field"
  else
    test_fail "Health response missing status field"
  fi
  
  if echo "$HEALTH_RESPONSE" | jq -e '.lastRun' >/dev/null 2>&1; then
    test_pass "Health response has lastRun field"
  else
    test_fail "Health response missing lastRun field"
  fi
else
  test_fail "Health endpoint not accessible or invalid JSON"
fi

# Stop server
kill $SERVER_PID 2>/dev/null || true
echo ""

# Test 6: Configuration Validation
echo -e "${BLUE}=== Test 6: Configuration Validation ===${NC}"
echo ""

# Check video URL template
if [[ -n "${VIDEO_URL_TEMPLATE:-}" ]]; then
  if [[ "$VIDEO_URL_TEMPLATE" =~ \{jobId\}|\{asin\} ]]; then
    test_pass "Video URL template has required placeholder"
  else
    test_fail "Video URL template missing {jobId} or {asin} placeholder"
  fi
else
  test_pass "Using default video URL template"
fi

# Check column letter
if [[ -n "${SHEET_VIDEO_TARGET_COLUMN_LETTER:-}" ]]; then
  if [[ "$SHEET_VIDEO_TARGET_COLUMN_LETTER" =~ ^[A-Z]+$ ]]; then
    test_pass "Valid column letter: $SHEET_VIDEO_TARGET_COLUMN_LETTER"
  else
    test_fail "Invalid column letter: $SHEET_VIDEO_TARGET_COLUMN_LETTER"
  fi
else
  test_pass "Using default column letter (AB)"
fi

# Check timeout settings
if [[ -n "${HEYGEN_VIDEO_DURATION_SECONDS:-}" ]]; then
  if [[ "$HEYGEN_VIDEO_DURATION_SECONDS" -ge 10 ]] && [[ "$HEYGEN_VIDEO_DURATION_SECONDS" -le 120 ]]; then
    test_pass "Valid video duration: ${HEYGEN_VIDEO_DURATION_SECONDS}s"
  else
    test_fail "Video duration out of range: ${HEYGEN_VIDEO_DURATION_SECONDS}s (should be 10-120)"
  fi
else
  test_pass "Using default video duration (30s)"
fi
echo ""

# Test 7: Google Sheets Integration
echo -e "${BLUE}=== Test 7: Google Sheets Integration ===${NC}"
echo ""

if [[ -n "${GS_SERVICE_ACCOUNT_EMAIL:-}" ]] && [[ -n "${GS_SERVICE_ACCOUNT_KEY:-}" ]]; then
  test_pass "Google Sheets credentials configured"
  
  # Validate email format
  if [[ "$GS_SERVICE_ACCOUNT_EMAIL" =~ @.*\.iam\.gserviceaccount\.com$ ]]; then
    test_pass "Service account email format valid"
  else
    test_fail "Service account email format invalid"
  fi
  
  # Check key format
  if [[ "$GS_SERVICE_ACCOUNT_KEY" =~ "BEGIN PRIVATE KEY" ]]; then
    test_pass "Service account key format valid"
  else
    test_fail "Service account key format invalid (should contain BEGIN PRIVATE KEY)"
  fi
else
  test_skip "Google Sheets credentials not configured (sheet writeback disabled)"
fi
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Test Summary                         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}✅ Passed: $TEST_PASS${NC}"
echo -e "  ${YELLOW}⏭️  Skipped: $TEST_SKIP${NC}"
echo -e "  ${RED}❌ Failed: $TEST_FAIL${NC}"
echo ""

if [[ $TEST_FAIL -eq 0 ]]; then
  echo -e "${GREEN}🎉 All tests passed! System is reliable and ready.${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Deploy to Google Cloud: ./scripts/deploy-gcp.sh"
  echo "  2. Verify deployment: ./scripts/verify-deployment.sh"
  echo "  3. Monitor first run: gcloud logging tail 'resource.type=\"cloud_run_job\"'"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Review and fix issues above.${NC}"
  exit 1
fi
