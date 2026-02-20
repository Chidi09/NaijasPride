#!/usr/bin/env bash
# =============================================================================
# NaijasPride Admin Media Smoke Script
# Runs admin curl checks for:
#   1) Book torrent discovery (1337x)
#   2) Elsci light-novel discovery/import
#   3) Movie resolve/ingest via Soap2Day provider
#   4) Optional movie torrent queue test (1337x magnet)
# =============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"
TOKEN="${TOKEN:-}"

RUN_COMPOSE_UP="${RUN_COMPOSE_UP:-0}"

AUTO_LIBRARY_TARGETS="${AUTO_LIBRARY_TARGETS:-6}"
AUTO_LIBRARY_MATCHES="${AUTO_LIBRARY_MATCHES:-4}"
AUTO_LIBRARY_MIN_SEEDERS="${AUTO_LIBRARY_MIN_SEEDERS:-5}"

ELSCI_MAX_FILES="${ELSCI_MAX_FILES:-8}"
ELSCI_MAX_BOOKS="${ELSCI_MAX_BOOKS:-8}"
ELSCI_FORMAT="${ELSCI_FORMAT:-epub}"

SOAP2DAY_PAGE_URL="${SOAP2DAY_PAGE_URL:-}"
SOAP2DAY_TIMEOUT_MS="${SOAP2DAY_TIMEOUT_MS:-90000}"
SOAP2DAY_MOVIE_TITLE="${SOAP2DAY_MOVIE_TITLE:-Smoke Test Soap2Day Movie}"
SOAP2DAY_MOVIE_YEAR="${SOAP2DAY_MOVIE_YEAR:-$(date +%Y)}"
RUN_REMOTE_INGEST="${RUN_REMOTE_INGEST:-1}"

RUN_1337X_MOVIE_TEST="${RUN_1337X_MOVIE_TEST:-0}"
TORRENT_MAGNET="${TORRENT_MAGNET:-}"
TORRENT_TITLE="${TORRENT_TITLE:-Smoke Test 1337x Movie}"
TORRENT_YEAR="${TORRENT_YEAR:-$(date +%Y)}"

PASS_COUNT=0
FAIL_COUNT=0
LAST_STATUS=""
LAST_BODY=""

usage() {
  cat <<'EOF'
Usage:
  chmod +x scripts/admin-media-smoke.sh
  BASE_URL="http://127.0.0.1:3000" \
  EMAIL="admin@naijaspride.com" \
  PASSWORD="your-password" \
  SOAP2DAY_PAGE_URL="https://<soap2day-mirror>/movie/<slug>" \
  ./scripts/admin-media-smoke.sh

Alternative auth:
  TOKEN="<bearer-token>" ./scripts/admin-media-smoke.sh

Optional toggles:
  RUN_COMPOSE_UP=1            # docker compose up -d api remote-ingest-worker flaresolverr
  RUN_REMOTE_INGEST=0         # skip /movies/remote/ingest
  RUN_1337X_MOVIE_TEST=1      # run /movies/torrents using TORRENT_MAGNET

Optional values:
  ELSCI_FORMAT=epub|pdf|any
  ELSCI_MAX_FILES=8
  ELSCI_MAX_BOOKS=8
  AUTO_LIBRARY_TARGETS=6
  AUTO_LIBRARY_MATCHES=4
  AUTO_LIBRARY_MIN_SEEDERS=5
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

json_pretty_print() {
  local payload="$1"
  printf '%s' "$payload" | node -e 'const fs=require("fs");const raw=fs.readFileSync(0,"utf8");try{console.log(JSON.stringify(JSON.parse(raw),null,2));}catch{console.log(raw);}'
}

api_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  local url="${BASE_URL%/}${path}"
  local -a args
  args=(-sS -w $'\n%{http_code}' -X "$method" "$url")

  if [[ -n "${TOKEN:-}" ]]; then
    args+=(-H "Authorization: Bearer $TOKEN")
  fi

  if [[ -n "$body" ]]; then
    args+=(-H "content-type: application/json" --data "$body")
  fi

  local response
  response=$(curl "${args[@]}")

  LAST_STATUS="${response##*$'\n'}"
  LAST_BODY="${response%$'\n'*}"
}

