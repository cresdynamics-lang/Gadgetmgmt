import { writeFileSync } from "node:fs";

// Explicit allowlist: never forward deployment keys or GitHub tokens to the app.
const keys = [
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_TRUST_HOST",
  "INITIAL_OWNER_NAME",
  "INITIAL_OWNER_EMAIL",
  "INITIAL_OWNER_PASSWORD",
  "DATABASE_URL",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "CATALOG_OPENING_STOCK",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY",
  "MPESA_ENVIRONMENT",
  "MPESA_TRANSACTION_TYPE",
  "MPESA_CALLBACK_SECRET",
  "MPESA_C2B_CALLBACK_SECRET",
  "APP_BASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
  "MAIL_REPLY_TO",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "AT_USERNAME",
  "AT_API_KEY",
  "AT_SENDER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_PAYMENT_TEMPLATE",
  "WHATSAPP_TEMPLATE_LANGUAGE",
  "WHATSAPP_PAY_BUTTON_INDEX",
  "CRON_SECRET",
  "OPENAI_API_KEY",
  "AI_INSIGHTS_MODEL",
  "STANBIC_ENVIRONMENT",
  "STANBIC_API_BASE_URL",
  "STANBIC_OAUTH_TOKEN_URL",
  "STANBIC_CLIENT_ID",
  "STANBIC_CLIENT_SECRET",
  "STANBIC_SCOPE",
  "STANBIC_MERCHANT_CODE",
  "STANBIC_CALLBACK_URL",
  "STANBIC_CALLBACK_SECRET",
  "STANBIC_SUBSCRIPTION_KEY",
  "RESEND_API_KEY_NOTIFICATIONS",
  "RESEND_API_KEY_ORDERS",
  "RESEND_API_KEY_ACCOUNTS",
  "MAIL_FROM_NOTIFICATIONS",
  "MAIL_FROM_ORDERS",
  "MAIL_FROM_ACCOUNTS",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "AI_QUESTIONS_PER_HOUR"
];
const lines = [];
for (const key of keys) {
  const value = process.env[key] ?? "";
  if (/[\r\n\0]/.test(value)) throw new Error(`Runtime setting ${key} must be a single line`);
  lines.push(`${key}=${value}`);
}
for (const key of ["DATABASE_URL", "NEXTAUTH_SECRET", "INITIAL_OWNER_EMAIL", "INITIAL_OWNER_PASSWORD"]) {
  if (!process.env[key]) throw new Error(`Missing required runtime secret: ${key}`);
}
if (process.env.NEXTAUTH_SECRET.length < 43) throw new Error("NEXTAUTH_SECRET is too short");
for (const key of ["NEXTAUTH_URL", "APP_BASE_URL"]) {
  const url = new URL(process.env[key]);
  if (url.origin !== "https://development.gadgethubke.com") throw new Error(`${key} must use the production HTTPS origin`);
}
writeFileSync(process.argv[2], lines.join("\n") + "\n", { mode: 0o600 });
console.log(`Prepared ${keys.length} runtime settings without printing values.`);
