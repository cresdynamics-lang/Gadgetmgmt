# UX QA report

Reviewed against the v4 operations spec, the HTML prototype, OWASP issue #3, and the running Next.js app. The live site at `https://development.gadgethubke.com` returned HTTP 444, so this pass did not inspect production pixels.

## Fixed

| Issue | What changed |
| --- | --- |
| A scan could not start a sale. | IMEI, serial, and SKU now add the in-stock line. Unknown and unavailable codes are refused. |
| Catalogue copy was garbled. | Ellipsis, the middle dot, and the empty-basket sentence are plain text. |
| A full M-Pesa sale could be confirmed with no code. | The code is required and stored. The screen says the money is not collected here. |
| Managers and cashiers could see shop revenue, profit, and Lipa totals. Sale JSON included unit cost. | Those figures are owner-only in the UI, the insights model, and the sale response. |
| Lipa follow-up followed the calendar, and stock followed the catalogue. | Late plans and thin stock lead their lists. Lipa has a call action. |
| Client and account ids were query parameters. | They move through `sessionStorage`, and the proxy strips the old query keys. |
| Desk navigation was a hamburger, and Sign out looked like a menu. | Persistent sidebar, phone tabs, and a labeled Sign out button. |
| The sales provider was undecided. | Stanbic is named on the till and in `GET /api/pos`. Checkout stays off. |

## Stanbic

The decision is to make sales through Stanbic's API. The sandbox portal does not publish a callback this server can verify, so this branch does not post a checkout, invent a merchant payload, or mark a sale paid from a provider response. Staff still record a payment the shop has already taken. Daraja payer links are unchanged.

## Not verified in a browser

This environment has no Docker and no database URL, so the app could not be signed in and the revised Sell, Stock, Lipa, and shell screens were not exercised in a browser. Behavior covered by tests is the scan matcher, finance redaction, Lipa sort, stock rank, access URL rules, and the Stanbic status that stays disconnected even when every setting is filled.

## Still partial

- A cashier can still add up per-plan balances from the credit API. Those amounts are required to collect. The shop-wide total is not shown.
- Dashboard and insights queries still compute money on the server. The presented objects and the rendered pages omit it for everyone except the owner.
- Old `?customer=` and `?account=` bookmarks lose the id because the proxy strips them before the page loads.
- Lipa terms, bank-account names, trade-in, deliveries, partners, expenses, and payroll were not changed.
