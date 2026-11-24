# Put the Dairy Farm server on Contabo

The dairy app runs in its own Docker containers: its own database, photo storage and daily backups.
It shares nothing with SupplyMeadow except the server itself and Caddy (the HTTPS web server).

## 1. Subdomain (once)

In the DNS settings of `supplymeadow.site`, add a record:

| Type | Name  | Value                     |
|------|-------|---------------------------|
| A    | dairy | your Contabo server's IP  |

Check it after a few minutes: `ping dairy.supplymeadow.site` should show your server's IP.

## 2. Get the code onto the server

```bash
cd /opt
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

## 5. HTTPS through Caddy (shared with SupplyMeadow)

Caddy already owns ports 80/443 and handles certificates. Do **not** install nginx or Traefik.
SupplyMeadow's `update.sh` overwrites `/etc/caddy/Caddyfile`, so the dairy site lives in its own file,
which SupplyMeadow's Caddyfile loads with `import /etc/caddy/sites/*.caddy`.
That line must be in SupplyMeadow's repository (`deploy/Caddyfile`); it is added on the SupplyMeadow side.

```bash
mkdir -p /etc/caddy/sites
cp /opt/dairyfarmapp/deploy/dairy.caddy /etc/caddy/sites/dairy.caddy
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```
Then from any computer, `https://dairy.supplymeadow.site/api/health` should answer `{"ok":true,...}`.
The first request can take a few seconds while Caddy gets the certificate.

If `API_PORT` in `deploy/.env` is not 3100, change the port in `/etc/caddy/sites/dairy.caddy` to match.

## 6. Create the owner account

Open the app. The server address is already set to `https://dairy.supplymeadow.site/api`.
Tap **Server settings → Check connection → First-time setup**, enter the `SETUP_CODE`, and create the owner account.

## Updating to a new version

```bash
cd /opt/dairyfarmapp
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
cd /opt/dairyfarmapp
docker compose -f deploy/docker-compose.yml --env-file deploy/.env stop api
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T db \
  pg_restore --clean --if-exists -U dairy -d dairy < /var/backups/dairy/daily/dairy-YYYY-MM-DD.dump
docker run --rm -v dairy_files:/data/files -v /var/backups/dairy:/b postgres:16-alpine \
  sh -c "cd /data && tar -xzf /b/daily/files-YYYY-MM-DD.tar.gz"
docker compose -f deploy/docker-compose.yml --env-file deploy/.env start api
```
We will practise a restore together in Phase 8.
