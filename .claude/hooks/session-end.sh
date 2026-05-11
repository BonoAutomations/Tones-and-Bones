#!/usr/bin/env bash
# Session end hook — reminds to update WORK.md and LEARNING.md.

WORK_FILE=".claude/MEMORY/WORK.md"
LEARNING_FILE=".claude/MEMORY/LEARNING.md"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tones-and-Bones | Session Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Before closing:"
echo ""
echo "  1. Update $WORK_FILE"
echo "     → Current task status, next steps, blockers"
echo ""
echo "  2. Update $LEARNING_FILE"
echo "     → Any new patterns, insights, or lessons"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
