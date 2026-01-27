#!/bin/bash
export RAILWAY_TOKEN="be7dea71-ec50-40f7-9196-d0ed30639b0e"

echo "=== Checking Registration Template Logs ==="
echo ""
echo "Fetching logs from last 7 days..."
echo ""

railway logs --service whatsapp-bot --lines 2000 2>&1 | \
  grep -i "registration\|template\|flow" | \
  grep -v "Conversation history" | \
  head -200

