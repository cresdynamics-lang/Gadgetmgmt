# Implementation plan

## Done on `revision/spec-ux`

- Sell can start from a scanned or typed IMEI, serial, or SKU, and refuses unknown or unavailable devices.
- A recorded M-Pesa sale stores a confirmation code. The till does not claim it collected the money.
- Owner-only finance redaction on the dashboard, insights, the insights model, and sale JSON.
- Lipa urgency order and a `tel:` call action. Stock attention order.
- Customer and Lipa account ids moved out of URLs and added to the sensitive query list.
- Desk sidebar, phone primary tabs, and an explicit Sign out control.
- Stanbic recorded as the sales checkout. `stanbicSalesStatus()` reports the missing settings and always returns `connected: false`.

## Stanbic, next, and not in this branch

The shop will take sales through Stanbic's API. The public sandbox page names an STK product and does not publish the callback body, signature, or production URL. Unofficial client samples are not a contract this server will charge against.

Before any checkout call:

1. Stanbic supplies the merchant code, the subscribed product, the headers, and the callback contract.
2. The server verifies that callback with `STANBIC_CALLBACK_SECRET` before a sale or a balance changes.
3. A missing credential returns the same kind of closed failure Daraja uses. The browser never confirms payment.
4. Daraja payer links stay until a verified Stanbic callback can replace that settlement path.

`STANBIC_CLIENT_ID`, `STANBIC_CLIENT_SECRET`, `STANBIC_MERCHANT_CODE`, `STANBIC_CALLBACK_URL`, and `STANBIC_CALLBACK_SECRET` are the settings the status already lists. Filling them does not turn checkout on. That requires a later change that checks the real callback.

## Left open on purpose

- Lipa sample rates of 40% and 1–6 months, and the markup multipliers. The live policy and 4, 6, and 12 month terms stay.
- A bank-transfer tender and named settlement accounts.
- React Native, native Face ID, trade-in, deliveries, partners, expenses, payroll, label printing, and a live socket layer.
- Stripping each Lipa plan balance from the credit API. Collection needs that amount. Shop-wide totals stay hidden.

## Checks

`npx tsc --noEmit` is clean. `npm run test:workflows` and `npm run test:access` cover scan matching, finance redaction, Lipa order, stock rank, Stanbic's closed status, and URL redaction. ESLint is clean on the files this branch edits.


## Auth branch and UX review — ordered work

1. Read #29 and comments; inspect installed Next.js auth guidance and existing data paths. Done.
2. Extend traceability artifacts; mark missing PDF/HTML and business decisions. Done; user authorized product judgment.
3. Inspect running login at representative widths before revising; capture evidence.
4. Deliver database-backed email verification, passkeys, failure lockout, owner alerts, audit, and revocable devices.
5. Enforce individual grants across server checks; restrict owner identity/provisioning; preserve finance redaction.
6. Implement accessible login, Account security, individual Access controls, and accurate recovery/empty states.
7. Verify with isolated database and WebAuthn virtual authenticator; verify error/replay/revocation/permissions; visually inspect revisions.
8. Run relevant regression tests, lint, type checking, build; document limitations; commit and push auth branch.
9. Broader operational modules remain separate vertical slices after authentication: complete sale/receipt journey, device lineage, deliveries and partner obligations, then accounting/support. Do not represent read-only desks as complete workflows.

Migration deliberately removes inherited staff authorization: Administrator must grant each account explicitly. Configure AUTH_OWNER_EMAIL (or INITIAL_OWNER_EMAIL), canonical APP_BASE_URL, and the existing email service before rollout. No production database changes are performed by this review.

Final auth verification: 18 end-to-end browser/security scenarios and 48 focused/regression checks pass. Fresh NUH seeding was exercised twice in the isolated migration database and retained exactly one shop. The migration applies to the original schema. See UX_QA_REPORT.md and artifacts/auth-review/results.json for scope and limits.

## PWA completion pass

