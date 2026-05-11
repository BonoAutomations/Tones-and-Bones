#!/usr/bin/env bash
# Pre-execution safety check for Bash commands.
# Blocks destructive patterns that should never run unattended.

BLOCKED_PATTERNS=(
  "rm -rf /"
  "sudo rm -rf"
  "dd if="
  "> /dev/sda"
  "mkfs."
  "format c:"
)

CMD="${CLAUDE_TOOL_INPUT:-}"

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qF "$pattern"; then
    echo "BLOCKED: Command matches safety pattern: '$pattern'" >&2
    exit 1
  fi
done

exit 0
