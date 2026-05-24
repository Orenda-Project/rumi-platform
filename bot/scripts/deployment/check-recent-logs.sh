#!/bin/bash
# Tail recent bot logs from Railway, filtered to registration/template/flow events.
#
# Requires RAILWAY_TOKEN in your environment — NEVER hardcode it in this file.
#   export RAILWAY_TOKEN=...        # a Railway project/account token
#   export RAILWAY_SERVICE=...      # your bot service name (default: rumi-bot)
# (or just run `railway login` and omit RAILWAY_TOKEN)
: "${RAILWAY_TOKEN:?Set RAILWAY_TOKEN in your environment (do not hardcode it)}"
SERVICE="${RAILWAY_SERVICE:-rumi-bot}"

echo "=== Checking Registration Template Logs ==="
echo ""
echo "Fetching logs from last 7 days..."
echo ""

railway logs --service "$SERVICE" --lines 2000 2>&1 | \
  grep -i "registration\|template\|flow" | \
  grep -v "Conversation history" | \
  head -200
