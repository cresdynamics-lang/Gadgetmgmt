# PWA implementation and QA report — 2026-11-13

This is the current report. The previous authentication-only report is retained below as historical evidence; its missing-feature list is superseded by this section and the dated PWA requirements matrix. The PDF/HTML were unavailable. Requirements authority is the supplied master prompt, confirmed repository decisions and issue #29; the user explicitly authorized design judgment and a PWA target.

## Implemented and verified

- **Operational accuracy:** real repair assignment/pass/fail, outgoing/borrowed partner device obligations, trade-in/return quarantine and inspection, delivery custody/COD, append-only device passports, per-device cost snapshots, and unique-identifier label PDFs. Database tests preserve one physical device through receipt, repair, partner return, two sales, return and repeated trade-in. Borrowed stock needs approved supplier cost before sale and settlement cannot duplicate an expense.
- **Cashier journey:** actual browser scan/manual serial → eligible device → identified customer → unpaid COD sale → real receipt PDF → queued email recovery. Delivery UI records rider dispatch, named proof, actual payment and closure against the original sale. A queued email is never reported as delivered.
- **Owner controls:** actual expense/payroll/marketing payments, immutable reversing corrections, recurring obligations and period-payment uniqueness, audited bill pause/resume, protected CSV export, capital/operating distinctions, estimated finance summary and owned-stock basis excluding borrowed stock. All money mutations/exports require fresh owner password confirmation where applicable; write-only repair costs remain unreadable to staff.
- **Permissions/security:** expiring individual grants apply on subsequent server requests; owner-only endpoints/exports are denied to staff. Passport and operational staff payloads omit protected costs and private input hashes. AI gets only explicitly granted datasets and source links, with no mutation tools. Database-backed foreground locking and expiring leases prevent a suspended client renewing an expired session.
- **PWA:** app-wide standalone manifest and authorized launch, install guidance, explicit update/restart, public-only offline recovery, connection feedback, system/light/dark appearances and safe areas. CacheStorage inspection proves that only the offline HTML/icons are retained. Authenticated pages/APIs and unsubmitted money are not cached or queued.
- **Usability/accessibility:** explicit field labels, mobile table labels/header associations, 44px actions, readable mobile inputs, focusable scroll region, drawer/quick-navigation focus management, readable semantic status colors and reduced motion. Large product prices and Add actions wrap instead of clipping.

## Verified defects fixed, ordered by impact

| Impact | Finding | Correction and evidence |
| --- | --- | --- |
| Critical — operational | Named modules lacked persistent handovers, inspections and payment reconciliation | Transactional state machines, concurrency versions, request-key deduplication and actual ledger/payment writes; transaction/browser evidence |
| Critical — privacy | New cost/history/AI paths could expose owner data unless explicitly shaped | Staff DTO allowlists/redaction; individual capability and expiry checks; browser API/model-input inspection |
| High — security | Browser background lock had no server bound after suspension/network loss | Local prepaint cover, lock beacon, renewable short lease and expired-heartbeat rejection; browser verified |
| High — task completion | Raw manual serial could fail identifier lookup | Physical identifier lookup precedes SKU fallback; regression + live cashier journey |
| High — recovery | Receipt delivery failure needed recovery without reselling | Saved PDF, queue/retry contract and atomic worker delivery; failure stays unsent |
| High — readability | Legacy palette declarations caused self-referencing colors/invisible input boundaries | Shared literal base tokens, scoped theme overrides; revised screenshots |
| High — accessibility | Dark controls/headings had insufficient contrast, customer select lacked a name, activity scrolling lacked focus | Shared contrast corrections, explicit name, focusable region; automated route/theme scans |
| Medium — mobile | Long price clipped inside catalog card despite no document overflow | Wrapped name/price/action layout; revised 390px screenshot |
| Medium — financial control | Recurring bills could not be paused without losing history | Audited pause/resume; payments blocked while paused; old entries preserved |

## Verification evidence and limits

