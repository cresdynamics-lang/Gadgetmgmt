import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compare} from 'bcryptjs';
import AxeBuilder from '@axe-core/playwright';

export async function reviewAccounts({browser,context,page,prisma,base,password,run,branch,mailFile,artifactDir,openWorkspace,staffContext,owner,pinDevice}) {
  const origin={Origin:base},email=`credentials-${run}@example.test`,name=`Credentials Review ${run}`;
  await openWorkspace('Staff & Users','/staff');await page.getByRole('button',{name:'Add a teammate',exact:true}).click();
  const form=page.locator('form').filter({has:page.locator('input[name="name"]')});
  await form.locator('[name="name"]').fill(name);await form.locator('[name="email"]').fill(email);await form.locator('[name="role"]').selectOption('CASHIER');
  await form.getByRole('button',{name:'Generate password',exact:true}).click();
  const generated=await form.locator('[name="password"]').inputValue();assert.equal(generated.length,24);assert.equal(await form.locator('[name="password"]').getAttribute('type'),'password');
  await form.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await form.locator('[name="password"]').getAttribute('type'),'text');await form.getByRole('button',{name:'Hide password',exact:true}).click();
  await page.screenshot({path:`${artifactDir}/account-create-390.png`,fullPage:true});
  const createResponse=page.waitForResponse(response=>response.url()===base+'/api/staff'&&response.request().method()==='POST');await form.getByRole('button',{name:'Create account',exact:true}).click();
  const created=await createResponse;assert.equal(created.status(),201);const body=await created.json();assert.equal(body.emailStatus,'accepted');assert.equal(JSON.stringify(body).includes(generated),false);
  await page.getByRole('status').filter({hasText:`Account created for ${name}.`}).waitFor();
  const invitation=JSON.parse(readFileSync(mailFile,'utf8'));assert.deepEqual(invitation.to,[email]);assert.ok(invitation.text.includes(generated));assert.ok(invitation.text.includes('verify ownership'));assert.equal(await compare(generated,(await prisma.user.findUniqueOrThrow({where:{id:body.id}})).passwordHash),true);
  const employee=await browser.newContext();const post=(action,data={})=>employee.request.post(base+'/api/auth/security',{headers:origin,data:{action,...data}});
  async function verify(pass){const pending=await post('password',{email,password:pass});assert.equal(pending.status(),200);const challenge=await pending.json();const code=JSON.parse(readFileSync(mailFile,'utf8')).text.match(/code is (\d{6})/)[1];const response=await post('code',{challengeId:challenge.challengeId,code});assert.equal(response.status(),200);return response.json();}
  async function redeem(ticket){const csrf=await(await employee.request.get(base+'/api/auth/csrf')).json();return employee.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,ticket},maxRedirects:0});}
  let proof=await verify(generated);let saved=await post('pin-set',{challengeId:proof.pinSetupId,pin:'036924',confirmPin:'036924'});assert.equal(saved.status(),200);await redeem((await saved.json()).ticket);
  const device=await prisma.authDevice.findFirstOrThrow({where:{userId:body.id,revokedAt:null}});
  await openWorkspace('Team access','/access');await page.getByRole('combobox').selectOption(body.id);await page.getByRole('checkbox',{name:'Allow app PIN sign-in',exact:true}).uncheck();await page.getByLabel('Confirm your password to save',{exact:true}).fill(password);await page.getByRole('button',{name:`Save access for ${name}`,exact:true}).click();await page.getByRole('status').filter({hasText:'Access saved'}).waitFor();
  assert.equal((await employee.request.get(base+'/api/auth/devices')).status(),401);assert.equal((await post('pin',{email,pin:'036924'})).status(),401);
  proof=await verify(generated);assert.equal(proof.pinSetupId,undefined);assert.ok(proof.ticket);await redeem(proof.ticket);assert.equal((await employee.request.get(base+'/api/auth/devices')).status(),200);
  await openWorkspace('Settings','/settings');const row=page.locator('.security-device-list > li').filter({hasText:name});await row.getByText('Device sign-in methods',{exact:true}).click();await row.getByRole('checkbox',{name:'Allow password sign-in',exact:true}).uncheck();await row.getByLabel('Confirm your password',{exact:true}).fill(password);await row.getByRole('button',{name:'Save device methods',exact:true}).click();await row.getByRole('status').filter({hasText:'Device sign-in methods saved'}).waitFor();
  assert.equal((await employee.request.get(base+'/api/auth/devices')).status(),401);
  assert.equal((await context.request.patch(base+'/api/auth/devices',{headers:origin,data:{id:device.id,password,pinAllowed:true,passwordAllowed:true,biometricsAllowed:false}})).status(),200);
  assert.equal((await context.request.put(base+'/api/auth/access',{headers:origin,data:{userId:body.id,pages:[],capabilities:[],pinAllowed:true,passwordAllowed:false,biometricsAllowed:true,password}})).status(),200);
  proof=await verify(generated);assert.equal(proof.ticket,undefined);assert.ok(proof.pinSetupId);assert.equal((await employee.request.get(base+'/api/auth/devices')).status(),401);
  saved=await post('pin-set',{challengeId:proof.pinSetupId,pin:'036924',confirmPin:'036924'});assert.equal(saved.status(),200);await redeem((await saved.json()).ticket);assert.equal((await employee.request.get(base+'/api/auth/devices')).status(),200);
  assert.equal((await post('passkey-options',{email})).status(),401);
  assert.equal((await context.request.patch(base+'/api/auth/devices',{headers:origin,data:{id:pinDevice.id,password,pinAllowed:false,passwordAllowed:false,biometricsAllowed:false}})).status(),404);
  assert.equal((await staffContext.request.patch(base+'/api/auth/devices',{headers:origin,data:{id:device.id,password,pinAllowed:true,passwordAllowed:true,biometricsAllowed:true}})).status(),403);
  const pending=await(await post('password',{email,password:generated})).json();const oldCode=JSON.parse(readFileSync(mailFile,'utf8')).text.match(/code is (\d{6})/)[1];
  await openWorkspace('Staff & Users','/staff');await page.getByRole('button',{name:`Reset password for ${name}`,exact:true}).click();const dialog=page.getByRole('dialog',{name:'Reset password',exact:true});await dialog.getByRole('button',{name:'Generate password',exact:true}).click();const resetPassword=await dialog.locator('[name="password"]').inputValue();assert.notEqual(resetPassword,generated);await dialog.getByLabel('Confirm your current password',{exact:true}).fill(password);
  await page.screenshot({path:`${artifactDir}/password-reset-390.png`,fullPage:true});const audit=await new AxeBuilder({page}).exclude('nextjs-portal').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(audit.violations,[]);
  await dialog.getByRole('button',{name:'Reset password',exact:true}).click();await dialog.getByRole('status').filter({hasText:'Password reset.'}).waitFor();assert.ok(JSON.parse(readFileSync(mailFile,'utf8')).text.includes(resetPassword));
  assert.equal((await employee.request.get(base+'/api/auth/devices')).status(),401);assert.equal((await post('code',{challengeId:pending.challengeId,code:oldCode})).status(),401);assert.equal((await post('pin',{email,pin:'036924'})).status(),401);assert.equal(await compare(generated,(await prisma.user.findUniqueOrThrow({where:{id:body.id}})).passwordHash),false);assert.equal(await compare(resetPassword,(await prisma.user.findUniqueOrThrow({where:{id:body.id}})).passwordHash),true);
  await dialog.getByRole('button',{name:'Done',exact:true}).click();proof=await verify(resetPassword);saved=await post('pin-set',{challengeId:proof.pinSetupId,pin:'036924',confirmPin:'036924'});await redeem((await saved.json()).ticket);
  assert.equal((await employee.request.post(base+`/api/staff/${owner.id}/password`,{headers:origin,data:{password:resetPassword,actorPassword:resetPassword,emailCredentials:true}})).status(),403);
  assert.equal((await context.request.post(base+`/api/staff/${owner.id}/password`,{headers:origin,data:{password:resetPassword,actorPassword:password,emailCredentials:true}})).status(),403);
  const failingEmail=`fail-delivery-${run}@example.test`;const failed=await context.request.post(base+'/api/staff',{headers:origin,data:{name:'Delivery Failure Review',email:failingEmail,password:generated,role:'CASHIER',branchId:branch.id,emailCredentials:true}});assert.equal(failed.status(),201);const failedBody=await failed.json();assert.equal(failedBody.emailStatus,'unconfirmed');assert.equal(JSON.stringify(failedBody).includes(generated),false);
  const duplicate=await context.request.post(base+'/api/staff',{headers:origin,data:{name:'Duplicate Review',email:failingEmail,password:generated,role:'CASHIER',branchId:branch.id,emailCredentials:true}});assert.equal(duplicate.status(),409);
  const noMailBefore=readFileSync(mailFile,'utf8');const noMail=await context.request.post(base+'/api/staff',{headers:origin,data:{name:'Private Handover Review',email:`no-mail-${run}@example.test`,password:generated,role:'CASHIER',branchId:branch.id,emailCredentials:false}});assert.equal((await noMail.json()).emailStatus,'not_requested');assert.equal(readFileSync(mailFile,'utf8'),noMailBefore);
  const events=await prisma.authEvent.findMany({where:{userId:owner.id},select:{action:true}});assert.equal(JSON.stringify(events).includes(generated),false);assert.equal(JSON.stringify(events).includes(resetPassword),false);
  await employee.close();
}
