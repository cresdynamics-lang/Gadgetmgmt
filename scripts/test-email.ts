// Sends one email per category through the app's mail code.
// Defaults to Resend's test inbox, which accepts mail without delivering it to a person.
import { emailConfigured, mailFrom, sendEmail, type MailCategory } from "../src/lib/mail";

const to = process.argv[2] || "delivered@resend.dev";
const categories: MailCategory[] = ["notifications", "orders", "accounts"];

async function main() {
  let failed = 0;
  for (const category of categories) {
    if (!emailConfigured(category)) { console.log(`${category}: not configured`); failed += 1; continue; }
    try {
      await sendEmail({ to, category, subject: `GadgetHub ${category} email check`, text: `This is a ${category} email check from Gadget Hub.` });
      console.log(`${category}: sent from ${mailFrom(category)}`);
    } catch (error) {
      failed += 1;
      console.log(`${category}: failed · ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  if (failed) process.exit(1);
}

void main();
