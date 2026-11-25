#!/bin/sh
# Put back the database and photos from a backup.
#   usage:  deploy/restore.sh 2026-11-25            (a daily backup)
#           deploy/restore.sh 2026-11 monthly       (a monthly backup)
# Before restoring, it saves the current data as "before-restore-<time>" so this can be undone.
set -eu
cd "$(dirname "$0")/.."
WHEN="${1:?Give the backup date, e.g. 2026-11-25}"
KIND="${2:-daily}"
BACKUP_DIR="$(grep -E '^BACKUP_DIR=' deploy/.env | cut -d= -f2-)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dairy}"
DB="$BACKUP_DIR/$KIND/dairy-$WHEN.dump"
FILES="$BACKUP_DIR/$KIND/files-$WHEN.tar.gz"
[ -f "$DB" ] || { echo "Not found: $DB"; ls "$BACKUP_DIR/$KIND"; exit 1; }
[ -f "$FILES" ] || { echo "Not found: $FILES"; exit 1; }

printf 'This replaces ALL current dairy data with the backup from %s. Type YES to continue: ' "$WHEN"
read -r answer
[ "$answer" = "YES" ] || { echo "Cancelled."; exit 1; }

DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
echo "1/5 Saving the current data first (before-restore-$STAMP)..."
$DC exec -T db pg_dump -U dairy -d dairy --format=custom > "$BACKUP_DIR/before-restore-$STAMP.dump"
$DC run --rm -T --entrypoint sh backup -c "tar -czf /backups/before-restore-$STAMP-files.tar.gz -C /data files"

echo "2/5 Stopping the app server..."
$DC stop api

echo "3/5 Restoring the database..."
$DC exec -T db pg_restore --clean --if-exists --no-owner -U dairy -d dairy < "$DB"
# Phones must download everything again (their download position is from after the backup).
# Changes still waiting on the phones are kept and sent again.
$DC exec -T db psql -U dairy -d dairy -qc 'UPDATE "User" SET "accessVersion" = "accessVersion" + 1000'

echo "4/5 Restoring photos..."
docker run --rm -v dairy_files:/data/files -v "$BACKUP_DIR":/b postgres:16-alpine \
  sh -c "rm -rf /data/files/* && cd /data && tar -xzf /b/$KIND/files-$WHEN.tar.gz"

echo "5/5 Starting the app server..."
$DC start api
echo "Done. Phones will download the restored data on their next sync."
echo "To undo: the data from just before this restore is in $BACKUP_DIR/before-restore-$STAMP.*"
