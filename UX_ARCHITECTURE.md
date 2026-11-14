# UX architecture

GadgetHub stays a Next.js App Router operations client. Roles are owner, branch manager, cashier, and inventory lead. Page access still goes through `canAccessPage` and `requirePage`. Capabilities still go through `canUseCapability`. Cashiers do not open Insights. The owner is the only role that sees shop money.

## Shell

From the `lg` breakpoint the navigation sits in a persistent dark sidebar (`#0a0a0a`) that is part of the screen, not a card floating on the page. The header stays put. Only the page scrolls. The sidebar link list scrolls on its own, and the scrollbar stays hidden until the pointer is over the list. Below that, the same destinations are a bottom bar: Today, Sell, Stock, and Alerts for the owner; Today, Sell, Stock, and Lipa for a manager; Today, Sell, Lipa, and Clients for a cashier; Today, Stock, and Alerts for inventory. More opens the full drawer. The header Sign out control is a button with a label, not a chevron that signs the person out.

The shell lives in each page layout, so the sidebar and header stay up while a `loading.tsx` skeleton stands in for the server data. Dashboard and insights still read their figures on the server. The rest of the till already loads its lists in the browser after the shell is on screen.

Access is granted one person at a time. Administrator selects a staff account, enables the required screens and actions, and explicitly allows biometrics when appropriate. Staff start with no operational grants. The owner retains all screens; protected finance and Activity cannot be delegated. Server checks enforce the current individual grants on each request.

## Sell

The catalogue, the scan field, and checkout stay on one screen. A scan or an Enter in search runs `matchSaleScan` against the in-stock devices already returned by the till, then against the SKU. An unknown code or a device with no available unit is refused. A matching device fills an empty identifier or adds the next unit. A second scan of the same identifier is refused.

Customer handoff from Clients uses `sessionStorage` key `gadgethub.saleCustomer`. The id is not put in the query string. The proxy 303-strips `customer`, `customerid`, and `customer_id` if a bookmark still has them.

Payment methods stay cash, M-Pesa, card, Lipa, split, and payer link. Stanbic is the chosen checkout, and the till says so. Until Stanbic's callback can be verified on the server, M-Pesa checkout records a code the shop has already checked. The screen says the app does not collect that money.

## Stock and Lipa

Stock rows are ordered by `stockAttentionRank`: at or below the reorder point, then empty with no reorder point, then healthy, then name.

Lipa rows are ordered by `compareLipaUrgency`: recovery, then the late stages, overdue, due, grace, due soon, active, and paid off, then the next due date. Call opens the phone dialer after the number is reduced to digits and a leading `+`. The account id arrives from `gadgethub.lipaAccount`, not from the URL. The outstanding-balance total is shown to the owner. Other roles see how many plans need a call, and they still see each plan's balance so they can record a payment.

## Money boundary

`canViewFinance` is true only for `OWNER`. `presentBusinessInsights` nulls revenue, collected money, profit, daily money, product sales value, Lipa overdue balance, and Lipa age buckets for every other role. Counts and units remain. `omitSaleCost` removes `unitCost` from sale JSON. The insights model receives that redacted payload and is told not to reconstruct the hidden figures. The dashboard does not render those amounts, and the AI briefing is limited to the owner and branch managers.


## Authentication slice — current branch

The sign-in journey is email → device passkey when available, or password → emailed verification on a new device. A verified device can use password alone as fallback. New accounts are created by Administrator; staff have no operational permissions until he grants screens and actions individually in Access. Account security is reachable independently of operational grants, including for newly provisioned staff. Users without operational grants land in Settings, where personal account security is always available.

Account security lists live verified devices, identifies the current device, offers enrollment after password confirmation, and gives an inline revoke confirmation with a safe Cancel action. Device sessions are checked in the database on every authenticated server request. Authentication events join Activity. Device inventory remains the existing physical-stock Devices module; login devices are managed in the Account security section inside Settings. The old `/account` destination redirects to `/settings#account-security`.

The web client uses platform WebAuthn with user verification. It does not collect Face ID images, device PINs, or claim native iOS behavior. Security-sensitive administration is separate from operational sales and inventory paths. Individual user grants supersede role-wide authorization.


## Current PWA architecture

The delivery surface is the existing App Router PWA, with one backend and shared business rules. Root launch selects an authorized destination. Account security remains available when staff have no operational grants. Mobile tabs are filtered by actual grants; More and quick navigation trap focus and have explicit dismiss actions. A notification bell is shown only to users with the inbox grant.

Focused operational journeys:

- Receive → unique physical unit → passport → repair/partner movement → sale → return/trade-in. Events are appended; a repeated intake does not erase earlier sales.
- Repair: assign a named repairer, due in two days by default → return inspection → pass to stock or remain in review. Write-only cost permission never adds cost read permission.
- Delivery: create an unpaid COD sale in Sell → assign its sold unit and named rider → dispatch → named delivery proof → collect actual sale payment → close after reconciliation.
- Partners: outgoing unit becomes unavailable until return or verified owner settlement; borrowed unit carries partner ownership, requires approved supplier cost before sale, then records payable settlement.
- Trade-in/return: verify identity, ownership, identifiers, locks and documentation → quarantine → owner valuation/inspection decision. Intake does not silently refund a previous sale or cancel financing.
- Owner finance: record an approved actual expense/payroll/marketing payment → immutable history → correcting reversal when required. Recurring bills represent obligations; only a confirmed payment changes the ledger.

The service worker stores only a public offline page and app icons. Business operations remain online; interrupted requests retain idempotency keys and explain recovery. Updates wait for an explicit restart. Backgrounding covers the workspace immediately and attempts server locking; a short server lease bounds suspension/offline failure. Reopening requires authentication. The web client cannot guarantee a network beacon on an OS kill.

WebAuthn delegates Face ID/fingerprint/device PIN to the OS. Independent application PINs, native secure storage and native haptics are not claimed. Account provides installation, appearance and owner service-readiness controls. Provider configuration and actual delivery are reported separately.


## Settings information architecture — 2026-11-14

Settings is a single navigation destination for every authenticated role. It groups Account security (passkeys and verified devices), App preferences (appearance, installation and authorized service readiness), and Business settings. Business settings render only for the Administrator or an authorized branch manager with both the business-settings page grant and branch-settings capability. Personal Settings access does not grant branch editing. The page grant is labeled Business settings in access administration to make that distinction clear. Legacy account links redirect to the security section; ungranted staff sign in to Settings instead of an inaccessible workspace.


## Primary PIN authentication — 2026-11-14

The sign-in page recognizes only the browser’s opaque verified-device cookie. A configured device opens with an email hint and app PIN as the primary action; password plus emailed code is the setup/recovery path. Unknown devices verify ownership before PIN selection. Six digits, confirmation, a masked numeric field and preserved leading zeroes support quick retail use. Face ID/passkeys remain optional under existing approvals.

PIN setup requires a fresh, expiring ownership receipt bound to the same user and device cookie. Recovery reuses that device record and advances its credential version, ending earlier sessions/tickets for that device. Failed PIN attempts are serialized on the server before comparison and use the existing three-failure account lockout. Settings exposes only whether the current device has a PIN; credential hashes and versions are never exposed there. Business authorization and financial step-up rules remain independent of the sign-in method.
