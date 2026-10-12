# GadgetHub Operations System

Multi-branch retail operations app built with Next.js, Auth.js, Prisma, and PostgreSQL. The current implementation includes database-backed authentication, dashboard, POS sales, inventory, customers, credit payments, reports, staff accounts, and branch settings.

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
- Credit accounts can accept payments; credit-plan creation, refunds, inter-branch transfers, serial/IMEI tracking, and password recovery are not implemented yet.
- Configure HTTPS, strong secrets, backups, monitoring, migration automation, and deployment-specific access controls before production use.

## Validation

```bash
npm run lint
npm run build
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
npm run test:catalog-csv
```

Set `CATALOG_OPENING_STOCK` only after confirming physical counts. Re-imports are idempotent for catalog rows and opening receipts. In production, use reviewed Prisma migrations instead of `db push`; this repository does not currently contain migration history.

The POS smoke test uses an active branch and administrator, verifies sale lines, stock decrement, inventory movement, and credit-plan linkage inside one serializable transaction, then intentionally rolls back all test data.

## Lipa Mdogo Mdogo (layaway)

Layaway is separate from post-sale credit. A cashier selects an active customer and an in-stock item, takes the first payment, and reserves the requested quantity at the current price. Further payments are recorded with method, reference, receiver, and timestamp. The order becomes ready for pickup only when its payment ledger covers the full locked total. A staff member then confirms handover; that transaction creates the paid sale and inventory movement, and only then decrements on-hand and reserved stock.

POS sales and each layaway installment can be downloaded as PDF receipts from their receipt/payment views. Layaway receipts show the received amount, payment method/reference, cumulative paid amount, remaining balance, receiving staff member, and pickup invoice once collected.

The current workflow supports one product per layaway order and has no cancellation, refund, expiry, or late-fee policy. Orders remain reserved until paid and collected; define and approve cancellation/refund and reservation-duration rules before using the workflow as a production policy. To test the database transaction lifecycle without retaining test data, run `npm run db:test-layaway-transaction`.

The schema change for auditable split tenders and idempotent catalog opening receipts is recorded in `prisma/migrations/20261012143000_pos_payments_and_catalog_idempotency/migration.sql`. This is an incremental migration, not a baseline for an empty production database; establish and review a baseline before adopting migrations on an existing deployment.
