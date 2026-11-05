import { appleModelKey, appleSerialFromScan, isAppleModelNumber, isAppleMpn, lookupAppleIdentity } from "@/lib/apple-barcodes";

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
  /** Printed barcode for this physical unit. Empty until the shop receives it. */
  unitCode?: string;
};

const emptyDevice: ScannedDevice = {
  imei: "", serial: "", mpn: "", modelNumber: "", storage: "", colour: "",
  batteryHealth: "", fmi: "", sim: "", version: "", name: "", category: "", group: "", unitCode: "",
};

/** Map a photo or About dump onto a catalog section without asking the staff to pick one. */
export function categoryFromText(text: string) {
  const source = text.toLowerCase();
  if (/\b(macbook|imac|mac mini|mac studio|mac pro)\b/.test(source) || /\bmac\b/.test(source)) return "Mac";
  if (/\bipad\b/.test(source)) return "iPad";
  if (/\bapple watch\b/.test(source) || /\bwatch\b/.test(source)) return "Apple Watch";
  if (/\bairpods\b/.test(source)) return "AirPods";
  if (/\b(apple tv|homepod)\b/.test(source)) return "Apple TV & Home";
  if (/\b(case|cover|charger|cable|strap|accessor)/.test(source)) return "Apple accessories";
  if (/\biphone\b/.test(source)) return "iPhone";
  return "";
}

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
  const compactEarly = text.toUpperCase().replace(/\s+/g, "");
  if (/^GH[A-Z0-9]{8}$/.test(compactEarly)) return { ...emptyDevice, unitCode: compactEarly };

  // A MacBook or iPad barcode is often the serial and nothing else. It says nothing about the model.
  const bareSerial = appleSerialFromScan(text);
  if (bareSerial) return { ...emptyDevice, serial: bareSerial };

  const compact = text.toUpperCase();
  const imei = text.match(/\b(\d{15})\b/)?.[1] || (compact.match(/IMEI[:\s-]*(\d{15})/)?.[1] ?? "");
  const mpn = compact.match(/\b([A-Z]{1,2}[A-Z0-9]{3,6}(?:[A-Z]{1,2})?\/A)\b/)?.[1] || "";
  const modelNumber = compact.match(/\b(A\d{4})\b/)?.[1] || compact.match(/(A\d{4})/)?.[1] || "";
  const serial = (
    field(compact, /(?:SR#|S\/N|SN[:\s]|SERIAL(?:\s*NUMBER)?)[:\s#]*([A-Z0-9]{8,12})\b/)
    || (!imei ? compact.match(/\bS((?=[A-Z0-9]*\d)[A-Z0-9]{8,12})\b/)?.[1] : "")
    || ""
  ).replace(/^S(?=[A-Z0-9]{8,12}$)/, "");
  const storage = (compact.match(/\b((?:64|128|256|512)\s*GB|(?:1|2)\s*TB)\b/)?.[1] || "").replace(/\s+/g, "");
  const colour = (field(text, /\b(?:COLOR|COLOUR)[:\s]+([A-Za-z][A-Za-z /-]+)/i) || text.match(/\b(SPACE\s+(?:GRAY|GREY|BLACK)|SILVER|MIDNIGHT|STARLIGHT|SKY\s+BLUE)\b/i)?.[1] || "")
    // Stop at the next field name, e.g. "Color GRAPHITE Version 17.4" is just GRAPHITE.
    .split(/\s+(?:VERSION|SIM|FMI|FIND|BATTERY|HEALTH|IMEI|SR#|SERIAL|S\/N|MODEL|CAPACITY|STORAGE|IOS|QTY|CATEGORY|ACCESSORY)\b/i)[0]
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
  const accessoryTitle = field(text, /\bACCESSORY[:\s]+(.+?)(?=\s+(?:COLOR|COLOUR|QTY|CATEGORY|IMEI|SR#|BATTERY|VERSION|SIM|FMI)\b|$)/i);
  const category = (categoryFromText(text) === "Apple accessories" ? "Apple accessories" : "") || identity?.category || categoryFromText(`${group} ${text}`) || (group.startsWith("iPhone") ? "iPhone" : "");
  const name = category === "Apple accessories" && accessoryTitle
    ? accessoryTitle.replace(/\s+/g, " ").trim()
    : [group || identity?.name, storageLabel].filter(Boolean).join(" ").trim();

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
    category,
    group,
    unitCode: compact.match(/\b(GH[A-Z0-9]{8})\b/)?.[1] || "",
  };
}

/**
 * What kind of arrival a scan or photo is describing.
 * A box QR with product details and no battery is new. A barcode with an IMEI or battery health is Ex-UK.
 * Trade-in is only taken on a sale; a photo can still be marked that way so staff are sent to Sales.
 */
export function inferArrivalCondition(raw: string): "NEW" | "EX_UK" | "TRADE_IN" | null {
  const text = String(raw || "");
  const marked = text.match(/\bArrival\s+(new|ex-uk|trade-in)\b/i)?.[1]?.toLowerCase();
  if (marked === "new") return "NEW";
  if (marked === "ex-uk") return "EX_UK";
  if (marked === "trade-in") return "TRADE_IN";
  const device = parseDeviceScan(text);
  const upper = text.toUpperCase();
  if (/\bTRADE[-\s]?IN\b/.test(upper)) return "TRADE_IN";
  if (/\bEX[-\s]?UK\b|\bREFURB/.test(upper) || device.mpn.startsWith("F")) return "EX_UK";
  if (device.batteryHealth && (device.imei || device.serial)) return "EX_UK";
  if (device.imei && !device.name && !device.modelNumber && !device.mpn) return "EX_UK";
  if (device.mpn.startsWith("M") && !device.batteryHealth && !device.imei) return "NEW";
  if ((device.modelNumber || device.mpn) && !device.imei && !device.batteryHealth) return "NEW";
  return null;
}

export function scanLookupCode(raw: string) {
  const device = parseDeviceScan(raw);
  if (device.unitCode) return { code: device.unitCode, kind: "unit" as const, device };
  if (device.imei) return { code: device.imei, kind: "imei" as const, device };
  if (device.modelNumber && isAppleModelNumber(device.modelNumber)) return { code: device.modelNumber, kind: "model" as const, device };
  if (device.mpn && isAppleMpn(device.mpn)) return { code: device.mpn, kind: "mpn" as const, device };
  if (device.serial) return { code: device.serial, kind: "serial" as const, device };
  return { code: "", kind: "unknown" as const, device };
}

export function deviceHasIdentity(device: ScannedDevice) {
  return Boolean(device.imei || device.serial || device.modelNumber || device.mpn || device.name || device.unitCode);
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