record_result() {
  local label="$1"

  echo
  echo "==> $label"
  echo "HTTP $LAST_STATUS"
  json_pretty_print "$LAST_BODY"

  if [[ "$LAST_STATUS" =~ ^2 ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

if [[ "$RUN_COMPOSE_UP" == "1" ]]; then
  echo "==> Starting docker services"
  docker compose up -d api remote-ingest-worker flaresolverr
fi

if [[ -z "$TOKEN" ]]; then
  if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
    echo "ERROR: Provide TOKEN or EMAIL + PASSWORD"
    usage
    exit 1
  fi

  login_payload=$(node -e 'const [email,password]=process.argv.slice(1);process.stdout.write(JSON.stringify({email,password}));' "$EMAIL" "$PASSWORD")
  api_call "POST" "/api/v1/auth/login" "$login_payload"
  record_result "Login"

  if [[ ! "$LAST_STATUS" =~ ^2 ]]; then
    echo
    echo "Stopping because login failed."
    exit 1
  fi

  TOKEN=$(printf '%s' "$LAST_BODY" | node -e 'const fs=require("fs");const raw=fs.readFileSync(0,"utf8");const j=JSON.parse(raw);const token=j?.data?.token||"";if(!token){process.exit(1)};process.stdout.write(token);')
fi

api_call "GET" "/api/v1/admin/books/auto-library/must-haves"
record_result "Admin must-have list"

auto_library_payload=$(node -e 'const [targets,matches,minSeeders]=process.argv.slice(1);process.stdout.write(JSON.stringify({includeMustHaves:true,includeTrending:true,maxTargets:Number(targets),maxMatches:Number(matches),minSeeders:Number(minSeeders),ingest:false,dryRun:true}));' "$AUTO_LIBRARY_TARGETS" "$AUTO_LIBRARY_MATCHES" "$AUTO_LIBRARY_MIN_SEEDERS")
api_call "POST" "/api/v1/admin/books/auto-library/discover" "$auto_library_payload"
record_result "Book torrent discovery dry-run (1337x)"

api_call "GET" "/api/v1/books/external/elsci/discover?maxFiles=${ELSCI_MAX_FILES}&formatPreference=${ELSCI_FORMAT}"
record_result "Elsci discover"

elsci_import_payload=$(node -e 'const [maxBooks,format]=process.argv.slice(1);process.stdout.write(JSON.stringify({maxBooks:Number(maxBooks),formatPreference:format,dryRun:true}));' "$ELSCI_MAX_BOOKS" "$ELSCI_FORMAT")
api_call "POST" "/api/v1/books/import/elsci-lightnovels" "$elsci_import_payload"
record_result "Elsci import dry-run"

if [[ -n "$SOAP2DAY_PAGE_URL" ]]; then
  soap_resolve_payload=$(node -e 'const [pageUrl,timeoutMs]=process.argv.slice(1);process.stdout.write(JSON.stringify({pageUrl,provider:"soap2day",timeoutMs:Number(timeoutMs)}));' "$SOAP2DAY_PAGE_URL" "$SOAP2DAY_TIMEOUT_MS")
  api_call "POST" "/api/v1/movies/remote/resolve" "$soap_resolve_payload"
  record_result "Soap2Day resolve"

  if [[ "$RUN_REMOTE_INGEST" == "1" ]]; then
    soap_ingest_payload=$(node -e 'const [title,year,pageUrl]=process.argv.slice(1);process.stdout.write(JSON.stringify({title,year:Number(year),genre:["Hollywood"],sourcePageUrl:pageUrl,provider:"soap2day",queueNow:true}));' "$SOAP2DAY_MOVIE_TITLE" "$SOAP2DAY_MOVIE_YEAR" "$SOAP2DAY_PAGE_URL")
    api_call "POST" "/api/v1/movies/remote/ingest" "$soap_ingest_payload"
    record_result "Soap2Day ingest queue"
  fi
else
  echo
  echo "==> Soap2Day resolve"
  echo "Skipped (set SOAP2DAY_PAGE_URL to enable)"
fi

if [[ "$RUN_1337X_MOVIE_TEST" == "1" ]]; then
  if [[ -z "$TORRENT_MAGNET" ]]; then
    echo
    echo "==> 1337x movie torrent queue"
    echo "Skipped (RUN_1337X_MOVIE_TEST=1 requires TORRENT_MAGNET)"
  else
    movie_torrent_payload=$(node -e 'const [magnet,title,year]=process.argv.slice(1);process.stdout.write(JSON.stringify({magnetLink:magnet,title,year:Number(year),genre:["Hollywood"]}));' "$TORRENT_MAGNET" "$TORRENT_TITLE" "$TORRENT_YEAR")
    api_call "POST" "/api/v1/movies/torrents" "$movie_torrent_payload"
    record_result "1337x movie torrent queue"
  fi
fi

api_call "GET" "/api/v1/admin/queues"
record_result "Admin queue summary"

echo
echo "============================================"
echo "Done. Passed: $PASS_COUNT | Failed: $FAIL_COUNT"
echo "============================================"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
