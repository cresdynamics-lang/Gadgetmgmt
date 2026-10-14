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

The seed creates one owner account only. Additional staff accounts should be created from the Staff screen. The sample product and opening stock are development data; replace them with verified business data before operational use.

## Database

The Prisma schema is in `prisma/schema.prisma`. `db:push` is intended for local development. Use reviewed Prisma migrations and a managed PostgreSQL service for deployments. Never commit `.env`; only `.env.example` belongs in source control. The credentials in `docker-compose.yml` are for a local development database only and must not be reused in production.

## Current workflow boundaries

- Completed cash, M-Pesa, and card sales are recorded locally in the database. Payment-provider settlement/integration is not configured.
- Inventory receipts and sales are recorded in an inventory movement ledger.
- Take-home credit sales can collect a deposit and create a 4, 6, or 12 month repayment schedule. Inventory is sold at checkout, and staff can share a secure customer account link.
- Customers can submit M-Pesa transaction references from their account link. Staff must verify each reference against the M-Pesa statement before approving it; only approved payments update the balance.
- Automated M-Pesa collection and outbound email/SMS code is implemented but remains inactive until provider credentials, customer opt-in, a public callback URL, and the scheduled job are configured. WhatsApp delivery is not implemented.
- Credit checkout now creates a separate 48-hour payer link for each remaining product balance. It displays only the branch, amount, and payment purpose; the payer enters their own Kenyan phone number and receives a Daraja STK prompt. A signed callback is checked against the request, amount, M-Pesa receipt, and payer phone before the credit ledger is updated. The older customer account link remains available for account schedules and manual reference submissions.
- POS also supports a standalone third-party payer link for walk-in purchases. The sale remains pending while the full amount is unpaid, inventory is reserved for up to 48 hours, and stock is released automatically on expiry. A verified Daraja callback completes the sale and updates the receipt; callback discrepancies are held for staff review in Messages & alerts.
- Customer SMS/email reminder preferences default off. A staff member can enable a channel in the customer profile only after the customer has agreed. The daily `/api/cron/collections` job queues reminders three days before due, on the due date, and three days overdue then weekly. It also queues branch daily email reports for owners and branch managers. Delivery attempts and failures appear in Messages & alerts; failed messages retry up to five times. Sent delivery history is pruned after 180 days.
- Email delivery uses Resend; SMS uses Africa's Talking. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM`, or `AT_USERNAME` and `AT_API_KEY` (optional `AT_SENDER_ID`). The job is scheduled for 07:30 East Africa Time in Vercel using `vercel.json`; other hosts must call the route daily with `Authorization: Bearer $CRON_SECRET`.
- Online M-Pesa uses Daraja STK Push and is disabled until sandbox/live credentials, shortcode, passkey, callback secret, and public `APP_BASE_URL` are configured. Test with Daraja sandbox and a public HTTPS callback before going live. Use `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline` for PayBill or `CustomerBuyGoodsOnline` for Till. The app never trusts the browser to confirm payment; only the verified callback updates the credit balance.
- Business Insights compares recent sales, collections, estimated gross profit, stock cover, and Lipa ageing. Its optional OpenAI briefing sends aggregate metrics only; names, phone numbers, and individual customer records are not sent to the model. Set `OPENAI_API_KEY` in the server environment to enable briefing generation. `AI_INSIGHTS_MODEL` selects the model (defaults to `gpt-4.1-mini`). Without a key, the metrics dashboard remains available and the page explains how to enable AI.
- Credit-plan refunds, inter-branch transfers, serial/IMEI tracking, and password recovery are not implemented yet.
- Configure HTTPS, strong secrets, backups, monitoring, migration automation, and deployment-specific access controls before production use.

## Validation

```bash
npm run lint
npm run build
npm run test:money-allocation
npm run test:receipt-pdf
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
