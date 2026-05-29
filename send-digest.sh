#!/usr/bin/env bash
#
# Manually trigger the daily AI news digest email.
#
# Usage:
#   ./send-digest.sh                 # fetch + summarize + send the email
#   ./send-digest.sh --dry-run       # build the digest, print it, DON'T send
#   ./send-digest.sh --hours 48      # widen the lookback window (default 24)
#   ./send-digest.sh --skip-summary  # fast preview: skip LLM summaries
#   ./send-digest.sh --dry-run --skip-summary
#
# Credentials (looked up in this order):
#   JOB_TOKEN    — env var, else read from server/.env (JOB_TOKEN=...)
#   BACKEND_URL  — env var, else server/.env, else the default below
#
# To avoid typing the token every time, add it to server/.env (gitignored):
#   echo 'JOB_TOKEN=your-token-here' >> server/.env
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/server/.env"
DEFAULT_BACKEND="https://cct-backend.zeabur.app"

# ── Read a KEY=value from server/.env (strips quotes/whitespace) ─────────
# Always returns 0 so a missing key doesn't trip `set -e` in command subst.
read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- \
    | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' -e 's/[[:space:]]*$//' || true
}

# ── Parse arguments (before credential check so --help always works) ─────
DRY_RUN=false
HOURS=24
QS_EXTRA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)      DRY_RUN=true; shift ;;
    --hours)        HOURS="${2:?--hours needs a number}"; shift 2 ;;
    --skip-summary) QS_EXTRA="${QS_EXTRA}&skip_summary=true"; shift ;;
    -h|--help)
      cat <<'USAGE'
Manually trigger the daily AI news digest email.

Usage:
  ./send-digest.sh                 fetch + summarize + SEND the email
  ./send-digest.sh --dry-run       build + print the digest, do NOT send
  ./send-digest.sh --hours 48      widen lookback window (default 24)
  ./send-digest.sh --skip-summary  fast preview: skip LLM summaries
  ./send-digest.sh --dry-run --skip-summary

Credentials:
  JOB_TOKEN / BACKEND_URL from env, else server/.env, else default URL.
  Add the token once:  echo 'JOB_TOKEN=your-token' >> server/.env
USAGE
      exit 0 ;;
    *) echo "Unknown argument: $1 (use --help)" >&2; exit 1 ;;
  esac
done

# ── Resolve credentials (env → server/.env → default) ────────────────────
JOB_TOKEN="${JOB_TOKEN:-$(read_env JOB_TOKEN)}"
BACKEND_URL="${BACKEND_URL:-$(read_env BACKEND_URL)}"
BACKEND_URL="${BACKEND_URL:-$DEFAULT_BACKEND}"

if [ -z "${JOB_TOKEN:-}" ]; then
  echo "Error: JOB_TOKEN not found." >&2
  echo "  Set it via:  export JOB_TOKEN=your-token" >&2
  echo "  Or add to ${ENV_FILE}:  JOB_TOKEN=your-token" >&2
  exit 1
fi

URL="${BACKEND_URL%/}/api/jobs/ai-news-digest?hours=${HOURS}&dry_run=${DRY_RUN}${QS_EXTRA}"

echo "▶ POST ${URL}"
echo "  (this can take 1-3 minutes — fetch + dedup + LLM summaries)"
echo

# --fail-with-body: non-2xx still prints the body so errors are visible.
# Pretty-print via python if available, else raw.
if command -v python3 >/dev/null 2>&1; then
  curl --fail-with-body -sS -X POST \
    -H "Authorization: Bearer ${JOB_TOKEN}" \
    --max-time 600 "$URL" | python3 -m json.tool
else
  curl --fail-with-body -sS -X POST \
    -H "Authorization: Bearer ${JOB_TOKEN}" \
    --max-time 600 "$URL"
  echo
fi
