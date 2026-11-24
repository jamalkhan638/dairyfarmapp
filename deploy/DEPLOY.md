# Put the Dairy Farm server on Contabo

The dairy app runs in its own Docker containers: its own database, photo storage and daily backups.
It shares nothing with SupplyMeadow except the server itself and Caddy (the HTTPS web server).

## 1. Subdomain: already done

The DNS for every `*.supplymeadow.site` name already points to this server (158.220.114.117),
and SupplyMeadow has reserved the name `dairy`, so no company can take it. Nothing to do here.

## 2. Get the code onto the server

```bash
ssh deploymeadow@158.220.114.117
cd ~
git clone https://github.com/jamalkhan638/dairyfarmapp.git
cd dairyfarmapp
```

## 3. Settings

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```
Fill in `DB_PASSWORD`, `JWT_SECRET` and `SETUP_CODE`. Make random values with `openssl rand -hex 32`.
Check that `API_PORT` (default 3100) is free: `ss -ltn | grep 3100` should print nothing.

## 4. Start

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl http://127.0.0.1:3100/api/health
```
The second command should answer `{"ok":true,...}`.

## 5. HTTPS through Caddy: already set up (24 Nov 2026)

Done on the SupplyMeadow side:
- SupplyMeadow's `deploy/Caddyfile` has `import /etc/caddy/sites/*.caddy`, right after its
  `{ on_demand_tls … }` global block. Its `update.sh` installs that Caddyfile.
- `/etc/caddy/sites/dairy.caddy` exists, containing:
  ```
  dairy.supplymeadow.site {
  	reverse_proxy 127.0.0.1:3100
  }
  ```
  `deploy/dairy.caddy` in this repo is the same, plus a 12 MB upload limit (optional).

Rules for the shared server:
- The dairy API must stay on **127.0.0.1:3100**. SupplyMeadow uses 3000.
- Never add a wildcard or catch-all site for dairy. SupplyMeadow owns those.
- Don't edit `/etc/caddy/Caddyfile` directly; SupplyMeadow's updates overwrite it.

Until the dairy containers are running, `https://dairy.supplymeadow.site` shows a 502 error. That's expected.
Once they're running, test with **`https://dairy.supplymeadow.site/api/health`**. It should answer `{"ok":true,...}`.
The main address (`/`) only shows "not found", because the API lives under `/api`.

To switch the dairy site off without affecting SupplyMeadow:
```bash
sudo rm /etc/caddy/sites/dairy.caddy && sudo systemctl reload caddy
```

## 6. Create the owner account

Open the app. The server address is already set to `https://dairy.supplymeadow.site/api`.
Tap **Server settings → Check connection → First-time setup**, enter the `SETUP_CODE`, and create the owner account.

## Updating to a new version

```bash
cd ~/dairyfarmapp
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```
Database changes are applied automatically when the server starts.

## Backups

- Every day at about 02:30 Pakistan time, plus each time the backup container starts.
- Saved in `/var/backups/dairy`: `daily/` keeps the last 30 days and `monthly/` the last 12 months.
  Each backup holds the database (`dairy-*.dump`) and the photos (`files-*.tar.gz`).
- Check that the latest one worked: `cat /var/backups/dairy/last-success`.
- **Copy them off the server regularly** (for example, download weekly to your computer).
  A backup on the same server does not help if the server itself is lost.

### Restore (only if something went wrong)

```bash
cd ~/dairyfarmapp
docker compose -f deploy/docker-compose.yml --env-file deploy/.env stop api
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T db \
  pg_restore --clean --if-exists -U dairy -d dairy < /var/backups/dairy/daily/dairy-YYYY-MM-DD.dump
docker run --rm -v dairy_files:/data/files -v /var/backups/dairy:/b postgres:16-alpine \
  sh -c "cd /data && tar -xzf /b/daily/files-YYYY-MM-DD.tar.gz"
docker compose -f deploy/docker-compose.yml --env-file deploy/.env start api
```
We will practise a restore together in Phase 8.
