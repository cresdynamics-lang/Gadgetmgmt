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
| P1 usability | Original login had no email-verification or passkey workflow, and directed access requests to a manager. | Clear passkey-first entry, password fallback, numeric code entry with autofill, preserved input on errors, truthful pending states, and Victor recovery guidance. | Actual running forms reviewed; current test evidence in results |
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

Apply the migration through the established deployment process. Configure Victor's owner email, the canonical HTTPS application origin, authentication secret, and working email delivery before rollout. Old sessions must sign in again. Existing staff lose inherited operational authorization until Victor grants their individual screens/actions. Fresh installations seed NUH; existing branch records and stock are preserved rather than silently consolidated. A shop consolidation, if needed, requires an explicit data-migration decision.
