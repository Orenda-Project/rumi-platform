#!/bin/bash
export RAILWAY_TOKEN="***REMOVED-SECRET***"

echo "=== Checking Registration Template Logs ==="
echo ""
echo "Fetching logs from last 7 days..."
echo ""

railway logs --service whatsapp-bot --lines 2000 2>&1 | \
  grep -i "registration\|template\|flow" | \
  grep -v "Conversation history" | \
  head -200

