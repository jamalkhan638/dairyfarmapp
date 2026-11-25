#!/bin/bash
# Put back the dairy database and photos from a backup (no Docker).
#   usage:  deploy/native/restore.sh 2026-11-25          (daily backup)
#           deploy/native/restore.sh 2026-11 monthly     (monthly backup)
# Saves the current data first (before-restore-*), so the restore itself can be undone.
# Only touches the dairy database, the dairy-api service and dairy folders.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$APP_DIR/apps/api/.env"
get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
DB_URL="$(get DATABASE_URL)"; DB_URL="${DB_URL%%\?*}"
FILES_DIR="$(get LOCAL_STORAGE_DIR)"
B="$(get BACKUP_STATUS_DIR)"
WHEN="${1:?Give the backup date, e.g. 2026-11-25}"
KIND="${2:-daily}"
DB="$B/$KIND/dairy-$WHEN.dump"
FILES="$B/$KIND/files-$WHEN.tar.gz"
[ -f "$DB" ] || { echo "Not found: $DB"; ls "$B/$KIND"; exit 1; }
[ -f "$FILES" ] || { echo "Not found: $FILES"; exit 1; }

read -r -p "This replaces ALL current dairy data with the backup from $WHEN. Type YES to continue: " answer
[ "$answer" = "YES" ] || { echo "Cancelled."; exit 1; }

STAMP="$(date -u +%Y%m%d-%H%M%S)"
echo "1/5 Saving the current data first (before-restore-$STAMP)..."
pg_dump --format=custom --file="$B/before-restore-$STAMP.dump" "$DB_URL"
tar -czf "$B/before-restore-$STAMP-files.tar.gz" -C "$(dirname "$FILES_DIR")" "$(basename "$FILES_DIR")"

echo "2/5 Stopping the dairy app server..."
sudo systemctl stop dairy-api

echo "3/5 Restoring the database..."
pg_restore --clean --if-exists --no-owner --dbname="$DB_URL" "$DB"
# Phones must download everything again (their download position is from after the backup).
# Changes still waiting on the phones are kept and sent again.
psql "$DB_URL" -qc 'UPDATE "User" SET "accessVersion" = "accessVersion" + 1000'

echo "4/5 Restoring photos..."
rm -rf "$FILES_DIR"
mkdir -p "$(dirname "$FILES_DIR")"
tar -xzf "$FILES" -C "$(dirname "$FILES_DIR")"

echo "5/5 Starting the dairy app server..."
sudo systemctl start dairy-api
echo "Done. Phones will download the restored data on their next sync."
echo "To undo: the data from just before this restore is in $B/before-restore-$STAMP.*"
