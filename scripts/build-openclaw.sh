#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${OPENCLAW_REPO_URL:-https://github.com/openclaw/openclaw.git}"
THIRD_PARTY_DIR="${THIRD_PARTY_DIR:-third_party}"
SRC_DIR="${OPENCLAW_SRC_DIR:-$THIRD_PARTY_DIR/openclaw}"
BUILD_DIR="${OPENCLAW_BUILD_DIR:-$SRC_DIR/build}"

mkdir -p "$THIRD_PARTY_DIR"

if [ ! -d "$SRC_DIR/.git" ]; then
  echo "Cloning OpenClaw from $REPO_URL into $SRC_DIR"
  git clone "$REPO_URL" "$SRC_DIR"
else
  echo "OpenClaw repository already exists at $SRC_DIR"
fi

cd "$SRC_DIR"

echo "Syncing OpenClaw source"
git fetch --all --tags
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  git checkout main
  git pull --ff-only origin main
elif git rev-parse --verify origin/master >/dev/null 2>&1; then
  git checkout master
  git pull --ff-only origin master
fi

echo "Configuring OpenClaw build"
cmake -S . -B "$BUILD_DIR"

echo "Building OpenClaw"
cmake --build "$BUILD_DIR" --config Release

echo "OpenClaw build complete. Artifacts are in $BUILD_DIR"
