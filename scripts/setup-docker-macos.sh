#!/usr/bin/env bash
set -euo pipefail

# Docker Desktop setup script for macOS
# Usage: ./scripts/setup-docker-macos.sh

echo "=== Docker Desktop Setup for macOS ==="

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo "Error: This script is intended for macOS only."
  exit 1
fi

# Step 1: Install Homebrew if not present
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  echo "Homebrew is already installed."
fi

# Step 2: Install Docker Desktop via Homebrew Cask
if ! brew list --cask docker &>/dev/null; then
  echo "Installing Docker Desktop..."
  brew install --cask docker
else
  echo "Docker Desktop is already installed."
fi

# Step 3: Launch Docker Desktop to initialize the daemon
echo "Starting Docker Desktop..."
open -a Docker

# Step 4: Wait for Docker daemon to be ready
echo "Waiting for Docker daemon to start (this may take a minute)..."
max_attempts=30
attempt=0
while ! docker info &>/dev/null; do
  attempt=$((attempt + 1))
  if [[ $attempt -ge $max_attempts ]]; then
    echo "Error: Docker daemon did not start within expected time."
    echo "Please open Docker Desktop manually and ensure it is running."
    exit 1
  fi
  sleep 2
done

echo "Docker is running!"
docker --version
echo "=== Setup complete ==="
