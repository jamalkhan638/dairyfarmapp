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

**Phase 4 – Feed & suppliers: done**
- Feed items (wanda, green fodder, silage, minerals, other) with a bag weight you set per item
- Suppliers with phone/address, active/inactive, and what the farm owes each one
- Buy feed by bags or by kg, cash or credit, from a supplier or cash at the market. The server stores the price per kg
- A cash purchase from a supplier records its payment automatically. Supplier payments are separate records (partial payments are fine)
- Record feeding for one animal, all milking cows, all animals, or chosen animals, with kg wasted
- Stock per item: bought − fed − wasted ± stock counts (shown in kg and bags). Warning if below zero
- Feed expense = feed fed and wasted, at the average purchase price up to that day. Purchases are not counted as expenses
- Feed with no purchase price yet is shown as "not included", never as free
- Each animal has a Feed tab (last 30 days). Shared feeding is split equally and marked **Estimate**
- New users get full access to every section by default (the owner can still untick things)

**Phase 5 – Expenses, capital & cash book: done**
- Operating expenses: vet, medicines, labour, electricity, transport, repairs, other, with an optional receipt photo, description and animal
- Paid now (cash/bank/JazzCash-Easypaisa) or on credit to a supplier. Credit adds to what you owe them, alongside feed purchases
- An expense paid now to a supplier also records the payment automatically, so the supplier's balance stays right
- Capital entries, kept apart from daily expenses: cow bought, equipment, owner money in, owner money out, animal sold
- Adding a cow with a purchase price offers to put that payment in the cash book as "cow bought"
- Cash book: opening balance (set once) + money in − money out, per month with a running balance. Nothing is counted twice and credit is not cash
- Money screen: cash in hand, this month's money in/out, this month's operating expenses by category
- The cash balance is labelled as not being profit (operating profit comes in Phase 7)

**Phase 6 – Health, breeding & reminders: done**
- Health records: illness, treatment, vaccination, deworming, other, with medicine, dose, vet, notes
- Milk withdrawal end date from the vet. Cows under withdrawal are flagged on the milk entry screen, and the milk screen offers "Record as discarded" for their milk
- Optional cost on a health record is saved once, as an expense for that animal (never counted twice)
- Breeding: heat, insemination (AI/natural, semen/bull, who did it), pregnancy check, calving, abortion
- Calving can add the calf as a new animal (linked to its mother) and set the mother to milking
- Pregnancy status (not pregnant / inseminated / pregnant + expected calving), kept separate from milking status
- Gestation, pregnancy-check and heat-repeat days are farm settings (cows ~283, buffaloes ~310 days)
- Automatic reminders: heat re-check, pregnancy check, dry-off, calving due, next vaccination/deworming, withdrawal end. They clear themselves when the follow-up is recorded, and "Done" hides one on every phone
- Your own reminders (with an optional animal)
- Local phone notifications at 8 am on due days (no internet or paid service needed)

**Phase 7 – Dashboard & reports: done**
- Home dashboard: reminders due, today's milk (recorded X of Y, sold), quick-action buttons, this month so far (operating profit estimate), cash in hand, what customers owe and what we owe suppliers, and buttons for every section
- Monthly report (works offline, calculated on the phone):
  - **Operating profit** = milk sales (delivered, paid or not) − feed used (fed + wasted, at average price) − other operating expenses. Labelled **Estimate**
  - Feed purchases, animals, equipment and owner money are shown separately and never included
  - Milk: produced, sold, fed to calves, home, discarded, not accounted for, and recording coverage
  - Sales: revenue, average price per litre, payments received, customers owe / advances at month end
  - Feed: cost used, kg fed and wasted, feed bought (as stock), what we owe suppliers at month end
  - Expenses by category; capital entries listed separately
  - Cash (start, in, out, end), separate from profit
  - Warnings: month in progress, milk recording incomplete, days with no feeding recorded, feed with no price, opening cash not set
- Per-animal tab: milk, estimated milk value, feed cost estimate (shared feed split equally)
- 6-month trend of profit, milk, sales, feed and expenses
- An automatic check that every text exists in both English and Urdu

**Phase 8 – Release & backups: done**
- Owner sees backup status in Settings → Backups (last success, warning if older than 36 hours or failed) and can tap **Back up now**
- Nightly backups (database + photos), 30 daily + 12 monthly; `deploy/restore.sh` restores a date safely (saves the current data first, makes phones re-download)
- Restore drill passed: backup → empty database → every table matched, photos back, server ran on the restored data
- After a restore, phones download everything again and resend unsent entries (tested with the real sync engine)
- Login lock: 5 wrong passwords for a username → locked for 15 minutes
- Server build steps checked exactly as Docker runs them (clean install, migrations on an empty database, start, owner setup)
- Android APK build set up with EAS Build (`apps/mobile/eas.json`, profile `apk`)

**Deploy guide: [deploy/DEPLOY.md](deploy/DEPLOY.md)**: server, APK, phones, backups, updates, restore.

Server setup on Contabo: see [deploy/DEPLOY.md](deploy/DEPLOY.md).

All 8 phases of version one are complete. → Health & breeding → Reports → Release & backups.

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
93 tests run against a real database. They include two simulated phones running the app's real sync engine offline.

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

## Verify Phase 4 (Feed)

