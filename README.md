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

**Phase 2 – Milk: done**
- Record a milking (morning or evening) for all cows on one screen, any date (not future)
- One entry per cow, date and milking: a second one on another phone becomes a duplicate to decide on
- Empty means "not recorded" and is shown as missing; 0 means the cow gave no milk
- Daily view: morning/evening/total, "X of Y milkings recorded", which cows are missing
- Milk not sold: fed to calves, used at home, discarded; remaining milk with a warning if negative
- Monthly view: totals, coverage, "Month in progress" / "Incomplete" labels, average per recorded milking
- Each cow has a Milk tab (last 30 days, who entered each value)
- Workers with only milk access can still see the cow list (not edit it)

**Phase 3 – Customers & sales: done**
- Customers with phone, address, usual payment (cash/credit), active/inactive
- Customer-specific rates with history: each delivery keeps the rate it was sold at
- Delivery round: one milking, all customers on one screen, litres + cash/credit per customer
- The server calculates every amount (litres × rate); a cash sale also records its payment automatically
- One delivery per customer, date and milking (a second one from another phone becomes a duplicate to decide on)
- Payments are separate records: any amount, partial payments, advances; cash/bank/JazzCash-Easypaisa
- Balances per customer and in total; monthly statement with opening balance, milk given, paid, closing balance
- The milk screens now show "Sold" from deliveries (only to users who may see sales)

Server setup on Contabo: see [deploy/DEPLOY.md](deploy/DEPLOY.md).

Next phases: Feed & suppliers → Expenses & capital → Health & breeding → Reports → Release & backups.

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
51 tests run against a real database. They include two simulated phones running the app's real sync engine offline.

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

## Verify Phase 2 (Milk)

1. Home → **Morning**. Every milking cow is listed. Enter litres for some cows and leave one empty, then Save.
2. Home shows today's total and "1 of 2 milkings recorded"-style coverage. **Milk** shows the missing cow under "Not recorded yet".
3. Open **Morning** again: the saved values are filled in. Change one and Save. The cow's **Milk** tab shows the new value, and its history shows who changed it.
4. Offline duplicate: put two phones in airplane mode and record the same cow's morning milk on both, then reconnect. One phone shows a conflict, which offers keeping the saved value or using yours.
5. **Add milk use** (e.g. 3 L fed to calves). The day's "Remaining" goes down.
6. **Monthly milk**: last month shows "Incomplete" if milkings are missing. This month shows "Month in progress".
7. Make a worker with only Milk permissions. They can record milk and see the cows, but cannot edit an animal.

## Verify Phase 3 (Sales)

1. **Sales → Add customer**: "Hotel", rate 210, usually Credit. Add "Walk-in", rate 220, usually Cash.
2. **Delivery round: Morning**: enter 10 L for Hotel and 2 L for Walk-in. The bottom button shows the total litres and rupees. Save.
3. Sales list: Hotel owes Rs 2,100. Walk-in is "Settled" (cash sale paid automatically).
4. **Receive payment** from Hotel: Rs 1,000. Hotel now owes Rs 1,100. The statement shows both lines with the running balance.
5. **Change rate** for Hotel to 230 from tomorrow. Today's delivery still shows Rs 210/L.
6. Open today's Hotel delivery from the statement and change it to 12 L. The amount becomes Rs 2,520 and the history shows who changed it.
7. **Milk** screen: "Sold" shows today's 12 L + 2 L, and "Remaining" is updated.
8. Offline: on two phones, enter Hotel's morning delivery for the same day, then reconnect. One delivery is kept and the other phone gets a decision.
9. A worker with Sales "See + Add" can record deliveries and payments but cannot change rates or edit saved deliveries.

## How sync works (short)

- Every record has an id made on the phone, so offline records keep their id.
- Saving writes the record and an **outbox** entry in the phone's SQLite database.
- Sync sends the outbox oldest-first. Each change carries a unique id, so a re-send is ignored by the server.
- Each change also carries the field values the phone saw before the edit. If the server's values are still the same, the change applies; fields nobody else touched merge. Otherwise the server stores a **conflict** and the user decides.
- The phone downloads everything changed since its last sync, filtered by what the user may see. If the owner changes someone's permissions, that phone downloads everything again.
- `createdById` and `updatedById` are always set by the server from the login.
