import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = 'http://localhost:3012';
const database = 'postgresql://gadgethub:gadgethub@localhost:5432/gadgethub_auth_review';
const prisma = new PrismaClient({ datasourceUrl: database });
const run = Date.now().toString(36);
const email = `administrator-${run}@example.test`;
const password = 'Auth-review-password-2026!';
const appPin='004269';
const mailFile = `/tmp/gadgethub-auth-mail-${run}.json`;
const productionReview=process.env.AUTH_REVIEW_PRODUCTION==='1';
const artifactDir = resolve(process.env.CATALOG_REVIEW==='1'?'artifacts/catalog-review':productionReview?'artifacts/production-review':process.env.PWA_REVIEW==='1'?'artifacts/pwa-review':'artifacts/auth-review');
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
    const action=await page.getByRole('button',{name:'Use Face ID or passkey'}).boundingBox(); assert.ok(action.height>=44);
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
  await page.locator('#password').fill(password);
  assert.equal(await page.locator('#password').getAttribute('type'),'password');
  await page.getByRole('button',{name:'Show password',exact:true}).click();
  assert.equal(await page.locator('#password').getAttribute('type'),'text');
  assert.equal(await page.locator('#password').inputValue(),password);
  await page.locator('#email').focus();
  assert.equal(await page.locator('#password').getAttribute('type'),'password');
  pass('Password visibility can be toggled without changing its value and conceals on leaving the field');
  await page.locator('#email').fill(email);
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
  await page.getByRole('button',{name:'Verify & continue',exact:true}).click();
  response=await pendingVerified; assert.equal(response.status(),200);
  const {ticket}=await response.json();
  await page.locator('#pin').waitFor();await page.screenshot({path:`${artifactDir}/pin-setup-390.png`,fullPage:true});
  assert.equal(await page.locator('.pin-field').first().locator('.pin-box').count(),6);
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(()=>navigator.clipboard.writeText('004269'));
  await page.locator('#pin').focus();await page.locator('#pin').press('ControlOrMeta+V');
  assert.equal(await page.locator('#pin').inputValue(),appPin);
  assert.equal(await page.locator('.pin-field').first().locator('.is-filled').count(),6);
  assert.equal((await page.locator('.pin-field').first().locator('.pin-boxes').innerText()).includes('4'),false);
  await page.getByRole('button',{name:'Show PIN',exact:true}).first().click();
  assert.equal(await page.locator('#pin').getAttribute('type'),'text');
  assert.match(await page.locator('.pin-field').first().locator('.pin-boxes').innerText(),/4/);
  await page.locator('#pin').focus();await page.locator('#pin').press('Home');await page.locator('#pin').press('Delete');
  assert.equal(await page.locator('#pin').inputValue(),'04269');
  await page.locator('#pin').press('End');await page.locator('#pin').press('Backspace');assert.equal(await page.locator('#pin').inputValue(),'0426');
  await page.locator('#confirmPin').focus();assert.equal(await page.locator('#pin').getAttribute('type'),'password');
  pass('Six-box PIN entry supports leading-zero paste, native editing, reveal and conceal');
  const pinSetupAudit=await new AxeBuilder({page}).exclude('nextjs-portal').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(pinSetupAudit.violations,[]);

  await page.locator('#pin').fill(appPin);await page.locator('#confirmPin').fill('004268');await page.getByRole('button',{name:'Save PIN & sign in',exact:true}).click();await page.getByRole('alert').filter({hasText:'same six-digit PIN'}).waitFor();
  await page.locator('#confirmPin').fill(appPin);await page.getByRole('button',{name:'Save PIN & sign in',exact:true}).click();
  await page.waitForURL('**/dashboard',{timeout:120000});
  pass('Password and email ownership verification lead to confirmed six-digit PIN setup, preserving leading zeroes');
  const pinDevice=await prisma.authDevice.findFirstOrThrow({where:{userId:owner.id,revokedAt:null}});assert.ok(pinDevice.pinHash);assert.notEqual(pinDevice.pinHash,appPin);assert.equal(pinDevice.pinVersion,1);
  const safePinDevices=await(await context.request.get(base+'/api/auth/devices')).json();assert.equal(safePinDevices.pinConfigured,true);assert.equal(JSON.stringify(safePinDevices).includes('pinHash'),false);assert.equal(JSON.stringify(safePinDevices).includes(pinDevice.pinHash),false);
  const unverifiedPin=await post('pin-set',{challengeId:crypto.randomUUID(),pin:appPin,confirmPin:appPin});assert.equal(unverifiedPin.status(),401);
  const stranger=await browser.newContext();assert.equal((await stranger.request.post(base+'/api/auth/security',{headers:{Origin:base},data:{action:'pin',email,pin:appPin}})).status(),401);await stranger.close();
  const mailBeforePin=readFileSync(mailFile,'utf8');await context.request.post(base+'/api/auth/lock',{headers:{Origin:base}});await page.goto(base+'/login',{waitUntil:'domcontentloaded'}).catch(error=>{if(!String(error).includes('ERR_ABORTED'))throw error;});await page.waitForURL(url=>url.pathname==='/login');await page.waitForFunction(()=>document.documentElement.dataset.authReady==='true');await page.screenshot({path:`${artifactDir}/pin-unlock-390.png`,fullPage:true});
  for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});for(const width of [320,375,390,430,768,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const bounds=await page.locator('.pin-control').boundingBox();assert.ok(bounds.height>=44);if(width===390)await page.screenshot({path:`${artifactDir}/pin-unlock-${scheme}-390.png`,fullPage:true});}await page.setViewportSize({width:390,height:844});const audit=await new AxeBuilder({page}).exclude('nextjs-portal').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(audit.violations,[]);}
  await page.emulateMedia({colorScheme:'light'});pass('PIN setup and unlock have clean accessibility scans and no overflow at six widths in both themes');
  await page.locator('#pin').fill(appPin);await page.getByRole('button',{name:'Unlock with PIN',exact:true}).click();await page.waitForURL('**/dashboard',{timeout:120000});assert.equal(readFileSync(mailFile,'utf8'),mailBeforePin);pass('Verified-device PIN unlock works without email; unverified devices and unproven PIN changes are rejected');

  assert.equal((await post('code',{challengeId:challenge.challengeId,code})).status(),401); pass('Verification code cannot be replayed');
  async function redeem(ticket) {
    const csrf=await (await context.request.get(base+'/api/auth/csrf')).json();
    return context.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,ticket,callbackUrl:base+'/account'},maxRedirects:0});
  }
  let session=await (await context.request.get(base+'/api/auth/session')).json(); assert.equal(session.user.id,owner.id);
  await redeem(ticket);
  // The original session remains valid; no second successful sign-in was recorded.
  assert.equal(await prisma.authEvent.count({where:{userId:owner.id,action:'Signed in'}}),3); pass('Login ticket is single-use and successful sign-in audited');
  await openWorkspace('Settings','/settings');
  await page.getByRole('heading',{name:'Account security',exact:true,level:2}).waitFor();
  await page.getByText('This device',{exact:true}).waitFor();
  for (const width of [375,390,430,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:`${artifactDir}/account-${width}.png`,fullPage:true});
    assert.equal(await page.locator('.workspace-content:visible').evaluate(el => el.scrollWidth > el.clientWidth),false);
  }
  await page.setViewportSize({width:390,height:844});
  const currentRow=page.locator('.security-device-list:visible li').filter({has:page.getByText('This device',{exact:true})});
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
  await page.getByLabel('Confirm your password',{exact:true}).filter({visible:true}).fill(password);
  await page.getByRole('button',{name:'Set up Face ID or a passkey',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Passkey ready'}).waitFor();
  assert.equal(await prisma.authPasskey.count({where:{device:{userId:owner.id}}}),1); pass('Real WebAuthn registration with required user verification succeeds');
  await page.goto(base+'/login',{waitUntil:'networkidle'});
  await page.locator('#email').fill(email);
  await page.getByRole('button',{name:'Use Face ID or passkey',exact:true}).click();
  await page.waitForURL('**/dashboard',{timeout:120000}); pass('Real WebAuthn authentication opens an authorized workspace');
  const staffContext=await browser.newContext();
  const staffPost=(action,extra={})=>staffContext.request.post(base+'/api/auth/security',{headers:{Origin:base},data:{action,...extra}});
  let staffResponse=await staffPost('password',{email:staff.email,password});
  const staffChallenge=await staffResponse.json();
  const staffMail=JSON.parse(readFileSync(mailFile,'utf8'));
  const staffCode=staffMail.text.match(/code is (\d{6})/)[1];
  staffResponse=await staffPost('code',{challengeId:staffChallenge.challengeId,code:staffCode});
  const staffVerified=await staffResponse.json();const staffTicket=staffVerified.ticket;
  const staffCsrf=await(await staffContext.request.get(base+'/api/auth/csrf')).json();
  await staffContext.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:staffCsrf.csrfToken,ticket:staffTicket,callbackUrl:base+'/account'},maxRedirects:0});
  const staffPinSet=await staffPost('pin-set',{challengeId:staffVerified.pinSetupId,pin:appPin,confirmPin:appPin});assert.equal(staffPinSet.status(),200);const staffPinTicket=(await staffPinSet.json()).ticket;
  await staffContext.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:staffCsrf.csrfToken,ticket:staffPinTicket,callbackUrl:base+'/settings'},maxRedirects:0});
  const staleSession=await browser.newContext();await staleSession.addCookies(await staffContext.cookies());
  const stalePinTicket=(await (await staffPost('pin',{email:staff.email,pin:appPin})).json()).ticket;
  const recovery=await staffPost('password',{email:staff.email,password});assert.equal(recovery.status(),200);const recoveryChallenge=await recovery.json();assert.equal(recoveryChallenge.needsCode,true,'Known devices still require email for PIN recovery');
  const recoveryMail=JSON.parse(readFileSync(mailFile,'utf8'));const recoveryCode=recoveryMail.text.match(/code is (\d{6})/)[1];const recoveryVerified=await (await staffPost('code',{challengeId:recoveryChallenge.challengeId,code:recoveryCode})).json();
  assert.equal(await prisma.authDevice.count({where:{userId:staff.id}}),1);
  await prisma.authChallenge.update({where:{id:recoveryVerified.pinSetupId},data:{expiresAt:new Date(Date.now()-1000)}});
  assert.equal((await staffPost('pin-set',{challengeId:recoveryVerified.pinSetupId,pin:'614820',confirmPin:'614820'})).status(),401);
  await prisma.authChallenge.update({where:{id:recoveryVerified.pinSetupId},data:{expiresAt:new Date(Date.now()+300000)}});
  const reset=await staffPost('pin-set',{challengeId:recoveryVerified.pinSetupId,pin:'614820',confirmPin:'614820'});assert.equal(reset.status(),200);const resetTicket=(await reset.json()).ticket;
  assert.equal((await staleSession.request.get(base+'/api/auth/devices')).status(),401);
  const staleCsrf=await(await staleSession.request.get(base+'/api/auth/csrf')).json();await staleSession.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:staleCsrf.csrfToken,ticket:stalePinTicket},maxRedirects:0});assert.equal((await staleSession.request.get(base+'/api/auth/devices')).status(),401);await staleSession.close();
  await staffContext.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:staffCsrf.csrfToken,ticket:resetTicket},maxRedirects:0});
  assert.equal((await staffPost('pin-set',{challengeId:recoveryVerified.pinSetupId,pin:'614820',confirmPin:'614820'})).status(),401);
  assert.equal((await staffPost('pin',{email:staff.email,pin:appPin})).status(),401);
  const newPin=await staffPost('pin',{email:staff.email,pin:'614820'});assert.equal(newPin.status(),200);const newPinTicket=(await newPin.json()).ticket;await staffContext.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:staffCsrf.csrfToken,ticket:newPinTicket},maxRedirects:0});
  pass('PIN recovery requires password plus email, expires and cannot replay; reset rejects old PINs, sessions and outstanding tickets without duplicating the device');
  assert.equal((await staffContext.request.get(base+'/api/pos')).status(),403);
  assert.equal((await staffContext.request.get(base+'/api/inventory')).status(),403);
  assert.equal((await staffContext.request.get(base+'/api/auth/access')).status(),403);
  const personalSettings=await staffContext.request.get(base+'/settings');assert.equal(personalSettings.status(),200);const personalMarkup=await personalSettings.text();assert.match(personalMarkup,/Account security/);assert.doesNotMatch(personalMarkup,/Save branch profile|Branch profile/);
  assert.equal((await staffContext.request.patch(base+`/api/branches/${branch.id}`,{headers:{Origin:base},data:{name:'Blocked change'}})).status(),403);
  // Production streaming redirects use a meta tag after headers are sent.
  const legacyPage=await staffContext.newPage();
  await legacyPage.goto(base+'/account',{waitUntil:'domcontentloaded'});
  await legacyPage.waitForURL(url=>url.pathname==='/settings'&&url.hash==='#account-security');
  await legacyPage.getByRole('heading',{name:'Account security',exact:true}).waitFor();
  pass('Personal Account Security lives in Settings for ungranted staff; business controls and writes remain denied; old account links redirect');
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
  // Provision through the real staff form; secondary Owners are approved explicitly.
  const peerEmail=`peer-${run}@example.test`;
  const ownerPayload={name:'Additional Owner Review',email:peerEmail,password,role:'OWNER',branchId:branch.id};
  assert.equal((await context.request.post(base+'/api/staff',{headers:{Origin:base},data:ownerPayload})).status(),401);
  await openWorkspace('Staff & Users','/staff');
  await page.getByRole('button',{name:'Add a teammate',exact:true}).click();
  const staffForm=page.locator('form').filter({has:page.locator('input[name="name"]')});
  await staffForm.locator('[name="name"]').fill(ownerPayload.name);await staffForm.locator('[name="email"]').fill(peerEmail);await staffForm.locator('[name="password"]').fill(password);await staffForm.locator('[name="role"]').selectOption('OWNER');
  await staffForm.getByLabel('Confirm your current password',{exact:true}).fill(password);
  await staffForm.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByRole('status').filter({hasText:`Account created for ${ownerPayload.name}.`}).waitFor();
  const peer=await prisma.user.findUniqueOrThrow({where:{email:peerEmail}});assert.ok(peer.ownerApprovedAt);
  assert.equal(await prisma.authEvent.count({where:{userId:owner.id,action:`Created Owner account for ${peerEmail}`}}),1);
  assert.equal(await page.getByRole('combobox',{name:`Status for ${peer.name}`,exact:true}).count(),0);assert.equal(await page.getByRole('combobox',{name:`Role for ${peer.name}`,exact:true}).count(),0);
  const peerContext=await browser.newContext();const peerPost=(action,data={})=>peerContext.request.post(base+'/api/auth/security',{headers:{Origin:base},data:{action,...data}});
  const peerChallenge=await(await peerPost('password',{email:peerEmail,password})).json();
  const peerCode=JSON.parse(readFileSync(mailFile,'utf8')).text.match(/code is (\d{6})/)[1];
  const peerProof=await(await peerPost('code',{challengeId:peerChallenge.challengeId,code:peerCode})).json();
  const peerCsrf=await(await peerContext.request.get(base+'/api/auth/csrf')).json();
  const peerRedeem=ticket=>peerContext.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:peerCsrf.csrfToken,ticket},maxRedirects:0});await peerRedeem(peerProof.ticket);
  const peerPin=await(await peerPost('pin-set',{challengeId:peerProof.pinSetupId,pin:appPin,confirmPin:appPin})).json();await peerRedeem(peerPin.ticket);
  const peerSession=await(await peerContext.request.get(base+'/api/auth/session')).json();assert.equal(peerSession.user.role,'OWNER');assert.deepEqual(peerSession.user.pages,['*']);assert.equal((await peerContext.request.get(base+'/api/expenses')).status(),200);
  const peerDevice=await prisma.authDevice.findFirstOrThrow({where:{userId:peer.id,revokedAt:null}});
  for(const [actorContext,target] of [[context,peer],[peerContext,owner]]) {
    const targetId=target.id;const actualDevice=targetId===peer.id?peerDevice:pinDevice;
    for(const changes of [{status:'SUSPENDED'},{role:'CASHIER'}])assert.equal((await actorContext.request.patch(base+`/api/staff/${targetId}`,{headers:{Origin:base},data:changes})).status(),403);
    assert.equal((await actorContext.request.delete(base+`/api/staff/${targetId}`,{headers:{Origin:base}})).status(),405);
    assert.equal((await actorContext.request.put(base+'/api/auth/access',{headers:{Origin:base},data:{userId:targetId,pages:[],capabilities:[],biometricsAllowed:false,expiresAt:new Date(Date.now()+60000).toISOString(),password}})).status(),403);
    assert.equal((await actorContext.request.delete(base+'/api/auth/devices',{headers:{Origin:base},data:{id:actualDevice.id,password}})).status(),404);
    const deviceList=await(await actorContext.request.get(base+'/api/auth/devices')).json();assert.equal(deviceList.devices.some(device=>device.id===actualDevice.id),false);
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:targetId}})).status,'ACTIVE');assert.equal((await prisma.authDevice.findUniqueOrThrow({where:{id:actualDevice.id}})).revokedAt,null);
  }
  assert.equal((await peerContext.request.post(base+'/api/staff',{headers:{Origin:base},data:{...ownerPayload,email:`denied-${run}@example.test`,actorPassword:password}})).status(),403);
  assert.equal((await staffContext.request.post(base+'/api/staff',{headers:{Origin:base},data:{...ownerPayload,email:`staff-denied-${run}@example.test`,actorPassword:password}})).status(),403);
  await Promise.all(Array.from({length:4},()=>peerPost('pin',{email:peerEmail,pin:'999999'})));
  assert.ok((await prisma.user.findUniqueOrThrow({where:{id:peer.id}})).lockedAt);
  const peerLockAlert=await prisma.staffAlert.findFirstOrThrow({where:{userId:owner.id,body:{contains:peer.name}}});assert.match(peerLockAlert.body,/server operator/);
  pass('Additional Owner security lockout remains enforced and directs recovery to the server operator');
  await peerContext.close();
  pass('Configured Owner provisions an audited Owner through the UI; that Owner verifies email and PIN, receives finance access, and both peers reject suspension, demotion, permission changes, deletion and device revocation');
  const {reviewAccounts}=await import('./account-review.mjs');
  await reviewAccounts({browser,context,page,prisma,base,password,run,branch,mailFile,artifactDir,openWorkspace,staffContext,owner,pinDevice});
  pass('Generated and manual account passwords, credential emails and failure recovery, administrator reset, old-session/PIN/code invalidation, and employee/device method policies work through actual controls');
  if(process.env.CATALOG_REVIEW==='1') {
    const {reviewCatalog}=await import('../catalog/review.mjs');
    await reviewCatalog({page,context,prisma,base,password,run,artifactDir,openWorkspace,staffContext});
    pass('Reference catalog UI lookup, source licence/password controls, rate-limit persistence and role boundaries verified without changing shop stock');
  }
  if(process.env.PWA_REVIEW==='1') {
    process.env.AUTH_REVIEW_AI_FILE=`/tmp/gadgethub-ai-${run}.json`;
    const {runPwaReview}=await import('../pwa/review.mjs');
    await runPwaReview({context,page,prisma,base,owner,staff,staffContext,password,pin:appPin,branch,artifactDir,openWorkspace});
  }
  // Lock the device and confirm that server access ends.
  assert.equal((await context.request.post(base+'/api/auth/lock',{headers:{Origin:base},data:{}})).status(),204);
  assert.equal((await context.request.get(base+'/api/auth/devices')).status(),401);pass('Server-backed workspace lock blocks subsequent authenticated requests');
  response=await post('pin',{email,pin:appPin});assert.equal(response.status(),200);await redeem((await response.json()).ticket);
  session=await (await context.request.get(base+'/api/auth/session')).json();assert.equal(session.user.id,owner.id);
  await openWorkspace('Settings','/settings');
  const revokeRow=page.locator('.security-device-list:visible li').filter({has:page.getByText('This device',{exact:true})});
  await revokeRow.getByRole('button',{name:/Revoke/}).click();
  await revokeRow.getByLabel('Confirm your password',{exact:true}).fill(password);
  await revokeRow.getByRole('button',{name:'Revoke access',exact:true}).click();
  await page.waitForURL('**/login',{timeout:120000});
  assert.equal((await context.request.get(base+'/api/auth/devices')).status(),401);pass('Revoke ends access on the next API request');
  // Lockouts include email-code failures and generate owner notification.
  const failedPins=await Promise.all(Array.from({length:6},()=>staffPost('pin',{email:staff.email,pin:'999999'})));for(const result of failedPins)assert.equal(result.status(),401);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:staff.id}})).failedSignIns,3);
  assert.ok((await prisma.user.findUnique({where:{id:staff.id}})).lockedAt);
  assert.equal((await post('password',{email:staff.email,password})).status(),401);
  assert.equal(await prisma.staffAlert.count({where:{userId:owner.id,title:'Account locked after failed sign-ins',body:{contains:staff.name}}}),1);pass('Concurrent wrong PINs stop at three failures, lock the account, revoke devices and alert the Administrator');
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
