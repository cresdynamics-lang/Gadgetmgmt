# UX architecture

GadgetHub stays a Next.js App Router operations client. Roles are owner, branch manager, cashier, and inventory lead. Page access still goes through `canAccessPage` and `requirePage`. Capabilities still go through `canUseCapability`. Cashiers do not open Insights. The owner is the only role that sees shop money.

## Shell

From the `lg` breakpoint the existing navigation sits in a persistent dark sidebar (`#102d27`). Below that, the same destinations are a bottom bar: Today, Sell, Stock, and Alerts for the owner; Today, Sell, Stock, and Lipa for a manager; Today, Sell, Lipa, and Clients for a cashier; Today, Stock, and Alerts for inventory. More opens the full drawer. The header Sign out control is a button with a label, not a chevron that signs the person out.

## Sell

The catalogue, the scan field, and checkout stay on one screen. A scan or an Enter in search runs `matchSaleScan` against the in-stock devices already returned by the till, then against the SKU. An unknown code or a device with no available unit is refused. A matching device fills an empty identifier or adds the next unit. A second scan of the same identifier is refused.

Customer handoff from Clients uses `sessionStorage` key `gadgethub.saleCustomer`. The id is not put in the query string. The proxy 303-strips `customer`, `customerid`, and `customer_id` if a bookmark still has them.

Payment methods stay cash, M-Pesa, card, Lipa, split, and payer link. Stanbic is the chosen checkout, and the till says so. Until Stanbic's callback can be verified on the server, M-Pesa checkout records a code the shop has already checked. The screen says the app does not collect that money.

## Stock and Lipa

Stock rows are ordered by `stockAttentionRank`: at or below the reorder point, then empty with no reorder point, then healthy, then name.

Lipa rows are ordered by `compareLipaUrgency`: recovery, then the late stages, overdue, due, grace, due soon, active, and paid off, then the next due date. Call opens the phone dialer after the number is reduced to digits and a leading `+`. The account id arrives from `gadgethub.lipaAccount`, not from the URL. The outstanding-balance total is shown to the owner. Other roles see how many plans need a call, and they still see each plan's balance so they can record a payment.

## Money boundary

`canViewFinance` is true only for `OWNER`. `presentBusinessInsights` nulls revenue, collected money, profit, daily money, product sales value, Lipa overdue balance, and Lipa age buckets for every other role. Counts and units remain. `omitSaleCost` removes `unitCost` from sale JSON. The insights model receives that redacted payload and is told not to reconstruct the hidden figures. The dashboard does not render those amounts, and the AI briefing is limited to the owner and branch managers.