The product target is now an installable PWA, not an Expo/native client. WebAuthn provides platform Face ID/fingerprint/device PIN; native-only backlog items are replaced by browser-supported acceptance tests. No offline payment or customer-data queue is introduced.

Execution: (1) app-wide service worker, safe offline/install/update behavior, themes and bounded foreground sessions; (2) persistent repair/delivery/partner/trade-in and device histories; (3) owner expense/payroll/recurring/marketing records and exports; (4) permission expiry and finance boundaries; (5) transaction, API, accessibility and responsive browser verification. Preserve existing Lipa policies until Administrator approves changes. Physical iPhone, actual push/email delivery, and production accounting-policy decisions remain external acceptance gates rather than fabricated test successes.


### PWA pass implementation and verification

Completed: shared themes/accessibility, app-wide offline/install/update shell, bounded sessions and expiring grants; persistent operations/device histories/labels; COD sale-to-delivery payments; owner ledger/recurring bills/CSV; variant planning; sourced AI scoping; receipt recovery worker and readiness. Added a deployable migration without modifying production data.

Validation: `npm run test:pwa:e2e` (isolated database and fake providers), `PWA_TEST_DATABASE_URL=<isolated review database> npm run test:pwa`, regression suites, TypeScript, lint and production build. Browser artifacts are under `artifacts/pwa-review`. The dated PWA requirements matrix supersedes earlier “not built” statements.

Rollout dependencies: apply migrations using the established deployment process; deploy application and notification worker together; configure canonical HTTPS, owner identity and provider secrets; grant new operational capabilities individually. Old devices without a live foreground lease reauthenticate. No automatic data consolidation, inventory backfill, bank charging, payroll deductions or financing-policy change is performed.

Remaining external acceptance work: real iPhone installed-mode/Face ID/camera/VoiceOver/large text; actual provider inbox/push and physical label printing; confirmed bank, statutory payroll, trade-in exchange/refund and replacement financing policy. These are explicitly tracked dependencies, not simulated production passes.


App PIN instruction: add device PIN hashes/credential versions and additive migration; make password + email ownership verification mandatory for setup/recovery; provide primary PIN unlock and optional WebAuthn; preserve verified sessions during rollout; verify replay/expiry/reset/concurrency/lockout and user-visible Settings flows before deployment. No production migration is applied until the reviewed release workflow runs.


## Six-box PIN and protected Owners
1. Reuse native semantic inputs behind masked PIN boxes; add reveal/conceal controls across password forms.
2. Persist explicit approval for additional Owners, keeping unapproved historical Owner rows unable to sign in.
3. Allow configured-Owner provisioning with password confirmation and an audit event; reject peer account and device mutations on the server.
4. Verify native PIN editing, reveal privacy, responsive layouts, accessibility, additional-Owner authentication and both directions of peer protection.
5. Apply the additive approval-column migration before releasing the application; leave production account creation to the configured Owner.


## Employee credential delivery and method policy
1. Add secure generated/manual password inputs and explicit credential-email options.
2. Send directly through the accounts email service after the account/reset transaction commits; never persist plaintext passwords in app logs or queues.
3. Add administrator-confirmed employee password reset, with device/challenge invalidation and Owner peer protection.
4. Add account and device sign-in policy fields and method-bound tickets/sessions; keep ownership-only verification from bypassing disabled password sign-in.
5. Verify invitation, opt-out, provider failure, reset, revoked old credentials and policy changes in an isolated running production build; rerun operations/PWA checks.


## Independent catalog slice
Completed: typed public-reference schema and additive migration; AppleDB and dedicated Samsung Wikidata adapters; durable leases/budgets/cache/backoff; append-only history and aliases; authorized lookup API/UI; password-confirmed Owner controls; zero-LLM independent Docker collector, health/watchdog, private local backup and runtime; production worker bundle/readiness wiring. Verify source coverage before adding licensed retail feeds or promoting reference data into operational products. Production deployment remains separate from the running local collector.
