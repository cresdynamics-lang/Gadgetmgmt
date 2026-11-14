// Test-process-only email transport. Never loaded by the application normally.
import { writeFileSync } from 'node:fs';
if (!process.env.DATABASE_URL?.endsWith('/gadgethub_auth_review') || process.env.RESEND_API_KEY !== 'auth-review-fake-key' || !process.env.AUTH_REVIEW_MAIL_FILE) throw new Error('Auth review bootstrap requires the isolated test database and fake email key.');
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === 'https://api.resend.com/emails') {
    const body = JSON.parse(init.body);
    if(body.to?.some(email=>email.startsWith('fail-delivery-')))return Response.json({error:'Isolated delivery failure'},{status:503});
    writeFileSync(process.env.AUTH_REVIEW_MAIL_FILE, JSON.stringify(body), { mode: 0o600 });
    return Response.json({ id: 'isolated-auth-review' });
  }
  if(String(input)==='https://api.openai.com/v1/responses' && process.env.OPENAI_API_KEY==='auth-review-fake-key') {
    const body=JSON.parse(init.body);const metrics=JSON.parse(body.input);
    writeFileSync(process.env.AUTH_REVIEW_AI_FILE,JSON.stringify(body),{mode:0o600});
    const destination=metrics.sales?'/sales':metrics.inventory?'/inventory':'/credit';
    return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({headline:'Fixture briefing',summary:'Recorded test data only.',insights:[{title:'Review recorded data',happened:'A permitted dataset is available.',compared:'No approved benchmark was supplied.',matters:'Use verified operational facts.',action:'Review the authorized workspace.',tone:'watch',destination}]})}]}]});
  }
  return realFetch(input, init);
};
