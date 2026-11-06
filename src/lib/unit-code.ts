const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short barcode for one physical device. The same model can still share a product. */
export function newUnitCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `GH${[...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("")}`;
}

export function isUnitCode(value: string) {
  return /^GH[A-Z0-9]{8}$/.test(value);
}

type CodeLookup = { deviceUnit: { findFirst: (args: { where: { unitCode: string }; select: { id: true } }) => Promise<{ id: string } | null> } };

/** Pick a code that is not already printed on another unit. */
export async function allocateUnitCode(db: CodeLookup) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const unitCode = newUnitCode();
    const taken = await db.deviceUnit.findFirst({ where: { unitCode }, select: { id: true } });
    if (!taken) return unitCode;
  }
  throw new Error("Could not assign a device barcode.");
}

/** Keep the barcode already shown to staff when it is still free. Otherwise assign a new one. */
export async function claimUnitCode(db: CodeLookup, preferred?: string | null) {
  const wanted = (preferred || "").toUpperCase();
  if (isUnitCode(wanted)) {
    const taken = await db.deviceUnit.findFirst({ where: { unitCode: wanted }, select: { id: true } });
    if (!taken) return wanted;
  }
  return allocateUnitCode(db);
}
