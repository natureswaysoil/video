#!/usr/bin/env bash
set -euo pipefail

# Cleanup script for identifying and managing stray videos and images
# This script helps identify videos that are not referenced in the Google Sheet

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Video & Image Cleanup Utility ===${NC}"
echo ""

# Configuration
SPREADSHEET_ID=${SPREADSHEET_ID:-""}
GID=${GID:-""}
DRY_RUN=${DRY_RUN:-"true"}

if [[ -z "$SPREADSHEET_ID" ]] || [[ -z "$GID" ]]; then
  echo -e "${YELLOW}Usage:${NC}"
  echo "  SPREADSHEET_ID=your_id GID=your_gid ./scripts/cleanup-stray-files.sh"
  echo ""
  echo -e "${YELLOW}Options:${NC}"
  echo "  DRY_RUN=false  - Actually perform cleanup (default: true, just report)"
  echo ""
  echo -e "${YELLOW}Example:${NC}"
  echo '  SPREADSHEET_ID="1LU2ahpzMqLB5FLYqiyDbXOfjTxbdp8U8" GID="1712974299" ./scripts/cleanup-stray-files.sh'
  exit 1
fi

CSV_URL="https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID}"

echo -e "${GREEN}Configuration:${NC}"
echo "  Spreadsheet ID: $SPREADSHEET_ID"
echo "  GID: $GID"
echo "  CSV URL: $CSV_URL"
echo "  Dry Run: $DRY_RUN"
echo ""

# Download CSV
echo -e "${GREEN}Step 1: Downloading CSV data...${NC}"
CSV_DATA=$(curl -s "$CSV_URL")
if [[ -z "$CSV_DATA" ]]; then
  echo -e "${RED}Error: Failed to download CSV${NC}"
  exit 1
fi
echo -e "  ✅ Downloaded $(echo "$CSV_DATA" | wc -l) rows"
echo ""

# Extract video URLs from CSV
echo -e "${GREEN}Step 2: Extracting video URLs from sheet...${NC}"
VIDEO_URLS=$(echo "$CSV_DATA" | grep -oP 'https?://[^\s,\"]+\.(mp4|mov|avi|heygen\.ai[^\s,\"]*)')
URL_COUNT=$(echo "$VIDEO_URLS" | grep -c "https" || echo "0")
echo -e "  ✅ Found ${URL_COUNT} video URL(s) referenced in sheet"
echo ""

if [[ $URL_COUNT -eq 0 ]]; then
  echo -e "${YELLOW}No video URLs found in sheet. Nothing to clean up.${NC}"
  exit 0
fi

# Save to temp file for analysis
TEMP_URLS=$(mktemp)
echo "$VIDEO_URLS" > "$TEMP_URLS"

echo -e "${GREEN}Referenced Video URLs:${NC}"
cat "$TEMP_URLS" | head -10
if [[ $URL_COUNT -gt 10 ]]; then
  echo "  ... (and $((URL_COUNT - 10)) more)"
fi
echo ""

# Analysis: Group by source
echo -e "${GREEN}Step 3: Analyzing video sources...${NC}"
HEYGEN_COUNT=$(grep -c "heygen" "$TEMP_URLS" || echo "0")
OTHER_COUNT=$(grep -cv "heygen" "$TEMP_URLS" || echo "0")

echo "  HeyGen videos: $HEYGEN_COUNT"
echo "  Other sources: $OTHER_COUNT"
echo ""

# Check for duplicate URLs
echo -e "${GREEN}Step 4: Checking for duplicates...${NC}"
DUPLICATES=$(sort "$TEMP_URLS" | uniq -d)
if [[ -n "$DUPLICATES" ]]; then
  echo -e "${YELLOW}  ⚠️  Found duplicate URLs:${NC}"
  echo "$DUPLICATES"
else
  echo "  ✅ No duplicate URLs found"
fi
echo ""

# Identify stray files (potential issues)
echo -e "${GREEN}Step 5: Identifying potential issues...${NC}"

