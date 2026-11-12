const REQUIRED_SETTINGS = [
  "STANBIC_CLIENT_ID",
  "STANBIC_CLIENT_SECRET",
  "STANBIC_MERCHANT_CODE",
  "STANBIC_CALLBACK_URL",
  "STANBIC_CALLBACK_SECRET",
] as const;

export type StanbicSalesStatus = {
  provider: "stanbic";
  connected: false;
  missing: string[];
  detail: string;
};

/**
 * Stanbic is the chosen checkout for sales. The published sandbox page does not
 * include a callback contract this server can verify, so checkout stays off.
 * A sale must not be marked paid from an unverified provider response.
 */
export function stanbicSalesStatus(env: Record<string, string | undefined> = process.env): StanbicSalesStatus {
  const missing = REQUIRED_SETTINGS.filter((name) => !env[name]?.trim());
  return {
    provider: "stanbic",
    connected: false,
    missing: [...missing],
    detail: missing.length
      ? "Stanbic is the checkout for sales. It is not connected yet, so record a payment the shop has already taken. Nothing is marked paid from Stanbic until the bank's callback can be verified."
      : "Stanbic credentials are present, but checkout stays off until the callback contract is confirmed and checked on the server. Record a payment the shop has already taken.",
  };
}
