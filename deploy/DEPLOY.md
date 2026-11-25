# Dairy Farm: deploy guide

Follow the parts in order. Every command is copy-paste ready.
**A** puts the server online, **B** builds the Android app, **C** installs it on the phones and sets up the farm.
**D**, **E** and **F** are for later: backups, updates and restore.

The dairy app runs directly on Ubuntu like SupplyMeadow (systemd service, PostgreSQL, Node 22), but with its own
folder, service, database, photos and backups. **SupplyMeadow is never touched.**

| | SupplyMeadow (not touched) | Dairy |
|---|---|---|
| Code | `~/supplymeadow` | `~/dairyfarmapp` |
| Service | `supplymeadow-api`, port 3000 | `dairy-api`, port 3100 |
| Database | `supplymeadow` | `dairy` (own login `dairy`, cannot see SupplyMeadow's data) |
| Photos | – | `~/dairy-data/files` |
| Backups | `~/backup-db.sh` (cron) | `deploy/native/backup.sh` (cron) → `~/dairy-backups` |
| Updates | `update.sh` | `deploy/native/update.sh` |

Already done, nothing to do:
- **DNS**: every `*.supplymeadow.site` name points to this server, and the name `dairy` is reserved for this app.
- **Caddy / HTTPS**: SupplyMeadow's Caddyfile loads `/etc/caddy/sites/*.caddy`, and `/etc/caddy/sites/dairy.caddy` sends
  `dairy.supplymeadow.site` to `127.0.0.1:3100`. Caddy gets the HTTPS certificate by itself.

Never restart `postgresql` or `caddy`, and never edit anything in `~/supplymeadow`. None of these steps need that.

---

## A. Server (about 20 minutes)

### A1. Log in and check (changes nothing)

```bash
ssh deploymeadow@158.220.114.117
```

```bash
node -v
```
✅ `v22…` (20 or newer is fine).

```bash
ss -ltn | grep ':3100 ' || echo "3100 is free"
```
✅ `3100 is free`.

```bash
sudo -u postgres psql -Atc "select datname from pg_database where datname='dairy' union all select rolname from pg_roles where rolname='dairy'"
```
✅ Prints nothing (no database or login called `dairy` exists yet).

```bash
df -h ~
```
✅ At least **2G** free in `Avail`.

### A2. Get the code

```bash
cd ~
```

```bash
git clone https://github.com/jamalkhan638/dairyfarmapp.git
```

```bash
cd ~/dairyfarmapp
```

If the repository is private, git asks for a username and password: enter your GitHub username and, as the password,
a GitHub token (GitHub → Settings → Developer settings → Personal access tokens → Fine-grained → only `dairyfarmapp`,
Contents: Read-only).

### A3. Create the dairy database and the settings file

Copy the **whole block** in one go (it creates a random database password and keeps it in a variable for the next
lines):

```bash
cd ~/dairyfarmapp
DB_PASS=$(openssl rand -hex 24)
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE dairy LOGIN PASSWORD '$DB_PASS'" -c "CREATE DATABASE dairy OWNER dairy" -c "REVOKE ALL ON DATABASE dairy FROM PUBLIC"
mkdir -p ~/dairy-data/files ~/dairy-backups
printf '%s\n' "DATABASE_URL=postgresql://dairy:$DB_PASS@127.0.0.1:5432/dairy" "PORT=3100" "JWT_SECRET=$(openssl rand -hex 32)" "SETUP_CODE=$(openssl rand -hex 4)" "STORAGE_DRIVER=local" "LOCAL_STORAGE_DIR=$HOME/dairy-data/files" "BACKUP_STATUS_DIR=$HOME/dairy-backups" > apps/api/.env
chmod 600 apps/api/.env
grep SETUP_CODE apps/api/.env
```

✅ `CREATE ROLE`, `CREATE DATABASE`, `REVOKE`, then `SETUP_CODE=` with 8 letters/numbers.
**Write the SETUP_CODE down**: you need it once, in step C2. Keep `apps/api/.env` private (it is never put on GitHub).

### A4. Install and build (3–5 minutes)

```bash
cd ~/dairyfarmapp
```

```bash
npm ci -w packages/shared -w apps/api --include-workspace-root --ignore-scripts --include=dev
```

```bash
npm run build -w packages/shared && npm run build -w apps/api
```

```bash
cd ~/dairyfarmapp/apps/api && npx prisma migrate deploy
```

✅ The last command ends with `All migrations have been successfully applied.`

### A5. Make it a system service (starts by itself after a reboot or crash)

Copy the **whole block** in one go:

```bash
NODE_BIN=$(which node)
printf '%s\n' "[Unit]" "Description=Dairy Farm API" "After=network.target postgresql.service" "" "[Service]" "Type=simple" "User=deploymeadow" "WorkingDirectory=/home/deploymeadow/dairyfarmapp/apps/api" "Environment=NODE_ENV=production" "ExecStart=$NODE_BIN dist/main.js" "Restart=always" "RestartSec=5" "" "[Install]" "WantedBy=multi-user.target" | sudo tee /etc/systemd/system/dairy-api.service
```

✅ It prints the service settings. The `ExecStart=` line shows the full path to node (e.g. `/usr/bin/node dist/main.js`).

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dairy-api
```

```bash
systemctl status dairy-api --no-pager | head -5
```

```bash
curl -s http://127.0.0.1:3100/api/health
```

✅ `active (running)`, and `{"ok":true,...}`.
If not, send me the output of: `journalctl -u dairy-api -n 60 --no-pager`

### A6. Check from outside (HTTPS)

Caddy is already set up for this name; nothing to change. Open **https://dairy.supplymeadow.site/api/health** on a phone
or computer.

✅ `{"ok":true,...}`. (The first visit can take a few seconds. The plain address shows "Not Found", which is normal.)
Also open `https://aatraders.supplymeadow.site` and check SupplyMeadow still works.

### A7. Backups: first backup and the nightly schedule

```bash
~/dairyfarmapp/deploy/native/backup.sh
```

```bash
ls -lh ~/dairy-backups/daily
```

✅ `backup ok …`, then a `dairy-….dump` and a `files-….tar.gz`.

Now add the dairy backup to cron. First look at the current cron lines (SupplyMeadow's backup is there):

```bash
crontab -l
```

This **adds** one dairy line and keeps all existing lines:

```bash
(crontab -l 2>/dev/null; echo "* * * * * /home/deploymeadow/dairyfarmapp/deploy/native/backup.sh --auto >> /home/deploymeadow/dairy-backups/backup.log 2>&1") | crontab -
```

```bash
crontab -l
```

✅ SupplyMeadow's lines are exactly as before, plus the new dairy line.
(The dairy line runs every minute but only backs up once a night at about 2:30, or when the owner taps **Back up now**.)

The server part is done.

---

## B. Build the Android app (APK), about 20 minutes, mostly waiting

The app is built by **EAS Build** with your existing Expo account. The dairy app becomes a **new, separate project**
in that account; the SupplyMeadow app's project is not changed.

Do this on **your computer** (not the server), in a new folder, with **Node.js 20 or newer** (`node -v`).

```bash
git clone https://github.com/jamalkhan638/dairyfarmapp.git
```

```bash
cd dairyfarmapp
```

```bash
npm install
```

```bash
cd apps/mobile
```

```bash
npx eas-cli@latest login
```
(Your existing Expo account. If it says you're already logged in, that's fine.)

```bash
npx eas-cli@latest init
```
⚠️ Choose to **create a new project** (named `dairyfarm`). **Don't pick the SupplyMeadow project.**
It adds a project id to `app.json`. Save that to GitHub:

```bash
git add app.json
```

```bash
git commit -m "Link app to Expo project"
```

```bash
git push
```

Build:

```bash
npx eas-cli@latest build --platform android --profile apk
```

If it asks *"Generate a new Android Keystore?"*, answer **Yes** (a new key just for the dairy app; Expo stores it).

✅ After 10 to 20 minutes it prints a link (and a QR code) to download **the APK**. The same link is on
https://expo.dev → project **dairyfarm** → Builds.

The app already points to `https://dairy.supplymeadow.site/api`, so nobody has to type a server address.

---

## C. Phones and first-time setup

### C1. Install on each phone

1. Open the APK link from part B on the phone (or scan the QR code), and download the file.
2. Open the downloaded file. Android asks to allow installing apps from this source: allow it, then **Install**.
3. Open **Dairy Farm**. Choose **اردو** or **English** at the top of the login screen.

### C2. Create the owner account (once, on the owner's phone)

1. On the login screen tap **Server settings → Check connection**. It should say the server is reachable.
2. Tap **First-time setup**. Enter the `SETUP_CODE` from A3, your name, a username and a password (6+ characters).
3. You are logged in as the owner.

### C3. Set up the farm (owner)

1. **Settings → Farm settings**: farm name, opening cash balance and its date, and the pregnancy length
   (283 for cows, about 310 for buffaloes).
2. **Settings → Users → Add user** for each worker: name, username and password. New users get full access;
   untick anything they should not do. Give each worker their username and password.
3. Allow notifications when the phone asks (reminders at 8 am on due days).
4. Start entering: **Animals** (your 3 cows), **Feed items** with bag weights, **Customers** with their rates,
   **Suppliers**.

### C4. Workers

Each worker installs the app (C1) and logs in with the username and password the owner gave them.
After the first login the app works offline. Entries sync when there is internet.

---

## D. Backups (keep doing this)

- The server backs up the dairy database and photos **every night at about 2:30**, keeping 30 daily and 12 monthly
  backups in `~/dairy-backups`.
- The owner sees the last successful backup in **Settings → Backups** (with a warning if it is more than 36 hours old
  or failed) and can tap **Back up now**.
- **Keep a copy off the server**, for example once a week. On the server:

```bash
tar -czf ~/dairy-backup-$(date +%F).tar.gz -C ~/dairy-backups daily
```

Then on your computer (PowerShell or Terminal), in the folder where you keep backups:

```bash
scp deploymeadow@158.220.114.117:~/dairy-backup-*.tar.gz .
```

Then on the server, remove the copy you downloaded:

```bash
rm ~/dairy-backup-*.tar.gz
```

---

## E. Updating to a new version

**Server** (when I tell you the server changed):

```bash
~/dairyfarmapp/deploy/native/update.sh
```

It backs up first, downloads the new code, builds, updates the dairy database and restarts only `dairy-api`.
✅ It ends with `{"ok":true,...}` and `==> Done: …`. Phones keep working offline during the restart.

**App** (when I tell you the app changed): on your computer run `git pull`, then the build command from part B again.
Open the new APK link on each phone and install it over the old app. Data on the phone is kept.

---

## F. Restore from a backup (only if something went wrong)

```bash
ls ~/dairy-backups/daily
```

Pick a date from the list, then (example for 25 Nov 2026):

```bash
~/dairyfarmapp/deploy/native/restore.sh 2026-11-25
```

Type `YES` when asked. The script:
1. first saves the current data as `before-restore-…` (so the restore itself can be undone);
2. stops only `dairy-api`, puts back the dairy database and photos from that date, and starts it again;
3. makes every phone download everything again. Changes still waiting on phones are kept and sent again.

For a monthly backup: `~/dairyfarmapp/deploy/native/restore.sh 2026-10 monthly`.

This was tested: a backup was restored into an empty database (every table matched row for row, photos came back,
the server ran on the restored data), and these scripts were tested with a dairy-only database login.

---

## Rules for the shared server

- The dairy API must stay on **127.0.0.1:3100**. SupplyMeadow uses 3000.
- Only use the `dairy-api` service, the `dairy` database and the dairy folders. Never restart `postgresql` or `caddy`
  for the dairy app; it doesn't need it.
- Never add a wildcard or catch-all Caddy site for dairy. SupplyMeadow owns those.
- Don't edit `/etc/caddy/Caddyfile` directly; SupplyMeadow's updates overwrite it. The dairy site lives in
  `/etc/caddy/sites/dairy.caddy` (`deploy/dairy.caddy` in this repo is the same, plus an optional 12 MB upload limit).
- To switch the dairy site off without affecting SupplyMeadow:

```bash
sudo rm /etc/caddy/sites/dairy.caddy && sudo systemctl reload caddy
```

---

## Optional: Docker instead

`Dockerfile` and `deploy/docker-compose.yml` can run the same app in Docker on a server that has Docker.
This server doesn't have Docker and doesn't need it; use part A above.
