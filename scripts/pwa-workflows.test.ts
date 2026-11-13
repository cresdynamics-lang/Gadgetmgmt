import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {PrismaClient,Prisma} from "@prisma/client";
import {operationCreate,operationUpdate,validateInspection,nextOperationState,presentOperation,csvCell} from "../src/lib/operations";
import {restockAdvice} from "../src/lib/variant-planning";
import {isCapitalCost,monthDueDate} from "../src/lib/expenses";
import {createDeviceLabel} from "../src/lib/device-label";
import {createOperation,updateOperation} from "../src/lib/operation-store";
import {recordStockUnit,claimDevicesForSale,snapshotSaleCosts} from "../src/lib/stock-units";
import {deliverQueuedReceipt} from "../src/lib/receipt-delivery";

const inspection={identityVerified:true,ownershipVerified:true,identifiersMatch:true,activationLockOff:true,stolenCheckClear:true,receiptPresent:true,boxPresent:true};
test("intake rejects unsafe locks, unverifiable ownership and undocumented missing receipts",()=>{
  assert.throws(()=>validateInspection({...inspection,activationLockOff:false}),/Verify/);
  assert.throws(()=>validateInspection({...inspection,ownershipVerified:false}),/Verify/);
  assert.throws(()=>validateInspection({...inspection,receiptPresent:false}),/why/);
  assert.doesNotThrow(()=>validateInspection({...inspection,boxPresent:false,missingDocumentsReason:"Customer provided a verified purchase record"}));
});
test("workflow state machines refuse skipped custody and inspection steps",()=>{
  assert.throws(()=>nextOperationState("DELIVERY","READY","CLOSE"),/not available/);
  assert.equal(nextOperationState("REPAIR","IN_PROGRESS","FAIL"),"REVIEW");
  assert.equal(nextOperationState("PARTNER","BORROWED_IN","VALUE"),"BORROWED_IN");
  assert.throws(()=>nextOperationState("TRADE_IN","COMPLETED","ACCEPT"),/not available/);
});
test("staff DTOs omit supplier money and hashes that could reveal private cost inputs",()=>{
  const record={kind:"PARTNER",party:"Dealer",costAmount:987,paidAmount:321,requestKey:"key",requestHash:"hash"};
  const safe=presentOperation(record,false);
  for(const key of ["costAmount","paidAmount","requestKey","requestHash"])assert.equal(Object.hasOwn(safe,key),false);
  assert.equal(presentOperation(record,true).costAmount,987);
  assert.equal(presentOperation({...record,kind:"DELIVERY"},false).paidAmount,321);
});
test("restocking never invents targets or days of cover",()=>{
  assert.equal(restockAdvice(2,0,null).suggested,null);assert.equal(restockAdvice(2,0,5).daysCover,null);
  assert.equal(restockAdvice(2,30,5).suggested,3);assert.equal(restockAdvice(2,30,5).daysCover,2);
  assert.equal(restockAdvice(6,30,5).suggested,0);
});
test("expense reports separate capital costs and preserve numeric CSV corrections safely",()=>{
  assert.equal(isCapitalCost({category:"DEVICE_PURCHASE",unitId:null}),true);
  assert.equal(isCapitalCost({category:"REPAIR",unitId:"unit"}),true);
  assert.equal(isCapitalCost({category:"PAYROLL",unitId:null}),false);
  assert.equal(monthDueDate(2026,1,31).getUTCDate(),28);
  assert.equal(csvCell(-400),"-400");assert.equal(csvCell("=IMPORTXML(1)"),'"\'=IMPORTXML(1)"');
});
test("device labels produce actual PDF output with the unique device identifier",()=>{
  const pdf=createDeviceLabel("iPhone review unit","PWA-SERIAL-1234");
  assert.equal(pdf.internal.pageSize.getWidth(),58);assert.equal(pdf.internal.pageSize.getHeight(),40);
  assert.match(pdf.output(),/^%PDF-/);assert.ok(pdf.output().length>1000);
});

