#!/bin/bash
# Update the dairy server to the newest code (no Docker).
# Backs up first, then: download code, install, build, update database, restart dairy-api.
# Only touches ~/dairyfarmapp, the dairy database and the dairy-api service.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_DIR"
echo "==> Backup first"
deploy/native/backup.sh
echo "==> Download new code"
git pull --ff-only
echo "==> Install (server parts only)"
npm ci -w packages/shared -w apps/api --include-workspace-root --ignore-scripts --include=dev
echo "==> Build"
npm run build -w packages/shared
npm run build -w apps/api
echo "==> Update database"
(cd apps/api && npx prisma migrate deploy)
echo "==> Restart"
sudo systemctl restart dairy-api
sleep 3
curl -fsS http://127.0.0.1:3100/api/health && echo
echo "==> Done: $(git rev-parse --short HEAD)"
