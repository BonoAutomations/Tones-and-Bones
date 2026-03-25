#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_BUILD_DIR="${OPENCLAW_BUILD_DIR:-third_party/openclaw/build}"

if [ -x "$OPENCLAW_BUILD_DIR/openclaw" ]; then
  exec "$OPENCLAW_BUILD_DIR/openclaw" "$@"
fi

if [ -x "$OPENCLAW_BUILD_DIR/Release/openclaw.exe" ]; then
  exec "$OPENCLAW_BUILD_DIR/Release/openclaw.exe" "$@"
fi

echo "Could not find an OpenClaw executable under $OPENCLAW_BUILD_DIR"
echo "Run ./scripts/build-openclaw.sh first."
exit 1
