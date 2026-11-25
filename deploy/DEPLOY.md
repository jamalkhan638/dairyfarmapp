# Dairy Farm: deploy guide

Follow the parts in order. Every command is copy-paste ready.
**A** puts the server online, **B** builds the Android app, **C** installs it on the phones and sets up the farm.
**D**, **E** and **F** are for later: backups, updates and restore.

The dairy app runs in its own Docker containers (database, photo storage, nightly backups).
It shares nothing with SupplyMeadow except the server itself and Caddy (the HTTPS web server).

Already done, nothing to do:
- **DNS**: every `*.supplymeadow.site` name points to this server, and the name `dairy` is reserved for this app.
- **Caddy / HTTPS**: SupplyMeadow's Caddyfile loads `/etc/caddy/sites/*.caddy`, and `/etc/caddy/sites/dairy.caddy` sends
  `dairy.supplymeadow.site` to `127.0.0.1:3100`. Caddy gets the HTTPS certificate by itself.

---

## A. Server (about 15 minutes)

### A1. Log in to the server

```bash
ssh deploymeadow@158.220.114.117
```

If a `docker` command below says *permission denied*, put `sudo` in front of it.

### A2. Get the code

```bash
cd ~
git clone https://github.com/jamalkhan638/dairyfarmapp.git
cd dairyfarmapp
```

If the repository is private, git asks for a username and password. Enter your GitHub username, and for the password a
GitHub *personal access token* (GitHub → Settings → Developer settings → Personal access tokens → fine-grained,
read access to `dairyfarmapp`). You can also use the same method SupplyMeadow's `update.sh` uses.

### A3. Make the settings file (random secrets are generated for you)

```bash
cat > deploy/.env <<EOF
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
SETUP_CODE=$(openssl rand -hex 4)
API_PORT=3100
BACKUP_DIR=/var/backups/dairy
EOF
chmod 600 deploy/.env
grep SETUP_CODE deploy/.env
```

✅ Write down the `SETUP_CODE` shown (8 letters/numbers). You need it once, in step C2.
Keep `deploy/.env` private and never put it on GitHub. It is already excluded.

Check that port 3100 is free (SupplyMeadow uses 3000):

```bash
ss -ltn | grep ':3100 ' || echo "3100 is free"
```

✅ It should print `3100 is free`.

### A4. Start the dairy server

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

The first time this takes a few minutes (it downloads and builds everything).

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps
curl -s http://127.0.0.1:3100/api/health
```

✅ `db`, `api` and `backup` show as running/healthy, and the second command prints `{"ok":true,...}`.
If not, show me the output of:
`docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs --tail 50 api`

### A5. Check it from outside (HTTPS)

Open **https://dairy.supplymeadow.site/api/health** in any browser (phone or computer).

✅ It shows `{"ok":true,...}`. The first visit can take a few seconds while Caddy gets the certificate.
(The plain address without `/api/health` shows "Not Found". That is normal: the app only uses `/api`.)

Also check SupplyMeadow still works: open `https://aatraders.supplymeadow.site`.

### A6. Check the first backup

The backup container makes a backup as soon as it starts:

```bash
sudo cat /var/backups/dairy/last-success
sudo ls -lh /var/backups/dairy/daily
```

✅ A date/time is shown, and `daily/` has a `dairy-….dump` and a `files-….tar.gz`.

The server part is done.

---

## B. Build the Android app (APK), about 20 minutes, mostly waiting

The app is built by **EAS Build**, Expo's own build service. It needs a free Expo account. The free plan
includes enough builds for this farm, and Expo keeps the app's signing key safe (needed for every future update).

Do this on **your computer** (Windows, Mac or Linux) with **Node.js 20 or newer** installed (https://nodejs.org).

1. Create a free account at https://expo.dev/signup
2. Open a terminal (Windows: PowerShell) and run:

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

```bash
npx eas-cli@latest init
```

`init` links the app to your Expo account (answer **Yes** to create the project). It adds a project id to
`app.json`; commit that change so later builds use the same project:

```bash
git add app.json && git commit -m "Link app to Expo project" && git push
```

3. Build:

```bash
npx eas-cli@latest build --platform android --profile apk
```

If it asks *"Generate a new Android Keystore?"*, answer **Yes** (Expo stores it for you).

✅ After 10 to 20 minutes it prints a link (and a QR code) to download **the APK**. The same link is on
https://expo.dev under your project → Builds.

The app already points to `https://dairy.supplymeadow.site/api`, so nobody has to type a server address.

> Prefer not to create an Expo account? The APK can also be built with Android Studio on your computer,
> which is free but a bigger install. Ask me for those steps.

---

## C. Phones and first-time setup

### C1. Install on each phone

1. Open the APK link from B3 on the phone (or scan the QR code), and download the file.
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

- The server backs up the database and photos **every night at about 2:30** and keeps 30 daily and 12 monthly backups
  in `/var/backups/dairy`.
- The owner sees the last successful backup in **Settings → Backups**, with a warning if it is more than 36 hours old
  or failed, and can tap **Back up now**.
- **Keep a copy off the server**, for example once a week. On the server:

```bash
sudo tar -czf ~/dairy-backup-$(date +%F).tar.gz -C /var/backups/dairy daily && sudo chown $USER ~/dairy-backup-*.tar.gz
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
cd ~/dairyfarmapp
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Database changes are applied automatically when the server starts. Phones keep working offline while it restarts.

**App** (when I tell you the app changed): on your computer run `git pull`, then repeat **B3**. Open the new APK
link on each phone and install it over the old app. Data on the phone is kept.

---

## F. Restore from a backup (only if something went wrong)

```bash
cd ~/dairyfarmapp
sudo ls /var/backups/dairy/daily
```

Pick a date from the list, then (example for 25 Nov 2026):

```bash
sudo deploy/restore.sh 2026-11-25
```

Type `YES` when asked. The script:
1. first saves the current data as `before-restore-…` (so the restore itself can be undone);
2. stops the app server and puts back the database and photos from that date;
3. makes every phone download everything again. Changes still waiting on phones are kept and sent again.

For a monthly backup: `sudo deploy/restore.sh 2026-10 monthly`.

This was tested (Phase 8): a backup was restored into an empty database, every table matched row for row,
the photos came back, and the server ran on the restored data.

---

## Rules for the shared server

- The dairy API must stay on **127.0.0.1:3100**. SupplyMeadow uses 3000.
- Never add a wildcard or catch-all Caddy site for dairy. SupplyMeadow owns those.
- Don't edit `/etc/caddy/Caddyfile` directly; SupplyMeadow's updates overwrite it. The dairy site lives in
  `/etc/caddy/sites/dairy.caddy` (`deploy/dairy.caddy` in this repo is the same, plus an optional 12 MB upload limit).
- To switch the dairy site off without affecting SupplyMeadow:

```bash
sudo rm /etc/caddy/sites/dairy.caddy && sudo systemctl reload caddy
```
