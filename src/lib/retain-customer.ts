/**
 * Keep website trade-in, Lipa, and checkout contacts in the Customer table.
 * A lead is stored when at least two of name, email, and phone are present.
 * Matching prefers phone, then email. Existing values are not wiped by blanks.
 */

export type CustomerContact = {
  name?: string;
  email?: string;
  phone?: string;
};

export type StoredCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
};

export function filledContact(input: CustomerContact) {
  const name = (input.name || "").trim();
  const email = (input.email || "").trim().toLowerCase();
  const phone = (input.phone || "").trim();
  return {
    name: name.length >= 2 ? name : "",
    email: email.includes("@") && email.length <= 254 ? email : "",
    phone: phone.replace(/\D/g, "").length >= 9 ? phone : "",
  };
}

export function hasTwoContacts(input: CustomerContact) {
  const filled = filledContact(input);
  return [filled.name, filled.email, filled.phone].filter(Boolean).length >= 2;
}

export function phoneKeys(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return [];
  let national = digits;
  if (digits.startsWith("254") && digits.length >= 12) national = digits.slice(3);
  else if (digits.startsWith("0") && digits.length >= 10) national = digits.slice(1);
  if (!/^[17]\d{8}$/.test(national)) return [...new Set([digits, phone.trim()])];
  return [...new Set([national, `0${national}`, `254${national}`, `+254${national}`])];
}

export function phonesEqual(left: string, right: string) {
  const a = phoneKeys(left);
  const b = new Set(phoneKeys(right));
  return a.some((key) => b.has(key));
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function fallbackCustomerName(input: CustomerContact) {
  const filled = filledContact(input);
  if (filled.name) return filled.name;
  if (filled.email) return filled.email.split("@")[0] || "Website customer";
  return "Website customer";
}

export function selectCustomerMatch(input: CustomerContact, customers: StoredCustomer[]) {
  const filled = filledContact(input);
  if (filled.phone) {
    const byPhone = customers.find((row) => phonesEqual(row.phone, filled.phone));
    if (byPhone) return byPhone;
  }
  if (filled.email) {
    const byEmail = customers.find((row) => (row.email || "").trim().toLowerCase() === filled.email);
    if (byEmail) return byEmail;
  }
  if (filled.name && (filled.phone || filled.email)) {
    const byName = customers.find((row) => normalizeName(row.name) === normalizeName(filled.name));
    if (byName && filled.phone && phonesEqual(byName.phone, filled.phone)) return byName;
    if (byName && filled.email && (byName.email || "").trim().toLowerCase() === filled.email) return byName;
  }
  return null;
}

export function mergeCustomerFields(existing: StoredCustomer, input: CustomerContact) {
  const filled = filledContact(input);
  const next = {
    name: filled.name && filled.name.length >= existing.name.trim().length ? filled.name : existing.name,
    email: filled.email || existing.email || null,
    phone: filled.phone ? phoneKeys(filled.phone)[2] || phoneKeys(filled.phone)[0] || existing.phone : existing.phone,
  };
  if (filled.phone) {
    const canonical = phoneKeys(filled.phone).find((key) => key.startsWith("254")) || filled.phone.replace(/\D/g, "");
    if (canonical) next.phone = canonical;
  }
  const changed = next.name !== existing.name || next.email !== (existing.email || null) || !phonesEqual(next.phone, existing.phone);
  return { next, changed };
}
