#!/usr/bin/env bash
# Exa API content extraction for known URLs
# Usage: ./scripts/exa-contents.sh "url1" ["url2" ...]
#
# Examples:
#   ./scripts/exa-contents.sh "https://docs.fal.ai/quickstart"
#   ./scripts/exa-contents.sh "https://elevenlabs.io/docs" "https://docs.openrouter.ai"

set -euo pipefail

if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

if [ -z "${EXA_API_KEY:-}" ]; then
  echo "Error: EXA_API_KEY not set. Export it or add to .env file." >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  echo "Usage: $0 \"url1\" [\"url2\" ...]" >&2
  exit 1
fi

# Build JSON array of URLs
URLS=$(printf '%s\n' "$@" | jq -R . | jq -s .)

curl -s -X POST 'https://api.exa.ai/contents' \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d "{
  \"urls\": ${URLS},
  \"text\": {
    \"max_characters\": 20000
  }
}"
