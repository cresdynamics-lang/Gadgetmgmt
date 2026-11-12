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
- React Native, Face ID, trade-in, deliveries, partners, expenses, payroll, label printing, and a live socket layer.
- Stripping each Lipa plan balance from the credit API. Collection needs that amount. Shop-wide totals stay hidden.

## Checks

`npx tsc --noEmit` is clean. `npm run test:workflows` and `npm run test:access` cover scan matching, finance redaction, Lipa order, stock rank, Stanbic's closed status, and URL redaction. ESLint is clean on the files this branch edits.
