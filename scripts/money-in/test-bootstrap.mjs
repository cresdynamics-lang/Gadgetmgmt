// Test-process-only email transport for the Money In review. Never loaded by the application normally.
import { appendFileSync } from 'node:fs';
if (!/money_in/.test(process.env.DATABASE_URL ?? '') || process.env.RESEND_API_KEY !== 'money-in-fake-key' || !process.env.MONEY_IN_MAIL_FILE) throw new Error('Money In bootstrap requires an isolated money_in database and the fake email key.');
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === 'https://api.resend.com/emails') {
    appendFileSync(process.env.MONEY_IN_MAIL_FILE, JSON.stringify(JSON.parse(init.body)) + '\n', { mode: 0o600 });
    return Response.json({ id: 'money-in-review' });
  }
  return realFetch(input, init);
};
