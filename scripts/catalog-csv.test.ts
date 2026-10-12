import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalog } from "./catalog-csv";

const header = "Category,Item ID,Group,Product,Configuration / Spec,Price NEW (KES),Price EX-UK (KES),Notes";

test("parses quoted commas and CRLF rows", () => {
  const [row] = parseCatalog(`${header}\r\nPhones,IP-01,Smartphone,Phone,128 GB,100,80,"Note, with comma"`);
  assert.equal(row.itemId, "IP-01");
  assert.equal(row.newPrice, 100);
  assert.equal(row.exUkPrice, 80);
  assert.equal(row.notes, "Note, with comma");
});

test("rejects duplicate item IDs", () => {
  const source = `${header}\nPhones,IP-01,Smartphone,Phone,128 GB,100,80,\nPhones,IP-01,Smartphone,Phone,256 GB,120,90,`;
  assert.throws(() => parseCatalog(source), /empty or duplicated/);
});

test("rejects zero, overflowing, and fractional prices", () => {
  for (const prices of ["0,80", "2147483648,80", "100,80.5"]) {
    assert.throws(() => parseCatalog(`${header}\nPhones,IP-01,Smartphone,Phone,128 GB,${prices},`), /price/i);
  }
});
