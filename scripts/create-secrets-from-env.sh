#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   1) Export env vars (e.g., source .env), then run:
#        ./scripts/create-secrets-from-env.sh
#   2) Or run interactively to be prompted for any missing values:
#        ./scripts/create-secrets-from-env.sh --interactive
#
# Creates secrets if missing and adds a version only when a value is provided.

INTERACTIVE=false
if [[ ${1-} == "--interactive" ]]; then
  INTERACTIVE=true
fi

SECRETS=(
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

for NAME in "${SECRETS[@]}"; do
  VAL=${!NAME-}

  # If interactive and empty, prompt securely (no echo)
  if $INTERACTIVE && [[ -z "${VAL:-}" ]]; then
    read -r -s -p "Enter value for $NAME (leave blank to skip): " VAL
    echo ""  # newline after prompt
  fi

  # Create secret if it doesn't exist
  if ! gcloud secrets describe "$NAME" >/dev/null 2>&1; then
    echo "Creating secret: $NAME"
    gcloud secrets create "$NAME" --replication-policy="automatic" >/dev/null
  fi

  # Add a version only if a value is provided
  if [[ -n "${VAL:-}" ]]; then
    echo "Adding version for: $NAME"
    printf '%s' "$VAL" | gcloud secrets versions add "$NAME" --data-file=- >/dev/null
  else
    echo "Skipping $NAME (empty)"
  fi
done

echo "Secrets processing complete."
