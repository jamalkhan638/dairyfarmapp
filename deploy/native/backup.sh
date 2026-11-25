#!/bin/bash
# Dairy backups (no Docker). Run by cron every minute with --auto:
#   - makes a backup when the owner tapped "Back up now" in the app (file backup-now), and
#   - once a day after 21:30 UTC (02:30 Pakistan time).
# Run with no argument to make a backup now.
# Keeps 30 daily + 12 monthly copies of the database and photos in ~/dairy-backups.
# Only touches the dairy database and dairy folders.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$APP_DIR/apps/api/.env"
get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
DB_URL="$(get DATABASE_URL)"; DB_URL="${DB_URL%%\?*}"
FILES_DIR="$(get LOCAL_STORAGE_DIR)"
B="$(get BACKUP_STATUS_DIR)"
[ -n "$B" ] || { echo "BACKUP_STATUS_DIR missing in $ENV_FILE"; exit 1; }
mkdir -p "$B/daily" "$B/monthly" "$FILES_DIR"
exec 9>"$B/.lock"
flock -n 9 || exit 0 # another backup is running

backup() {
  local day month
  day="$(date -u +%Y-%m-%d)"; month="$(date -u +%Y-%m)"
  pg_dump --format=custom --file="$B/daily/.dairy-$day.tmp" "$DB_URL"
  mv "$B/daily/.dairy-$day.tmp" "$B/daily/dairy-$day.dump"
  tar -czf "$B/daily/.files-$day.tmp" -C "$(dirname "$FILES_DIR")" "$(basename "$FILES_DIR")"
  mv "$B/daily/.files-$day.tmp" "$B/daily/files-$day.tar.gz"
  [ -f "$B/monthly/dairy-$month.dump" ] || cp "$B/daily/dairy-$day.dump" "$B/monthly/dairy-$month.dump"
  [ -f "$B/monthly/files-$month.tar.gz" ] || cp "$B/daily/files-$day.tar.gz" "$B/monthly/files-$month.tar.gz"
  ls -1t "$B"/daily/dairy-*.dump | tail -n +31 | xargs -r rm -f
  ls -1t "$B"/daily/files-*.tar.gz | tail -n +31 | xargs -r rm -f
  ls -1t "$B"/monthly/dairy-*.dump | tail -n +13 | xargs -r rm -f
  ls -1t "$B"/monthly/files-*.tar.gz | tail -n +13 | xargs -r rm -f
  date -u +%Y-%m-%dT%H:%M:%SZ > "$B/last-success"
  date -u +%Y-%m-%d > "$B/.last-daily"
  rm -f "$B/last-error"
  echo "backup ok $day"
}
attempt() {
  if ! backup; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup failed" > "$B/last-error"
    echo "backup FAILED" >&2
    return 1
  fi
}

if [ "${1:-}" = "--auto" ]; then
  if [ -f "$B/backup-now" ]; then rm -f "$B/backup-now"; attempt; exit; fi
  if [ "$(date -u +%H%M)" -ge 2130 ] && [ "$(cat "$B/.last-daily" 2>/dev/null)" != "$(date -u +%Y-%m-%d)" ]; then attempt; fi
else
  attempt
fi
