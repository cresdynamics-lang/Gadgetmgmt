# GadgetHub Project Status Report

Date: 2026-10-12

Feature update: 2026-10-13

Remote implementation includes the catalog/POS, layaway, downloadable receipt, and credit-settlement hardening changes on `main`.

## Delivered

- Added an idempotent CSV catalog importer and verifier. The supplied market master contains 519 unique items across seven categories; the importer creates NEW and EX-UK condition variants per active branch.
- Preserved source groups, configurations, notes, and both integer market prices. Supplier cost and opening stock remain zero unless verified values are supplied; optional opening receipts are auditable and deduplicated.
- Added catalog and rollback-only POS transaction commands.
- Hardened POS checkout with a serializable transaction, guarded stock decrements, sale/line snapshots, receipt numbers, ledger movements, and credit-plan creation for credit sales.
- Added role-based page/API access, owner staff access controls, and account status revalidation.
- Protected health checks, added production Auth.js secret validation, and documented pooled/TLS database configuration.
- Shared a quote-aware catalog CSV parser between import and verification; verification now compares exact source and variant prices, and invalid/overflowing prices are rejected.
- Made opening receipts idempotent under concurrent imports, expanded invoice identifiers, guarded POS integer totals, and persisted split-tender methods and amounts.
- Added an itemized printable POS receipt, split-tender reporting by actual channel, focused CSV parser tests, and an incremental Prisma migration.
- Added separate layaway orders with branch-scoped stock reservation, locked price/cost snapshots, payment history, fully-paid pickup gating, and sale/inventory-ledger creation at confirmed handover.
- Retired Save & Collect for new business. New orders are blocked, its navigation entry is removed, and the legacy close-out page remains unlisted for managers/owners to resolve existing customer commitments without deleting their records.
- Added downloadable PDF receipts for POS sales and individual layaway installments, including running balance and pickup invoice details where applicable.
- Receipt PDF generation tests passed for both POS and layaway receipt formats; lint, TypeScript, and production build passed after adding the download controls.
- Credit collections update the plan, payment ledger, and originating sale settlement atomically. Owners can collect across branches; other roles remain branch-scoped. Payment reporting uses the collection date and excludes duplicated layaway handover tenders.
- Added private, expiring third-party payment links for outstanding Lipa balances. The payer enters their own M-Pesa number on a minimal page; Daraja STK callbacks are authenticated with an HMAC signature and checked for request ID, exact amount, payer number, and receipt before the credit ledger updates.
- Added a separate POS payer-link checkout for walk-in purchases. Stock is reserved while payment is pending, released when the 48-hour request expires, and committed when a verified Daraja callback settles the sale. The cashier receipt polls for settlement and enables receipt printing after payment clears.
- Added reminder consent preferences to customer records (SMS and email default off), a deduplicated message outbox with delivery/retry history, daily installment reminders, branch-scoped owner/manager email summaries, and a Messages & alerts workspace.
- Added Resend email and Africa's Talking SMS provider adapters, a secured scheduled collections route, and a Vercel 07:30 EAT cron entry. Provider values are documented in `.env.example`; secrets are not checked into the repository.
- Exposed customer account and third-party payer pages publicly while keeping staff application routes authenticated.
- Checkout rejects unknown fields and invalid payment-breakdown combinations instead of silently ignoring caller values.
- Rollback-only credit collection regression test verifies branch isolation, partial sale settlement, and final paid state.
- Checkout discount/tax line allocations now use integer-safe proportional arithmetic; large-value and validation boundary tests pass.

## Verification

- New payment/reminder schema validated; local development PostgreSQL schema synchronized successfully with additive changes. Prisma Client types regenerated, and final `tsc --noEmit` and Prisma schema validation passed after the POS payer-link receipt refresh.
- Native Prisma query-engine file replacement was blocked by the running Windows development server. The existing engine was kept in place; run `npm run db:generate` after stopping/restarting the dev server if the local generator reports a file-lock error again.
- The full lint/build/test suite was not run for this feature update.

- `npm exec prisma -- validate`: passed.
- `npm run db:generate`: passed.
- `npm exec tsc -- --noEmit`: passed.
- `npm run lint`: passed with exit code 0.
- `npm run build`: passed.
- Catalog importer dry-run: passed; 519 unique source records expand to 1,038 condition variants per active branch across seven categories.
- Local database schema push succeeded against PostgreSQL on this workstation.
- Owner seed succeeded and browser sign-in reached the Westlands dashboard.
- Supplied CSV dry-run validated 519 unique records across seven categories; import created 2,076 variants across two active branches with opening stock set to zero.
- Catalog verification confirmed all 2,076 variants and exact source prices. The rollback-only POS transaction smoke test passed.
- Catalog parser tests cover quoted commas, CRLF, duplicate IDs, zero prices, fractional prices, and PostgreSQL integer overflow; all three tests passed.
- Money allocation tests passed, including values whose intermediate products exceed JavaScript's safe integer precision.
- Layaway lifecycle smoke test passed against local PostgreSQL; reservation, two installments, pickup sale, inventory movements, balances, and final order state were checked in one transaction and rolled back.
- Credit payment lifecycle test passed, including wrong-branch rejection, owner cross-branch collection, partial settlement, and final paid state; test writes were rolled back.
- POS sale, catalog parsing, and downloadable receipt tests passed after this review.
- Production dependency audit passed with zero findings using `npm audit --omit=dev --omit=optional --audit-level=high`; the complete development toolchain still includes a Prisma CLI `deepmerge-ts` advisory.
- Layaway production page and API routes are included in the passing production build.
- Prisma validation/generation, lint, TypeScript, and production build passed. The production build used a process-local throwaway Auth.js secret.

