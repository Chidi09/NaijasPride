#!/usr/bin/env bash
# =============================================================================
# Verify all content pipelines are working
# Run on VPS: bash scripts/verify-content-pipelines.sh [port]
# Default port is 3001 (blue stack). Use 3002 for green.
# =============================================================================
set -euo pipefail

PORT=${1:-3001}
BASE="http://localhost:$PORT/api/v1"
EMAIL=${ADMIN_EMAIL:-admin@naijaspride.com}
PASSWORD=${ADMIN_PASSWORD:-n0LPUFF-oUyV6J9X}

echo "=== Content Pipeline Verification (port $PORT) ==="
echo ""

# ── Auth ─────────────────────────────────────────────────────────────────────
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.data.token // empty')

if [ -z "$TOKEN" ]; then
  echo "FAIL: Could not get admin token — check credentials"
  exit 1
fi
echo "OK: Admin token obtained"

# ── 1. Book Auto-Library (1337x) ──────────────────────────────────────────────
echo ""
echo "--- 1. Book Auto-Library (1337x) ---"
RESULT=$(curl -s -X POST "$BASE/admin/books/auto-library/discover" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false,"ingest":true,"maxTargets":3,"maxMatches":2,"minSeeders":0}')
MATCHED=$(echo "$RESULT" | jq '.data.matched // 0')
CREATED=$(echo "$RESULT" | jq '.data.created // 0')
ERRORS=$(echo "$RESULT" | jq -r '.data.errors // [] | join(", ")')
echo "  Matched: $MATCHED | Created: $CREATED"
[ -n "$ERRORS" ] && echo "  Errors: $ERRORS"
if [ "$MATCHED" -gt 0 ]; then
  echo "  OK: 1337x book discovery working"
else
  echo "  WARN: No books matched — check 1337x connectivity / FlareSolverr"
fi

# ── 2. Torrent Discovery ──────────────────────────────────────────────────────
echo ""
echo "--- 2. Torrent Movie Discovery (1337x + TMDB) ---"
MOVIES_WITH_POSTER=$(curl -s "$BASE/movies?limit=20" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '[.data // [] | .[] | select(.posterUrl != null and .posterUrl != "")] | length')
echo "  Movies with TMDB poster (first 20): $MOVIES_WITH_POSTER"
if [ "$MOVIES_WITH_POSTER" -gt 0 ]; then
  echo "  OK: TMDB enrichment working"
else
  echo "  WARN: No movies with posterUrl — check TMDB_KEY and TORRENT_DISCOVERY_ENABLED"
fi

# ── 3. Elsci Light Novels ─────────────────────────────────────────────────────
echo ""
echo "--- 3. Elsci Light Novels ---"
ELSCI_COUNT=$(curl -s "$BASE/books?limit=1" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.meta.total // 0')
echo "  Total books in DB: $ELSCI_COUNT"
if [ "$ELSCI_COUNT" -gt 0 ]; then
  echo "  OK: Books exist in DB"
else
  echo "  WARN: No books found — check ELSCI_AUTO_IMPORT_ENABLED and book-worker logs"
fi

# ── 4. External Service Health ────────────────────────────────────────────────
echo ""
echo "--- 4. External Service Health ---"
HEALTH=$(curl -s "$BASE/admin/health/external-services" \
  -H "Authorization: Bearer $TOKEN")
ELSCI_OK=$(echo "$HEALTH" | jq '.services.elsci.healthy // false')
FLARE_OK=$(echo "$HEALTH" | jq '.services.flaresolverr.healthy // false')
echo "  Elsci healthy: $ELSCI_OK"
echo "  FlareSolverr healthy: $FLARE_OK"
if [ "$FLARE_OK" = "true" ]; then
  echo "  OK: FlareSolverr reachable"
else
  echo "  WARN: FlareSolverr not reachable — 1337x bypass will be degraded"
fi

# ── 5. Soap2Day Crawler ───────────────────────────────────────────────────────
echo ""
echo "--- 5. Soap2Day Crawler (manual trigger, 1 movie max) ---"
SOAP=$(curl -s -X POST "$BASE/admin/movies/soap2day/crawl" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxPerRun":1}')
SOAP_OK=$(echo "$SOAP" | jq '.status // "error"')
SOAP_DISCOVERED=$(echo "$SOAP" | jq '.data.discovered // 0')
SOAP_CREATED=$(echo "$SOAP" | jq '.data.created // 0')
SOAP_ERRORS=$(echo "$SOAP" | jq -r '.data.errors // [] | join(", ")')
echo "  Status: $SOAP_OK | Discovered: $SOAP_DISCOVERED | Created: $SOAP_CREATED"
[ -n "$SOAP_ERRORS" ] && echo "  Errors: $SOAP_ERRORS"
if [ "$SOAP_OK" = '"success"' ] && [ "$SOAP_DISCOVERED" -gt 0 ]; then
  echo "  OK: Soap2Day crawler reached listing page"
elif [ "$SOAP_OK" = '"success"' ] && [ "$SOAP_DISCOVERED" -eq 0 ]; then
  echo "  WARN: Crawler ran but found nothing — check SOAP2DAY_CRAWLER_URLS"
else
  echo "  WARN: Soap2Day crawl endpoint not available or failed"
fi

echo ""
echo "=== Verification complete ==="
