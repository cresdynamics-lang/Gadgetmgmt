# UX architecture

GadgetHub stays a Next.js App Router operations client. Roles are owner, branch manager, cashier, and inventory lead. Page access still goes through `canAccessPage` and `requirePage`. Capabilities still go through `canUseCapability`. Cashiers do not open Insights. The owner is the only role that sees shop money.

## Shell

From the `lg` breakpoint the navigation sits in a persistent dark sidebar (`#0a0a0a`) that is part of the screen, not a card floating on the page. The header stays put. Only the page scrolls. The sidebar link list scrolls on its own, and the scrollbar stays hidden until the pointer is over the list. Below that, the same destinations are a bottom bar: Today, Sell, Stock, and Alerts for the owner; Today, Sell, Stock, and Lipa for a manager; Today, Sell, Lipa, and Clients for a cashier; Today, Stock, and Alerts for inventory. More opens the full drawer. The header Sign out control is a button with a label, not a chevron that signs the person out.

The shell lives in each page layout, so the sidebar and header stay up while a `loading.tsx` skeleton stands in for the server data. Dashboard and insights still read their figures on the server. The rest of the till already loads its lists in the browser after the shell is on screen.

Access is granted one person at a time. Victor selects a staff account, enables the required screens and actions, and explicitly allows biometrics when appropriate. Staff start with no operational grants. The owner retains all screens; protected finance and Activity cannot be delegated. Server checks enforce the current individual grants on each request.

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

The sign-in journey is email → device passkey when available, or password → emailed verification on a new device. A verified device can use password alone as fallback. New accounts are created by Victor; staff have no operational permissions until he grants screens and actions individually in Access. Account security is reachable independently of operational grants, including for newly provisioned staff. Users without a permitted dashboard land in Account security rather than a forbidden dead end.

Account security lists live verified devices, identifies the current device, offers enrollment after password confirmation, and gives an inline revoke confirmation with a safe Cancel action. Device sessions are checked in the database on every authenticated server request. Authentication events join Activity. Device inventory remains the existing physical-stock Devices module; login devices use a separate Account security destination.

The web client uses platform WebAuthn with user verification. It does not collect Face ID images, device PINs, or claim native iOS behavior. Security-sensitive administration is separate from operational sales and inventory paths. Individual user grants supersede role-wide authorization.
