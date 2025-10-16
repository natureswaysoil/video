#!/bin/bash

# List Pinterest boards to find board IDs

if [ -z "$PINTEREST_ACCESS_TOKEN" ]; then
  echo "Error: PINTEREST_ACCESS_TOKEN not set"
  echo "Usage: PINTEREST_ACCESS_TOKEN=your_token ./scripts/list-pinterest-boards.sh"
  exit 1
fi

echo "Fetching Pinterest boards..."
curl -s -X GET "https://api.pinterest.com/v5/boards" \
  -H "Authorization: Bearer $PINTEREST_ACCESS_TOKEN" \
  | jq -r '.items[] | "\(.id) - \(.name)"'
