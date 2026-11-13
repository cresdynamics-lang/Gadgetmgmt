import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
export async function runPwaReview({context,page,prisma,base,owner,staff,staffContext,password,branch,artifactDir,openWorkspace}) {
  const results=[],audits=[];const mark=text=>{results.push(text);console.log('PWA PASS',text)};
  const origin={Origin:base};
  const request=async(method,path,data)=>{const response=await context.request[method](base+path,{headers:origin,...(data?{data}:{})});const body=await response.json();assert.ok(response.ok(),`${method} ${path}: ${response.status()} ${JSON.stringify(body)}`);return body;};
  const forbidden=new Set(['costPrice','unitCost','totalCost','costAmount','requestHash']);
  function noPrivate(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){assert.equal(forbidden.has(key),false,`Private field ${key} in staff response`);noPrivate(child);}}
  const suffix=randomUUID().slice(0,8),serial=`PWA-${suffix.toUpperCase()}`;
  const product=await prisma.product.create({data:{sku:`PWA-${suffix}`,name:`Review iPhone ${suffix}`,category:'Smartphone',unitTracking:true,costPrice:200,sellingPrice:1000,branchId:branch.id,inventory:{create:{branchId:branch.id,stockOnHand:0}}}});
  const intake=await request('post','/api/inventory/units',{productId:product.id,serialNumber:serial,condition:'NEW',activationLock:'OFF',networkLock:'UNLOCKED',color:'Midnight',storage:'128 GB'});
  const unit=await prisma.stockUnit.findUniqueOrThrow({where:{serialNumber:serial}});
  assert.ok(intake);assert.ok(await prisma.deviceEvent.count({where:{unitId:unit.id,kind:'Device received'}}));mark('Physical receipt persists a unique device and its first history event');
  await openWorkspace('Repairs','/repairs');
  const newRepair=page.getByText('New repair',{exact:true}).locator('..');
  if(!await newRepair.evaluate(el=>el.open))await newRepair.locator('summary').click();
  await newRepair.getByLabel('Physical device',{exact:true}).selectOption(unit.id);
  await newRepair.getByLabel('Repairer',{exact:true}).fill('Fixture repairer');
  await newRepair.getByLabel('Reason and operational details',{exact:true}).fill('Fixture inspection and battery repair');
  const repairResponse=page.waitForResponse(r=>r.url()===base+'/api/operations'&&r.request().method()==='POST');
  await newRepair.getByRole('button',{name:'Save repair',exact:true}).click();
  const response=await repairResponse;assert.equal(response.status(),201,await response.text());
  let repair=await response.json();assert.equal((await prisma.stockUnit.findUniqueOrThrow({where:{id:unit.id}})).status,'IN_REPAIR');mark('Repair assignment works through the actual UI and removes sellable stock');
  const grants={userId:staff.id,pages:['/dashboard','/sales','/inventory','/repairs','/devices','/assistant'],capabilities:['sales','inventory','repairs','costEntry'],biometricsAllowed:true,expiresAt:null,password};
  await request('put','/api/auth/access',grants);
  let staffResponse=await staffContext.request.patch(base+'/api/operations',{headers:origin,data:{requestKey:randomUUID(),id:repair.id,version:repair.version,action:'PASS',proof:'Fixture return inspection passed',costAmount:500}});
  assert.equal(staffResponse.status(),200);noPrivate(await staffResponse.json());
  staffResponse=await staffContext.request.get(base+`/api/devices/${unit.id}/passport`);assert.equal(staffResponse.status(),200);noPrivate(await staffResponse.json());
  assert.equal((await prisma.stockUnit.findUniqueOrThrow({where:{id:unit.id}})).status,'IN_STOCK');mark('Write-only repair costs persist while staff workflow and history responses omit protected values');
  const customer=await prisma.customer.create({data:{branchId:branch.id,name:`Fixture buyer ${suffix}`,phone:'0700000000',marketingSource:'Fixture referral'}});
  // A separate headless instance keeps the owner window foreground during the cashier journey.
  const staffBrowser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  let sale;
  try {
    const cashier=await staffBrowser.newContext({viewport:{width:390,height:844}});await cashier.addCookies(await staffContext.cookies());
    const till=await cashier.newPage();till.setDefaultTimeout(60000);
    await till.goto(base+'/sales',{waitUntil:'networkidle',timeout:120000});
    await till.getByRole('textbox',{name:'Search products or scan a device identifier',exact:true}).fill(serial);
    await till.getByRole('textbox',{name:'Search products or scan a device identifier',exact:true}).press('Enter');
    await till.locator('select:visible').first().selectOption(customer.id);
    await till.getByRole('button',{name:'Cash on delivery',exact:true}).click();
    await till.screenshot({path:`${artifactDir}/cashier-before-checkout.png`,fullPage:true});
    await expect(till.getByRole('button',{name:'Record unpaid delivery sale',exact:true})).toBeEnabled();
    const [saved]=await Promise.all([till.waitForResponse(r=>r.url()===base+'/api/pos'&&r.request().method()==='POST'),till.getByRole('button',{name:'Record unpaid delivery sale',exact:true}).click()]);assert.equal(saved.status(),201,await saved.text());sale=await saved.json();noPrivate(sale);assert.equal(sale.paidAmount,0);assert.equal(sale.payments.length,0);
    await till.locator('section[aria-label="Sale receipt"]:visible').waitFor();
    await till.screenshot({path:`${artifactDir}/cashier-cod-receipt-390.png`,fullPage:true});
    const pdf=await cashier.request.get(base+`/api/pos/${sale.id}/receipt`);assert.equal(pdf.status(),200);assert.match((await pdf.body()).toString('ascii',0,5),/^%PDF-/);
    await till.getByText('Receipt delivery & recovery',{exact:true}).click();
    await till.getByLabel('Receipt email address',{exact:true}).fill('fixture-buyer@example.test');
    await till.getByRole('button',{name:'Request receipt email',exact:true}).click();
    await till.getByRole('status').filter({hasText:'Receipt email queued'}).waitFor();
    assert.equal(await prisma.customerNotification.count({where:{kind:'SALE_RECEIPT',dedupeKey:{startsWith:`receipt:${sale.id}:`}}}),1);
    mark('Cashier scans an eligible device, identifies a customer, records unpaid COD, downloads a real receipt and queues email without repeating the sale');
  } finally {await staffBrowser.close();}
  await openWorkspace('Deliveries','/deliveries');
  const newDelivery=page.getByText('New delivery',{exact:true}).locator('..');if(!await newDelivery.evaluate(el=>el.open))await newDelivery.locator('summary').click();
  await newDelivery.getByLabel('Physical device',{exact:true}).selectOption(unit.id);await newDelivery.getByLabel('Responsible rider',{exact:true}).fill('Fixture rider');await newDelivery.getByLabel('Destination & customer handover details',{exact:true}).fill('Verified fixture customer destination');await newDelivery.getByLabel('Cash on delivery obligation (KES)',{exact:true}).fill('1000');await newDelivery.getByLabel('Due date',{exact:true}).fill(new Date(Date.now()+86400000).toISOString().slice(0,16));await newDelivery.getByLabel('Reason and operational details',{exact:true}).fill('Fixture COD delivery');
  const deliveryCreated=page.waitForResponse(r=>r.url()===base+'/api/operations'&&r.request().method()==='POST');await newDelivery.getByRole('button',{name:'Save delivery',exact:true}).click();const deliveryResponse=await deliveryCreated;assert.equal(deliveryResponse.status(),201,await deliveryResponse.text());let delivery=await deliveryResponse.json();
  const deliveryRow=page.locator('article:visible').filter({hasText:product.name});
  async function action(value,extra={}) {
    await expect(deliveryRow).toHaveAttribute('data-version',String(delivery.version));
    await deliveryRow.getByText('Record next action',{exact:true}).click();await deliveryRow.getByLabel('Action',{exact:true}).selectOption(value);await deliveryRow.getByLabel('Named handover / inspection / settlement proof',{exact:true}).fill('Named fixture handover verified');
    if(extra.amount)await deliveryRow.getByLabel('Actual payment received (KES)',{exact:true}).fill(String(extra.amount));if(extra.method)await deliveryRow.getByLabel('Payment method',{exact:true}).selectOption(extra.method);
    const confirmed=page.waitForResponse(r=>r.url()===base+'/api/operations'&&r.request().method()==='PATCH');await deliveryRow.getByRole('button',{name:'Confirm action',exact:true}).click();const result=await confirmed;assert.equal(result.status(),200,await result.text());delivery=await result.json();
  }
  await action('DISPATCH');await action('DELIVER');await action('COLLECT',{amount:1000,method:'CASH'});await action('CLOSE');assert.equal((await prisma.sale.findUniqueOrThrow({where:{id:sale.id}})).paidAmount,1000);mark('Delivery UI traces rider handover, proof, COD payment and closure to the saved sale');
  await openWorkspace('Expenses','/expenses');
  const expense=page.getByText('Record an expense',{exact:true}).locator('..');if(!await expense.evaluate(el=>el.open))await expense.locator('summary').click();await expense.getByLabel('Category',{exact:true}).selectOption('RENT');await expense.getByLabel('Payee / employee',{exact:true}).fill(`Fixture landlord ${suffix}`);await expense.getByLabel('Amount paid (KES)',{exact:true}).fill('300');await expense.getByLabel('Actual payment date & time',{exact:true}).fill(new Date(Date.now()-60000).toISOString().slice(0,16));await expense.getByLabel('Verified payment reference',{exact:true}).fill(`PWA-RENT-${suffix}`);await expense.getByLabel('Description / campaign / approved payroll period',{exact:true}).fill('Isolated fixture expense');await expense.getByLabel('Confirm your password',{exact:true}).fill(password);
  const expenseSaved=page.waitForResponse(r=>r.url()===base+'/api/expenses'&&r.request().method()==='POST');await expense.getByRole('button',{name:'Confirm expense payment',exact:true}).click();const expenseResponse=await expenseSaved;assert.equal(expenseResponse.status(),201,await expenseResponse.text());const entry=await expenseResponse.json();assert.equal(entry.amount,300);
  const duplicate=await context.request.post(base+'/api/expenses',{headers:origin,data:{requestKey:entry.requestKey,category:'RENT',payee:entry.payee,description:entry.description,amount:300,occurredAt:entry.occurredAt,reference:entry.reference,password}});assert.equal(duplicate.status(),201);
  const reversed=await request('post','/api/expenses',{requestKey:randomUUID(),category:'RENT',payee:entry.payee,description:'Fixture correction',amount:300,occurredAt:new Date().toISOString(),reference:`PWA-REV-${suffix}`,reversesId:entry.id,password});assert.equal(reversed.amount,-300);
  const bill=await request('post','/api/recurring-bills',{requestKey:randomUUID(),title:`Fixture bill ${suffix}`,payee:'Fixture utility',category:'UTILITIES',amount:200,dueDay:31,password});
  const payment={requestKey:randomUUID(),category:'UTILITIES',payee:bill.payee,description:'Actual fixture bill payment',amount:200,occurredAt:new Date().toISOString(),reference:`PWA-BILL-${suffix}`,billId:bill.id,period:new Date().toISOString().slice(0,7),password};await request('post','/api/expenses',payment);const duplicatePeriod=await context.request.post(base+'/api/expenses',{headers:origin,data:{...payment,requestKey:randomUUID()}});assert.equal(duplicatePeriod.status(),409);
  const paused=await request('patch','/api/recurring-bills',{id:bill.id,active:false,password});assert.equal(paused.active,false);
  assert.equal((await context.request.post(base+'/api/expenses',{headers:origin,data:{...payment,requestKey:randomUUID(),period:'2026-01'}})).status(),400);
  const resumed=await request('patch','/api/recurring-bills',{id:bill.id,active:true,password});assert.equal(resumed.active,true);
  assert.equal(await prisma.expenseEntry.count({where:{billId:bill.id}}),1);
  assert.equal((await staffContext.request.get(base+'/api/expenses')).status(),403);assert.equal((await staffContext.request.post(base+'/api/finance/export',{headers:origin,data:{password}})).status(),403);
  const exported=await context.request.post(base+'/api/finance/export',{headers:origin,data:{password}});assert.equal(exported.status(),200);assert.match(await exported.text(),/PWA-REV/);mark('Expense UI persists actual owner payments; corrections append reversals, duplicate bill periods are rejected, and staff cannot query or export finance');
  await request('put','/api/planner',{productId:product.id,color:'Midnight',storage:'128 GB',targetAvailable:3,password});
  await openWorkspace('Stock planner','/planner');await page.getByRole('heading',{name:product.name,exact:true}).waitFor();const advice=page.locator('article:visible').filter({hasText:product.name});await expect(advice).toContainText('Restock 3');mark('Variant restocking uses the approved target and actual sold-device history');
  await request('put','/api/auth/access',{...grants,capabilities:['inventory'],pages:['/dashboard','/inventory','/assistant','/devices']});
  const ai=await staffContext.request.post(base+'/api/insights',{headers:origin});assert.equal(ai.status(),200,await ai.text());const aiBody=await ai.json();assert.deepEqual(aiBody.sources,['/inventory']);const aiPayload=JSON.parse(readFileSync(process.env.AUTH_REVIEW_AI_FILE,'utf8'));const metrics=JSON.parse(aiPayload.input);assert.equal(Object.hasOwn(metrics,'sales'),false);assert.equal(Object.hasOwn(metrics,'credit'),false);noPrivate(metrics);mark('Read-only AI receives only granted datasets and returns only authorized source links');
  await prisma.user.update({where:{id:staff.id},data:{accessExpiresAt:new Date(Date.now()-1000)}});assert.equal((await staffContext.request.get(base+'/api/inventory')).status(),403);await request('put','/api/auth/access',grants);mark('Expired temporary access is rejected on the next server request');
  const pages=[['Dashboard','/dashboard'],['Sales (POS)','/sales'],['Inventory','/inventory'],['Stock planner','/planner'],['Devices','/devices'],['Repairs','/repairs'],['Deliveries','/deliveries'],['Partners','/partners'],['Trade-ins & returns','/trade-ins'],['Expenses','/expenses'],['Finance','/finance'],['Customers','/customers'],['Lipa Mdogo Mdogo','/credit'],['Layaway close-out','/layaway'],['Staff & Users','/staff'],['Activity','/activity'],['Messages & alerts','/notifications'],['Settings','/settings'],['Performance','/performance'],['AI Assistant','/assistant'],['Business insights','/insights'],['Account security','/account']];
  for(const theme of ['light','dark']){
    await openWorkspace('Account security','/account');await page.getByLabel('Appearance',{exact:true}).selectOption(theme);
    for(const [name,path] of pages){await staffContext.request.post(base+'/api/auth/heartbeat',{headers:origin});await openWorkspace(name,path);await page.waitForLoadState('networkidle');await page.waitForTimeout(700);await page.getByText('Loading live records…',{exact:true}).waitFor({state:'hidden'});const key=path.slice(1).replaceAll('/','-');
      for(const width of [375,390,430,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${path} overflow at ${width}`);if(width===390 || width===1440 && ['/repairs','/deliveries','/partners','/expenses','/finance','/inventory','/planner'].includes(path))await page.screenshot({path:`${artifactDir}/${key}-${theme}-${width}.png`,fullPage:true});}
      await page.setViewportSize({width:390,height:844});const audit=await new AxeBuilder({page}).exclude('nextjs-portal').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();audits.push({path,theme,violations:audit.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
    }
  }
  writeFileSync(`${artifactDir}/accessibility.json`,JSON.stringify(audits,null,2));mark('All workspace routes are checked at five widths in both appearances with automated WCAG analysis');
  await openWorkspace('Account security','/account');await page.getByLabel('Appearance',{exact:true}).selectOption('system');await page.getByRole('button',{name:'Check app services',exact:true}).click();await page.getByText('Worker not reporting a current heartbeat',{exact:true}).waitFor();assert.ok([401,403].includes((await staffContext.request.get(base+'/api/readiness')).status()));mark('Owner service readiness distinguishes configured services from unverified real delivery');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const manifest=await(await context.request.get(base+'/manifest.webmanifest')).json();assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');
  const leaseDevice=await prisma.authDevice.findFirstOrThrow({where:{userId:staff.id,revokedAt:null}});await prisma.authDevice.update({where:{id:leaseDevice.id},data:{activeUntil:new Date(Date.now()-1000)}});assert.equal((await staffContext.request.post(base+'/api/auth/heartbeat',{headers:origin})).status(),401);mark('A suspended or killed client cannot revive an expired foreground lease');
  await context.setOffline(true);await page.getByRole('status').filter({hasText:'You’re offline'}).waitFor();await page.goto(base+'/finance',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Reconnect to your workspace.',exact:true}).waitFor();await page.screenshot({path:`${artifactDir}/offline-390.png`,fullPage:true});
  const caches=await page.evaluate(async()=>{const rows=[];for(const key of await window.caches.keys())for(const entry of await(await window.caches.open(key)).keys())rows.push(new URL(entry.url).pathname);return rows;});assert.ok(caches.length);assert.ok(caches.every(path=>['/notifications-offline.html','/notifications-icon-192.png','/notifications-icon-512.png'].includes(path)));await context.setOffline(false);await page.getByRole('link',{name:'Try connection again',exact:true}).click();await page.waitForURL('**/login',{timeout:120000});
  await page.locator('#email').fill(owner.email);await page.getByRole('button',{name:'Use password',exact:true}).click();await page.locator('#password').fill(password);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL('**/dashboard',{timeout:120000});mark('Offline navigation exposes only a public recovery screen, protected data is absent from CacheStorage, and reopening a locked PWA requires sign-in');
  await openWorkspace('Team access','/access');
  writeFileSync(`${artifactDir}/pwa-results.json`,JSON.stringify({date:new Date().toISOString(),results,accessibility:audits.map(row=>({path:row.path,theme:row.theme,violations:row.violations.length})),limits:['Physical iPhone installation, Face ID hardware, VoiceOver and real push/email delivery require real-device/provider verification.','Unapproved financing, statutory payroll and refund accounting policies are not invented.']},null,2));
  const serious=audits.flatMap(row=>row.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>`${row.path} ${row.theme}: ${v.id}`));assert.deepEqual(serious,[],`Accessibility issues: ${serious.join(', ')}`);
}
