import assert from "node:assert/strict";
import test from "node:test";
import { BarcodeFormat, QRCodeWriter } from "@zxing/library";
import { createBarcodeDecoder, scanRegion } from "../src/lib/barcode-scanner";

test("scan guide maps to the visible object-cover video, including cropped edges", () => {
  assert.deepEqual(scanRegion(1920, 1080, 640, 320), { x: 192, y: 348, width: 1536, height: 384 });
  assert.deepEqual(scanRegion(1920, 1080, 320, 640), { x: 744, y: 324, width: 432, height: 432 });
  assert.equal(scanRegion(0, 1080, 640, 320), null);
});

test("decodes an EAN-13 product barcode from RGBA camera pixels", () => {
  // EAN-13 fixture for 5901234123457, with quiet zones and 3 pixels per module.
  const modules = "00000000000" + "101" + "0001011" + "0100111" + "0110011" + "0010011" + "0111101" + "0011101" + "01010" + "1100110" + "1101100" + "1000010" + "1011100" + "1001110" + "1000100" + "101" + "0000000";
  const width = modules.length * 3;
  const height = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const shade = modules[Math.floor(x / 3)] === "1" ? 0 : 255;
      data.set([shade, shade, shade, 255], offset);
    }
  }
  assert.deepEqual(createBarcodeDecoder()({ data, width, height }), { value: "5901234123457", format: BarcodeFormat.EAN_13 });
});

test("decoder can scan successive frames and ignores frames without a barcode", () => {
  const decode = createBarcodeDecoder();
  const width = 240;
  const height = 240;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  assert.equal(decode({ data, width, height }), null);
  const matrix = new QRCodeWriter().encode("INVENTORY-12345", BarcodeFormat.QR_CODE, width, height, new Map());
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shade = matrix.get(x, y) ? 0 : 255;
      data.set([shade, shade, shade, 255], (y * width + x) * 4);
    }
  }
  assert.deepEqual(decode({ data, width, height }), { value: "INVENTORY-12345", format: BarcodeFormat.QR_CODE });
  assert.deepEqual(decode({ data, width, height }), { value: "INVENTORY-12345", format: BarcodeFormat.QR_CODE });
});
