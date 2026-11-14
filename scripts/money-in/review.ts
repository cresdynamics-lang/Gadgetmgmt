/**
 * End-to-end check of every Money In payment path against a running app and an isolated database.
 * Run: DATABASE_URL=...gadgethub_money_in npm run test:money-in:e2e
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";

const database = process.env.DATABASE_URL ?? "";
if (!/money_in/.test(database)) throw new Error("Point DATABASE_URL at an isolated *_money_in database.");
const prisma = new PrismaClient({ datasources: { db: { url: database } } });
const port = Number(process.env.MONEY_IN_PORT ?? 3014);
const base = `http://localhost:${port}`;
const secret = "money-in-review-secret-64-characters-long-for-isolated-tests-2026";
const run = randomBytes(4).toString("hex");
const mailFile = `/tmp/gadgethub-money-in-mail-${run}.jsonl`;
const password = "Money-in-review-password-2026!";
const results: string[] = [];
const pass = (label: string) => { results.push(label); console.log(`ok - ${label}`); };

async function session(user: { id: string; role: string; branchId: string }, deviceId: string) {
  const token = await encode({ secret, salt: "authjs.session-token", token: { sub: user.id, userId: user.id, deviceId, pinVersion: 0, authMethod: "PASSWORD", role: user.role, branchId: user.branchId, branchName: "Money In Review" } });
  return `authjs.session-token=${token}`;
}

async function main() {
  const branch = await prisma.branch.create({ data: { name: `Money In Review ${run}`, code: `MI${run}`.toUpperCase(), address: "Nairobi", phone: "+254700000000" } });
  await prisma.creditPolicy.create({ data: { branchId: branch.id, minimumDepositPercent: 20 } });
  const passwordHash = await hash(password, 10);
  const owner = await prisma.user.create({ data: { name: "Victor Review", email: `owner-${run}@example.test`, passwordHash, role: "OWNER", branchId: branch.id, ownerApprovedAt: new Date() } });
  const cashier = await prisma.user.create({ data: { name: "Seller Review", email: `seller-${run}@example.test`, passwordHash, role: "CASHIER", branchId: branch.id, accessPages: ["/sales"], accessCapabilities: ["sales", "customers", "credit"] } });
  const device = async (userId: string) => (await prisma.authDevice.create({ data: { userId, tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), label: "Money In review", activeUntil: new Date(Date.now() + 3600_000) } })).id;
  const ownerCookie = await session({ id: owner.id, role: "OWNER", branchId: branch.id }, await device(owner.id));
  const sellerCookie = await session({ id: cashier.id, role: "CASHIER", branchId: branch.id }, await device(cashier.id));

  const phone = await prisma.product.create({ data: { sku: `MI-PHONE-${run}`, name: "Review Phone", category: "Phones", unitTracking: true, costPrice: 60000, sellingPrice: 100000, branchId: branch.id, inventory: { create: { branchId: branch.id, stockOnHand: 0 } } } });
  const charger = await prisma.product.create({ data: { sku: `MI-CHG-${run}`, name: "Review Charger", category: "Accessories", unitTracking: false, costPrice: 500, sellingPrice: 2000, branchId: branch.id, inventory: { create: { branchId: branch.id, stockOnHand: 50 } } } });
  const units: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const unit = await prisma.stockUnit.create({ data: { branchId: branch.id, productId: phone.id, recordedById: owner.id, imei: `35${run.replace(/\D/g, "0").padEnd(8, "0").slice(0, 8)}${String(index).padStart(5, "0")}`.slice(0, 15), activationLock: "OFF", status: "IN_STOCK" } });
    units.push(unit.id);
  }
  await prisma.inventoryItem.update({ where: { branchId_productId: { branchId: branch.id, productId: phone.id } }, data: { stockOnHand: units.length } });
  const lockedUnit = units[7];
  await prisma.stockUnit.update({ where: { id: lockedUnit }, data: { activationLock: "ON", condition: "USED" } });
  const customer = await prisma.customer.create({ data: { name: "Client Review", phone: "+254711000000", email: `client-${run}@example.test`, branchId: branch.id } });

  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], {
    env: { ...process.env, DATABASE_URL: database, NEXT_DIST_DIR: ".next-money-in-review", APP_BASE_URL: base, NEXTAUTH_URL: base, AUTH_URL: base, NEXTAUTH_SECRET: secret, AUTH_SECRET: secret, RESEND_API_KEY: "money-in-fake-key", EMAIL_FROM: "GadgetHub <alerts@example.test>", MAIL_FROM_ORDERS: "GadgetHub <info@gadgethubke.com>", MONEY_IN_MAIL_FILE: mailFile, AT_USERNAME: "", AT_API_KEY: "", NODE_OPTIONS: `--import=${resolve("scripts/money-in/test-bootstrap.mjs")}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (chunk) => { serverLog += chunk; });
  server.stderr.on("data", (chunk) => { serverLog += chunk; });
  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try { const response = await fetch(`${base}/login`, { signal: AbortSignal.timeout(5000) }); if (response.status < 500) break; } catch { /* still starting */ }
      await new Promise((done) => setTimeout(done, 1000));
    }
    const call = async (method: string, path: string, cookie: string, body?: unknown) => {
      const response = await fetch(`${base}${path}`, { method, headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json", Accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
      const text = await response.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
      return { status: response.status, data };
    };
    const sale = (body: Record<string, unknown>, cookie = sellerCookie) => call("POST", "/api/pos", cookie, body);
    const phoneItem = (unit: string) => ({ productId: phone.id, quantity: 1, devices: [{ stockUnitId: unit }] });

    const catalogue = await call("GET", "/api/pos", sellerCookie);
    assert.equal(catalogue.status, 200, JSON.stringify(catalogue.data));
    assert.equal((catalogue.data.seller as { name: string }).name, "Seller Review");
    assert.equal((catalogue.data.creditPolicy as { minimumDepositPercent: number }).minimumDepositPercent, 40);
    pass("Sale screen loads with the seller locked to the signed-in account and a 40% Lipa minimum");

    const noMethod = await sale({ items: [{ productId: charger.id, quantity: 1 }] });
    assert.equal(noMethod.status, 400);
    pass("A sale without a payment method is refused");

    const forged = await sale({ items: [{ productId: charger.id, quantity: 1 }], paymentMethod: "CASH", cashierId: owner.id });
    assert.equal(forged.status, 400);
    pass("The seller name cannot be overridden from the request");

    const cash = await sale({ items: [phoneItem(units[0])], customerId: customer.id, paymentMethod: "CASH" });
    assert.equal(cash.status, 201, JSON.stringify(cash.data));
    assert.equal(cash.data.status, "PAID");
    assert.equal((cash.data.cashier as { name: string }).name, "Seller Review");
    const cashPayments = cash.data.payments as { method: string; requiresVerification: boolean }[];
    assert.deepEqual(cashPayments.map((payment) => [payment.method, payment.requiresVerification]), [["CASH", false]]);
    assert.equal(cash.data.receiptEmail, "QUEUED");
    pass("Full cash payment: sale, invoice and payment created together; cash needs no tick");

    const bankMissing = await sale({ items: [{ productId: charger.id, quantity: 1 }], paymentMethod: "BANK" });
    assert.equal(bankMissing.status, 400);
    assert.match(String(bankMissing.data.error), /bank transfer reference/i);
    const bank = await sale({ items: [{ productId: charger.id, quantity: 2 }], paymentMethod: "BANK", paymentReference: `FT${run}BANK` });
    assert.equal(bank.status, 201, JSON.stringify(bank.data));
    assert.equal((bank.data.payments as { requiresVerification: boolean }[])[0].requiresVerification, true);
    pass("Bank transfer needs a reference and waits for the owner's tick");

    const mpesaMissing = await sale({ items: [{ productId: charger.id, quantity: 1 }], paymentMethod: "MPESA" });
    assert.equal(mpesaMissing.status, 400);
    const mpesaCode = `QK${run}`.toUpperCase().padEnd(10, "X");
    const mpesa = await sale({ items: [phoneItem(units[1])], paymentMethod: "MPESA", paymentReference: mpesaCode });
    assert.equal(mpesa.status, 201, JSON.stringify(mpesa.data));
    assert.equal((mpesa.data.payments as { requiresVerification: boolean }[])[0].requiresVerification, true);
    const duplicate = await sale({ items: [{ productId: charger.id, quantity: 1 }], paymentMethod: "MPESA", paymentReference: mpesaCode });
    assert.equal(duplicate.status, 409);
    pass("M-Pesa send money needs its code, waits for the tick, and a reused code is refused");

    const card = await sale({ items: [{ productId: charger.id, quantity: 1 }], paymentMethod: "CARD" });
    assert.equal(card.status, 201, JSON.stringify(card.data));
    assert.equal((card.data.payments as { requiresVerification: boolean }[])[0].requiresVerification, false);
    pass("Card payment records immediately");

    const split = await sale({ items: [{ productId: charger.id, quantity: 5 }], paymentMethod: "SPLIT", paymentBreakdown: [{ method: "CASH", amount: 4000 }, { method: "BANK", amount: 6000, reference: `FT${run}SPLIT` }] });
    assert.equal(split.status, 201, JSON.stringify(split.data));
    pass("Split payment across cash and bank transfer");

    const lowDeposit = await sale({ items: [phoneItem(units[2])], customerId: customer.id, paymentMethod: "CREDIT", creditTermMonths: 4, creditDepositAmount: 30000, creditDepositMethod: "CASH" });
    assert.equal(lowDeposit.status, 400);
    assert.match(String(lowDeposit.data.error), /minimum/i);
    const lipa = await sale({ items: [phoneItem(units[2])], customerId: customer.id, paymentMethod: "CREDIT", creditTermMonths: 4, creditDepositAmount: 40000, creditDepositMethod: "MPESA", creditDepositReference: `QL${run}DEP`.toUpperCase() });
    assert.equal(lipa.status, 201, JSON.stringify(lipa.data));
    assert.equal(lipa.data.status, "PARTIAL");
    assert.equal((lipa.data.creditPlanLinks as unknown[]).length, 1);
    pass("Lipa Mdogo Mdogo refuses a 30% deposit and opens a plan on 40% (branch policy of 20% is raised)");

    const locked = await sale({ items: [phoneItem(lockedUnit)], paymentMethod: "CASH" });
    assert.equal(locked.status, 409);
    const resold = await sale({ items: [phoneItem(units[0])], paymentMethod: "CASH" });
    assert.equal(resold.status, 409);
    pass("Locked and already-sold devices cannot be sold");

    const inspection = { identityVerified: true, ownershipVerified: true, identifiersMatch: true, activationLockOff: true, stolenCheckClear: true, receiptPresent: false, boxPresent: true, missingDocumentsReason: "Receipt lost" };
    const tradeA = await sale({ items: [phoneItem(units[3])], customerId: customer.id, paymentMethod: "TRADE_IN", tradeIn: { requestKey: randomUUID(), productId: phone.id, identifier: `86${run.replace(/\D/g, "1").padEnd(13, "1")}`.slice(0, 15), value: 35000, inspection, topUpMethod: "MPESA", topUpReference: `QT${run}TOP`.toUpperCase() } });
    assert.equal(tradeA.status, 201, JSON.stringify(tradeA.data));
    assert.equal(tradeA.data.status, "PAID");
    assert.deepEqual((tradeA.data.payments as { method: string; amount: number }[]).map((payment) => [payment.method, payment.amount]).sort(), [["MPESA", 65000], ["TRADE_IN", 35000]]);
    const tradeOp = await prisma.operation.findFirstOrThrow({ where: { saleId: String(tradeA.data.id), kind: "TRADE_IN" }, include: { unit: true } });
    assert.equal(tradeOp.status, "INSPECTION");
    assert.equal(tradeOp.unit.status, "QUARANTINED");
    pass("Trade-in + top-up: one sale for the seller, trade credit plus M-Pesa top-up, device sent to inspection");

    const overTrade = await sale({ items: [{ productId: charger.id, quantity: 1 }], customerId: customer.id, paymentMethod: "TRADE_IN", tradeIn: { requestKey: randomUUID(), productId: phone.id, identifier: `87${run.replace(/\D/g, "2").padEnd(13, "2")}`.slice(0, 15), value: 5000, inspection } });
    assert.equal(overTrade.status, 400);
    pass("A trade-in worth more than the sale is refused (no cash out)");

    const accept = await call("PATCH", "/api/operations", ownerCookie, { requestKey: randomUUID(), id: tradeOp.id, version: tradeOp.version, action: "ACCEPT", proof: "Inspected, grade B", costAmount: 35000, password });
    assert.equal(accept.status, 200, JSON.stringify(accept.data));
    const credit = await prisma.salePayment.findFirstOrThrow({ where: { saleId: String(tradeA.data.id), method: "TRADE_IN" } });
    assert.ok(credit.verifiedAt);
    pass("Owner accepting the trade-in confirms the trade credit");

    const tradeB = await sale({ items: [phoneItem(units[4])], customerId: customer.id, paymentMethod: "TRADE_IN", tradeIn: { requestKey: randomUUID(), productId: phone.id, identifier: `88${run.replace(/\D/g, "3").padEnd(13, "3")}`.slice(0, 15), value: 100000, inspection } });
    assert.equal(tradeB.status, 201, JSON.stringify(tradeB.data));
    const tradeOpB = await prisma.operation.findFirstOrThrow({ where: { saleId: String(tradeB.data.id), kind: "TRADE_IN" } });
    const reject = await call("PATCH", "/api/operations", ownerCookie, { requestKey: randomUUID(), id: tradeOpB.id, version: tradeOpB.version, action: "REJECT", proof: "Screen replaced with non-original part" });
    assert.equal(reject.status, 200, JSON.stringify(reject.data));
    const rejectedSale = await prisma.sale.findUniqueOrThrow({ where: { id: String(tradeB.data.id) } });
    assert.equal(rejectedSale.status, "PARTIAL");
    assert.equal(rejectedSale.paidAmount, 0);
    pass("Owner rejecting a trade-in removes the credit and reopens the balance");

    const sellerTick = await call("POST", "/api/finance/payments", sellerCookie, { paymentIds: [String((bank.data.payments as { id: string }[])[0].id)] });
    assert.equal(sellerTick.status, 403);
    const pending = await call("GET", "/api/finance/payments", ownerCookie);
    assert.equal(pending.status, 200);
    const pendingIds = (pending.data.payments as { id: string; sale: { invoiceNumber: string } }[]).filter((payment) => [bank, mpesa, split, lipa, tradeA].some((entry) => entry.data.invoiceNumber === payment.sale.invoiceNumber)).map((payment) => payment.id);
    assert.equal(pendingIds.length, 5);
    const tick = await call("POST", "/api/finance/payments", ownerCookie, { paymentIds: pendingIds });
    assert.equal(tick.status, 200, JSON.stringify(tick.data));
    assert.equal(tick.data.verified, 5);
    pass("Only the owner can tick; M-Pesa and bank entries from every path are confirmed");

    const cod = await sale({ items: [{ productId: charger.id, quantity: 1 }], customerId: customer.id, paymentMethod: "COD" });
    assert.equal(cod.status, 201, JSON.stringify(cod.data));
    assert.equal((cod.data.payments as unknown[]).length, 0);
    const payLink = await sale({ items: [{ productId: charger.id, quantity: 1 }], paymentMethod: "PAY_LINK", payerPhone: "0712345678", payerConsent: true });
    assert.equal(payLink.status, 503);
    pass("Cash on delivery records no money yet; payer link refuses cleanly while SMS is not configured");

    const events = await prisma.saleEvent.findMany({ where: { saleId: String(cash.data.id) }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(new Set(events.map((event) => event.kind)), new Set(["Sale recorded", "Invoice created", "Payment recorded", "Receipt queued"]));
    const tradeEvents = await prisma.saleEvent.findMany({ where: { saleId: String(tradeA.data.id) } });
    assert.ok(["Trade-in opened", "Trade-in accepted", "Payment confirmed"].every((kind) => tradeEvents.some((event) => event.kind === kind)));
    const alerts = await prisma.staffAlert.count({ where: { userId: owner.id, title: { contains: "Sale GH-" } } });
    assert.ok(alerts >= 8);
    pass("Every step is written to the sale activity trail and each sale reaches the owner live");

    for (let attempt = 0; attempt < 30 && !(existsSync(mailFile) && readFileSync(mailFile, "utf8").includes(String(cash.data.invoiceNumber))); attempt += 1) await new Promise((done) => setTimeout(done, 1000));
    const mail = readFileSync(mailFile, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { from: string; to: string[]; subject: string; attachments?: { filename: string; content: string }[] }).find((entry) => entry.subject.includes(String(cash.data.invoiceNumber)));
    assert.ok(mail, "receipt email was sent");
    assert.equal(mail.from, "GadgetHub <info@gadgethubke.com>");
    assert.deepEqual(mail.to, [customer.email]);
    assert.ok(Buffer.from(mail.attachments?.[0]?.content ?? "", "base64").subarray(0, 5).toString() === "%PDF-");
    const notification = await prisma.customerNotification.findUniqueOrThrow({ where: { dedupeKey: `receipt:${String(cash.data.id)}:checkout` } });
    assert.equal(notification.status, "SENT");
    pass("Receipt PDF is emailed to the client at once");

    const performance = await prisma.sale.groupBy({ by: ["cashierId"], where: { branchId: branch.id }, _count: { _all: true } });
    assert.equal(performance.find((row) => row.cashierId === cashier.id)?._count._all, 9); // cash, bank, M-Pesa, card, split, Lipa, two trade-ins, COD
    pass("Trade-in sales count toward the seller's sales");
  } catch (error) {
    console.error(serverLog.split("\n").filter((line) => /error|Error|failed/.test(line)).slice(-30).join("\n"));
    throw error;
  } finally {
    server.kill("SIGTERM");
    if (existsSync(mailFile)) rmSync(mailFile);
    await prisma.$disconnect();
  }
  console.log(`# pass ${results.length}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
