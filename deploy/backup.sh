#!/bin/sh
# Daily backup of the database and photos, kept on the server in $BACKUP_DIR (default /var/backups/dairy).
#   daily/    last 30 days
#   monthly/  first backup of each month, last 12 months
# Runs once at start-up, then every day at about 02:30 Pakistan time (21:30 UTC).
set -eu
mkdir -p /backups/daily /backups/monthly

run_backup() {
  day=$(date -u +%Y-%m-%d)
  tmp="/backups/daily/.dairy-$day.dump.tmp"
  pg_dump --format=custom --file="$tmp"
  mv "$tmp" "/backups/daily/dairy-$day.dump"
  tar -czf "/backups/daily/.files-$day.tmp" -C /data files 2>/dev/null || tar -czf "/backups/daily/.files-$day.tmp" -C /data .
  mv "/backups/daily/.files-$day.tmp" "/backups/daily/files-$day.tar.gz"
  month=$(date -u +%Y-%m)
  [ -f "/backups/monthly/dairy-$month.dump" ] || cp "/backups/daily/dairy-$day.dump" "/backups/monthly/dairy-$month.dump"
  [ -f "/backups/monthly/files-$month.tar.gz" ] || cp "/backups/daily/files-$day.tar.gz" "/backups/monthly/files-$month.tar.gz"
  ls -1t /backups/daily/dairy-*.dump | tail -n +31 | xargs -r rm -f
  ls -1t /backups/daily/files-*.tar.gz | tail -n +31 | xargs -r rm -f
  ls -1t /backups/monthly/dairy-*.dump | tail -n +13 | xargs -r rm -f
  ls -1t /backups/monthly/files-*.tar.gz | tail -n +13 | xargs -r rm -f
  date -u +%Y-%m-%dT%H:%M:%SZ > /backups/last-success
  echo "backup ok $day"
}

run_backup || echo "backup FAILED"
while true; do
  now=$(date -u +%s)
  target=$(date -u -d "$(date -u +%Y-%m-%d) 21:30" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))
  run_backup || echo "backup FAILED"
done
