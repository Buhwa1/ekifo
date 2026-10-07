# FindEkifo

**Find your space in Uganda.** Rent a hostel room, flat or arcade stall, or book a turf, pool, rooftop, garden, bar, club or restaurant by the hour or event slot, all in one view-first PWA. A Business hub lists every shop inside a mall with its room number. Landlords are NIN-verified, there are no viewing fees, and Mobile Money stays in escrow until the tenant moves in or the booking has happened.

Next.js 15 (App Router, Server Actions, React 19) · PostgreSQL + Drizzle ORM · Tailwind v4 · PWA · Flutterwave Mobile Money · Termii SMS · Cloudinary

---

## Quick start (Supabase)

1. Create a project at [supabase.com](https://supabase.com). Pick a region close to East Africa, such as **eu-central-1 (Frankfurt)**, and save the database password.
2. Click **Connect** in the top bar. Under **Connection string**, copy:
   - **Transaction pooler** (port **6543**) → `DATABASE_URL`
   - **Session pooler** (port **5432**) → `MIGRATION_DATABASE_URL`

   Replace `[YOUR-PASSWORD]` in both. Use the `…pooler.supabase.com` host, not `db.<ref>.supabase.co`, which is IPv6-only on most networks.
3. Then run:

```bash
cp .env.example .env          # paste the two URLs, set APP_SECRET to 32+ random characters
npm install
npm run db:migrate            # creates/updates the tables and locks them off Supabase's public REST API
npm run db:seed               # demo data + accounts (wipes app tables — dev project only)
npm run dev                   # http://localhost:3000
```

The app doesn't use the Supabase JS client or anon key. It connects to Postgres directly from the server, and the second migration turns on Row Level Security with no policies (and revokes the `anon`/`authenticated` grants), so nobody can read your tables through the auto-generated API. You'll see "RLS enabled, no policies" in the dashboard — that's intentional.

**Upgrading an existing database:** run `npm run db:migrate` again. Migrations 0002–0004 add property types, venue hierarchy, time-slot bookings and the Business hub, and convert your existing listings' old category to the new `type` automatically. Nothing is lost.

### Demo accounts (after `db:seed`)

| Role | Phone | What to try |
|---|---|---|
| Admin | 0700 000 001 | Clients, Property types, Verification, Money |
| Landlord (hostels, mall) | 0772 100 200 | Units statuses, Directory approvals for Kisementi Square Mall |
| Landlord (rentals, turf, bar) | 0752 300 400 | Slot bookings in the Lead inbox |
| Landlord (hotel, pool, club) | 0772 900 800 | Hotel with a rooftop and pool inside it |
| Pending landlord | 0783 500 600 | Waiting for verification |
| Seeker | 0701 234 567 | Reserve a room, book a turf by the hour |
| Shop owner | 0772 410 100 | Owns Chloe's Boutique, Room A2 |

OTP codes print in the server console while `SMS_PROVIDER=console`.

**Tests** insert rows, so give them a separate throwaway Supabase project (or a local Postgres) via `TEST_DATABASE_URL`. `npm test` refuses to run against a remote `DATABASE_URL` without it.

**Local Postgres instead:** set `DATABASE_URL=postgresql://user:pass@localhost:5432/findekifo` and leave `MIGRATION_DATABASE_URL` empty.

## What's in it

**Three groups of space, one model.** Every listing has a *property type* that belongs to a group:
- **Stay:** hostel, rental, short stay, hotel
- **Business:** mall & arcade
- **Leisure & events:** turf & sports pitch, swimming pool, lounge & rooftop, event garden, restaurant, bar, club

Stay and Business types are *rented* (deposit, per semester/month/day). Leisure types are *booked by time*: `per_hour` or `per_event_slot` (Morning 8–12, Afternoon 1–5, Evening 6–11, limited to the venue's opening hours). Admins can add new types (e.g. "Co-working space") from **Admin → Property types** without a code change; they appear in search and the listing wizard immediately.

**Parent and child spaces.** A type marked "can contain spaces" (hotel, mall) can have children, and a type marked "can sit inside a venue" (pool, rooftop, garden, turf…) can either stand alone or sit inside one. Kololo Summit Hotel contains Summit Rooftop Lounge and Summit Pool Deck; each is booked on its own page, shown on the hotel's page under "Also at", and labelled "At Kololo Summit Hotel" in search.

**Unit statuses:** Vacant, Booked (paid, in escrow), Occupied, Under maintenance, Under construction, Hidden. Owners change them from a single dropdown on the Units screen; seekers see unavailable units collapsed with a reason ("2 under construction").

**Time-slot bookings.** A bottom sheet lets the seeker pick the pitch/area, a day, then a start time and duration (hourly) or a slot card (event). Taken times are greyed out. The full price is paid up front by Mobile Money and held in escrow; the venue is paid automatically 24 hours after the booking ends unless the guest reports a problem. Free cancellation until `FREE_CANCEL_HOURS` before the start. A Postgres exclusion constraint (`no_overlapping_slots`) makes double-booking a time window impossible, even under concurrent requests.

**Business hub (tenant directory).** Shops inside malls and arcades get a public profile: name, room/shop number (e.g. "Chloe's Boutique, Room A2"), category, opening hours, WhatsApp/phone/Instagram/TikTok/Facebook/website and 1–2 storefront photos. Browse by mall or category at `/directory`; each mall's page shows "Shops here". Profiles go live instantly for tenants renting through FindEkifo, the mall owner and admins; anyone else is queued for the mall owner to approve under **My spaces → Directory**.

**Seeker:** Anyone can search and filter (suburb, UGX price range, payment cycle, Yaka setup, water, security, vacancies only) without signing in. Each listing has a detail page with a photo/video gallery, utility chips, a per-unit price table, an OSM map with directions, and verified reviews. Phone OTP is required only when the seeker books a visit, reserves a unit, or wants to see the landlord's contacts. A Mobile Money checkout leads to a live "approve on your phone" screen. Under **Account** the seeker can say "I've moved in", cancel for free within the cancellation window, open a dispute, download the tenancy agreement PDF, and leave a review.

**Landlord:** Landlords verify with their NIN, a selfie and proof of authority. Listing uses a 3-step wizard with a GPS pin and photo compression on the phone, and drafts are saved locally. Other screens:
- a colour-coded unit grid
- a lead inbox where visits can be accepted, rescheduled, declined, marked done or no-show, and where held deposits can be released
- tenancies with capped rent changes
- a payout ledger with withdrawals to MTN, Airtel or a bank account

**Admin:** **Clients** onboards a landlord, mall manager or venue owner by phone (optionally marking them verified after an in-person ID check, which is audit-logged), sends them an SMS invite, and lets the admin list spaces on their behalf; those go live immediately. **Property types** adds, edits or hides types. The verification center shows the ID documents beside the listing and flags any NIN reused across accounts. Other screens:
- listing review with duplicate-photo alerts
- featured placement
- financial ledger: escrow, revenue, payout approval and sending, manual release or refund
- flags and disputes, with tools to suspend a listing or an owner
- full audit log

## Design

- **Type:** Roboto (headlines, prices, numbers; slightly condensed for display) and Inter (text, with tabular figures). Both are self-hosted variable fonts in `app/fonts/`, so there's no Google Fonts request and they work offline.
- **Colours:** a vivid set chosen to contrast with each other, all WCAG-checked for the text placed on them. Defined as tokens in `app/globals.css`.
  - Navy `#0B1F7A` for surfaces, headers and the hero
  - Green `#14E08A` for actions and free units, always with dark ink text (10:1)
  - Amber `#FFB31A` for money, deposits and the Business group
  - Sky `#38C6FF` for Leisure & events
  - Ink `#0A1238` on a cool paper `#F4F6FD`
- **Group colour coding:** Stay is green, Business is amber, Leisure is sky, on tabs, type chips, cards and admin screens.
- **Signature element:** the homepage vacancy board. It shows live free-unit counts and the cheapest unit per area, cached for 60 seconds and refreshed whenever inventory changes. Each row opens that area's results.
- **Phone-first patterns:**
  - bottom tab bar
  - bottom sheets for filters, visit booking and confirmations
  - a sticky "Choose a unit" bar on listings
  - a swipeable gallery
  - OTP that submits on the sixth digit
  - day and time chips instead of date pickers
- **States:** skeleton loading screens, an offline-aware error page, a helpful 404, and empty states that tell you what to do next.

## How the money stays correct

This is the part that has to be robust, and it's covered by tests that run against real Postgres (`npm test`).

- **No double booking.** A partial unique index (`one_active_hold_per_unit`) allows at most one pending or held lease reservation per unit, and a `btree_gist` exclusion constraint (`no_overlapping_slots`) stops two live bookings overlapping in time on the same pitch or venue. The database enforces both, so they hold even if application code races. Tests fire concurrent reservations and check that exactly one wins.
- **Double-entry ledger.** Every movement writes balanced rows (deposit → escrow → landlord payable + platform revenue → payout). Rows are append-only, and a movement that doesn't balance throws and rolls back. The admin overview alerts if the ledger is ever out of balance.
- **Idempotent settlement.** The webhook, the status-page poll and the background sweep all call `settlePayment()`, which locks the payment row and no-ops if it's already settled. Webhooks are also deduplicated by event id.
- **We never trust the webhook body.** We re-verify every payment with Flutterwave, and an underpayment or wrong currency is rejected and flagged.
- **Late payments are handled.** If money arrives after a hold expired and someone else took the unit, the payer is refunded automatically. If the unit is still free, the hold is revived.
- **Lost webhooks are recovered** because the sweep re-polls pending payments, and overdue ones are closed out.
- **Payouts can't overdraw.** Each landlord's payout requests are serialised with an advisory lock and checked against the ledger balance minus payouts already in flight. Transfers use the payout id as the provider reference, so retrying is safe.
- **SMS goes through a transactional outbox.** Notifications are written in the same transaction as the state change and delivered with retries and backoff. A failed transaction never sends a message.
- **Only the tenant (or an admin) releases escrow.** Landlords can refund a deposit but can never pay themselves.

Other safeguards:
- OTP codes are stored as HMACs, rate-limited per phone in the database, and locked after 5 wrong attempts.
- Sessions are server-side and revocable; suspending a user signs them out everywhere.
- NINs are stored only as an HMAC plus the last 4 characters.

## Business rules (all in `.env`)

| Setting | Default | Meaning |
|---|---|---|
| `COMMISSION_BPS` | 400 | 4% of each deposit, taken from the landlord's share |
| `WRITTEN_AGREEMENT_THRESHOLD` | 500000 | Monthly-equivalent rent at or above which a written agreement is flagged as required |
| `RENT_INCREASE_CAP_BPS` | 1000 | Maximum 10% increase per rolling 12 months on active tenancies |
| `RENT_NOTICE_DAYS` | 30 | Minimum notice before a rent increase |
| `HOLD_PAYMENT_WINDOW_MIN` | 15 | Time the seeker has to approve the PIN prompt |
| `HOLD_DURATION_HOURS` | 72 | How long a paid hold reserves a unit before admin review |
| `FREE_CANCEL_HOURS` | 24 | Leases: window after paying to cancel for a full refund. Time-slot bookings: free cancellation until this many hours before the start |

⚠️ The 10% cap, the notice period and the UGX 500,000 threshold come from your spec. Have a Ugandan lawyer confirm them against the current Landlord and Tenant Act before launch. They're configuration, so you won't need code changes.

## Going live

1. **Supabase:** use a separate production project, run `npm run db:migrate` on deploy, and keep `DB_POOL_MAX` small (5) on serverless. Optionally paste Supabase's CA certificate into `DATABASE_CA_CERT` for fully verified TLS; without it, the connection is still encrypted.
2. **Flutterwave:** set `PAYMENT_PROVIDER=flutterwave` and `FLW_SECRET_KEY`. In the dashboard, set the webhook URL to `https://<domain>/api/webhooks/flutterwave` and put the same secret hash in `FLW_WEBHOOK_HASH`. Enable Uganda Mobile Money collections and transfers on the account.
3. **Termii:** set `SMS_PROVIDER=termii`, `TERMII_API_KEY`, and a registered sender ID.
4. **Cloudinary:** set the three `CLOUDINARY` variables. Uploads go straight from the browser using signed parameters.
5. **Background jobs:** these expire holds, re-poll payments, flag lapsed holds and send SMS.
   - Serverless (Vercel and similar): call `GET /api/cron` with `Authorization: Bearer $CRON_SECRET` every minute.
   - VPS: run `npm run jobs:run` next to `npm start`, or set `JOBS_IN_PROCESS=1`.
6. Add the admin numbers to `ADMIN_PHONES`.

The app refuses to boot in production with mock payments or console SMS. The exception is `ALLOW_MOCK_PROVIDERS=1`, which you can set for a staging or demo deploy.

## Project map

```
db/schema.ts            data model (holds, ledger, outbox…) · db/migrations/
lib/booking.ts          reservation + escrow state machine (the money path)
lib/ledger.ts           double-entry posting and balances
lib/payments.ts         Flutterwave + mock adapters (charge / verify / disburse)
lib/visits.ts           visit scheduling with per-role transition rules
lib/listings.ts         KYC, listings, unit status, duplicate-photo detection
lib/payouts.ts          landlord withdrawals
lib/tenancy.ts          rent-change cap, agreement PDF
lib/rules.ts            pure rules (commission, rent cap, phone parsing, slot pricing) — unit tested
lib/types.ts            admin-managed property types (cached, tag "types")
lib/businesses.ts       Business hub profiles and approval
lib/clients.ts          admin client onboarding
lib/search.ts           search, vacancy board, child spaces
app/actions/*           server actions per persona
app/(pages)             /, /spaces/[id], /reserve, /holds, /me, /directory/*, /owner/*, /admin/*
```

## Not built yet (natural next steps)

- **Web Push** for visit reminders and price-drop alerts. The service worker is in place; this needs VAPID keys and a subscription table.
- A **map/list toggle** on search. Detail pages already have a map; this needs a tile provider for clustered search results.
- **Paying for featured listings** in-app. Admins can feature listings today; the next step is charging for it through the same Mobile Money flow.
- **Caretaker lead subscriptions** and **paid Business hub placements** from the monetisation matrix.
- **Recurring slot bookings** (e.g. a weekly five-a-side game) and per-venue custom event slots.
- **Stricter KYC privacy:** Cloudinary "authenticated" delivery for ID documents.
- **WhatsApp OTP** as an alternative to SMS (via the WhatsApp Business API).
