# Gadget Hub Operations â€” System Health Check

**Date:** 15 October 2026
**Scope:** Code stability, local database, owner workflows, and payment/collections readiness
**Environment:** Local Windows development environment; no production systems changed

## Executive summary

The application builds cleanly and the local database is reachable. POS, credit payment, and layaway transaction smoke checks passed with rollback, and the unit suite passes. A customer-facing accounting display bug involving late fees was fixed.

The system is **not yet an end-to-end live digital payment and reminder service**. The local database has no recorded collections-job run, and Daraja, messaging, WhatsApp, cron, and AI credentials are not configured. Provider callbacks and message delivery therefore have not been verified against live or sandbox providers.

## Confirmed working

- TypeScript check, repository lint, Prisma validation, and optimized production build pass.
- All 15 unit tests pass: catalog CSV, credit lifecycle and progress, stock thresholds, money allocation, and receipt PDFs.
- POS, credit payment, and layaway database transaction smoke tests passed and rolled their sample changes back.
- Local Prisma migrations report as applied and up to date. No production database was migrated.
- The production build includes the dashboard, sales/POS, inventory, customers, Lipa, layaway, messages, staff, settings, insights, customer payment pages, and API routes.
- Credit installments, payment ledgers, and payment submissions remain integer-valued; transaction paths use database transactions and the tested credit payment uses serializable isolation.
- The collections job checks customer channel preferences before delivery, uses deduplication keys, and tracks attempts and job runs.

## Fix made during this check

Late fees are added to an accountâ€™s outstanding balance and installment schedule, but customer repayment progress was calculated using only the original plan amount. This could make progress incorrect after a fee was applied. The customer account view and private payment portal now calculate paid-to-date and progress against principal plus the applied fee, clamp progress to 0â€“100%, and show the applied fee explicitly. Added two regression tests.

Files: `src/lib/credit-progress.ts`, `src/app/customers/page.tsx`, `src/app/pay/[token]/page.tsx`, `src/app/api/customers/[id]/route.ts`, `scripts/credit-progress.test.ts`, `src/lib/stock-levels.ts`, `src/app/dashboard/page.tsx`, `src/app/inventory/page.tsx`, `src/app/api/inventory/route.ts`, `scripts/stock-levels.test.ts`, `src/app/credit/policy-form.tsx`, `src/app/api/credit/policy/route.ts`, and `src/app/api/cron/collections/route.ts`.

Stock alert behavior was corrected: rows with no reorder point no longer inflate reorder alerts. Inventory labels rows with no threshold, and the receive-stock form lets staff set the branch reorder point while recording a receipt. Automatic late-fee application and new non-zero fee policy edits are disabled until signed customer consent can be recorded. Existing fees already recorded on plans remain visible and included in progress calculations.

## Local data snapshot

- 2 active branches, 1 active owner, and 2 active non-owner staff accounts.
- 2,077 catalog products and inventory rows; 502 total units on hand and 4 reserved.
- 2,071 inventory rows have zero on-hand stock; only 6 rows currently have stock. Confirm whether these are intentionally catalog-only items or products that need replenishment. If they are catalog-only, the dashboardâ€™s reorder count will be noisy until the business distinguishes tracked stock from unstocked catalog entries.
- 4 customers, 11 sales recorded in the last 7 days (KES 71,500), and 3 active credit plans.
- No collections scheduled-job run has been recorded in this local database. No queued or delivered customer notifications were present at check time.
- Four payment requests were in `CREATED` state; their age and business intent should be reviewed before using this data operationally.

Counts are a snapshot of the local database at check time, not a claim about production data.

## Readiness blockers and risks

1. **Collections automation is not operating locally.** No job run exists, `CRON_SECRET` is missing, and the local app does not have a scheduler calling `/api/cron/collections`. Vercel has the intended daily schedule in `vercel.json`; other hosts need an equivalent authenticated scheduler.
2. **Payment providers are not configured.** Daraja STK and C2B credentials/secrets are missing. No payment prompt, callback signature, callback reachability, automatic reconciliation, or bank settlement was end-to-end tested.
3. **Messaging providers are not configured.** Resend, Africaâ€™s Talking, and WhatsApp variables are missing. Delivery, retries, sender approval, template correctness, and fallback behavior still require sandbox/provider tests. Customer reminders are consent-gated in code; do not turn them on without recording channel-specific consent.
4. **Late-fee consent evidence is not stored.** Non-zero policy edits and automatic fee application are now disabled. Add an auditable acceptance record and include the fee terms in the agreement before re-enabling fees.
5. **Uncertain STK outcomes need operational attention.** A request left `PROCESSING` after a provider timeout is deliberately not retried, to avoid double charging. If Daraja never calls back, it can remain pending and keep related sale stock reserved. Add a timed, audited manager resolution path after confirming provider status; do not automatically expire an uncertain charge without checking Daraja.
6. **Catalog and stock need business review.** Confirm which products each branch actively tracks and set reorder points for those products. Rows without a configured threshold remain visible but do not inflate reorder alerts.
7. **Production readiness remains outstanding.** Apply migrations only after backup and a rehearsal against a production-like database; configure HTTPS callbacks and scheduler; test provider sandbox flows; add production monitoring/rate limiting and perform authenticated mobile/desktop acceptance review.

## Checks run

- `npm exec tsc -- --noEmit` â€” pass.
- `npm run lint` â€” pass.
- `prisma validate` and local migration status â€” pass/up to date.
- Unit tests â€” 15 passed, 0 failed. On this Windows Node 24 environment the stock `tsx` launch fails before tests with an OS user-info error; tests were run with a temporary process-local shim that was removed afterward.
- `npm run build` â€” pass with a randomly generated, build-process-only auth secret; `.env` was not changed.
- POS, credit payment, and layaway transaction smoke tests â€” pass with rollback.
- Read-only local database counts â€” pass; no customer names, phone numbers, emails, or secret values were included in the diagnostic output.

## Ownerâ€™s next actions

1. Confirm the intended stock-tracked catalog and clear/verify any stale payment requests.
2. Obtain and configure Daraja sandbox credentials and public callback URLs; run an end-to-end STK and C2B test.
3. Choose and configure one reminder provider first, then test opted-in delivery and opt-out handling.
4. Confirm the credit agreement and fee policy before enabling late fees.
5. Deploy the daily scheduler and verify a successful run in **Messages & alerts**.
6. Rehearse migrations, backups, and authenticated desktop/mobile workflows before production launch.
