import { appleModelKey, isAppleModelNumber, isAppleMpn, lookupAppleIdentity } from "@/lib/apple-barcodes";

export type ScannedDevice = {
  imei: string;
  serial: string;
  mpn: string;
  modelNumber: string;
  storage: string;
  colour: string;
  batteryHealth: string;
  fmi: string;
  sim: string;
  version: string;
  name: string;
  category: string;
  group: string;
};

const emptyDevice: ScannedDevice = {
  imei: "", serial: "", mpn: "", modelNumber: "", storage: "", colour: "",
  batteryHealth: "", fmi: "", sim: "", version: "", name: "", category: "", group: "",
};

function field(raw: string, pattern: RegExp) {
  return raw.match(pattern)?.[1]?.trim() || "";
}

/** Wholesale QR and pasted stickers often arrive without line breaks. */
function normalizeScanText(raw: string) {
  return String(raw || "")
    .replace(/\u0000/g, " ")
    .replace(/([A-Za-z0-9.%])(SR#|S\/N|SERIAL|FMI|IMEI|VERSION|COLOR|COLOUR|SIM[:\s])/gi, "$1 $2")
    .replace(/(GB|TB)(A\d{4})/gi, "$1 $2")
    .replace(/([A-Za-z0-9])(A\d{4})/gi, "$1 $2")
    .replace(/(\d{15})/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull IMEI, serial, MPN and About-style details out of a barcode or QR payload. */
export function parseDeviceScan(raw: string): ScannedDevice {
  const text = normalizeScanText(raw);
  if (!text) return { ...emptyDevice };

  const compact = text.toUpperCase();
  const imei = text.match(/\b(\d{15})\b/)?.[1] || (compact.match(/IMEI[:\s-]*(\d{15})/)?.[1] ?? "");
  const mpn = compact.match(/\b([A-Z]{1,2}[A-Z0-9]{3,6}(?:[A-Z]{1,2})?\/A)\b/)?.[1] || "";
  const modelNumber = compact.match(/\b(A\d{4})\b/)?.[1] || compact.match(/(A\d{4})/)?.[1] || "";
  const serial = (
    field(compact, /(?:SR#|S\/N|SN[:\s]|SERIAL(?:\s*NUMBER)?)[:\s#]*([A-Z0-9]{8,12})\b/)
    || (compact.match(/\bS([A-Z0-9]{8,12})\b/)?.[1] && !imei ? compact.match(/\bS([A-Z0-9]{8,12})\b/)?.[1] : "")
    || ""
  ).replace(/^S(?=[A-Z0-9]{8,12}$)/, "");
  const storage = (compact.match(/\b((?:64|128|256|512)\s*GB|(?:1|2)\s*TB)\b/)?.[1] || "").replace(/\s+/g, "");
  const colour = field(text, /\b(?:COLOR|COLOUR)[:\s]+([A-Za-z][A-Za-z /-]+)/i)
    // Stop at the next field name, e.g. "Color GRAPHITE Version 17.4" is just GRAPHITE.
    .split(/\s+(?:VERSION|SIM|FMI|FIND|BATTERY|HEALTH|IMEI|SR#|SERIAL|S\/N|MODEL|CAPACITY|STORAGE|IOS)\b/i)[0]
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const batteryHealth = field(text, /(?:BATTERY(?:\s*HEALTH)?|HEALTH|CAPACITY|=)\s*(\d{1,3})\s*%/i);
  const fmi = /FMI\s*OFF|FIND\s*MY\s*OFF/i.test(text) ? "Off" : /FMI\s*ON|FIND\s*MY\s*ON/i.test(text) ? "On" : "";
  const sim = /UNLOCKED/i.test(text) ? "Unlocked" : /LOCKED|SIM\s*LOCK/i.test(text) ? "Locked" : "";
  const version = field(text, /\bVERSION[:\s]+([\d.]+)/i);

  const identity = lookupAppleIdentity([modelNumber, mpn, text].filter(Boolean).join(" "));
  const named = appleModelKey(text);
  const group = identity?.group || (named ? named.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "");
  const storageLabel = storage.replace(/GB$/i, "GB").replace(/TB$/i, "TB");
  const name = [group || identity?.name, storageLabel].filter(Boolean).join(" ").trim();

  return {
    imei,
    serial: serial && serial !== imei ? serial : "",
    mpn,
    modelNumber,
    storage: storageLabel,
    colour,
    batteryHealth,
    fmi,
    sim,
    version,
    name,
    category: identity?.category || (group.startsWith("iPhone") ? "iPhone" : ""),
    group,
  };
}

export function scanLookupCode(raw: string) {
  const device = parseDeviceScan(raw);
  if (device.imei) return { code: device.imei, kind: "imei" as const, device };
  if (device.modelNumber && isAppleModelNumber(device.modelNumber)) return { code: device.modelNumber, kind: "model" as const, device };
  if (device.mpn && isAppleMpn(device.mpn)) return { code: device.mpn, kind: "mpn" as const, device };
  if (device.serial) return { code: device.serial, kind: "serial" as const, device };
  return { code: "", kind: "unknown" as const, device };
}

export function deviceHasIdentity(device: ScannedDevice) {
  return Boolean(device.imei || device.serial || device.modelNumber || device.mpn || device.name);
}

export function phoneLabelTitle(device: ScannedDevice) {
  const group = (device.group || device.name || "").replace(/\s+\d+\s*(GB|TB).*/i, "").trim();
  const parts = ["Apple", group, device.mpn, device.storage].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function overlayDevice(device: ScannedDevice, extra: Partial<ScannedDevice> = {}): ScannedDevice {
  const next = { ...device };
  (Object.keys(emptyDevice) as (keyof ScannedDevice)[]).forEach((key) => {
    const value = extra[key];
    if (typeof value === "string" && value.trim()) next[key] = value.trim();
  });
  return next;
}

export function emptyScannedDevice(): ScannedDevice {
  return { ...emptyDevice };
}

export function deviceNotes(device: ScannedDevice) {
  return [
    device.serial ? `Sr# ${device.serial}` : null,
    device.fmi ? `FMI ${device.fmi}` : null,
    device.batteryHealth ? `Battery ${device.batteryHealth}%` : null,
    device.sim ? `SIM ${device.sim}` : null,
    device.version ? `Version ${device.version}` : null,
  ].filter(Boolean).join(" · ");
}
