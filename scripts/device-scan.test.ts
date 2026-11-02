import assert from "node:assert/strict";
import test from "node:test";

import { lookupAppleIdentity } from "../src/lib/apple-barcodes";
import { encodeCode128 } from "../src/lib/code128";
import { parseDeviceScan, phoneLabelTitle, scanLookupCode } from "../src/lib/device-scan";
import { matchScanProducts, parseScanPayload } from "../src/lib/inventory-scan";
import { createPhoneLabelPdf, PHONE_LABEL, phoneLabelInnerHtml, phoneLabelPrintDocument } from "../src/lib/phone-label";
import { applyDeviceScanToTradeIn, blankTradeInForm } from "../src/components/trade-in-panel";

const sampleSticker = `Apple iPhone 14 MPUA3LL/A 128GB GB
A2649
Sr# V2WT716GVM
FMI Off
= 100%
Sim: Unlocked
Version 26.4
Color MIDNIGHT
2026-03-30
1 PC 12
100% Working Phone
358250492399182`;

const aboutDump = `iPhone 14
Model Number A2649
Serial Number V2WT716GVM
IMEI 358250492399182
Maximum Capacity 100%`;

test("a glued one-line sticker still populates IMEI, serial and colour", () => {
  const device = parseDeviceScan("Apple iPhone 14 MPUA3LL/A 128GB GBA2649Sr# V2WT716GVMFMI Off= 100%Sim: UnlockedVersion 26.4Color MIDNIGHT358250492399182");
  assert.equal(device.imei, "358250492399182");
  assert.equal(device.serial, "V2WT716GVM");
  assert.equal(device.modelNumber, "A2649");
  assert.equal(device.colour, "MIDNIGHT");
  assert.equal(device.version, "26.4");
});

test("an Ex-UK sticker QR populates IMEI, serial, MPN, A-number and colour", () => {
  const device = parseDeviceScan(sampleSticker);
  assert.equal(device.imei, "358250492399182");
  assert.equal(device.serial, "V2WT716GVM");
  assert.equal(device.mpn, "MPUA3LL/A");
  assert.equal(device.modelNumber, "A2649");
  assert.equal(device.storage, "128GB");
  assert.equal(device.colour, "MIDNIGHT");
  assert.equal(device.batteryHealth, "100");
  assert.equal(device.fmi, "Off");
  assert.equal(device.sim, "Unlocked");
  assert.equal(device.version, "26.4");
  assert.equal(device.group, "iPhone 14");
  assert.equal(phoneLabelTitle(device), "Apple iPhone 14 MPUA3LL/A 128GB");
  assert.equal(scanLookupCode(sampleSticker).kind, "imei");
  assert.equal(parseScanPayload(sampleSticker).code, "358250492399182");
  assert.equal(lookupAppleIdentity(sampleSticker)?.group, "iPhone 14");
});

test("Settings → About text fills IMEI, serial and model for a trade-in", () => {
  const device = parseDeviceScan(aboutDump);
  assert.equal(device.imei, "358250492399182");
  assert.equal(device.serial, "V2WT716GVM");
  assert.equal(device.modelNumber, "A2649");
  assert.equal(device.batteryHealth, "100");
  assert.equal(device.group, "iPhone 14");

  const form = applyDeviceScanToTradeIn(aboutDump, { ...blankTradeInForm, active: true });
  assert.equal(form.brand, "APPLE");
  assert.equal(form.deviceType, "iPhone");
  assert.equal(form.model, "iPhone 14");
  assert.equal(form.serial, "358250492399182");
  assert.equal(form.deviceSerial, "V2WT716GVM");
});

test("an Ex-UK 128GB scan does not receive a different storage SKU", () => {
  const stock = [
    {
      id: "ex256",
      sku: "EXUK-IPHONE-14-256GB",
      name: "iPhone 14 256GB (Ex-UK)",
      category: "iPhone",
      brand: "Apple",
      condition: "EX_UK",
      colour: null,
      imei: null,
      productGroup: "iPhone 14",
      websiteProductId: null,
      websiteVariantKey: null,
    },
    {
      id: "ex128",
      sku: "EXUK-IPHONE-14-128GB",
      name: "iPhone 14 128GB (Ex-UK)",
      category: "iPhone",
      brand: "Apple",
      condition: "EX_UK",
      colour: "Midnight",
      imei: null,
      productGroup: "iPhone 14",
      websiteProductId: null,
      websiteVariantKey: null,
    },
  ];
  const hits = matchScanProducts(sampleSticker, stock, { condition: "EX_UK" });
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.product.id, "ex128");
});

