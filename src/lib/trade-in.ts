export const tradeInBrands = ["APPLE", "SAMSUNG"] as const;
export type TradeInBrand = (typeof tradeInBrands)[number];

/** Any device the shop takes in part-exchange, grouped by type. Each type maps to a stock category. */
export const tradeInDevices: Record<TradeInBrand, Record<string, { category: string; models: string[] }>> = {
  APPLE: {
    iPhone: {
      category: "iPhone",
      models: [
        "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
        "iPhone 12", "iPhone 12 mini", "iPhone 12 Pro", "iPhone 12 Pro Max",
        "iPhone 13", "iPhone 13 mini", "iPhone 13 Pro", "iPhone 13 Pro Max",
        "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
        "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max",
        "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max",
        "iPhone SE (3rd gen)",
      ],
    },
    iPad: {
      category: "iPad",
      models: ["iPad (9th gen)", "iPad (10th gen)", "iPad mini (6th gen)", "iPad Air (M1)", "iPad Air (M2)", "iPad Pro 11-inch", "iPad Pro 12.9-inch", "iPad Pro (M4)"],
    },
    MacBook: {
      category: "Mac",
      models: ["MacBook Air M1", "MacBook Air M2", "MacBook Air M3", "MacBook Pro 13-inch M1", "MacBook Pro 13-inch M2", "MacBook Pro 14-inch", "MacBook Pro 16-inch", "iMac", "Mac mini"],
    },
    "Apple Watch": {
      category: "Apple Watch",
      models: ["Apple Watch SE", "Apple Watch Series 7", "Apple Watch Series 8", "Apple Watch Series 9", "Apple Watch Series 10", "Apple Watch Ultra", "Apple Watch Ultra 2"],
    },
    AirPods: {
      category: "AirPods",
      models: ["AirPods (3rd gen)", "AirPods (4th gen)", "AirPods Pro", "AirPods Pro 2", "AirPods Max"],
    },
  },
  SAMSUNG: {
    Phone: {
      category: "Other brands",
      models: ["Galaxy A35", "Galaxy A55", "Galaxy S22", "Galaxy S23", "Galaxy S24", "Galaxy S24 Ultra", "Galaxy S25", "Galaxy S25 Ultra", "Galaxy Z Flip", "Galaxy Z Fold"],
    },
    Tablet: {
      category: "Other brands",
      models: ["Galaxy Tab A9", "Galaxy Tab S9", "Galaxy Tab S10"],
    },
  },
};

export function tradeInBrandLabel(brand: string) {
  return brand === "APPLE" ? "Apple" : brand === "SAMSUNG" ? "Samsung" : brand;
}

/** Stock category for a traded-in device, matching the shop's product types. */
export function tradeInCategory(brand: string, deviceType: string) {
  return tradeInDevices[brand as TradeInBrand]?.[deviceType]?.category ?? (brand === "APPLE" ? "Apple accessories" : "Other brands");
}

export const tradeInGrades = {
  EXCELLENT: { label: "Excellent", detail: "Looks like new. No scratches or dents." },
  GOOD: { label: "Good", detail: "Light scratches only. Everything works." },
  FAIR: { label: "Fair", detail: "Visible wear, scuffs or small dents. Everything works." },
  FAULTY: { label: "Faulty", detail: "Cracked, not working, water damaged or repaired with non-original parts." },
} as const;
export type TradeInGrade = keyof typeof tradeInGrades;

/** Wording the cashier signs off on before a trade-in is accepted. Stored with each trade-in. */
export function tradeInDeclaration(staffName: string) {
  return `I, ${staffName}, confirm that I personally inspected this device and the seller’s documents, and that every check ticked above is true.`;
}

export function ownershipProofFrom(receiptSeen: boolean, boxSeen: boolean): OwnershipProof | "" {
  return receiptSeen && boxSeen ? "BOTH" : receiptSeen ? "RECEIPT" : boxSeen ? "BOX" : "";
}

export const ownershipProofs = {
  RECEIPT: "Original receipt or invoice",
  BOX: "Original box with matching IMEI / serial",
  BOTH: "Receipt and original box",
} as const;
export type OwnershipProof = keyof typeof ownershipProofs;

