# GadgetHub Operations System

Multi-branch retail operations app built with Next.js, Auth.js, Prisma, and PostgreSQL. The current implementation includes database-backed authentication, dashboard, POS sales, inventory, customers, credit payments, staff accounts, branch settings, and owner/manager business insights.

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL 16 or newer (Docker Compose is provided for local development)

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `NEXTAUTH_SECRET` to a unique random value (for example, `openssl rand -base64 32`). Set `INITIAL_OWNER_EMAIL` and `INITIAL_OWNER_PASSWORD`; the password must be 12 to 72 characters and must not be reused elsewhere.
3. Start a local PostgreSQL instance. To use the included development container, run:
   ```bash
   docker compose up -d
   ```
4. Install packages and create the local schema:
   ```bash
   npm install
   npm run db:push
   npm run db:generate
   ```
5. Create the initial owner, branches, and sample product/stock:
   ```bash
   npm run db:seed
   ```
6. Start the application:
   ```bash
   npm run dev
   ```
7. Open http://localhost:3000 and sign in using `INITIAL_OWNER_EMAIL` and `INITIAL_OWNER_PASSWORD`.

For production, generate `NEXTAUTH_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Use the database provider's pooled connection URL for application traffic, enable TLS with `sslmode=require`, and retain a separate direct URL for schema deployment if the provider requires one.

The seed creates the owner from `INITIAL_OWNER_EMAIL` and `INITIAL_OWNER_PASSWORD`, and stores the starting page and capability entitlements for owner, branch manager, cashier, and inventory lead. The owner edits both on the same Role access screen. Each screen checks the saved page list on the server. Re-seeding does not overwrite entitlements an owner has already edited. Outside production, the seed also creates local test accounts for the other three roles at `@gadgethub.test` addresses. Those accounts share `INITIAL_OWNER_PASSWORD` and are not created when `NODE_ENV` is `production` unless `SEED_DEMO_STAFF=true`. The sample product and opening stock are development data; replace them with verified business data before operational use. The owner edits role access at `/access`.

## Database

The Prisma schema is in `prisma/schema.prisma`. `db:push` is intended for local development. Use reviewed Prisma migrations and a managed PostgreSQL service for deployments. Never commit `.env`; only `.env.example` belongs in source control. The credentials in `docker-compose.yml` are for a local development database only and must not be reused in production.

## Current workflow boundaries

- Cash, card, and in-store M-Pesa tenders are recorded by staff. Third-party payer links can initiate a Daraja M-Pesa STK prompt and only settle after a verified provider callback.
- Inventory receipts and sales are recorded in an inventory movement ledger. Reorder alerts use configured positive reorder points; staff can set the branch threshold while receiving stock, and zero means no reorder alert is configured.
- Take-home credit sales can collect a deposit and create a 4, 6, or 12 month repayment schedule. Inventory is sold at checkout, and staff can share a secure customer account link.
- Customers can submit M-Pesa transaction references from their account link. Staff must verify each reference against the M-Pesa statement before approving it; only approved payments update the balance.
- Scheduled Lipa status automation now updates plans through Active, DueSoon, Due, Grace, Late 1–3, Recovery, and Settled states. Branch policy controls grace days, minimum deposit, credit exposure limit, and manager/owner escalation thresholds.
- Lipa tracks a customer reliability score and optional device IMEI. Customers can request a due-date change from their secure account link; the schedule changes only after manager approval. Automatic late fees are disabled until signed customer consent and agreed fee terms can be stored on the plan.
- Daraja C2B confirmation can reconcile payments by the plan reference printed at checkout. Unmatched and over-balance transactions are held for review; duplicate transaction IDs are idempotent. Configure the C2B callback secret and register the public route with Daraja before enabling it.
- Email, SMS, and optional WhatsApp template delivery are supported. Customer channel preferences default off; staff may enable them only after the customer consents. WhatsApp reminders use an approved Cloud API template with a URL button, with SMS fallback only when SMS consent is separately enabled.
- Credit checkout creates a separate 48-hour payer link for each remaining product balance; the staff member can share it, and the payer enters a Kenyan phone number for the Daraja STK prompt. The callback URL's request-bound HMAC token and matching checkout request are checked alongside amount, M-Pesa receipt, and payer phone before the credit ledger is updated. The older customer account link remains available for account schedules, manual reference submissions, and reschedule requests.
- POS also supports a standalone third-party payer link for walk-in purchases. Staff enter the payer’s Kenyan mobile number and confirm permission for a one-time SMS; the app creates the private link, texts it immediately through Africa’s Talking, and pre-fills that number for the payer’s M-Pesa prompt. Delivery status is recorded in Messages & alerts, failed messages retry through the scheduled outbox, and the cashier can copy the link if delivery fails. The sale remains pending while unpaid, inventory is reserved for up to 48 hours, and stock is released automatically on expiry. A verified Daraja callback completes the sale; callback discrepancies are held for staff review.
- Customer SMS/email/WhatsApp reminder preferences default off and are tracked by channel. The daily `/api/cron/collections` job refreshes plan states, queues consented reminders, escalates overdue accounts to managers and owners, and queues branch email reports. Each invocation is recorded so owners can see the last run, account/message counts, and whether the run is current in Messages & alerts. Delivery attempts and failures appear there too; failed messages retry up to five times. Sent delivery history is pruned after 180 days.
- Email delivery uses Resend; SMS uses Africa's Talking. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM`, or `AT_USERNAME` and `AT_API_KEY` (optional `AT_SENDER_ID`). The job is scheduled for 07:30 East Africa Time in Vercel using `vercel.json`; other hosts must call the route daily with `Authorization: Bearer $CRON_SECRET`.
- Online M-Pesa payer links currently use Safaricom Daraja STK Push and stay disabled until sandbox/live credentials, shortcode, passkey, callback secret, and public `APP_BASE_URL` are configured. Test with Daraja sandbox and a public HTTPS callback before going live. Use `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline` for PayBill or `CustomerBuyGoodsOnline` for Till. The app never trusts the browser to confirm payment; only a verified callback updates a balance. Stanbic is the chosen checkout for sales. It is not called yet: the sandbox portal does not publish a callback this server can verify, and a sale must not be marked paid from an unverified Stanbic response. Until that contract is confirmed, the till records a payment the shop has already taken.
- For C2B reconciliation, set `MPESA_C2B_CALLBACK_SECRET` and register `https://your-domain/api/webhooks/mpesa/c2b?key=<secret>` with Daraja as the confirmation URL. Customers/payers must enter the plan reference shown on their Lipa account. Treat this callback URL as a credential and rotate it if exposed.
- The existing layaway workflow remains a reserve-until-paid flow. It is not yet migrated into the installment plan lifecycle; no new layaway due-date or credit policy is assumed.
- WhatsApp reminders require an approved Meta template containing one body text parameter and one URL button. Configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_PAYMENT_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE`, and `WHATSAPP_PAY_BUTTON_INDEX`. The button URL prefix in the approved template must target `APP_BASE_URL/request/`; confirm the exact component configuration with Meta before enabling customer consent.
- Business Insights compares recent sales, collections, estimated gross profit, stock cover, and Lipa ageing. Its optional OpenAI briefing sends aggregate metrics only; names, phone numbers, and individual customer records are not sent to the model. Set `OPENAI_API_KEY` in the server environment to enable briefing generation. `AI_INSIGHTS_MODEL` selects the model (defaults to `gpt-4.1-mini`). Without a key, the metrics dashboard remains available and the page explains how to enable AI.
- Credit-plan refunds, inter-branch transfers, device serial tracking beyond the single optional Lipa IMEI, and password recovery are not implemented yet.
- Configure HTTPS, strong secrets, backups, monitoring, migration automation, and deployment-specific access controls before production use.

## Messages & Alerts

`/notifications` provides an inbox for all active staff, with a bell panel, unread counts, and new-message toasts across workspace pages. These in-app notifications work in a normal browser and in the installed PWA without email or browser notification permission. Owners and branch managers can send immediately or schedule messages; managers are limited to their branch. In-app delivery is always included, with optional email through the shared company Resend sender and optional browser push. The notification screen includes an Install app action, device subscription controls, and a self-test. Run `npm run notifications:setup-push` once to create stable server push keys in local `.env`; retain them in production configuration. Push requires HTTPS (localhost is allowed for testing), and iOS requires installation to the Home Screen. Senders can review scheduled messages, read state, attempts and provider errors.

Set `RESEND_API_KEY` on the server. From the email warning in Messages & Alerts, choose **Configure email** to save the company's dedicated sender address and display name. Only the company owner can change these settings; changes apply to staff and customer emails without restarting delivery. The sender domain must be verified in Resend. `EMAIL_FROM` remains an optional deployment fallback. The Resend account address is separate from the sender. Start Redis and the dedicated worker with `npm run notifications:worker`, or use the Compose `notifications` profile. Messages are persisted before enqueueing and recover after worker/Redis downtime. Email status SENT means provider acceptance, not confirmed inbox delivery.

See [notification setup and deployment](docs/notifications.md) and [environment template](docs/notifications.env.example). Apply the reviewed notification migrations through your deployment process after reviewing the existing incremental migration baseline. Local development follows the `db:push` workflow above. Run `npm run test:notifications` for regression checks and `npm run test:notifications:e2e` for isolated browser/API/database/worker verification. The latter uses a captured email provider by default.

## Validation

```bash
npm run lint
npm run build
npm run test:money-allocation
npm run test:receipt-pdf
npm run test:credit-lifecycle
```

## Catalog intake

The supplied `Gadget_Hub_Complete_Market_Master.csv` contains 519 unique source items (not 489) across seven categories. The importer creates NEW and EX-UK condition SKUs for every active branch, so one branch gets 1,038 variants. It maps the two source price columns to retail market prices, leaves purchase cost at 0 until actual supplier cost is known, and leaves stock at 0 unless a verified count is configured.

```powershell
npm run db:push
npm run db:generate
npm run db:import-catalog -- "C:\Users\pc\Downloads\Gadget_Hub_Complete_Market_Master.csv" --dry-run
npm run db:import-catalog -- "C:\Users\pc\Downloads\Gadget_Hub_Complete_Market_Master.csv"
npm run db:verify-catalog -- "C:\Users\pc\Downloads\Gadget_Hub_Complete_Market_Master.csv"
npm run db:test-pos-transaction
npm run db:test-credit-payment
npm run test:catalog-csv
npm run test:money-allocation
```

Set `CATALOG_OPENING_STOCK` only after confirming physical counts. Re-imports are idempotent for catalog rows and opening receipts. In production, use reviewed Prisma migrations instead of `db push`; this repository does not currently contain migration history.

The POS smoke test uses an active branch and administrator, verifies sale lines, stock decrement, inventory movement, and credit-plan linkage inside one serializable transaction, then intentionally rolls back all test data. The credit payment smoke test checks branch scoping and that installment payments update the linked sale settlement and plan balance atomically, then rolls back its writes.

Keep the Prisma CLI in development dependencies. The current production dependency audit is clean when omitting development and optional tooling; the full development-tool tree still reports a high-severity advisory in Prisma CLI's `deepmerge-ts` configuration dependency. Review on the next compatible Prisma CLI update.

## Installment purchases

Use Lipa Mdogo Mdogo for installment purchases: the customer takes the product at checkout after paying the agreed deposit, then pays the balance over the selected term. The retired Save & Collect workflow no longer accepts new orders. Its database history and a restricted close-out screen remain temporarily so existing commitments can be completed without losing their payment and inventory records.

The schema change for auditable split tenders and idempotent catalog opening receipts is recorded in `prisma/migrations/20261012143000_pos_payments_and_catalog_idempotency/migration.sql`. This is an incremental migration, not a baseline for an empty production database; establish and review a baseline before adopting migrations on an existing deployment.

### Device authentication and individual access

Issue #29 adds password + a six-digit emailed code on each new device, platform passkeys, account lockout after three failed verifications, and server-checked device sessions. Configure `AUTH_OWNER_EMAIL` (or `INITIAL_OWNER_EMAIL`) to Victor’s stored OWNER email, a canonical HTTPS `APP_BASE_URL`, `NEXTAUTH_SECRET`, and the existing Resend/company sender settings before rollout. The email provider must be working before a new device can sign in; delivery failures never create a session.

Apply the new schema migration through the established deployment process. Existing JWTs have no verified device and will require sign-in again. Existing staff start with no operational grants: Victor must select each person in **Access** and grant screens and actions explicitly. Role templates no longer authorize staff. Only Victor can create accounts or promote users; owner access cannot be delegated. Fresh seeding creates NUH only; it does not merge, rename, or move stock in existing branches.

**Account security** in navigation lists verified login devices, separately from the physical-stock **Devices** module. Revoke requires password confirmation and ends access on the next server request. Passkey enrollment also requires a password. Browsers use operating-system Face ID, fingerprint, or screen-lock PIN through WebAuthn; the server never receives biometric data or the device PIN. This is the web client, not a native React Native/Expo app. Backgrounding locks the workspace locally and sends a server lock; reopening requires authentication. Offline browsers cannot deliver that lock until connected, and no remote wipe of already-displayed data is implied.

After verifying a locked account holder’s identity, Victor can unlock staff in Access. If the owner is locked out, an authorized server operator can run `npm run auth:unlock -- owner@example.com`; this appends an audit event and leaves revoked devices revoked. It does not bypass email verification or reset passwords.

`node scripts/auth/review.mjs` runs the isolated local Chromium/WebAuthn review against `gadgethub_auth_review` on local PostgreSQL (the Docker development credentials), port 3012, and `/usr/bin/chromium`. Create that separate database and apply the schema with `prisma db push` first. The test process substitutes email transport; production authentication has no test-code bypass. Screenshots and results are saved to `artifacts/auth-review`. npm aliases `webauthn-server` and `webauthn-browser` select current SimpleWebAuthn versions independently of Auth.js’s optional legacy WebAuthn provider peer dependencies.
