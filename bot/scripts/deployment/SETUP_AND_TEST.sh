#!/bin/bash

# Rumi Bot - Complete Setup and Test Script
# Run this script to install dependencies and test AWS SQS + Railway Redis
# Usage: ./SETUP_AND_TEST.sh

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 RUMI BOT - SETUP AND TEST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Navigate to project directory
cd "$(dirname "$0")/../.."

# Step 1: Install Dependencies
echo "📦 Step 1: Installing dependencies..."
echo "   This may take 30-60 seconds..."
echo ""

npm install

echo ""
echo "✅ Dependencies installed!"
echo ""

# Step 2: Test AWS SQS Connection
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Step 2: Testing AWS SQS Connection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node scripts/test-sqs-connection.js

echo ""

# Step 3: Test Railway Redis Connection
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Step 3: Testing Railway Redis Connection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  NOTE: This test will fail until you set up Railway Redis"
echo "   Follow instructions in scripts/RAILWAY_REDIS_SETUP.md"
echo ""

if [ -z "$REDIS_URL" ]; then
  echo "⚠️  REDIS_URL not set in .env"
  echo "   Skipping Redis test for now"
  echo "   Complete Railway Redis setup, then run:"
  echo "   node scripts/test-redis-connection.js"
else
  node scripts/test-redis-connection.js
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ SETUP COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Summary:"
echo "   ✅ Dependencies installed (aws-sdk, ioredis)"
echo "   ✅ AWS SQS queues tested and working"
echo "   ⏭️  Railway Redis: Set up next"
echo ""
echo "🎯 Next Steps:"
echo "   1. Set up Railway Redis (5 minutes)"
echo "      → See: scripts/RAILWAY_REDIS_SETUP.md"
echo "   2. Test Redis:"
echo "      → node scripts/test-redis-connection.js"
echo "   3. Start SQS worker:"
echo "      → node workers/sqs-worker.js"
echo ""
echo "📚 Documentation:"
echo "   → Reports/IMPLEMENTATION_PROGRESS.md"
echo "   → Reports/IMPLEMENTATION_ROADMAP_V3_FINAL.md"
echo ""
