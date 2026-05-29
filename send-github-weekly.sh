#!/usr/bin/env bash
#
# Manually trigger the weekly GitHub AI trending report email.
#
# Usage:
#   ./send-github-weekly.sh                 build + SEND the weekly report
#   ./send-github-weekly.sh --dry-run       build + print, do NOT send
#   ./send-github-weekly.sh --limit 8       include more repos (default 5)
#   ./send-github-weekly.sh --skip-enrich   fast preview: skip README + LLM detail
#   ./send-github-weekly.sh --help
#
# Credentials: JOB_TOKEN / BACKEND_URL from env, else server/.env, else default.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/server/.env"
DEFAULT_BACKEND="https://cct-backend.zeabur.app"

read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- \
    | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' -e 's/[[:space:]]*$//' || true
}

DRY_RUN=false
LIMIT=5
QS_EXTRA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)     DRY_RUN=true; shift ;;
    --limit)       LIMIT="${2:?--limit needs a number}"; shift 2 ;;
    --skip-enrich) QS_EXTRA="${QS_EXTRA}&skip_enrich=true"; shift ;;
    -h|--help)
      cat <<'USAGE'
Manually trigger the weekly GitHub AI trending report email.

Usage:
  ./send-github-weekly.sh                 build + SEND the weekly report
  ./send-github-weekly.sh --dry-run       build + print, do NOT send
  ./send-github-weekly.sh --limit 8       include more repos (default 5)
  ./send-github-weekly.sh --skip-enrich   fast preview: skip README + LLM detail

Credentials: JOB_TOKEN / BACKEND_URL from env, else server/.env, else default.
USAGE
      exit 0 ;;
    *) echo "Unknown argument: $1 (use --help)" >&2; exit 1 ;;
  esac
done

JOB_TOKEN="${JOB_TOKEN:-$(read_env JOB_TOKEN)}"
BACKEND_URL="${BACKEND_URL:-$(read_env BACKEND_URL)}"
BACKEND_URL="${BACKEND_URL:-$DEFAULT_BACKEND}"

if [ -z "${JOB_TOKEN:-}" ]; then
  echo "Error: JOB_TOKEN not found (set env or add to ${ENV_FILE})." >&2
  exit 1
fi

URL="${BACKEND_URL%/}/api/jobs/github-weekly?limit=${LIMIT}&dry_run=${DRY_RUN}${QS_EXTRA}"
echo "▶ POST ${URL}"
echo "  (this can take 1-2 minutes — scrape + README + LLM detail)"
echo

if command -v python3 >/dev/null 2>&1; then
  curl --fail-with-body -sS -X POST -H "Authorization: Bearer ${JOB_TOKEN}" \
    --max-time 600 "$URL" | python3 -m json.tool
else
  curl --fail-with-body -sS -X POST -H "Authorization: Bearer ${JOB_TOKEN}" \
    --max-time 600 "$URL"; echo
fi
