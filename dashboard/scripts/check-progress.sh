#!/bin/bash
echo "=================================="
echo "Track 1: Re-transcribed Sessions"
echo "=================================="
for session in 9b676c31 4de5e799 459e7f99 69df5dc5; do
  if [ -f "/tmp/track1-session*.log" ]; then
    tail -3 /tmp/track1-session*.log 2>/dev/null | grep -E "(Sections:|completed|Failed)" | head -1 && echo "  ✅ $session" || echo "  ⏳ $session"
  fi
done

echo ""
echo "=================================="
echo "Track 2: JSON Error Sessions"
echo "=================================="
for session in fd3b8246 8b46a650 8fe7a1f2 cfaee385; do
  logfile="/tmp/track2-${session}.log"
  if [ -f "$logfile" ]; then
    if grep -q "✅ Session" "$logfile" 2>/dev/null; then
      echo "  ✅ $session - DONE"
    elif grep -q "Processing session" "$logfile" 2>/dev/null; then
      echo "  ⏳ $session - Processing..."
    else
      echo "  ⏳ $session - Starting..."
    fi
  else
    echo "  ⏳ $session - Queued"
  fi
done

echo ""
echo "Run: bash check-progress.sh"
