import { authOrigin } from "./auth-security";
import { deliverNotification } from "./notifications";

export async function emailAccountPassword(input:{name:string;email:string;password:string;reset:boolean;eventId:string}) {
  try {
    await deliverNotification({purpose:"accounts",channel:"EMAIL",recipient:input.email,subject:input.reset?"Your GadgetHub password was reset":"Your GadgetHub account",idempotencyKey:`account-credentials-${input.eventId}`,body:`Hello ${input.name},\n\n${input.reset?"An Administrator reset your password. Existing device sign-ins have ended.":"An Administrator created your GadgetHub account."}\n\nSign in: ${authOrigin().origin}/login\nEmail: ${input.email}\nPassword: ${input.password}\n\nUse these credentials and the verification code emailed to you to verify ownership, then set a PIN for your device when permitted. Your Administrator controls which sign-in methods you can use. Keep this password private and do not forward this email. If you did not expect this account or reset, contact your Administrator.`});
    return "accepted" as const;
  } catch {
    // The account operation already committed. Never imply email delivery succeeded.
    return "unconfirmed" as const;
  }
}
