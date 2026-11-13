import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { chromium } from '@playwright/test';

const base = 'http://localhost:3012';
const database = 'postgresql://gadgethub:gadgethub@localhost:5432/gadgethub_auth_review';
const prisma = new PrismaClient({ datasourceUrl: database });
const run = Date.now().toString(36);
const email = `administrator-${run}@example.test`;
const password = 'Auth-review-password-2026!';
const mailFile = `/tmp/gadgethub-auth-mail-${run}.json`;
const productionReview=process.env.AUTH_REVIEW_PRODUCTION==='1';
const artifactDir = resolve(productionReview?'artifacts/production-review':process.env.PWA_REVIEW==='1'?'artifacts/pwa-review':'artifacts/auth-review');
mkdirSync(artifactDir, { recursive: true });
const logFile = `/tmp/gadgethub-auth-server-${run}.log`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', productionReview?'start':'dev', '--port', '3012'], { env: { ...process.env, DATABASE_URL: database, NEXT_DIST_DIR: productionReview?'.next':process.env.PWA_REVIEW==='1'?'.next-pwa-review':'.next-auth-test-clean', APP_BASE_URL: base, NEXTAUTH_URL: base, AUTH_URL: base, AUTH_OWNER_EMAIL: email, NEXTAUTH_SECRET: 'isolated-review-secret-64-characters-long-for-authentication-only-2026', RESEND_API_KEY: 'auth-review-fake-key', EMAIL_FROM: 'GadgetHub <auth@example.test>', AUTH_REVIEW_MAIL_FILE: mailFile, AUTH_REVIEW_AI_FILE: process.env.AUTH_REVIEW_AI_FILE||`/tmp/gadgethub-ai-${run}.json`, OPENAI_API_KEY:'auth-review-fake-key', NODE_OPTIONS: `--import=${resolve('scripts/auth/test-bootstrap.mjs')}` }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs += chunk; writeFileSync(logFile, logs); });
let browser;
const findings = [];
function pass(name) { findings.push(name); console.log(`PASS ${name}`); }
try {
  const branch = await prisma.branch.create({ data: { name: 'NUH auth review', code: `AUTH-${run}`, address: 'Isolated test', phone: '' } });
  const owner = await prisma.user.create({ data: { name: 'Administrator Review', email, passwordHash: await hash(password, 12), role: 'OWNER', branchId: branch.id } });
  const staff = await prisma.user.create({ data: { name: 'Cashier Review', email: `cashier-${run}@example.test`, passwordHash: await hash(password, 12), role: 'CASHIER', branchId: branch.id } });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Preview exited: ${logs}`);
    try { const r=await fetch(base+'/login', {signal:AbortSignal.timeout(2000)}); if(r.ok)break; } catch {}
    await delay(1000);
  }
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const runtimeErrors=[];page.on('pageerror', error => {runtimeErrors.push(error.message);console.log('BROWSER ERROR',error.message);});
  page.on('console', message => { if(message.type()==='error') console.log('BROWSER CONSOLE',message.text().slice(0,200)); });
  async function openWorkspace(name,path) {
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.getByRole('dialog',{name:'Navigation',exact:true}).getByRole('link',{name,exact:true}).click();
    await page.waitForURL(`**${path}`,{timeout:120000});
    await page.waitForLoadState('networkidle');
    assert.deepEqual(runtimeErrors,[],`Runtime error on ${path}`);
    assert.equal(await page.getByText('Application error:',{exact:false}).count(),0);
  }
  const post = (action, extra = {}) => context.request.post(base+'/api/auth/security', { headers: { Origin: base }, data: { action, ...extra } });
  for (const width of [375,390,430,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/login', {waitUntil:'networkidle',timeout:120000});
    await page.waitForFunction(() => document.documentElement.dataset.authReady === 'true');
    await page.screenshot({path:`${artifactDir}/login-${width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const input=await page.locator('#email').boundingBox(); assert.ok(input.height >=44);
    const action=await page.getByRole('button',{name:'Sign in with Face ID or passkey'}).boundingBox(); assert.ok(action.height>=44);
    assert.equal(await page.locator('#email').evaluate(el=>getComputedStyle(el).fontSize),'16px');
  }
  pass('Login renders without overflow and with 44px targets at five viewport widths');
  await page.emulateMedia({ colorScheme:'dark',reducedMotion:'reduce' });
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`${artifactDir}/login-dark-390.png`,fullPage:true});
  await page.emulateMedia({colorScheme:'light'});
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(() => document.documentElement.dataset.authReady === 'true');
  // Verify the browser's actual recovery UI and retained email.
  await page.locator('#email').fill(email);
  await page.getByRole('button',{name:'Use password',exact:true}).click();
  await page.locator('#password').fill('wrong-password');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('.security-error').waitFor();
  assert.equal(await page.locator('#email').inputValue(),email);
  await page.screenshot({path:`${artifactDir}/login-error-390.png`,fullPage:true});
  pass('Failed sign-in displays a recoverable error and preserves email');
  await prisma.user.update({where:{id:owner.id},data:{failedSignIns:0}});
  const blocked = await context.request.post(base+'/api/auth/security',{headers:{Origin:'https://attacker.example'},data:{action:'password',email,password}});
  assert.equal(blocked.status(),403); pass('Cross-origin authentication rejected');
  const pendingCode=page.waitForResponse(r=>r.url()===base+'/api/auth/security' && r.request().postData()?.includes('"action":"password"') && JSON.parse(r.request().postData()).password === password);
  await page.locator('#password').fill(password);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  let response=await pendingCode;
  const submitted=JSON.parse(response.request().postData());
  assert.equal(submitted.email,email,'Browser submits the entered email');
  assert.equal(submitted.password,password,'Browser submits the entered password');
  assert.equal(response.status(),200);
  await page.locator('#code').waitFor();
  await page.screenshot({path:`${artifactDir}/email-code-390.png`,fullPage:true});
  const challenge=await response.json(); assert.ok(challenge.needsCode);
  const mail=JSON.parse(readFileSync(mailFile,'utf8')); assert.deepEqual(mail.to,[email]);
  const code=mail.text.match(/code is (\d{6})/)[1];
  assert.equal((await post('password',{email,password})).status(),429); pass('New device requires emailed code and resend is throttled');
  await prisma.authChallenge.update({where:{id:challenge.challengeId},data:{expiresAt:new Date(Date.now()-1000)}});
  assert.equal((await post('code',{challengeId:challenge.challengeId,code})).status(),401);
  await prisma.authChallenge.update({where:{id:challenge.challengeId},data:{expiresAt:new Date(Date.now()+300000)}});
  const wrongCode=((Number(code)+1)%1000000).toString().padStart(6,'0');
  assert.equal((await post('code',{challengeId:challenge.challengeId,code:wrongCode})).status(),401);
  pass('Expired and incorrect email codes cannot authenticate');
  const pendingVerified=page.waitForResponse(r=>r.url()===base+'/api/auth/security' && r.request().postData()?.includes('"action":"code"'));
  await page.locator('#code').fill(code);
  await page.getByRole('button',{name:'Verify & sign in',exact:true}).click();
  response=await pendingVerified; assert.equal(response.status(),200);
  const {ticket}=await response.json();
  await page.waitForURL('**/dashboard',{timeout:120000});
  pass('Password and emailed code complete the actual browser sign-in flow');
  assert.equal((await post('code',{challengeId:challenge.challengeId,code})).status(),401); pass('Verification code cannot be replayed');
  async function redeem(ticket) {
    const csrf=await (await context.request.get(base+'/api/auth/csrf')).json();
    return context.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,ticket,callbackUrl:base+'/account'},maxRedirects:0});
  }
  let session=await (await context.request.get(base+'/api/auth/session')).json(); assert.equal(session.user.id,owner.id);
  await redeem(ticket);
  // The original session remains valid; no second successful sign-in was recorded.
  assert.equal(await prisma.authEvent.count({where:{userId:owner.id,action:'Signed in'}}),1); pass('Login ticket is single-use and successful sign-in audited');
  await openWorkspace('Account security','/account');
  await page.getByRole('heading',{name:'Account security',exact:true,level:2}).waitFor();
  await page.getByText('This device',{exact:true}).waitFor();
  for (const width of [375,390,430,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:`${artifactDir}/account-${width}.png`,fullPage:true});
    assert.equal(await page.locator('.workspace-content:visible').evaluate(el => el.scrollWidth > el.clientWidth),false);
  }
  await page.setViewportSize({width:390,height:844});
  const currentRow=page.locator('.security-device-list:visible li').filter({hasText:'This device'});
  await currentRow.getByRole('button',{name:/Revoke/}).click();
  await page.screenshot({path:`${artifactDir}/revoke-confirm-390.png`,fullPage:true});
  await currentRow.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'More',exact:true}).click();
  const navigation=page.getByRole('dialog',{name:'Navigation',exact:true});
  await navigation.waitFor();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await navigation.evaluate(el=>el.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');
  assert.equal(await navigation.count(),0);
  pass('Mobile navigation traps keyboard focus and closes with Escape');
  const cdp=await context.newCDPSession(page); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  await page.getByLabel('Confirm your password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Set up Face ID or a passkey',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Passkey ready'}).waitFor();
  assert.equal(await prisma.authPasskey.count({where:{device:{userId:owner.id}}}),1); pass('Real WebAuthn registration with required user verification succeeds');
  await page.goto(base+'/login',{waitUntil:'networkidle'});
  await page.locator('#email').fill(email);
  await page.getByRole('button',{name:'Sign in with Face ID or passkey',exact:true}).click();
  await page.waitForURL('**/dashboard',{timeout:120000}); pass('Real WebAuthn authentication opens an authorized workspace');
  const staffContext=await browser.newContext();
  const staffPost=(action,extra={})=>staffContext.request.post(base+'/api/auth/security',{headers:{Origin:base},data:{action,...extra}});
  let staffResponse=await staffPost('password',{email:staff.email,password});
  const staffChallenge=await staffResponse.json();
  const staffMail=JSON.parse(readFileSync(mailFile,'utf8'));
  const staffCode=staffMail.text.match(/code is (\d{6})/)[1];
  staffResponse=await staffPost('code',{challengeId:staffChallenge.challengeId,code:staffCode});
  const staffTicket=(await staffResponse.json()).ticket;
  const staffCsrf=await(await staffContext.request.get(base+'/api/auth/csrf')).json();
  await staffContext.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:staffCsrf.csrfToken,ticket:staffTicket,callbackUrl:base+'/account'},maxRedirects:0});
  assert.equal((await staffContext.request.get(base+'/api/pos')).status(),403);
  assert.equal((await staffContext.request.get(base+'/api/inventory')).status(),403);
  assert.equal((await staffContext.request.get(base+'/api/auth/access')).status(),403);
  pass('A signed-in staff account has no operational or owner access before explicit grants');
  // Server grant mutation requires password and applies per person.
  response=await context.request.put(base+'/api/auth/access',{headers:{Origin:base},data:{userId:staff.id,pages:['/dashboard','/sales','/finance'],capabilities:['sales'],biometricsAllowed:true,password}});assert.equal(response.status(),200);
  const updated=await prisma.user.findUnique({where:{id:staff.id}});assert.deepEqual(updated.accessPages,['/dashboard','/sales']);assert.deepEqual(updated.accessCapabilities,['sales']);pass('Individual grants persist and finance screen cannot be delegated');
  assert.equal((await staffContext.request.get(base+'/api/pos')).status(),200);
  assert.equal((await staffContext.request.get(base+'/api/inventory')).status(),403);
  response=await context.request.put(base+'/api/auth/access',{headers:{Origin:base},data:{userId:staff.id,pages:['/dashboard','/inventory'],capabilities:['inventory'],biometricsAllowed:true,password}});
  assert.equal(response.status(),200);
  assert.equal((await staffContext.request.get(base+'/api/pos')).status(),403);
  const product=await prisma.product.create({data:{sku:`AUTH-PRODUCT-${run}`,name:'Review accessory',category:'Accessory',costPrice:765432,sellingPrice:987654,branchId:branch.id}});
  await prisma.inventoryItem.create({data:{branchId:branch.id,productId:product.id,stockOnHand:1}});
  const staffInventory=await(await staffContext.request.get(base+'/api/inventory')).json();
  assert.equal(staffInventory.items[0].product.sellingPrice,987654);
  assert.equal(Object.hasOwn(staffInventory.items[0].product,'costPrice'),false);
  const ownerInventory=await(await context.request.get(base+'/api/inventory')).json();
  assert.equal(ownerInventory.items[0].product.costPrice,765432);
  pass('Permission changes apply to existing sessions and staff inventory JSON excludes buying costs');
  await openWorkspace('Team access','/access');
  await page.getByRole('combobox').selectOption(staff.id);
  await page.getByRole('checkbox',{name:'Sales (POS)',exact:true}).check();
  await page.getByRole('checkbox',{name:'Sales View and record sales',exact:true}).check();
  await page.getByLabel('Confirm your password to save',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Save access for Cashier Review',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Access saved'}).waitFor();
  assert.equal((await staffContext.request.get(base+'/api/pos')).status(),200);
  pass('Individual permission editor saves grants through its actual browser controls');
  for (const width of [375,390,430,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:`${artifactDir}/access-${width}.png`,fullPage:true});
    assert.equal(await page.locator('.workspace-content:visible').evaluate(el => el.scrollWidth > el.clientWidth),false);
  }
  await page.setViewportSize({width:390,height:844});
  if(process.env.PWA_REVIEW==='1') {
    process.env.AUTH_REVIEW_AI_FILE=`/tmp/gadgethub-ai-${run}.json`;
    const {runPwaReview}=await import('../pwa/review.mjs');
    await runPwaReview({context,page,prisma,base,owner,staff,staffContext,password,branch,artifactDir,openWorkspace});
  }
  // Lock the device and confirm that server access ends.
  assert.equal((await context.request.post(base+'/api/auth/lock',{headers:{Origin:base},data:{}})).status(),204);
  assert.equal((await context.request.get(base+'/api/auth/devices')).status(),401);pass('Server-backed workspace lock blocks subsequent authenticated requests');
  response=await post('password',{email,password});assert.equal(response.status(),200);await redeem((await response.json()).ticket);
  session=await (await context.request.get(base+'/api/auth/session')).json();assert.equal(session.user.id,owner.id);
  await openWorkspace('Account security','/account');
  const revokeRow=page.locator('.security-device-list:visible li').filter({hasText:'This device'});
  await revokeRow.getByRole('button',{name:/Revoke/}).click();
  await revokeRow.getByLabel('Confirm your password',{exact:true}).fill(password);
  await revokeRow.getByRole('button',{name:'Revoke access',exact:true}).click();
  await page.waitForURL('**/login',{timeout:120000});
  assert.equal((await context.request.get(base+'/api/auth/devices')).status(),401);pass('Revoke ends access on the next API request');
  // Lockouts include email-code failures and generate owner notification.
  for(let i=0;i<3;i++)assert.equal((await post('password',{email:staff.email,password:'wrong-password'})).status(),401);
  assert.ok((await prisma.user.findUnique({where:{id:staff.id}})).lockedAt);
  assert.equal((await post('password',{email:staff.email,password})).status(),401);
  assert.equal(await prisma.staffAlert.count({where:{userId:owner.id,title:'Account locked after failed sign-ins'}}),1);pass('Three failures lock the account and alert the owner');
  assert.equal((await staffContext.request.get(base+'/api/auth/devices')).status(),401);
  await staffContext.close();
  writeFileSync(`${artifactDir}/results.json`,JSON.stringify({date:new Date().toISOString(),findings,limitations:['Virtual authenticator validates WebAuthn protocol, not physical Face ID hardware.','Email uses a test-process transport; live provider delivery not exercised.']},null,2)+'\n');
  console.log(`Artifacts: ${artifactDir}`);
} catch(error) {
  writeFileSync(`${artifactDir}/failure.txt`,String(error));
  for(const context of browser?.contexts() ?? []) for(const page of context.pages()) { try { await page.screenshot({path:`${artifactDir}/failure.png`,fullPage:true}); writeFileSync(`${artifactDir}/failure.html`,await page.content()); } catch {} }
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await prisma.$disconnect();
  console.log(`Server log: ${logFile}`);
}