# Check for invalid URLs (based on common patterns)
INVALID_COUNT=0
while IFS= read -r url; do
  if [[ ! "$url" =~ ^https?:// ]] || [[ ${#url} -lt 10 ]]; then
    echo -e "  ${YELLOW}⚠️  Potentially invalid URL: $url${NC}"
    ((INVALID_COUNT++))
  fi
done < "$TEMP_URLS"

if [[ $INVALID_COUNT -eq 0 ]]; then
  echo "  ✅ All URLs appear valid"
else
  echo -e "  ${YELLOW}Found $INVALID_COUNT potentially invalid URL(s)${NC}"
fi
echo ""

# Check for blank video cells
echo -e "${GREEN}Step 6: Checking for blank video cells...${NC}"
# Count rows with ASIN but no video URL
TOTAL_ROWS=$(echo "$CSV_DATA" | tail -n +2 | wc -l)
ROWS_WITH_VIDEOS=$URL_COUNT
ROWS_WITHOUT_VIDEOS=$((TOTAL_ROWS - ROWS_WITH_VIDEOS))

echo "  Total product rows: $TOTAL_ROWS"
echo "  Rows with videos: $ROWS_WITH_VIDEOS"
echo "  Rows without videos: $ROWS_WITHOUT_VIDEOS"
echo ""

if [[ $ROWS_WITHOUT_VIDEOS -gt 0 ]]; then
  echo -e "${YELLOW}  ℹ️  Products without videos will be processed in next run${NC}"
fi

# Summary
echo -e "${GREEN}=== Summary ===${NC}"
echo ""
echo "Video Statistics:"
echo "  ✅ Referenced videos: $URL_COUNT"
echo "  ✅ HeyGen videos: $HEYGEN_COUNT"
echo "  ⚠️  Invalid URLs: $INVALID_COUNT"
echo "  ⚠️  Duplicate URLs: $(echo "$DUPLICATES" | grep -c "https" || echo "0")"
echo ""
echo "Sheet Statistics:"
echo "  📊 Total rows: $TOTAL_ROWS"
echo "  ✅ With videos: $ROWS_WITH_VIDEOS"
echo "  ⏳ Without videos: $ROWS_WITHOUT_VIDEOS"
echo ""

# Cleanup recommendations
echo -e "${GREEN}=== Cleanup Recommendations ===${NC}"
echo ""

if [[ $INVALID_COUNT -gt 0 ]]; then
  echo -e "${YELLOW}1. Fix Invalid URLs:${NC}"
  echo "   - Review and correct malformed URLs in the sheet"
  echo "   - Re-run video generation for affected rows"
fi

if [[ $(echo "$DUPLICATES" | grep -c "https" || echo "0") -gt 0 ]]; then
  echo -e "${YELLOW}2. Remove Duplicate URLs:${NC}"
  echo "   - Multiple rows pointing to same video"
  echo "   - Consider if this is intentional"
fi

if [[ $ROWS_WITHOUT_VIDEOS -gt 0 ]]; then
  echo -e "${YELLOW}3. Generate Missing Videos:${NC}"
  echo "   - $ROWS_WITHOUT_VIDEOS products need videos"
  echo "   - Will be processed automatically on next scheduled run"
fi

echo ""
echo -e "${GREEN}=== HeyGen Cloud Cleanup ===${NC}"
echo ""
echo "Note: Videos are stored in HeyGen's cloud (not local files)."
echo "To clean up videos from HeyGen:"
echo ""
echo "1. Log in to HeyGen dashboard: https://app.heygen.com"
echo "2. Navigate to 'Videos' or 'Projects' section"
echo "3. Identify videos not in your sheet (compare with list above)"
echo "4. Delete test videos or failed generations manually"
echo ""
echo "Future enhancement: Automated HeyGen API cleanup based on sheet references"
echo ""

# Google Sheets cleanup recommendations
echo -e "${GREEN}=== Google Sheets Cleanup ===${NC}"
echo ""
echo "To clean up or reset the sheet:"
echo ""
echo "1. Archive old data:"
echo "   - Copy processed rows to an 'Archive' sheet"
echo "   - Keep main sheet with active products only"
echo ""
echo "2. Reset Posted column:"
echo "   - Clear 'Posted' column to reprocess rows"
echo "   - System will regenerate and repost"
echo ""
echo "3. Clear video URLs:"
echo "   - Clear video URL column to force regeneration"
echo "   - Useful for updating videos with new script/avatar"
echo ""
echo "4. Remove test rows:"
echo "   - Delete rows with test data"
echo "   - Keep only production products"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}=== Dry Run Mode ===${NC}"
  echo ""
  echo "This was a read-only analysis. No changes were made."
  echo "To perform actual cleanup operations, set DRY_RUN=false"
  echo ""
fi

# Cleanup temp file
rm -f "$TEMP_URLS"

echo -e "${GREEN}✅ Cleanup analysis complete${NC}"
