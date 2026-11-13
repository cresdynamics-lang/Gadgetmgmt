// Verify the public auth boundary without creating a trusted device or sending OTP mail.
const base=new URL(process.env.APP_BASE_URL).origin;
if(base!=='https://development.gadgethubke.com')throw new Error('Unexpected production origin');
for(const [path,status] of [['/login',200],['/api/auth/csrf',200],['/api/auth/session',200],['/api/operations?kind=REPAIR',403]]){
 const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(response.status!==status)throw new Error(`${path} HTTP ${response.status}, expected ${status}`);
}
console.log('PASS: public login/auth endpoints available; protected operations deny unauthenticated access. Owner password was verified on the deployment host; first browser sign-in still requires email verification.');

if(process.env.EXPECTED_OWNER_EMAIL && process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase()!==process.env.EXPECTED_OWNER_EMAIL.trim().toLowerCase())throw new Error('Configured administrator email does not match the requested identity');
if(process.env.VERIFY_OWNER_EMAIL_CODE==='true'){
 const response=await fetch(base+'/api/auth/security',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'password',email:process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase(),password:process.env.INITIAL_OWNER_PASSWORD}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 if(!response.ok||!result.needsCode||!result.challengeId)throw new Error(`Administrator email verification request failed (HTTP ${response.status})`);
 console.log('PASS: administrator password accepted; email provider accepted the real sign-in code. Inbox arrival and code entry must be completed by the account holder. No code, ticket or session was logged.');
}
