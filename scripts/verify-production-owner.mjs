// Verify the public auth boundary without creating a trusted device or sending OTP mail.
const base=new URL(process.env.APP_BASE_URL).origin;
if(base!=='https://development.gadgethubke.com')throw new Error('Unexpected production origin');
for(const [path,status] of [['/login',200],['/api/auth/csrf',200],['/api/auth/session',200],['/api/operations?kind=REPAIR',403]]){
 const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(response.status!==status)throw new Error(`${path} HTTP ${response.status}, expected ${status}`);
}
console.log('PASS: public login/auth endpoints available; protected operations deny unauthenticated access. Owner password was verified on the deployment host; first browser sign-in still requires email verification.');
