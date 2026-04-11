#!/usr/bin/env bash
set -euo pipefail
# Push to GitHub: uses GH_TOKEN if set, otherwise OAuth device flow (official GitHub CLI OAuth app).
# After HTTPS push, remote is restored to SSH — token is not left in .git/config.
CLIENT_ID="178c6fc778ccc68e1d6a"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_SSH="git@github.com:joyce-ren07/joycerepo.git"

push_with_token() {
  local token="$1"
  cd "$ROOT"
  export GIT_TERMINAL_PROMPT=0
  git remote set-url origin "https://joyce-ren07:${token}@github.com/joyce-ren07/joycerepo.git"
  git push -u origin main
  git remote set-url origin "$REMOTE_SSH"
  echo ""
  echo "Push complete. Remote is SSH again (no token stored)."
}

if [[ -n "${GH_TOKEN:-}" ]]; then
  echo "Using GH_TOKEN from environment."
  push_with_token "$GH_TOKEN"
  exit 0
fi

echo "Requesting device code from GitHub…"
RESP="$(curl -sS -X POST -H "Accept: application/json" \
  -d "client_id=${CLIENT_ID}" \
  -d "scope=repo" \
  https://github.com/login/device/code)"

DEVICE_CODE="$(echo "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["device_code"])')"
USER_CODE="$(echo "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["user_code"])')"
INTERVAL="$(echo "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("interval",5))')"
EXPIRES="$(echo "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("expires_in",900))')"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Approve in the browser (one time)"
echo "  Code:  $USER_CODE   (copied to clipboard)"
echo "  URL:   https://github.com/login/device"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -n "$USER_CODE" | pbcopy 2>/dev/null || true
open "https://github.com/login/device" 2>/dev/null || true

END=$((SECONDS + EXPIRES - 30))
TOKEN=""
while (( SECONDS < END )); do
  sleep "$INTERVAL"
  OUT="$(curl -sS -X POST -H "Accept: application/json" \
    -d "client_id=${CLIENT_ID}" \
    -d "device_code=${DEVICE_CODE}" \
    -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
    https://github.com/login/oauth/access_token)"
  ERR="$(echo "$OUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("error",""))' 2>/dev/null || true)"
  if [[ "$ERR" == "authorization_pending" ]] || [[ "$ERR" == "slow_down" ]]; then
    printf "."
    continue
  fi
  if echo "$OUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("access_token") else 1)' 2>/dev/null; then
    TOKEN="$(echo "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))')"
    break
  fi
  echo ""
  echo "OAuth error: $OUT" >&2
  exit 1
done

echo ""
if [[ -z "$TOKEN" ]]; then
  echo "Timed out waiting for browser authorization." >&2
  exit 1
fi

push_with_token "$TOKEN"
