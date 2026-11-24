# Dairy Farm App

Android app for running a small dairy farm. Works offline, and syncs when internet returns.
Urdu and English. Owner and Worker accounts.

```
apps/mobile     React Native + Expo app (TypeScript)
apps/api        NestJS backend: one app, one module per feature (TypeScript, Prisma, PostgreSQL)
packages/shared Rules shared by app and server: validation, permissions, sync protocol
```

## Status

**Phase 1 – Foundation + Animals: done**
- Owner setup, login, Owner/Worker roles, per-module permissions set by the owner (checked by the server)
- Animals: tag, name, photo, breed, sex, birth date (or estimate), purchase date & price, notes
- Status history (milking / dry / calf-young / sold / died), kept separately from the animal details
- "Added by …" / "Last updated by …" on every record, from the logged-in user (never typed)
- Full change history per record (who changed which field, from what to what, when)
- Offline: every entry saves on the phone first; a sync bar shows offline / waiting / conflicts
- Duplicate prevention: re-sent changes apply once; same tag on two phones → duplicate conflict
- Conflicts: edits to different fields merge; same field → user decides, nothing overwritten
- Urdu (right-to-left) and English, switchable in the app

Server setup on Contabo: see [deploy/DEPLOY.md](deploy/DEPLOY.md).

Next phases: Milk → Customers & sales → Feed & suppliers → Expenses & capital → Health & breeding → Reports → Release & backups.

## Run it (development)

Needs Node.js 20+ and PostgreSQL 14+.

1. Install everything (also builds the shared package and the database client):
   ```bash
   npm install
   ```
2. Create the database and settings:
   ```bash
   createdb dairy
   cp apps/api/.env.example apps/api/.env
   ```
   Edit `apps/api/.env`: set `DATABASE_URL`, a long random `JWT_SECRET`, and a `SETUP_CODE` (you type it once in the app to create the owner account).
3. Create the tables:
   ```bash
   npm run migrate:deploy -w apps/api
   ```
4. Start the server (listens on port 3000):
   ```bash
   npm run api:dev
   ```
5. Start the app:
   ```bash
   npm run mobile
   ```
   Install **Expo Go** from the Play Store on your Android phone and scan the QR code.
   The phone and computer must be on the same Wi-Fi.
6. In the app, tap **Server settings**. Enter `http://<your computer's Wi-Fi IP>:3000/api` (the built-in default is the live server, `https://dairy.supplymeadow.site/api`), tap **Check connection**, then **First-time setup** and create the owner account.

## Verify Phase 1

Automated (needs a `dairy_test` database: `createdb dairy_test`):
```bash
npm test
```
26 tests run against a real database. They include two simulated phones running the app's real sync engine offline.

By hand on a phone:
1. **Owner + worker.** As owner: Settings → Users → Add user. Give the worker Animals: See + Add + Edit, but not Delete. Log in as the worker on a second phone.
2. **Offline entry.** Turn on airplane mode and add an animal with a photo. The sync bar turns orange and shows "1 change waiting". Turn internet back on. The bar turns green, and the animal appears on the owner's phone.
3. **Added by.** Open the animal. It says "Added by <worker>". The owner edits the breed, and it now also says "Last updated by <owner>". The **Change history** tab lists both changes.
4. **Conflict.** Put both phones in airplane mode. Change the same animal's *name* on both, then reconnect both. The second phone shows a red "conflict" bar. Tap it, see both values side by side, and choose one.
5. **Merge.** Repeat step 4, but change the *name* on one phone and the *breed* on the other. Both changes are kept with no conflict.
6. **Duplicate.** Add tag `500` on both phones while offline, then reconnect. One gets a duplicate conflict instead of a second cow 500.
7. **Permission enforced by server.** As the worker, delete is not offered. The server also refuses it if forced (covered by the tests).
8. **Status.** Change status → Dry. It shows at once, offline too, and appears in Status history.
9. **Language.** Settings → Language → English / اردو. The app restarts once to switch direction.

## How sync works (short)

- Every record has an id made on the phone, so offline records keep their id.
- Saving writes the record and an **outbox** entry in the phone's SQLite database.
- Sync sends the outbox oldest-first. Each change carries a unique id, so a re-send is ignored by the server.
- Each change also carries the field values the phone saw before the edit. If the server's values are still the same, the change applies; fields nobody else touched merge. Otherwise the server stores a **conflict** and the user decides.
- The phone downloads everything changed since its last sync, filtered by what the user may see. If the owner changes someone's permissions, that phone downloads everything again.
- `createdById` and `updatedById` are always set by the server from the login.
