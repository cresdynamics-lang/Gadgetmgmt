// Test-process-only email transport. Never loaded by the application normally.
import { writeFileSync } from 'node:fs';
if (!process.env.DATABASE_URL?.endsWith('/gadgethub_auth_review') || process.env.RESEND_API_KEY !== 'auth-review-fake-key' || !process.env.AUTH_REVIEW_MAIL_FILE) throw new Error('Auth review bootstrap requires the isolated test database and fake email key.');
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === 'https://api.resend.com/emails') {
    const body = JSON.parse(init.body);
    writeFileSync(process.env.AUTH_REVIEW_MAIL_FILE, JSON.stringify(body), { mode: 0o600 });
    return Response.json({ id: 'isolated-auth-review' });
  }
  return realFetch(input, init);
};
