#!/bin/bash
# scripts/test-external-services.sh
# Integration test for external content discovery services

set -e

echo "=== External Services Integration Test ==="
echo "Testing torrent discovery, Elsci light novels, and Soap2Day resolver"
echo ""

# Check if API is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "ERROR: API server is not running on localhost:3000"
  echo "Please start the API server first: npm run dev"
  exit 1
fi

echo "✓ API server is running"
echo ""

# Test health endpoint
echo "1. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/admin/health/external-services -H "Authorization: Bearer $ADMIN_TOKEN" 2>&1 || echo "FAILED")
if echo "$HEALTH_RESPONSE" | grep -q "elsci"; then
  echo "✓ Health endpoint responding"
  echo "$HEALTH_RESPONSE" | jq '.services' 2>/dev/null || echo "$HEALTH_RESPONSE"
else
  echo "✗ Health endpoint failed"
  echo "$HEALTH_RESPONSE"
fi
echo ""

# Test Elsci discovery
echo "2. Testing Elsci light novel discovery..."
ELSCI_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/books/external/elsci/discover?maxFiles=5" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" 2>&1 || echo "FAILED")

if echo "$ELSCI_RESPONSE" | grep -q "title"; then
  echo "✓ Elsci discovery working"
  echo "$ELSCI_RESPONSE" | jq '. | length' 2>/dev/null | xargs -I {} echo "  Found {} books"
else
  echo "✗ Elsci discovery failed"
  echo "$ELSCI_RESPONSE" | head -20
fi
echo ""

# Test 1337x book search (dry run)
echo "3. Testing 1337x book discovery (dry run)..."
if curl -s -X POST "http://localhost:3000/api/books/auto-library/discover" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"maxTargets":3,"maxMatches":2}' 2>&1 | grep -q "targets"; then
  echo "✓ 1337x book discovery working"
else
  echo "✗ 1337x book discovery failed or disabled"
fi
echo ""

# Test Soap2Day resolver
echo "4. Testing Soap2Day stream resolver..."
echo "   (Requires valid SOAP2DAY_ALLOWED_MIRRORS and page URL)"
echo "   Skipping in automated test - requires manual verification"
echo ""

echo "=== Test Summary ==="
echo "Check the logs above for any failures."
echo ""
echo "Manual verification steps:"
echo "1. Test Elsci: curl http://localhost:3000/api/books/external/elsci/discover"
echo "2. Test 1337x: Enable BOOK_AUTO_LIBRARY_ENABLED=true and check discovery"
echo "3. Test Soap2Day: POST to /api/movies/remote/resolve with provider: 'soap2day'"
