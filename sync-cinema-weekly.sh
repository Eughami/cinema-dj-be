#!/usr/bin/env bash
#
# sync-cinema-weekly.sh — weekly cinema sync for the cinema-dj backend.
#
# What it does:
#   1. Loads .env next to this script (TMDB_API_KEY, ...).
#   2. If TMDB_API_KEY is set: pulls real "now playing" + "upcoming" movies
#      for TMDB_REGION/TMDB_LANGUAGE, downloads posters/backdrops into
#      uploads/ and schedules a week of non-overlapping sessions.
#   3. If no key: falls back to the built-in catalog mode (same scheduler,
#      placeholder posters).
#   4. Appends timestamped output to the log file.
#
# Recommended cron (every Wednesday at 06:00):
#   0 6 * * 3 /home/imam/Documents/cinema/cinema-dj-be/sync-cinema-weekly.sh
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
fi

LOG_FILE="${SYNC_LOG_FILE:-$APP_DIR/cinema-server-log}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== weekly cinema sync start ==="

if [ -n "${TMDB_API_KEY:-}" ]; then
  log "mode: TMDB real sync (region=${TMDB_REGION:-FR}, lang=${TMDB_LANGUAGE:-fr-FR})"
  SYNC_ARGS="--tmdb --auto"
else
  log "mode: catalog fallback (TMDB_API_KEY not set)"
  SYNC_ARGS="--auto"
fi

if [ -f "$APP_DIR/weekly-schedule.js" ]; then
  log "runner: node weekly-schedule.js $SYNC_ARGS"
  # shellcheck disable=SC2086
  node "$APP_DIR/weekly-schedule.js" $SYNC_ARGS 2>&1 | tee -a "$LOG_FILE"
else
  log "runner: npx ts-node weekly-schedule.ts $SYNC_ARGS"
  # shellcheck disable=SC2086
  npx --yes ts-node "$APP_DIR/weekly-schedule.ts" $SYNC_ARGS 2>&1 | tee -a "$LOG_FILE"
fi

log "=== weekly cinema sync done (exit $?) ==="
