# Requirements matrix

Requirements authority: the user’s supplied master requirements and GitHub issue #29, including its comments. The named PDF and HTML are missing; the user authorized product judgment on 2026-11-13. Earlier rows below are historical implementation notes, not evidence that those files were inspected. Confirmed PDF business decisions take precedence when supplied. The Next.js web client remains; native iOS is a separate, unimplemented client.

| Area | Spec | Decision | This branch |
| --- | --- | --- | --- |
| Sell | Scan or pick a device, then take payment. | Keep the existing till. | Scan and search can start a line from an in-stock IMEI, serial, or SKU. |
| M-Pesa on a completed sale | Staff confirm a code before the sale is recorded. | Still true until Stanbic can settle the sale. | A full M-Pesa tender, and each M-Pesa leg of a split tender, requires a 6–32 character code stored on `SalePayment.reference`. Cash and card do not. |
| Stanbic checkout | The PDF left the bank and card terminal open. | Sales will be collected through Stanbic's API. | Status is returned by `GET /api/pos` and shown on Sell. Checkout is not called. `connected` is always false. See the implementation plan. |
| Daraja payer links | Not the long-term sales checkout. | Leave them working for credit and payment-link flows. | Unchanged. They stay off until Daraja credentials exist. |
| Lipa Mdogo Mdogo | Sample 40% deposit, 1–6 months, sample multipliers. | Victor has not set those rates. | Unchanged: branch minimum deposit and 4, 6, or 12 months. |
| Lipa follow-up | Late accounts come before the calendar. | Keep per-account balances so staff can collect. | Queue sorts by urgency, then due date. Call uses `tel:`. Shop-wide Lipa money is owner-only. |
| Stock | Empty and reorder rows need attention first. | Do not invent reorder points. | List sorts by attention, then name. Zero reorder points still do not alert untracked rows. |
| Finance visibility | Only the owner sees cost, profit, margin, expenses, payroll, and stock value. | OWASP issue #3. Selling price stays visible to every role. | Dashboard, insights, insights AI, and sale JSON hide those figures from everyone except the owner. |
| Identity in URLs | No passwords or user details in URLs. Server-side auth. | Customer and Lipa account ids count. | Customers page stores the id in `sessionStorage`. The proxy strips `customer`, `account`, and the matching id keys. |
| Navigation | Phone and desk both need the daily actions. | Reuse the spruce shell. | Desk sidebar from `lg`. Phone primary tabs plus More. Sign out is a labeled button. |
| Deliveries, stock planner, devices, repairs, partners, finance, expenses, performance, assistant, activity | Named in the operations sidebar. | Show the desks. Do not invent rates, targets, or sample rows. | In the sidebar for the roles in the document. Devices, the planner, in-repair units, performance counts, owner finance, and the activity log read live records. Deliveries, partners, and expenses stay empty until a record exists. Payroll, Face ID, and a label printer are still not built. |
| Bank transfer tender | Named in the spec. Which accounts are still open. | Stanbic is the sales API, not a new staff tender type. | No `BANK` enum and no migration. |

Per-account Lipa balances stay on the collection screen and in the credit API because a cashier cannot collect without the amount due. Shop-wide Lipa totals, revenue, profit, cost, and stock value do not.


## Authentication branch traceability — 2026-11-13

Status is conservative: source review alone does not establish workflow completion.