- 69 unit, domain, regression and real-database transaction checks passed, with no skipped tests. Three additional service-worker tests pass for deliberate updates, scoped cache cleanup and protected request exclusion.
- `npm run test:pwa:e2e` runs the original 18 authentication/security browser scenarios plus the PWA journeys in an isolated PostgreSQL database with fake email/AI providers. The test never accesses production business data or sends real messages.
- 22 workspace routes × light/dark appearance × 375/390/430/768/1440 widths were checked for document overflow; 44 automated WCAG 2.2-relevant axe scans reported no violations in the tested states. This is not a complete accessibility certification of all dialogs/data/error combinations.
- Screenshots were inspected for mobile repairs/expenses/Sell and desktop deliveries; additional route screenshots and machine-readable results are in `artifacts/pwa-review`. The development framework indicator may appear in captures; it is absent in production builds.
- TypeScript, source ESLint and the production build are validation gates. Generated `.next-*` review bundles are excluded from source lint.
- The new migration was applied only to the isolated review database. No production migration or provider deployment was performed.

## Implemented but not fully externally verified

Physical Safari/Home Screen installation, Face ID/OS PIN hardware, camera permissions/flashlight behavior, VoiceOver/large text, actual push/email arrival, worker deployment and thermal-label printing require the real target device/provider setup. Full partner settlement and trade-in UI journeys have transaction coverage but do not yet have the same browser end-to-end coverage as repairs/COD. Hardware checks are not replaced by virtual passkey tests or generated PDFs.

## Partial or awaiting business decisions

- The trade-in/return intake is real, but full exchange top-up allocation, refund authorization/accounting and cancellation/reconciliation of prior financing need an approved policy. Active financing is not silently canceled and unsafe stock return is blocked.
- Expense/payroll records represent amounts approved and actually paid. Statutory payroll calculations, tax treatment and certified financial statements are not implemented without approved accounting rules. Finance summaries are explicitly estimates; catalog fallback costs/history coverage require reconciliation for legacy inventory.
- Existing Lipa terms and configuration are preserved. Replacement 40% / one-to-six-month terms and financing multipliers await owner approval; no illustrative rate became production policy.
- Bank transfer settlement accounts and Stanbic callback contract remain external dependencies. The existing disconnected status is retained; the system does not falsely claim to charge or verify a bank payment.
- Independent app PIN, native secure storage/haptics and Expo are outside the PWA implementation. Platform passkeys may use Face ID, fingerprint or OS PIN; the server never receives biometric/PIN data.
- Offline sale/payment submission is deliberately unsupported. OS process termination cannot guarantee immediate server notification; the lease bounds server access, rather than claiming a guaranteed background beacon or remote wipe.

## Deployment handoff

Apply `20261113170000_pwa_operations` through the established migration process, deploy the web app and receipt/notification worker together, configure canonical HTTPS and the existing owner/email/push settings, and grant new operation capabilities individually. Existing devices without a live lease must sign in again. Use Account → Check app services to distinguish configuration from actual delivery. Production reconciliation and the external acceptance checks remain required before a production-ready claim.

---

## Historical authentication review

# UX QA report

## Current scope and sources — 2026-11-13

