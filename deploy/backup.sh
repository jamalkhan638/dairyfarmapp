#!/bin/sh
# Backup of the database and photos, kept on the server in $BACKUP_DIR (default /var/backups/dairy).
#   daily/    last 30 days        monthly/  first backup of each month, last 12 months
# Runs at start-up, every day at about 02:30 Pakistan time (21:30 UTC), and whenever the
# owner taps "Back up now" in the app (the API creates the file /backups/backup-now).
# Writes /backups/last-success or /backups/last-error so the app can show the result.
set -u
mkdir -p /backups/daily /backups/monthly

run_backup() {
  day=$(date -u +%Y-%m-%d)
  tmp="/backups/daily/.dairy-$day.dump.tmp"
  pg_dump --format=custom --file="$tmp" || return 1
  mv "$tmp" "/backups/daily/dairy-$day.dump"
  tar -czf "/backups/daily/.files-$day.tmp" -C /data files || return 1
  mv "/backups/daily/.files-$day.tmp" "/backups/daily/files-$day.tar.gz"
  month=$(date -u +%Y-%m)
  [ -f "/backups/monthly/dairy-$month.dump" ] || cp "/backups/daily/dairy-$day.dump" "/backups/monthly/dairy-$month.dump"
  [ -f "/backups/monthly/files-$month.tar.gz" ] || cp "/backups/daily/files-$day.tar.gz" "/backups/monthly/files-$month.tar.gz"
  ls -1t /backups/daily/dairy-*.dump | tail -n +31 | xargs -r rm -f
  ls -1t /backups/daily/files-*.tar.gz | tail -n +31 | xargs -r rm -f
  ls -1t /backups/monthly/dairy-*.dump | tail -n +13 | xargs -r rm -f
  ls -1t /backups/monthly/files-*.tar.gz | tail -n +13 | xargs -r rm -f
  date -u +%Y-%m-%dT%H:%M:%SZ > /backups/last-success
  rm -f /backups/last-error
  echo "backup ok $day"
}

attempt() {
  if ! run_backup; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup failed" > /backups/last-error
    echo "backup FAILED"
  fi
}

attempt
last_daily=$(date -u +%Y-%m-%d)
while true; do
  if [ -f /backups/backup-now ]; then
    rm -f /backups/backup-now
    attempt
  fi
  now_day=$(date -u +%Y-%m-%d)
  if [ "$(date -u +%H%M)" -ge 2130 ] && [ "$last_daily" != "$now_day" ]; then
    attempt
    last_daily=$now_day
  fi
  sleep 30
done