test("the phone label encodes the IMEI as Code 128 and names the device like the sample sticker", () => {
  const device = parseDeviceScan(sampleSticker);
  const modules = encodeCode128(device.imei);
  assert.ok(modules.length > 10);
  assert.equal(modules[0]?.black, true);
  const doc = createPhoneLabelPdf(device);
  assert.equal(PHONE_LABEL.widthMm, 90);
  assert.equal(PHONE_LABEL.heightMm, 50);
  assert.equal(Math.round(doc.internal.pageSize.getWidth()), 90);
  assert.equal(Math.round(doc.internal.pageSize.getHeight()), 50);
  const html = phoneLabelInnerHtml(device);
  assert.match(html, /GADGET HUB/);
  assert.match(html, /mark-on-light\.png/);
  assert.match(html, /Battery health/);
  assert.match(html, /100%/);
  assert.match(html, /358250492399182/);
  const printHtml = phoneLabelPrintDocument(device);
  assert.match(printHtml, /@page \{ size: 90mm 50mm; margin: 0; \}/);
  assert.match(printHtml, /gh-phone-label__logo/);
});

test("a bare MacBook serial is read as a serial, with no model guessed", () => {
  for (const code of ["C02XK1ABJG5H", "SC02XK1ABJG5H", "V2WT7T6GVM"]) {
    const device = parseDeviceScan(code);
    assert.equal(device.serial, code.replace(/^S(?=.{12}$)/, ""));
    assert.equal(device.name, "");
    assert.equal(device.category, "");
    assert.equal(device.modelNumber, "");
  }
  assert.equal(scanLookupCode("C02XK1ABJG5H").kind, "serial");
  assert.equal(parseDeviceScan("A2337").serial, "");
  assert.equal(parseDeviceScan("IPHONE17PRO").serial, "");
  assert.equal(parseDeviceScan("358250492399182").serial, "");
});

test("a MacBook sticker fills model, chip, storage, colour and serial", () => {
  const device = parseDeviceScan("Apple MacBook Air M1 MGN63LL/A 256GB A2337 Sr# C02XK1ABJG5H Battery 91% Version 15.1 Space Gray");
  assert.equal(device.category, "Mac");
  assert.equal(device.group, 'MacBook Air 13" M1');
  assert.equal(device.name, 'MacBook Air 13" M1 256GB');
  assert.equal(device.storage, "256GB");
  assert.equal(device.serial, "C02XK1ABJG5H");
  assert.equal(device.imei, "");
  assert.equal(device.colour, "SPACE GRAY");
  assert.equal(device.batteryHealth, "91");
});

test("an iPad About screen is told apart from an iPhone", () => {
  const device = parseDeviceScan("iPad Air 11-inch (M2)\nModel Number A2902\nSerial Number HXY12ABC34\nCapacity 256 GB");
  assert.equal(device.category, "iPad");
  assert.equal(device.group, 'iPad Air 11" M2');
  assert.equal(device.serial, "HXY12ABC34");
});

test("a MacBook scanned at checkout is taken in as a MacBook, not an iPhone", () => {
  const form = applyDeviceScanToTradeIn("Apple MacBook Air M1 MGN63LL/A 256GB A2337 Sr# C02XK1ABJG5H Battery 91%", { ...blankTradeInForm, active: true });
  assert.equal(form.brand, "APPLE");
  assert.equal(form.deviceType, "MacBook");
  assert.equal(form.model, 'MacBook Air 13" M1');
  assert.equal(form.serial, "C02XK1ABJG5H");
  assert.equal(form.storage, "256GB");
  const bare = applyDeviceScanToTradeIn("C02XK1ABJG5H", { ...blankTradeInForm, active: true });
  assert.equal(bare.deviceType, "");
  assert.equal(bare.serial, "C02XK1ABJG5H");
});