This review implements the authentication slice on `29-0-authentication`. The supplied master requirements and issue [#29](https://github.com/cresdynamics-lang/Gadgetmgmt/issues/29), including its comments, are the working authority. Issue #28 is a closed deployment PR. The PDF and HTML are absent; the user explicitly authorized product judgment. No claim is made that those missing sources, a native iOS client, or every business module have been verified.

The actual local Next.js application was exercised in Chromium against an isolated PostgreSQL database with fixture accounts. Email transport was replaced only in the test process; the application has no test-code bypass. WebAuthn used Chromium's virtual authenticator with resident credentials and user verification. Screenshots and machine-readable results are in `artifacts/auth-review/`.

## Prioritized findings and fixes

| Priority | Verified issue / evidence | Change | Status |
| --- | --- | --- | --- |
| P0 security | Password-only credentials previously created a session on any device. | New devices require password and a one-use six-digit emailed code; codes expire after five minutes. Auth.js only accepts a one-use device-bound ticket. | Implemented; browser/API verified |
| P0 security | No login-device record meant an individual session could not be revoked. | Database-backed verified devices; every authenticated request checks revocation, account state, and lock state. Revoke has confirmation and fresh password verification. | Implemented; next-request denial verified |
| P0 security | Shared role templates automatically gave staff access. | Explicit per-person screens and capabilities, initially empty; all stored-grant API checks now include user identity. Finance floors remain independent of grants. | Implemented; verification recorded in results |
| P0 security | OWNER was a delegable role rather than a single configured identity. | Only the configured owner email can authenticate as OWNER; provisioning and owner promotion are restricted. | Implemented; policy tests pass |
| P1 security | No three-failure lockout, owner alert, or sign-in audit. | Atomic failure counting locks accounts, revokes devices, creates an owner inbox/email alert, and appends authentication events to Activity. Audited operator recovery handles owner lockout. | Implemented; lockout/alert/audit verified |
| P1 security | No biometric reopening or verified passkey registration. | Platform WebAuthn with required user verification, canonical origin/RP checks, one-use challenges, credential counters, and device binding. Enrollment requires a password. | Registration and authentication verified with virtual hardware |
| P1 security | Backgrounded workspaces remained active. | Immediate local lock plus a server lock beacon; reopening requires authentication. | Server lock verified; physical iOS lifecycle/offline behavior not verified |
| P1 usability | Original login had no email-verification or passkey workflow, and directed access requests to a manager. | Clear passkey-first entry, password fallback, numeric code entry with autofill, preserved input on errors, truthful pending states, and Administrator recovery guidance. | Actual running forms reviewed; current test evidence in results |
| P1 usability | Newly created staff without screen grants could land on a forbidden dashboard. | Login chooses an authorized destination or Account security, which remains available without operational grants. | Policy tested; broader role-specific journeys remain partial |
| P2 usability | Account-security screenshots exposed a stale “Role access” shell title and small header controls. | Label changed to Team access; frequent header controls have 44px minimum targets. | Revised screenshots checked |
| P2 accessibility | Mobile navigation lacked modal semantics, focus containment, and Escape dismissal. | Labeled modal navigation, trapped Tab navigation, Escape dismissal, focus restoration. | Implemented; browser check included |
| P2 accessibility | Security controls needed consistent labels, readable errors, safe confirmation, and mobile sizing. | Shared security components use 16px inputs, 48px actions, text-based statuses/errors, visible focus, wrapping device rows, and Cancel on revoke. | Screens visually checked at representative widths |
| P2 presentation | Applying a dark panel palette to an otherwise light shell would create unreadable headings. | Dark appearance is scoped to the fully themed sign-in surface. Account and Access retain the existing light shell. | Login dark capture reviewed; whole-app dark mode remains partial |
| P2 verification | The fallback webpack preview rendered unstyled content with the Turbopack-only CSS setup. | Use Next.js's documented Tailwind PostCSS integration across both preview/build modes. | Default production build passes |

## Evidence and checks

- Login, Account security, and Access captured at 375, 390, 430, 768, and 1440 pixels. Login also captured in dark appearance, with a failed sign-in, and with email verification. Revocation has a confirmation capture.
- Automated viewport checks reject horizontal content overflow. Login controls meet the 44px target baseline; text inputs are 16px to avoid iPhone focus zoom.
- The full browser journey checks actual password/code sign-in, passkey registration and authentication, access editing, and revocation, alongside direct API boundary checks. All 18 browser/security scenarios passed. The authoritative list of completed checks is `artifacts/auth-review/results.json`.
- Six focused authentication-policy tests pass. Existing access (8), workflow/finance (9), device/scanner (9), and notification (16) tests pass: 48 unit/regression checks in total. Four production-environment security tests also pass.
- ESLint passed across all 57 changed source/test files; the final configuration warning was corrected. TypeScript and the final production build passed.
- The SQL migration applied successfully to a separate database containing the original branch schema. Fresh seeding and repeat seeding both retained exactly one NUH shop. No production database or shop records were modified.

Screenshots use explicitly isolated fixture accounts and records. The Next.js development indicator visible in captures is development tooling, not a product control. A virtual authenticator proves protocol behavior, not physical Face ID hardware.

## Partial, missing, and unresolved

- **Physical iPhone and native app:** not implemented or hardware-tested. This remains the responsive Next.js web client. Native secure storage, native Face ID lifecycle, haptics, and Expo integration require a separate client and device verification.
- **PIN:** WebAuthn supports the operating system's screen-lock PIN. An independent application PIN is not implemented; length, recovery, and policy need a confirmed decision. The server never receives biometrics or the device PIN.
- **Email:** live Resend delivery, sender-domain setup, inbox arrival, and worker delivery of owner email alerts are not exercised. A working email provider is a deployment dependency, not a simulated production success.
- **Foreground locking:** browser visibility and a server beacon cannot guarantee immediate server locking while offline or on an operating-system process kill. No remote wipe of previously displayed data is claimed. The exact native policy remains open.
- **Step-up and temporary grants:** enrollment, grant editing, and revocation require fresh password verification. A comprehensive timed step-up policy for every financial action, and temporary approval/expiry rules, await confirmed policy.
- **Whole-app accessibility and themes:** this pass does not certify WCAG 2.2 AA across every module. Physical VoiceOver, large text, keyboard behavior in legacy dialogs, full dark appearance, and all long-data states remain open.
- **Business workflows:** POS persistence/receipt delivery, device lineage across all business events, trade-ins, repair assignments, deliveries/COD, partner settlement, payroll, recurring bills, and marketing remain partial or missing as recorded in REQUIREMENTS_MATRIX.md. Existing read-only desks are not complete workflows.
- **Finance:** unit/regression tests and staff inventory response checks verify the scoped boundary. All exports, AI answers, live updates, and every financial path are not certified by this slice.
- **Rates/accounting:** Lipa's approved rates/terms, bank tender policy, and other missing-source decisions remain unresolved. No illustrative values were adopted as policy.

## Rollout requirements

Apply the migration through the established deployment process. Configure Administrator's owner email, the canonical HTTPS application origin, authentication secret, and working email delivery before rollout. Old sessions must sign in again. Existing staff lose inherited operational authorization until Administrator grants their individual screens/actions. Fresh installations seed NUH; existing branch records and stock are preserved rather than silently consolidated. A shop consolidation, if needed, requires an explicit data-migration decision.


## Production rollout and sidebar coverage — 2026-11-13

The release preflight now verifies every Prisma model column against the production database before startup, applies absent historical migrations in order after a private backup, and verifies a live notification-worker heartbeat. Production was missing notification, physical-device and legacy role-template prerequisites; additive migrations preserve existing records and individual grants.

`AUTH_REVIEW_PRODUCTION=1 PWA_REVIEW=1 node scripts/auth/review.mjs` runs the compiled production build against isolated fixtures. The sidebar suite explicitly covers all 22 navigation entries plus Account security, verifies visible task content/headings/controls, checks browser runtime exceptions, and evaluates five widths in both themes. Live production data is not used to create test transactions. Real installed-iPhone/provider checks remain external acceptance gates.


Production-mode evidence: all 23 destinations passed visible-content checks in both themes, all 46 automated accessibility scans reported zero violations, and the complete authentication/PWA workflow suite passed. Evidence is in `artifacts/production-review`. Public deployment is validated separately by schema preflight, service/worker readiness and unauthenticated public endpoint probes; no live financial test transactions are created.

## Brand and installation prompt — 2026-11-13

Original GadgetHub artwork from the user-supplied app.gadgethubke.com is used on sign-in, desktop/mobile navigation, browser icons and PWA/notification icons. Static brand files are public so sign-in never depends on an authenticated image request. The public-only service-worker cache version changed to refresh older app icons.

A dismissible install card provides native browser installation when `beforeinstallprompt` is available, and explicit Safari Add to Home Screen instructions on iPhone/iPad. It hides in installed mode, remembers dismissal for seven days, yields to sign-in input focus/dialogs, and is suspended during connection/update notices. It never labels a requested installation as completed.

Browser evidence: `artifacts/branding-review`. Five scenarios pass: original logo/five-width layout, sign-in focus, persisted dismissal, installed-mode suppression, and native-prompt handling with a clean accessibility scan. The native event is simulated; actual OS installation remains a physical-device check. Existing provider and accounting-policy limits still apply.

## Administrator terminology and identity configuration

Hardcoded personal administrator references have been replaced by “Administrator” across sign-in/recovery, verification emails, account security, access management, operation approvals, documentation and isolated fixtures. The owner’s shell label is Administrator; actual account IDs, financial history and role permissions are preserved.

At the account holder’s explicit request, seed defaults and the deployment owner-email secret use `aabere70@gmail.com`. Runtime `AUTH_OWNER_EMAIL` follows the configured `INITIAL_OWNER_EMAIL` to prevent a stale environment setting blocking sign-in. A targeted synchronization can assert the expected identity and, only when explicitly requested, exercise the real password-to-email-code flow. Provider acceptance is distinguished from inbox receipt and completed authentication; OTPs and credentials are never logged.
