import { createHmac } from "node:crypto";

type DarajaConfig = { consumerKey: string; consumerSecret: string; shortcode: string; passkey: string; callbackSecret: string; baseUrl: string; transactionType: string; environment: "sandbox" | "production" };

export function getDarajaConfig(): DarajaConfig | null {
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_SECRET } = process.env;
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL;
  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || !MPESA_SHORTCODE || !MPESA_PASSKEY || !MPESA_CALLBACK_SECRET || MPESA_CALLBACK_SECRET.length < 32 || !baseUrl) return null;
  const configuredEnvironment = process.env.MPESA_ENVIRONMENT || "sandbox";
  if (configuredEnvironment !== "sandbox" && configuredEnvironment !== "production") return null;
  const environment = configuredEnvironment;
  const transactionType = process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline";
  let parsedBaseUrl: URL;
  try { parsedBaseUrl = new URL(baseUrl); } catch { return null; }
  if (environment === "production" && parsedBaseUrl.protocol !== "https:") return null;
  if (transactionType !== "CustomerPayBillOnline" && transactionType !== "CustomerBuyGoodsOnline") return null;
  return {
    consumerKey: MPESA_CONSUMER_KEY,
    consumerSecret: MPESA_CONSUMER_SECRET,
    shortcode: MPESA_SHORTCODE,
    passkey: MPESA_PASSKEY,
    callbackSecret: MPESA_CALLBACK_SECRET,
    baseUrl: baseUrl.replace(/\/$/, ""),
    transactionType,
    environment,
  };
}

function darajaHost(environment: DarajaConfig["environment"]) {
  return environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

function nairobiTimestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

export async function requestMpesaStk(input: { phone: string; amount: number; accountReference: string; description: string }) {
  const config = getDarajaConfig();
  if (!config) throw new Error("MPESA_NOT_CONFIGURED");
  const host = darajaHost(config.environment);
  const authorization = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const tokenResponse = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${authorization}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error("MPESA_AUTH_FAILED");
  const tokenBody = await tokenResponse.json() as { access_token?: string };
  if (!tokenBody.access_token) throw new Error("MPESA_AUTH_FAILED");

  const timestamp = nairobiTimestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString("base64");
  // Daraja rejects callback URLs containing "mpesa", "safaricom", "query" and similar words.
  const callback = new URL("/api/webhooks/payments/stk", config.baseUrl);
  callback.searchParams.set("request", input.accountReference);
  callback.searchParams.set("signature", createHmac("sha256", config.callbackSecret).update(input.accountReference).digest("hex"));
  const response = await fetch(`${host}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenBody.access_token}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: config.transactionType,
      Amount: input.amount,
      PartyA: input.phone,
      PartyB: config.shortcode,
      PhoneNumber: input.phone,
      CallBackURL: callback.toString(),
      AccountReference: input.accountReference.slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    }),
  });
  const body = await response.json().catch(() => null) as { ResponseCode?: string; ResponseDescription?: string; errorMessage?: string; CheckoutRequestID?: string; MerchantRequestID?: string } | null;
  if (!response.ok || body?.ResponseCode !== "0" || !body.CheckoutRequestID) throw new Error("MPESA_STK_REJECTED");
  return { checkoutRequestId: body.CheckoutRequestID, merchantRequestId: body.MerchantRequestID ?? null };
}

export function normalizeKenyanPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return null;
}
