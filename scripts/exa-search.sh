#!/usr/bin/env bash
# Exa API search utility for Tones-and-Bones
# Usage: ./scripts/exa-search.sh "your search query" [num_results] [type]
#
# Examples:
#   ./scripts/exa-search.sh "AI image generation API best practices"
#   ./scripts/exa-search.sh "ElevenLabs voice synthesis tutorial" 5 deep
#   ./scripts/exa-search.sh "payment processing compliance" 10 auto

set -euo pipefail

# Load .env if present
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

if [ -z "${EXA_API_KEY:-}" ]; then
  echo "Error: EXA_API_KEY not set. Export it or add to .env file." >&2
  exit 1
fi

QUERY="${1:?Usage: $0 \"search query\" [num_results] [type]}"
NUM_RESULTS="${2:-10}"
SEARCH_TYPE="${3:-auto}"

curl -s -X POST 'https://api.exa.ai/search' \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d "{
  \"query\": \"${QUERY}\",
  \"type\": \"${SEARCH_TYPE}\",
  \"num_results\": ${NUM_RESULTS},
  \"contents\": {
    \"text\": {
      \"max_characters\": 20000
    }
  }
}"
