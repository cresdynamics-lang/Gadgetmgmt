export type EmailPurpose = "accounts" | "notifications" | "orders";
/** Select private server transport credentials; never include this result in API payloads. */
export function emailTransport(purpose:EmailPurpose="notifications",environment:Record<string,string|undefined>=process.env) {
  const suffix=purpose.toUpperCase();
  return {
    apiKey:environment[`RESEND_API_KEY_${suffix}`]?.trim()||environment.RESEND_API_KEY?.trim()||"",
    from:environment[`MAIL_FROM_${suffix}`]?.trim()||environment.EMAIL_FROM?.trim()||environment.MAIL_FROM?.trim()||"",
  };
}
