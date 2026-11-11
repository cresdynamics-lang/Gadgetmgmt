import assert from "node:assert/strict";
import test from "node:test";
import { BarcodeFormat, QRCodeWriter } from "@zxing/library";
import { createBarcodeDecoder, detectDeviceCode, scanRegion, squareScanRegion } from "../src/lib/barcode-scanner";
import { imeiChecksumValid } from "../src/lib/device-units";

test("scan guide maps to the visible object-cover video, including cropped edges", () => {
  assert.deepEqual(scanRegion(1920, 1080, 640, 320), { x: 192, y: 348, width: 1536, height: 384 });
  assert.deepEqual(scanRegion(1920, 1080, 320, 640), { x: 744, y: 324, width: 432, height: 432 });
  assert.equal(scanRegion(0, 1080, 640, 320), null);
  const square = squareScanRegion(1920, 1080, 640, 320);
  assert.ok(square);
  assert.equal(square.width, square.height);
  assert.ok(square.width > 600 && square.width < 800);
  assert.equal(squareScanRegion(0, 1080, 640, 320), null);
});

function checkDigit(base14: string) {
  let sum = 0;
  for (let index = 0; index < base14.length; index += 1) {
    let digit = Number(base14[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return `${base14}${(10 - (sum % 10)) % 10}`;
}

test("QR and labeled codes reveal a serial or IMEI without fetching the payload", () => {
  const imei = checkDigit("49015420323751");
  assert.equal(imeiChecksumValid(imei), true);
  assert.deepEqual(detectDeviceCode(`Serial: C02ABCDEF12\nIMEI: ${imei}`), {
    raw: `Serial: C02ABCDEF12\nIMEI: ${imei}`,
    imei,
    imei2: null,
    serialNumber: "C02ABCDEF12",
    productCode: null,
  });
  assert.equal(detectDeviceCode("https://check.example/device?sn=C02ABCDEF12&imei=" + imei).serialNumber, "C02ABCDEF12");
  assert.equal(detectDeviceCode("https://check.example/device?sn=C02ABCDEF12").imei, null);
  assert.equal(detectDeviceCode('{"sn":"R5CT80ABCDE","imei2":"' + checkDigit("35693803564380") + '"}').serialNumber, "R5CT80ABCDE");
  assert.equal(detectDeviceCode("C02ABCDEF12").serialNumber, "C02ABCDEF12");
  assert.equal(detectDeviceCode("5901234123457").productCode, "5901234123457");
  assert.equal(detectDeviceCode("5901234123457").serialNumber, null);
  assert.equal(detectDeviceCode("123456789012345").imei, null);
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
