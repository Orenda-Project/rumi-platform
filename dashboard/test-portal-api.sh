#!/bin/bash

# Teacher Portal API Test Script
# Tests all 12 portal API endpoints
# Usage: ./test-portal-api.sh [base_url]
# Example: ./test-portal-api.sh http://localhost:4000
# Example: ./test-portal-api.sh https://your-dashboard.up.railway.app

BASE_URL="${1:-http://localhost:4000}"
API_URL="$BASE_URL/api/portal"

echo "═══════════════════════════════════════════════════════════"
echo "🧪 Teacher Portal API Test Suite"
echo "═══════════════════════════════════════════════════════════"
echo "Base URL: $BASE_URL"
echo "Testing started at: $(date)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print test result
print_result() {
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $2"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $2"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Function to make request and check response
test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_status=$4
  local test_name=$5

  echo ""
  echo -e "${YELLOW}→ Testing:${NC} $test_name"
  echo "  Method: $method"
  echo "  Endpoint: $endpoint"

  if [ -n "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      -c cookies.txt -b cookies.txt \
      "$API_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -c cookies.txt -b cookies.txt \
      "$API_URL$endpoint")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "  Status: $http_code (expected: $expected_status)"
  echo "  Response: $body" | head -c 200

  if [ "$http_code" -eq "$expected_status" ]; then
    print_result 0 "$test_name"
  else
    print_result 1 "$test_name (got $http_code, expected $expected_status)"
  fi
}

echo "═══════════════════════════════════════════════════════════"
echo "1️⃣  AUTHENTICATION ENDPOINTS"
echo "═══════════════════════════════════════════════════════════"

# Test 1: Validate invalid token
test_endpoint "POST" "/validate-token" \
  '{"token":"invalid-token-12345"}' \
  404 \
  "Validate invalid invitation token"

# Test 2: Validate token without token field
test_endpoint "POST" "/validate-token" \
  '{}' \
  400 \
  "Validate token - missing token field"

# Test 3: Portal setup without token
test_endpoint "POST" "/setup" \
  '{"password":"test123456"}' \
  400 \
  "Portal setup - missing token"

# Test 4: Portal setup with weak password
test_endpoint "POST" "/setup" \
  '{"token":"test-token","password":"short"}' \
  400 \
  "Portal setup - password too short"

# Test 5: Portal setup without number in password
test_endpoint "POST" "/setup" \
  '{"token":"test-token","password":"passwordonly"}' \
  400 \
  "Portal setup - password missing number"

# Test 6: Login without credentials
test_endpoint "POST" "/login" \
  '{}' \
  400 \
  "Login - missing credentials"

# Test 7: Login with invalid phone
test_endpoint "POST" "/login" \
  '{"phoneNumber":"923001234567","password":"test123456"}' \
  401 \
  "Login - invalid phone number"

# Test 8: Request password reset without phone
test_endpoint "POST" "/request-reset" \
  '{}' \
  400 \
  "Request reset - missing phone number"

# Test 9: Request password reset for non-existent user
test_endpoint "POST" "/request-reset" \
  '{"phoneNumber":"923009999999"}' \
  404 \
  "Request reset - user not found"

# Test 10: Verify reset code without credentials
test_endpoint "POST" "/verify-reset-code" \
  '{}' \
  400 \
  "Verify reset code - missing credentials"

# Test 11: Verify invalid reset code
test_endpoint "POST" "/verify-reset-code" \
  '{"phoneNumber":"923001234567","code":"999999"}' \
  400 \
  "Verify reset code - invalid code"

# Test 12: Reset password without session
test_endpoint "POST" "/reset-password" \
  '{"password":"newpass123"}' \
  401 \
  "Reset password - no session"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "2️⃣  DATA ENDPOINTS (Protected - Should Fail Without Auth)"
echo "═══════════════════════════════════════════════════════════"

# Remove cookies to test auth
rm -f cookies.txt

# Test 13: Dashboard without auth
test_endpoint "GET" "/dashboard" \
  "" \
  401 \
  "Dashboard - no authentication"

# Test 14: Lesson plans without auth
test_endpoint "GET" "/lesson-plans" \
  "" \
  401 \
  "Lesson plans - no authentication"

# Test 15: Coaching sessions without auth
test_endpoint "GET" "/coaching-sessions" \
  "" \
  401 \
  "Coaching sessions - no authentication"

# Test 16: Coaching session detail without auth
test_endpoint "GET" "/coaching-session/abc123" \
  "" \
  401 \
  "Coaching session detail - no authentication"

# Test 17: Coaching analytics without auth
test_endpoint "GET" "/coaching-analytics" \
  "" \
  401 \
  "Coaching analytics - no authentication"

# Test 18: Logout without auth
test_endpoint "POST" "/logout" \
  "" \
  401 \
  "Logout - no authentication"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "3️⃣  PAGINATION & FILTERING"
echo "═══════════════════════════════════════════════════════════"

# Test 19: Lesson plans with pagination params
test_endpoint "GET" "/lesson-plans?page=1&limit=10" \
  "" \
  401 \
  "Lesson plans - pagination params (no auth)"

# Test 20: Lesson plans with content type filter
test_endpoint "GET" "/lesson-plans?type=lesson_plan" \
  "" \
  401 \
  "Lesson plans - filter by type (no auth)"

# Test 21: Coaching sessions with pagination
test_endpoint "GET" "/coaching-sessions?page=2&limit=5" \
  "" \
  401 \
  "Coaching sessions - pagination (no auth)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "4️⃣  RATE LIMITING TESTS"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo -e "${YELLOW}→ Testing:${NC} Rate limiting on login endpoint"
echo "  Making 6 rapid login attempts..."

# Make 6 rapid requests to trigger rate limit
for i in {1..6}; do
  response=$(curl -s -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"phoneNumber":"923001234567","password":"test123"}' \
    "$API_URL/login")

  http_code=$(echo "$response" | tail -c 4)

  if [ $i -eq 6 ]; then
    if [ "$http_code" -eq 429 ]; then
      print_result 0 "Rate limiting - blocked 6th attempt"
    else
      print_result 1 "Rate limiting - should block 6th attempt (got $http_code)"
    fi
  fi
done

# Cleanup
rm -f cookies.txt

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📊 TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo "═══════════════════════════════════════════════════════════"

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