const database=process.env.PWA_TEST_DATABASE_URL;
const integration={skip:!database};
if(database && !/^gadgethub_(auth|pwa)_review$/.test(new URL(database).pathname.slice(1)))throw new Error("Use an isolated review database.");
const db=database?new PrismaClient({datasourceUrl:database}):null;
const rollback=new Error("ROLLBACK_PWA_REVIEW");
async function isolated(run:(tx:Prisma.TransactionClient)=>Promise<void>) {
  assert.ok(db);
  try{await db.$transaction(async tx=>{await run(tx);throw rollback;},{timeout:45000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}catch(error){if(error!==rollback)throw error;}
}
async function fixture(tx:Prisma.TransactionClient) {
  const suffix=randomUUID().slice(0,8);
  const branch=await tx.branch.create({data:{name:"PWA isolated review",code:`PWA-${suffix}`,address:"Fixture only",phone:""}});
  const user=await tx.user.create({data:{name:"PWA reviewer",email:`pwa-${suffix}@example.test`,passwordHash:"not-a-login",role:"OWNER",branchId:branch.id}});
  const product=await tx.product.create({data:{name:"PWA review device",sku:`PWA-${suffix}`,category:"Smartphone",unitTracking:true,costPrice:200,sellingPrice:1000,branchId:branch.id,inventory:{create:{branchId:branch.id,stockOnHand:0}}}});
  return {branch,user,product,actor:{id:user.id,role:"OWNER",branchId:branch.id},suffix};
}
async function makeSale(tx:Prisma.TransactionClient,context:Awaited<ReturnType<typeof fixture>>,unitId:string,paid=1000) {
  const snapshot=await tx.inventoryItem.findUniqueOrThrow({where:{branchId_productId:{branchId:context.branch.id,productId:context.product.id}}});
  const sale=await tx.sale.create({data:{invoiceNumber:`PWA-${randomUUID()}`,branchId:context.branch.id,cashierId:context.user.id,total:1000,paidAmount:paid,status:paid===1000?"PAID":"PARTIAL",paymentMethod:"CASH",saleItems:{create:{productId:context.product.id,quantity:1,unitPrice:1000,unitCost:200,total:1000}}},include:{saleItems:true}});
  await tx.inventoryItem.update({where:{id:snapshot.id},data:{stockOnHand:{decrement:1}}});
  await claimDevicesForSale(tx,{branchId:context.branch.id,productId:context.product.id,category:"Smartphone",unitTracking:true,quantity:1,devices:[{stockUnitId:unitId}],saleItemId:sale.saleItems[0].id,userId:context.user.id,hold:false,stockSnapshot:snapshot});
  await snapshotSaleCosts(tx,sale.id);return sale;
}
test("real transactions preserve one device through receipt, repair, partner return, sale, COD and repeat intake",integration,async()=>isolated(async tx=>{
  const f=await fixture(tx);const received=await recordStockUnit(tx,{branchId:f.branch.id,productId:f.product.id,userId:f.user.id,serialNumber:`PWA-${f.suffix}`,condition:"NEW",activationLock:"OFF",networkLock:"UNLOCKED"});const unitId=received.unit.id;
  const stock=async()=> (await tx.inventoryItem.findUniqueOrThrow({where:{branchId_productId:{branchId:f.branch.id,productId:f.product.id}}})).stockOnHand;
  const create=(kind:string,extra:Record<string,unknown>={})=>operationCreate.parse({requestKey:randomUUID(),kind,unitId,party:"Named reviewer",details:"Verified fixture operation",dueAt:new Date(Date.now()+86400000).toISOString(),...extra});
  const act=(record:{id:string;version:number},action:string,extra:Record<string,unknown>={})=>operationUpdate.parse({requestKey:randomUUID(),id:record.id,version:record.version,action,proof:"Named handover and physical inspection verified",...extra});
  const repairInput=create("REPAIR");let repair=await createOperation(tx,repairInput,f.actor);assert.equal(await stock(),0);
  assert.equal((await createOperation(tx,repairInput,f.actor)).id,repair.id);assert.equal(await stock(),0);
  await assert.rejects(()=>createOperation(tx,create("REPAIR"),f.actor),/open operation/);
  repair=await updateOperation(tx,act(repair,"FAIL"),f.actor,true);assert.equal(await stock(),0);
  const repairPass=act(repair,"PASS",{costAmount:500});repair=await updateOperation(tx,repairPass,f.actor,true);assert.equal(await stock(),1);
  await updateOperation(tx,repairPass,f.actor,true);assert.equal(await tx.expenseEntry.count({where:{unitId}}),1);
  let partner=await createOperation(tx,create("PARTNER"),f.actor);assert.equal(await stock(),0);partner=await updateOperation(tx,act(partner,"RETURN"),f.actor,true);assert.equal(partner.status,"RETURNED");assert.equal(await stock(),1);
  const sale=await makeSale(tx,f,unitId,0);assert.equal(await stock(),0);assert.equal((await tx.saleItem.findUniqueOrThrow({where:{id:sale.saleItems[0].id}})).totalCost,700);
  let delivery=await createOperation(tx,create("DELIVERY",{saleId:sale.id,destination:"Verified customer location",codAmount:1000}),f.actor);
  delivery=await updateOperation(tx,act(delivery,"DISPATCH"),f.actor,true);delivery=await updateOperation(tx,act(delivery,"DELIVER"),f.actor,true);
  await assert.rejects(()=>updateOperation(tx,act(delivery,"CLOSE"),f.actor,true),/COD/);
  const collection=act(delivery,"COLLECT",{amount:1000,method:"CASH",reference:`PWA-COD-${f.suffix}`});delivery=await updateOperation(tx,collection,f.actor,true);
  await updateOperation(tx,collection,f.actor,true);assert.equal(await tx.salePayment.count({where:{saleId:sale.id}}),1);assert.equal((await tx.sale.findUniqueOrThrow({where:{id:sale.id}})).paidAmount,1000);
  delivery=await updateOperation(tx,act(delivery,"CLOSE"),f.actor,true);assert.equal(delivery.status,"COMPLETED");
  let returned=await createOperation(tx,create("RETURN",{inspection}),f.actor);assert.equal((await tx.stockUnit.findUniqueOrThrow({where:{id:unitId}})).status,"QUARANTINED");
  returned=await updateOperation(tx,act(returned,"ACCEPT"),f.actor,true);assert.equal(await stock(),1);assert.equal(returned.unitId,unitId);
  const resale=await makeSale(tx,f,unitId);assert.notEqual(resale.id,sale.id);
  let trade=await createOperation(tx,create("TRADE_IN",{inspection}),f.actor);trade=await updateOperation(tx,act(trade,"ACCEPT",{costAmount:300}),f.actor,true);assert.equal(trade.unitId,unitId);assert.equal(await stock(),1);
  assert.ok(await tx.deviceEvent.count({where:{unitId,saleId:sale.id}}));assert.ok(await tx.deviceEvent.count({where:{unitId,saleId:resale.id}}));assert.ok(await tx.deviceEvent.count({where:{unitId}})>12);
}));
test("borrowed stock requires approved supplier cost and settlement records real obligations without duplicate payments",integration,async()=>isolated(async tx=>{
  const f=await fixture(tx);let loan=await createOperation(tx,operationCreate.parse({requestKey:randomUUID(),kind:"PARTNER",partnerDirection:"IN",productId:f.product.id,identifier:`BORROW-${f.suffix}`,party:"Verified dealer",details:"Borrowed fixture device",dueAt:new Date(Date.now()+86400000).toISOString(),inspection}),f.actor);
  await tx.$executeRawUnsafe("SAVEPOINT before_unapproved_sale");
  await assert.rejects(()=>makeSale(tx,f,loan.unitId),/supplier obligation/);await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT before_unapproved_sale");
  loan=await updateOperation(tx,operationUpdate.parse({requestKey:randomUUID(),id:loan.id,version:loan.version,action:"VALUE",costAmount:400}),f.actor,true);
  assert.equal(await tx.expenseEntry.count({where:{unitId:loan.unitId}}),0);
  const sale=await makeSale(tx,f,loan.unitId);loan=await tx.operation.findUniqueOrThrow({where:{id:loan.id}});assert.equal(loan.status,"PAYABLE");assert.equal((await tx.saleItem.findUniqueOrThrow({where:{id:sale.saleItems[0].id}})).totalCost,400);
  const settle=operationUpdate.parse({requestKey:randomUUID(),id:loan.id,version:loan.version,action:"SETTLE",amount:400,reference:`SUPPLIER-${f.suffix}`,proof:"Dealer confirmed payment"});loan=await updateOperation(tx,settle,f.actor,true);await updateOperation(tx,settle,f.actor,true);assert.equal(loan.status,"SETTLED");assert.equal(await tx.expenseEntry.count({where:{unitId:loan.unitId}}),1);assert.equal((await tx.stockUnit.findUniqueOrThrow({where:{id:loan.unitId}})).status,"SOLD");
}));
test("receipt worker claims a queued email once and never reports a failed provider as sent",integration,async()=>{
  assert.ok(db);const f=await db.branch.create({data:{code:`MAIL-${randomUUID().slice(0,8)}`,name:"Isolated mail fixture",address:"Test",phone:""}});
  const notification=await db.customerNotification.create({data:{branchId:f.id,kind:"SALE_RECEIPT",channel:"EMAIL",recipient:"test@example.test",body:"Fixture receipt",dedupeKey:randomUUID()}});
  let sends=0;const sender=async()=>{sends++;};
  await Promise.all([deliverQueuedReceipt(notification.id,sender,db),deliverQueuedReceipt(notification.id,sender,db)]);assert.equal(sends,1);assert.equal((await db.customerNotification.findUniqueOrThrow({where:{id:notification.id}})).status,"SENT");
  const failed=await db.customerNotification.create({data:{branchId:f.id,kind:"SALE_RECEIPT",channel:"EMAIL",recipient:"test@example.test",body:"Failure fixture",dedupeKey:randomUUID()}});
  await assert.rejects(()=>deliverQueuedReceipt(failed.id,async()=>{throw new Error("Mock provider unavailable")},db!));assert.equal((await db.customerNotification.findUniqueOrThrow({where:{id:failed.id}})).status,"QUEUED");
});
test.after(async()=>{await db?.$disconnect();});
