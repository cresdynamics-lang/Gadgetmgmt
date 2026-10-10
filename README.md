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
```
