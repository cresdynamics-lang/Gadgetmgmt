import { BarcodeFormat, BinaryBitmap, ChecksumException, DecodeHintType, FormatException, HybridBinarizer, MultiFormatReader, NotFoundException, RGBLuminanceSource } from "@zxing/library";

import { imeiChecksumValid, normalizeImei, normalizeSerial } from "@/lib/device-units";

// These proportions also define the guide drawn over the object-cover preview.
export const SCAN_GUIDE = { width: 0.8, height: 0.4 };
export const SQUARE_GUIDE = 0.72;

const SCAN_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.ITF,
];

export type DetectedCode = {
  raw: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
  productCode: string | null;
};

export function scanRegion(videoWidth: number, videoHeight: number, previewWidth: number, previewHeight: number) {
  if ([videoWidth, videoHeight, previewWidth, previewHeight].some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const scale = Math.max(previewWidth / videoWidth, previewHeight / videoHeight);
  const width = previewWidth / scale * SCAN_GUIDE.width;
  const height = previewHeight / scale * SCAN_GUIDE.height;
  return { x: (videoWidth - width) / 2, y: (videoHeight - height) / 2, width, height };
}

export function squareScanRegion(videoWidth: number, videoHeight: number, previewWidth: number, previewHeight: number) {
  if ([videoWidth, videoHeight, previewWidth, previewHeight].some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const scale = Math.max(previewWidth / videoWidth, previewHeight / videoHeight);
  const side = Math.min(previewWidth, previewHeight) / scale * SQUARE_GUIDE;
  return { x: (videoWidth - side) / 2, y: (videoHeight - side) / 2, width: side, height: side };
}

const SERIAL_LABEL = /(?:serial(?:\s*number|\s*no\.?)?|s\/n|sn)\s*[:#=\-]?\s*([A-Za-z0-9][A-Za-z0-9-]{3,39})/i;
const IMEI_LABEL = /imei\s*1?\s*[:#=\-]?\s*(\d{15})/i;
const IMEI2_LABEL = /imei\s*2\s*[:#=\-]?\s*(\d{15})/i;
const SERIAL_KEYS = new Set(["serial", "serialnumber", "serialno", "serial_number", "sn"]);
const IMEI_KEYS = new Set(["imei", "imei1", "imei_1"]);
const IMEI2_KEYS = new Set(["imei2", "imei_2"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function detectDeviceCode(rawInput: string): DetectedCode {
  const raw = rawInput.replace(/^\uFEFF/, "").trim();
  const empty = { raw, imei: null, imei2: null, serialNumber: null, productCode: null };
  if (!raw || raw.length > 2000) return empty;

  let imei = normalizeImei(raw);
  let imei2: string | null = null;
  let serialNumber: string | null = imei ? null : readPlainSerial(raw);
  let productCode: string | null = null;

  const labeledImei = raw.match(IMEI_LABEL)?.[1] ?? "";
  const labeledImei2 = raw.match(IMEI2_LABEL)?.[1] ?? "";
  const labeledSerial = raw.match(SERIAL_LABEL)?.[1] ?? "";
  if (imeiChecksumValid(labeledImei)) imei = labeledImei;
  if (imeiChecksumValid(labeledImei2) && labeledImei2 !== imei) imei2 = labeledImei2;
  const labeled = normalizeSerial(labeledSerial);
  if (labeled && labeled !== imei && labeled !== imei2) serialNumber = labeled;

  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const record = asRecord(JSON.parse(raw));
      if (record) {
        for (const [key, value] of Object.entries(record)) {
          const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
          const text = textValue(value);
          if (IMEI_KEYS.has(normalizedKey)) imei = normalizeImei(text) ?? imei;
          else if (IMEI2_KEYS.has(normalizedKey)) imei2 = normalizeImei(text) ?? imei2;
          else if (SERIAL_KEYS.has(normalizedKey)) serialNumber = normalizeSerial(text) ?? serialNumber;
        }
      }
    } catch {
      // A QR payload that merely looks like JSON stays plain text.
    }
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      for (const [key, value] of url.searchParams) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (IMEI_KEYS.has(normalizedKey)) imei = normalizeImei(value) ?? imei;
        else if (IMEI2_KEYS.has(normalizedKey)) imei2 = normalizeImei(value) ?? imei2;
        else if (SERIAL_KEYS.has(normalizedKey)) serialNumber = normalizeSerial(value) ?? serialNumber;
      }
    } catch {
      // Ignore values that are not a usable URL. Nothing is fetched.
    }
  }

  const compact = raw.replace(/[\s-]/g, "");
  if (!imei && !serialNumber && /^\d{8,14}$/.test(compact)) productCode = compact;
  if (imei2 === imei) imei2 = null;
  return { raw, imei, imei2, serialNumber, productCode };
}

function readPlainSerial(value: string) {
  if (/\s/.test(value) || value.includes("://") || value.startsWith("{")) return null;
  const serial = normalizeSerial(value);
  if (!serial || /^\d{8,15}$/.test(serial)) return null;
  return serial;
}

export function createBarcodeDecoder() {
  const reader = new MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, SCAN_FORMATS],
  ]);
  reader.setHints(hints);
  return (image: Pick<ImageData, "data" | "width" | "height">) => {
    const luminance = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0; i < luminance.length; i += 1) {
      const offset = i * 4;
      luminance[i] = (image.data[offset] + 2 * image.data[offset + 1] + image.data[offset + 2]) / 4;
    }
    try {
      const result = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, image.width, image.height))));
      return { value: result.getText(), format: result.getBarcodeFormat() };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) return null;
      throw error;
    } finally {
      reader.reset();
    }
  };
}