1. **Feed → Feed items → Add**: "Wanda", type Wanda/concentrate, bag weight 50 kg. Add "Green fodder" with no bag weight.
2. **Suppliers → Add**: "Haji Feeds".
3. **Buy feed**: Wanda from Haji Feeds, 4 bags at Rs 4,500, Credit. Total Rs 18,000, Rs 90/kg. Stock shows 200 kg (4 bags). Haji Feeds: "We owe Rs 18,000".
4. **Pay supplier**: Rs 10,000 to Haji Feeds. Now "We owe Rs 8,000". The supplier statement shows both lines.
5. **Record feeding**: Wanda, All milking cows, 20 kg fed, 1 kg wasted. Stock drops to 179 kg. Feed expense this month is Rs 1,890 (21 kg × Rs 90), not Rs 18,000.
6. Open a cow → **Feed** tab: her share of the 21 kg, marked **Estimate**.
7. **Record feeding**: Green fodder, One animal, 30 kg. It's shown as "fed with no purchase price yet". Then buy green fodder (by kg) and the cost appears.
8. **Stock count**: Wanda, counted 175 kg. A −4 kg correction is saved and stock shows 175 kg.
9. Offline: on two phones, one buys feed and the other records feeding and a supplier payment. After syncing, stock and supplier balance match on both.

## Verify Phase 5 (Money)

1. **Money → Opening balance**: Rs 50,000 from the 1st of this month.
2. **Add expense**: Vet, Rs 1,500, paid now in cash, for cow #1. Take a receipt photo. It appears under this month's operating expenses, and cash in hand becomes Rs 48,500.
3. **Add expense**: Medicines, Rs 800, on credit from a supplier. Operating expenses go up by Rs 800, cash doesn't change, and the supplier's statement shows "+Rs 800".
4. **Add capital entry**: Equipment, chaff cutter, Rs 45,000. Cash drops by Rs 45,000, but operating expenses don't change.
5. **Animals → Add animal** with purchase price Rs 250,000 and "Also add … to the cash book" ticked. The cash book shows "Cow / animal bought −Rs 250,000".
6. **Cash book**: the month shows balance at start, money in (customer payments), money out (expenses, supplier payments, cash feed, capital) and balance at end. Tapping a line opens that record.
7. Offline: add an expense on one phone and a capital entry on another, then sync both. Cash in hand is the same on both phones.

## Verify Phase 6 (Health & breeding)

1. Open a cow → **Health** tab → **Add breeding record**: Insemination, today, AI, semen "Sahiwal 123". Health & breeding shows reminders for a heat check in 21 days and a pregnancy check in 60 days, and the cow shows "Inseminated, awaiting check".
2. **Add breeding record**: Pregnancy check, Pregnant (backdate the insemination to test). The pregnancy-check reminder disappears, the cow shows "Pregnant" with the expected calving date, and a dry-off reminder appears if she is milking.
3. Settings → **Farm settings**: change pregnancy length to 310 (buffalo). The expected calving date moves.
4. **Add health record**: Treatment "Mastitis", withdrawal ends in 3 days, cost Rs 1,200 (Medicines). Money → expenses shows one Rs 1,200 medicine expense for that cow.
5. **Milk → Morning**: the cow shows "Milk withdrawal until …". After saving her milk, the milk screen offers **Record as discarded**.
6. Vaccination "FMD" with next due date in 6 months. A reminder appears. Tap **Done** and it disappears on both phones after sync.
7. **Calving**: add calf "21-C1", female, with "Mother starts milking" ticked. The calf appears in Animals as Calf/young with her mother linked, and the mother is Milking and no longer pregnant.
8. Allow notifications when asked. On a due date you get a notification at 8 am listing that day's reminders.

## Verify Phase 7 (Reports)

1. **Home**: today's milk with "X of Y recorded", reminders due, and quick buttons. "This month so far" shows operating profit with an **Estimate** label.
2. **Reports → Summary** for this month: "Month in progress" is shown. Profit = Milk sales − Feed used − Other expenses, and the three lines add up.
3. Buy feed for Rs 18,000 and feed 21 kg. Feed bought shows Rs 18,000 "stock, not expense", while Feed used shows only the 21 kg's cost.
4. Add an equipment capital entry. It appears under "Capital this month (not in profit)" and in Cash, and profit doesn't change.
5. Skip one evening milking and one day of feeding. The report shows "Milk recording incomplete" and "Feed not recorded on 1 day(s)".
6. **Per animal**: each cow's litres, estimated milk value and feed cost, with an **Estimate** badge for shared feed.
7. **6 months**: one line per month. Tap one to open its summary.
8. Switch to English/Urdu. Every report label is translated.

## How sync works (short)

- Every record has an id made on the phone, so offline records keep their id.
- Saving writes the record and an **outbox** entry in the phone's SQLite database.
- Sync sends the outbox oldest-first. Each change carries a unique id, so a re-send is ignored by the server.
- Each change also carries the field values the phone saw before the edit. If the server's values are still the same, the change applies; fields nobody else touched merge. Otherwise the server stores a **conflict** and the user decides.
- The phone downloads everything changed since its last sync, filtered by what the user may see. If the owner changes someone's permissions, that phone downloads everything again.
- `createdById` and `updatedById` are always set by the server from the login.
