# Requirements matrix

Source of truth: `Gadget_Hub_Operations_System_v4.pdf`. The HTML prototype is a walkthrough. Where it disagrees with the running Next.js app or with an explicit shop decision, the app and that decision win. This pass did not replace the web app with React Native.

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
| Trade-in, deliveries, partners, expenses, payroll, Face ID, label printer | Specified or left open. | Not in this pass. | Not built. |
| Bank transfer tender | Named in the spec. Which accounts are still open. | Stanbic is the sales API, not a new staff tender type. | No `BANK` enum and no migration. |

Per-account Lipa balances stay on the collection screen and in the credit API because a cashier cannot collect without the amount due. Shop-wide Lipa totals, revenue, profit, cost, and stock value do not.