| ID | Source | Feature | Role | Workflow | Business rule | UI location | Status | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | #29 comment: new device | Password + emailed code | All | Password → 6-digit email code → session | Active account; one-use code; 5-minute expiry | Sign in | Implemented; evidence in auth-review/results.json | Wrong password/code denied; expired/replayed code denied; valid code signs in |
| AUTH-02 | #29; master §8 | Face ID / passkey / device PIN | Owner; approved staff | Verify device → confirm password → enroll → OS verification | Required WebAuthn user verification; origin/RP checks; device-bound credential | Sign in; Account security | Implemented; evidence in auth-review/results.json | Virtual authenticator registration and sign-in; wrong origin/signature denied |
| AUTH-03 | #29 | Device list and instant revoke | Owner; own devices for staff | List → revoke confirmation | Server rejects revoked devices on next request | Account security | Implemented; evidence in auth-review/results.json | Revoke session then call protected API; expect 401 |
| AUTH-04 | #29 | Individual permission grants | Owner | Select person → screens/actions → save | Staff start with no grants; role grants do not authorize | Access | Implemented; evidence in auth-review/results.json | Direct API denied without individual capability; next request reflects removal |
| AUTH-05 | #29 comment: three failures | Lockout and owner alert | All | Three failures → locked → owner identity check/unlock | Database atomic failure count; active sessions revoked | Sign in; Access; Alerts | Implemented; evidence in auth-review/results.json | Three wrong passwords/codes lock; owner alert created; unlock recovers |
| AUTH-06 | #29 comment: activity | Sign-in audit | Owner | Sign in → Activity | Append-only sign-in/security events | Activity | Implemented; evidence in auth-review/results.json | Successful and failed sign-ins appear with user/device |
| AUTH-07 | #29; master §6 | Victor-only finance | Owner | Configured identity signs in | OWNER requires configured email; other owners cannot authenticate | All finance paths | Partial; existing redaction tests | Staff JSON omits unitCost and protected aggregates |
| AUTH-08 | #29 | Single NUH shop; future branches | Owner | Seed new installation | Do not rename or merge existing shops or move stock | Seed | Verified fresh and repeated seeding; one NUH shop | Fresh seed creates NUH only; existing branch records preserved |
| AUTH-09 | master §8 | Foreground lock | All | Background → lock → authenticate to reopen | Must block server operations, not only hide content | Shell | Partial; server lock verified, physical lifecycle pending | Background then protected request is denied |
| AUTH-10 | master §8 | Sensitive-action reauthentication | Owner | Fresh verification before access/revoke | Exact native policy absent | Security administration | Partial; enrollment/grants/revoke require password; complete policy pending | Stale session cannot perform privileged mutation without fresh verification |
| IOS-01 | master §8, §14 | Native iPhone app | All | Native biometrics and secure storage | WebAuthn web client is not a native app | Separate client | Not implemented | Physical iPhone and native lifecycle tests |
| POS-01 | master §7A | Scan → customer → payment → receipt | Cashier | Current Sell workflow | Eligible physical unit; payment validation; duplicate safety | Sell | Partial; existing tests | Complete persisted sale/receipt journey with database |
| LIPA-01 | master §7B | Financing and collections | Cashier/manager | Quote → deposit → schedule → collect | Rates unapproved; 40% / 1–6 months conflict with live policy | Lipa | Conflicting / business decision | Approved policy drives server and client totals |
| TRADE-01 | master §7C | Inspection and trade-in | Authorized staff | Identity → locks → condition → valuation | Reject locked/stolen/mismatched devices | Trade-ins | Missing | Persist inspection and device lineage; reject invalid locks |
| INV-01 | master §7D | Physical-device passport | Inventory | Receive → identify → move → history | Variant differs from unique device; append-only lineage | Stock / Devices | Partial | Same identity survives repair/sale/return/partner movements |
| REP-01 | master §7E | Repair operations | Inventory/manager | Assign → due → return inspection | Default turnaround needs source confirmation | Repairs | Partial read view | Persist assignment, inspection, cost permissions and stock return |
| DEL-01 | master §7F | Delivery and COD accountability | Cashier/manager | Handover → proof → payment → close | Named responsibility for device and money | Deliveries | Missing write workflow | Cannot close without required proof/payment |
| PART-01 | master §7G | Consignment and partner settlement | Manager/owner | Handover → due → return/settle | Preserve device ownership/history | Partners | Missing write workflow | Persist ownership, obligations, returns and audit |
| FIN-01 | master §7H | Owner accounting and payroll | Owner | Authoritative entries → reports | Sales ≠ profit; corrections auditable | Finance / Expenses | Partial / payroll missing | Reconcile totals to entries; unauthorized payload inspection |
| PLAN-01 | master §7I | Variant restocking | Inventory/owner | Review shortage → reasoning | No invented reorder thresholds | Planner | Partial | Variant and availability calculations match stored facts |
| AI-01 | master §7J | Read-only authorized AI | Permitted staff | Ask → sourced answer → record | Redacted backend DTO; no writes | Assistant / Insights | Partial | Restricted data absent from model inputs and responses |
| SUPPORT-01 | master §7K | Customers, performance, notifications | Permitted staff | Live lookup / message / review | Scope by individual grants and branch | Existing desks | Partial | Role/branch integration tests and actual browser tasks |
| SUPPORT-02 | master §7K | Marketing, recurring bills, exports | Owner/authorized staff | Record → reconcile → report | Approval/accounting rules need source | Various | Missing or unverified | Source-specific acceptance tests required |
| UX-01 | master §13 | Responsive / accessible interaction | All | 375/390/430/768/1440 widths | No clipped controls; 44px targets; keyboard/focus/error labels | Auth slice | Auth slice visually reviewed; broader app unverified | Browser screenshots, overflow, keyboard and error-state checks |

### Open decisions and source limits

- PIN uses the operating system’s screen-lock verification via WebAuthn; an independent application PIN is not implemented. Its length, recovery, and lock policy are unspecified.
- WebAuthn may use Face ID, fingerprint, or device PIN. A website cannot require Face ID exclusively or inspect biometric data.
- Desktop passkeys are enabled by platform capability; #29’s later-release wording conflicts with the broader current request.
- Temporary permissions and exact step-up / foreground-lock policy require the missing source or a confirmed business decision.
- Neither live customer data nor illustrative source values are used as fixtures. No finance rates or accounting policies are invented.