## Remaining To Complete

### 1. Connect And Initialize The Database

Local development database initialization is complete on this workstation. The commands below are retained for repeatable setup on another machine; `db:push` is for local development only. The owner password was supplied at setup time and was not committed.

```powershell
npm run db:push
npm run db:generate
npm run db:seed
npm run db:import-catalog -- "C:\Users\Administrator\Downloads\Gadget_Hub_Complete_Market_Master.csv"
npm run db:verify-catalog -- "C:\Users\Administrator\Downloads\Gadget_Hub_Complete_Market_Master.csv"
npm run db:test-pos-transaction
```

### 2. Load Verified Business Data

- The attached CSV contains **519** unique products across seven categories, not 489. Both NEW and EX-UK price variants produce 1,038 catalog variants per active branch.
- The source contains market prices, not supplier acquisition cost. Imported `costPrice` is 0 until verified supplier cost data is entered; margin reports are not reliable before then.
- The source contains no physical stock counts. Opening stock remains 0 until a branch-by-branch count is confirmed. Only then set `CATALOG_OPENING_STOCK`; the importer records opening receipts in the inventory ledger.
- Confirm product naming, variant/category mapping, source price currency and accuracy with the business owner before import into a live database.

### 3. Finish POS And Credit Operations

- Exercise cash, M-Pesa, card, credit, and split tenders against a working database, including concurrent last-unit checkout and failure rollback. The split tender now stores each tender method and amount.
- The API supports discount/tax values, but the current POS UI has no adjustment controls. Define the adjustment policy and add the approved UI/authorization path before using discounts or tax operationally.
- Live cash, M-Pesa, card, and split-tender checkout flows have not been separately exercised through the browser; the database smoke test covers the rollback-only credit transaction path.
- Decide and enforce customer credit-limit rules, default due dates/installment policy, and what should happen when a customer already has overdue credit.
- M-Pesa STK and notification integrations are implemented but not activated until deployment credentials and sandbox verification are complete. Refunds and void/reversal workflows are not implemented.
- Third-party payment, scheduled messaging and owner digest code are implemented but not live until the migration is applied and Daraja/Resend/Africa's Talking/deployment scheduler credentials are configured. M-Pesa sandbox-to-live approval and callback reachability remain external setup steps.
- Layaway currently supports one product per order and deliberately has no cancellation/refund, reservation expiry, or late-fee handling until business policy is approved.
- Login rate limiting and abuse monitoring remain production hardening requirements. Configure edge/WAF rate limits until a shared application-level limiter is deployed.

### 4. Prepare For Production

- Review the new incremental Prisma migration and establish a migration baseline for any existing production database; this repository still has no prior migration history, so do not use `db push` as a production deployment process.
- Configure a managed PostgreSQL connection pool for runtime and a direct migration connection where required; require TLS and verify backup/restore procedures.
- Set deployment-specific `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and database credentials. The local generated secret is not a production secret and must not be copied to deployment.
- Add rate limiting and monitoring, establish audit/retention practices, test access policies with each role, and validate that every sensitive API remains branch-scoped.
- npm reports a high-severity advisory in the Prisma CLI config dependency (`deepmerge-ts`); the Prisma CLI is development-only, but production install/audit must omit dev and optional peer tooling, and the CLI advisory should be revisited when a compatible Prisma release is available.
- Run dependency/security review and complete a production-like staging test before launch.
- Production dependency audit (`npm audit --omit=dev --omit=optional --audit-level=high`) reports zero vulnerabilities. The full development tree still reports a high-severity `deepmerge-ts` advisory through Prisma CLI; keep the CLI out of runtime deployments and revisit on a compatible upstream fix.
- Add and verify login rate limiting/monitoring before public or internet-accessible deployment; no distributed limiter is configured in this repository.

## Final Acceptance Checklist

- [x] Lint, Prisma schema validation, Prisma client generation, TypeScript, and production build pass.
- [x] Catalog CSV dry-run validates 519 unique IDs, integer price fields, and seven categories.
- [x] Code/report pushed to `origin/main`; local `.env` excluded.
- [x] Local development database schema push succeeds using this workstation's configured PostgreSQL credentials. Production migration deployment is not yet verified.
- [x] Owner seed succeeds and the configured owner can sign in.
- [x] Database verification confirms all expected catalog variants and exact source prices across active branches.
- [x] POS transaction smoke test passes against PostgreSQL and rolls back its test data.
- [x] Credit collection keeps plan/payment/sale ledgers consistent and passes branch-scope regression checks.
- [x] Money allocation remains exact at supported integer boundaries.
- [ ] Verified supplier costs and physical stock counts are loaded.
- [ ] Production migrations, secrets, TLS/pooling, backups, and operational integrations are configured.
- [ ] Apply migration `20261013103000_payment_requests_and_notifications`, generate Prisma client, and validate payer callbacks in Daraja sandbox before live credentials.
- [ ] Configure provider variables and a public HTTPS `APP_BASE_URL`; verify email sender domain and SMS sender registration; capture customer reminder consent.
- [ ] Configure `CRON_SECRET` in the deployment and verify daily job execution and message retries in Messages & alerts.

## Database Blocker Details

The schema, owner seed, catalog import/verification, owner browser sign-in, and rollback-only POS transaction test are complete on this local workstation. Supplier costs and physical opening counts remain unset; all imported stock is zero. Credit policy, payment-provider settlement, refunds/voids, managed production database configuration, backups, and production staging acceptance remain business/operations requirements and have not been inferred or fabricated. Rotate the owner password before production use because setup credentials were shared during this session.