/** Checks every trade-in must pass before it can be accepted. */
export const tradeInChecks = [
  { id: "idVerified", label: "Seller’s ID checked", detail: "National ID or passport matches the seller’s name and the receipt where there is one." },
  { id: "notStolen", label: "Not lost, stolen or on a loan", detail: "Seller confirms the device is theirs, not reported stolen, and not still being paid off with another shop or lender." },
  { id: "lockRemoved", label: "Account lock removed", detail: "Find My / iCloud Activation Lock turned off (Apple), or Google/Samsung account and FRP removed. Check it in front of the seller." },
  { id: "dataErased", label: "Erased to factory settings", detail: "Device reset in front of staff. Passcode, Apple ID and SIM removed." },
  { id: "powersOn", label: "Powers on and charges", detail: "Turns on, charges with a cable and holds charge." },
  { id: "functionsWork", label: "Everything works", detail: "Screen and touch, buttons, cameras, speakers, mic, Wi-Fi, Face ID / Touch ID, and network signal where it has a SIM." },
  { id: "noLiquidDamage", label: "No water damage or tampering", detail: "No liquid damage, missing screws, opened casing or non-original screen. Check Settings > General > About > Parts and Service History on iPhone." },
] as const;
export type TradeInCheckId = (typeof tradeInChecks)[number]["id"];

/** Device types where battery health and storage size matter for value. */
export const tradeInBatteryDevices = ["iPhone", "iPad", "MacBook", "Apple Watch", "Phone", "Tablet"];
export const tradeInStorageDevices = ["iPhone", "iPad", "MacBook", "Phone", "Tablet"];
export const tradeInStorageSizes = ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"];
export const MIN_BATTERY_HEALTH = 80;

export type TradeInAssessmentInput = {
  deviceType: string;
  model: string;
  serial: string;
  storage?: string | null;
  grade: TradeInGrade | "";
  batteryHealth?: number | null;
  ownershipProof: OwnershipProof | "";
  checks: Partial<Record<TradeInCheckId, boolean>>;
  sellerName: string;
  sellerPhone: string;
  value: number;
  resalePrice: number;
  staffConfirmed: boolean;
};

/** Blockers stop the trade-in. Warnings are shown to the cashier but still allow it. */
export function assessTradeIn(input: TradeInAssessmentInput) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!input.deviceType) blockers.push("Choose the device type.");
  if (input.model.trim().length < 2) blockers.push("Enter the device model.");
  if (!/^[A-Za-z0-9]{8,20}$/.test(input.serial)) blockers.push("Enter the IMEI (phones) or serial number (Macs, iPads, Watches, AirPods).");
  if (tradeInStorageDevices.includes(input.deviceType) && !input.storage) blockers.push("Choose the storage size.");
  if (!input.ownershipProof) blockers.push("Proof of ownership is needed: the original receipt or the original box with a matching IMEI / serial.");
  for (const check of tradeInChecks) {
    if (!input.checks[check.id]) blockers.push(`Not yet confirmed: ${check.label}.`);
  }
  if (!input.grade) blockers.push("Choose the condition grade.");
  if (input.grade === "FAULTY") blockers.push("Faulty devices are not accepted as trade-ins.");
  if (tradeInBatteryDevices.includes(input.deviceType)) {
    const health = input.batteryHealth ?? 0;
    if (!health || health < 1 || health > 100) blockers.push("Enter the battery health percentage (Settings > Battery > Battery Health).");
    else if (health < MIN_BATTERY_HEALTH) warnings.push(`Battery health is ${health}%. It will need a battery replacement before resale, so offer a lower value.`);
  }
  if (input.sellerName.trim().length < 2) blockers.push("Enter the seller’s full name as on their ID.");
  if (input.sellerPhone.replace(/\D/g, "").length < 9) blockers.push("Enter the seller’s phone number.");
  if (!(input.value > 0)) blockers.push("Enter the trade-in value.");
  if (!(input.resalePrice > 0)) blockers.push("Enter the resale price.");
  else if (input.value >= input.resalePrice) blockers.push("The trade-in value must be lower than the resale price, or the shop loses money on it.");
  if (!input.staffConfirmed) blockers.push("Tick the staff declaration to confirm you checked the device and documents yourself.");
  if (input.ownershipProof === "BOX") warnings.push("No receipt. Make sure the IMEI / serial on the box matches the device.");
  return { blockers, warnings, eligible: blockers.length === 0 };
}
