export const UNIT_STATUSES = ["IN_STOCK", "RESERVED", "SOLD", "IN_REPAIR", "RETURNED"] as const;
export const DEVICE_CONDITIONS = ["NEW", "OPEN_BOX", "REFURBISHED", "USED"] as const;
export const NETWORK_LOCKS = ["UNKNOWN", "LOCKED", "UNLOCKED"] as const;
export const ACTIVATION_LOCKS = ["UNKNOWN", "ON", "OFF"] as const;
export const COSMETIC_GRADES = ["A", "B", "C"] as const;

export type UnitStatus = (typeof UNIT_STATUSES)[number];
export type DeviceCondition = (typeof DEVICE_CONDITIONS)[number];
export type NetworkLock = (typeof NETWORK_LOCKS)[number];
export type ActivationLock = (typeof ACTIVATION_LOCKS)[number];
export type CosmeticGrade = (typeof COSMETIC_GRADES)[number];

export type KnownDevice = {
  id: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
};

export type DeviceClaim = {
  stockUnitId?: string;
  imei?: string;
  serialNumber?: string;
};

const ACCESSORY_WORDS = /case|cover|charger|cable|accessor|protector|earphone|headphone|adapter|glass|skin|power bank|powerbank/;

export function categoryTracksUnits(category: string) {
  const value = category.trim().toLowerCase();
  if (!value || ACCESSORY_WORDS.test(value)) return false;
  return /^(smart\s?phones?|phones?|iphones?|handsets?|laptops?|notebooks?|macbooks?|tablets?|ipads?)$/.test(value)
    || /\b(smartphone|iphone|laptop|macbook|notebook|tablet|ipad|handset)\b/.test(value);
}

export function tracksUnits(category: string, unitTracking: boolean | null | undefined) {
  if (unitTracking === true) return true;
  if (unitTracking === false) return false;
  return categoryTracksUnits(category);
}

export function imeiChecksumValid(imei: string) {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let index = 0; index < imei.length; index += 1) {
    let digit = Number(imei[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function normalizeImei(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\s+/g, "");
  if (!digits) return null;
  if (!imeiChecksumValid(digits)) return null;
  return digits;
}

export function normalizeSerial(value: string | null | undefined) {
  const serial = (value ?? "").trim().toUpperCase();
  if (!serial) return null;
  if (!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(serial)) return null;
  return serial;
}

export function maskImei(imei: string) {
  const digits = imei.replace(/\D/g, "");
  if (digits.length < 8) return "••••";
  return `${digits.slice(0, 4)} •••• ${digits.slice(-3)}`;
}

export function maskSerial(serial: string) {
  const value = serial.trim();
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function activationAllowsStock(condition: DeviceCondition, activationLock: ActivationLock) {
  if (activationLock === "ON") return false;
  if (condition !== "NEW" && activationLock !== "OFF") return false;
  return true;
}

export function stockDeltas(from: UnitStatus, to: UnitStatus) {
  if (from === "SOLD" || to === "SOLD") return null;
  if (from === to) return { stockOnHand: 0, reservedStock: 0 };
  const sellable = (status: UnitStatus) => status === "IN_STOCK" || status === "RESERVED";
  return {
    stockOnHand: (sellable(to) ? 1 : 0) - (sellable(from) ? 1 : 0),
    reservedStock: (to === "RESERVED" ? 1 : 0) - (from === "RESERVED" ? 1 : 0),
  };
}

export function unidentifiedSellable(stockOnHand: number, reservedStock: number, inStockUnits: number) {
  return stockOnHand - reservedStock - inStockUnits;
}

export function claimFromIdentifier(value: string, known: readonly KnownDevice[]): DeviceClaim | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s-]/g, "");
  const match = known.find((unit) =>
    (unit.imei && unit.imei === compact)
    || (unit.imei2 && unit.imei2 === compact)
    || (unit.serialNumber && unit.serialNumber.toUpperCase() === trimmed.toUpperCase()));
  if (match) return { stockUnitId: match.id };
  if (/^\d{15}$/.test(compact)) return imeiChecksumValid(compact) ? { imei: compact } : null;
  const serial = normalizeSerial(trimmed);
  return serial ? { serialNumber: serial } : null;
}

export function presentDevice<T extends { imei: string | null; imei2: string | null; serialNumber: string | null }>(unit: T) {
  return {
    ...unit,
    imeiMasked: unit.imei ? maskImei(unit.imei) : null,
    imei2Masked: unit.imei2 ? maskImei(unit.imei2) : null,
    serialMasked: unit.serialNumber ? maskSerial(unit.serialNumber) : null,
  };
}
