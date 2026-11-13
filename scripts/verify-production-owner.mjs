// Verify the real credentials flow without logging secrets, tokens or cookies.
const env=process.env;
const base=new URL(env.APP_BASE_URL).origin;
if (base !== 'https://development.gadgethubke.com') throw new Error('Unexpected production origin');
if (!env.INITIAL_OWNER_EMAIL || !env.INITIAL_OWNER_PASSWORD) throw new Error('Owner credentials are required');
const cookies=new Map();
async function request(path,options={}) {
 const response=await fetch(base+path,{...options,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{...options.headers,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}});
 for(const cookie of response.headers.getSetCookie()) {const part=cookie.split(';')[0];const index=part.indexOf('=');cookies.set(part.slice(0,index),part.slice(index+1));}
 return response;
}
const csrfResponse=await request('/api/auth/csrf');
if(csrfResponse.status!==200)throw new Error('CSRF endpoint HTTP '+csrfResponse.status);
const {csrfToken}=await csrfResponse.json();
const response=await request('/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-auth-return-redirect':'1',origin:base},body:new URLSearchParams({csrfToken,email:env.INITIAL_OWNER_EMAIL,password:env.INITIAL_OWNER_PASSWORD,callbackUrl:base+'/dashboard'})});
let redirect=response.headers.get('location');
if(response.headers.get('content-type')?.includes('application/json'))redirect=(await response.json()).url;
if(!redirect || new URL(redirect,base).origin!==base || /error=/.test(redirect))throw new Error('Owner sign-in did not return a successful same-site redirect');
const session=await (await request('/api/auth/session')).json();
if(session.user?.role!=='OWNER' || session.user?.email.toLowerCase()!==env.INITIAL_OWNER_EMAIL.toLowerCase())throw new Error('Owner session was not authenticated');
const dashboard=await request('/dashboard');
if(dashboard.status!==200)throw new Error('Authenticated dashboard HTTP '+dashboard.status);
console.log('PASS: owner credentials accepted, OWNER session established, dashboard HTTP 200, redirects stay on public HTTPS origin.');
