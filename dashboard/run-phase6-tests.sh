#!/bin/bash
# Phase 6 Test Runner
# Runs GitHub API and Redis Cache tests sequentially to work around Node v25 issues

echo "===== Phase 6: GitHub API Basic Access Tests ====="
echo ""
echo "Running GitHub API tests..."
npx jest tests/github-api.test.js || exit 1

echo ""
echo "Running Redis Cache tests..."
npx jest tests/redis-cache.test.js || exit 1

echo ""
echo "===== Phase 6 Tests: ALL PASSED ====="
echo "- GitHub API: 9 tests"
echo "- Redis Cache: 8 tests"
echo "- Total: 17 tests"
