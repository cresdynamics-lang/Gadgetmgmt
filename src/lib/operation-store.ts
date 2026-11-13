import { createHash } from "node:crypto";
import { Prisma, type OperationKind } from "@prisma/client";
import { snapshotSaleCosts, moveStockUnit, recordStockUnit, StockUnitError } from "@/lib/stock-units";
import { normalizeImei, normalizeSerial } from "@/lib/device-units";
import { nextOperationState, OperationError, validateInspection, type OperationCreate, type OperationUpdate } from "@/lib/operations";
type Tx=Prisma.TransactionClient;
export type OperationActor={id:string;role:string;branchId:string|null};
export const fingerprint=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const operationInclude={unit:{select:{id:true,imei:true,serialNumber:true,status:true,product:{select:{name:true,sku:true,sellingPrice:true}}}},sale:{select:{invoiceNumber:true,total:true,paidAmount:true}},user:{select:{name:true}}} satisfies Prisma.OperationInclude;
export async function createOperation(tx:Tx,input:OperationCreate,actor:OperationActor) {
  if (!actor.branchId) throw new OperationError(403,"Assign a shop to your account first.");
  const hash=fingerprint({actor:actor.id,input});
  const previous=await tx.operation.findUnique({where:{requestKey:input.requestKey}});
  if(previous) { if(previous.requestHash!==hash)throw new OperationError(409,"This submission key has already been used for different details."); return previous; }
  let unitId=input.unitId;
  let newlyRecorded=false;
  if(input.kind==="TRADE_IN" || input.kind==="RETURN" || input.kind==="PARTNER" && input.partnerDirection==="IN") {
    validateInspection(input.inspection);
    if(!unitId) {
      if(!input.productId || !input.identifier)throw new OperationError(400,"Choose a product variant and enter its IMEI or serial.");
      const imei=normalizeImei(input.identifier);
      const serialNumber=imei?null:normalizeSerial(input.identifier);
      if(!imei && !serialNumber)throw new OperationError(400,"Enter a valid IMEI or serial.");
      const existing=await tx.stockUnit.findFirst({where:{OR:[...(imei?[{imei},{imei2:imei}]:[]),...(serialNumber?[{serialNumber}]:[])]}});
      if(existing) {
        if(existing.branchId!==actor.branchId || existing.productId!==input.productId)throw new OperationError(409,"This identifier belongs to another shop or product. Verify it before intake.");
        unitId=existing.id;
      } else {
        if(input.kind==="RETURN")throw new OperationError(400,"A return must match a device already recorded by GadgetHub.");
        const recorded=await recordStockUnit(tx,{productId:input.productId,branchId:actor.branchId,userId:actor.id,imei,serialNumber,condition:"USED",activationLock:"OFF",networkLock:"UNKNOWN",batteryHealth:input.inspection?.batteryHealth});
        unitId=recorded.unit.id; newlyRecorded=true;
      }
    }
  }
  if(!unitId)throw new OperationError(400,"Choose the physical device for this operation.");
  const unit=await tx.stockUnit.findFirst({where:{id:unitId,branchId:actor.branchId},include:{saleItem:{select:{saleId:true}}}});
  if(!unit)throw new OperationError(404,"Device not found at your shop.");
  if(await tx.operation.findFirst({where:{unitId,closedAt:null}}))throw new OperationError(409,"Finish the open operation for this device first.");
  const dueAt=input.dueAt?new Date(input.dueAt):input.kind==="REPAIR"?new Date(Date.now()+2*86400000):null;
  if(!dueAt)throw new OperationError(400,"Choose a due date.");
  if(dueAt<=new Date())throw new OperationError(400,"Choose a future due date.");
  if(input.kind==="DELIVERY") {
    if(!input.destination || !input.saleId)throw new OperationError(400,"Choose the sale and enter the delivery destination.");
    const sale=await tx.sale.findFirst({where:{id:input.saleId,branchId:actor.branchId,status:{not:"VOIDED"}},include:{creditPlans:{select:{id:true}}}});
    if(!sale || unit.saleItem?.saleId!==sale.id || unit.status!=="SOLD")throw new OperationError(409,"Delivery must reference this sold device’s sale.");
    const obligations=await tx.operation.aggregate({where:{saleId:sale.id,kind:"DELIVERY",closedAt:null},_sum:{codAmount:true,paidAmount:true}});
    if(input.codAmount+(obligations._sum.codAmount??0)-(obligations._sum.paidAmount??0)>sale.total-sale.paidAmount || (input.codAmount>0 && sale.creditPlans.length))throw new OperationError(400,"COD must not exceed the sale balance. Collect financing payments through Lipa.");
  } else if(input.codAmount)throw new OperationError(400,"COD is only available on deliveries.");
  if(input.kind==="REPAIR" || input.kind==="PARTNER" && input.partnerDirection!=="IN") {
    if(unit.status!=="IN_STOCK" && !(input.kind==="REPAIR"&&unit.status==="IN_REPAIR"))throw new OperationError(409,"Only an available device can leave stock for repair or a partner.");
    if(unit.status==="IN_STOCK")await moveStockUnit(tx,{id:unit.id,branchId:actor.branchId,status:input.kind==="REPAIR"?"IN_REPAIR":"WITH_PARTNER",location:input.party,userId:actor.id});
  }
  if(input.kind==="TRADE_IN" || input.kind==="RETURN") {
    if(unit.status==="IN_STOCK" && !newlyRecorded)throw new OperationError(409,"This device is already in shop stock. Verify the intake identifier.");
    if(!["SOLD","RETURNED","IN_STOCK"].includes(unit.status))throw new OperationError(409,"The device is held or unavailable for intake.");
    if(unit.status==="IN_STOCK") await moveStockUnit(tx,{id:unit.id,branchId:actor.branchId,status:"QUARANTINED",location:"Intake inspection"});
    else await tx.stockUnit.update({where:{id:unit.id},data:{status:"QUARANTINED",saleItemId:null,soldAt:null,activationLock:"OFF",location:"Intake inspection"}});
  }
  if(input.kind==="PARTNER" && input.partnerDirection==="IN") {
    if(!newlyRecorded) {
      if(unit.status!=="RETURNED" || unit.ownership!=="PARTNER" || unit.ownerName!==input.party)throw new OperationError(409,"Existing shop stock cannot be relabeled as borrowed.");
      await moveStockUnit(tx,{id:unit.id,branchId:actor.branchId,status:"IN_STOCK",location:"Shop",userId:actor.id});
    }
    await tx.stockUnit.update({where:{id:unit.id},data:{ownership:"PARTNER",ownerName:input.party,supplierName:input.party}});
  }
  const initial:Record<OperationKind,string>={REPAIR:"IN_PROGRESS",DELIVERY:"READY",PARTNER:"OUT",TRADE_IN:"INSPECTION",RETURN:"INSPECTION"};
  const operation=await tx.operation.create({data:{requestKey:input.requestKey,requestHash:hash,kind:input.kind,partnerDirection:input.partnerDirection,status:input.kind==="PARTNER" && input.partnerDirection==="IN"?"BORROWED_IN":initial[input.kind],branchId:actor.branchId,userId:actor.id,unitId:unit.id,saleId:input.saleId ?? unit.saleItem?.saleId,party:input.party,contact:input.contact,destination:input.destination,reference:input.reference,details:input.details,dueAt,codAmount:input.codAmount,inspection:input.inspection as Prisma.InputJsonValue | undefined}});
  await tx.deviceEvent.create({data:{branchId:actor.branchId,unitId:unit.id,userId:actor.id,kind:`${input.kind} opened`,note:`${input.party} · ${input.details}`,operationId:operation.id,saleId:unit.saleItem?.saleId}});
  return operation;
}
export async function updateOperation(tx:Tx,input:OperationUpdate,actor:OperationActor,canWriteCosts:boolean) {
  const {password:omittedPassword,...safe}=input; void omittedPassword;
  const hash=fingerprint({actor:actor.id,input:safe});
  const replay=await tx.deviceEvent.findUnique({where:{requestKey:input.requestKey}});
  if(replay) {if(replay.requestHash!==hash)throw new OperationError(409,"This submission key belongs to a different action."); const prior=await tx.operation.findUnique({where:{id:input.id}});if(!prior)throw new OperationError(404,"Operation not found.");return prior;}
  const operation=await tx.operation.findFirst({where:{id:input.id,...(actor.role==="OWNER"?{}:{branchId:actor.branchId??""})}});
  if(!operation)throw new OperationError(404,"Operation not found.");
  if(operation.version!==input.version)throw new OperationError(409,"This record changed. Refresh it before continuing.");
  let status=nextOperationState(operation.kind,operation.status,input.action);
  if(["DELIVER","PASS","FAIL","RETURN","SETTLE","ACCEPT","REJECT"].includes(input.action) && !input.proof?.trim())throw new OperationError(400,"Record the named handover, inspection result, or settlement proof.");
  if(operation.kind==="TRADE_IN" && input.action==="ACCEPT")await tx.stockUnit.update({where:{id:operation.unitId},data:{ownership:"SHOP",ownerName:operation.party,supplierName:operation.party}});
  if(input.action==="VALUE" && (actor.role!=="OWNER" || !input.costAmount))throw new OperationError(403,"Administrator must record the agreed supplier obligation before this borrowed device can be sold.");
  if((input.costAmount!==undefined && !canWriteCosts) || (input.action==="SETTLE" && actor.role!=="OWNER") || (operation.kind==="TRADE_IN" && input.action==="ACCEPT" && actor.role!=="OWNER"))throw new OperationError(403,"Administrator must approve valuation or settlement. Cost entry requires explicit permission.");
  if(operation.kind==="TRADE_IN" && input.action==="ACCEPT" && !input.costAmount)throw new OperationError(400,"Administrator must record the approved trade-in valuation.");
  let paidAmount=operation.paidAmount;
  if(input.action==="COLLECT") {
    if(!input.amount || !input.method || !operation.saleId || input.amount>operation.codAmount-operation.paidAmount)throw new OperationError(400,"Enter a payment within the remaining COD obligation.");
    if(input.method==="MPESA" && !/^[A-Z0-9]{6,32}$/i.test(input.reference??""))throw new OperationError(400,"Enter the verified M-Pesa confirmation code.");
    if(input.reference && await tx.salePayment.findFirst({where:{reference:input.reference.toUpperCase()}}))throw new OperationError(409,"That payment reference is already recorded.");
    const sale=await tx.sale.findUnique({where:{id:operation.saleId}});
    if(!sale || sale.status==="VOIDED" || input.amount>sale.total-sale.paidAmount)throw new OperationError(409,"The sale balance changed. Reconcile it before collecting.");
    const updated=await tx.sale.updateMany({where:{id:sale.id,paidAmount:sale.paidAmount,status:sale.status},data:{paidAmount:{increment:input.amount},status:sale.paidAmount+input.amount===sale.total?"PAID":"PARTIAL"}});
    if(!updated.count)throw new OperationError(409,"The sale changed. Refresh before collecting.");
    await tx.salePayment.create({data:{saleId:sale.id,amount:input.amount,method:input.method,reference:input.reference?.toUpperCase()}});
    paidAmount+=input.amount;
  }
  if(input.action==="CLOSE" && (operation.paidAmount<operation.codAmount || !operation.proof))throw new OperationError(409,"Record delivery proof and reconcile all COD money before closing.");
  if((operation.kind==="REPAIR" && input.action==="PASS") || (operation.kind==="PARTNER" && operation.partnerDirection!=="IN" && input.action==="RETURN") || (["TRADE_IN","RETURN"].includes(operation.kind) && input.action==="ACCEPT")) {
    await moveStockUnit(tx,{id:operation.unitId,branchId:operation.branchId,status:"IN_STOCK",location:"Shop",userId:actor.id});
  }
  if(input.costAmount!==undefined && actor.role!=="OWNER" && operation.kind!=="REPAIR") throw new OperationError(403,"Write-only costs apply to repair records; other financial changes require Administrator approval.");
  if(operation.kind==="RETURN" && input.action==="ACCEPT" && operation.saleId && await tx.creditPlan.findFirst({where:{saleId:operation.saleId,balance:{gt:0}}})) throw new OperationError(409,"Reconcile the financed sale in Lipa before making this returned device available.");
  if(["TRADE_IN","RETURN"].includes(operation.kind) && input.action==="REJECT") await tx.stockUnit.update({where:{id:operation.unitId},data:{status:"RETURNED",location:`Returned to ${operation.party}`}});
  if(operation.kind==="PARTNER" && operation.partnerDirection==="IN" && input.action==="RETURN") await moveStockUnit(tx,{id:operation.unitId,branchId:operation.branchId,status:"RETURNED",location:operation.party});
  if(operation.kind==="PARTNER" && operation.partnerDirection==="IN" && input.action==="SETTLE") {
    if(!input.amount || !input.reference || !operation.costAmount || input.amount>operation.costAmount-operation.paidAmount)throw new OperationError(400,"Record a verified supplier payment within the agreed outstanding obligation.");
    paidAmount+=input.amount;
    if(paidAmount<operation.costAmount)status="PAYABLE";
    else await tx.stockUnit.update({where:{id:operation.unitId},data:{ownership:"SHOP"}});
    await tx.expenseEntry.create({data:{requestKey:input.requestKey,requestHash:hash,branchId:operation.branchId,userId:actor.id,category:"DEVICE_PURCHASE",payee:operation.party,description:"Borrowed-device supplier settlement",amount:input.amount,occurredAt:new Date(),reference:input.reference,unitId:operation.unitId,operationId:operation.id}});
  }
  if(operation.kind==="PARTNER" && operation.partnerDirection!=="IN" && input.action==="SETTLE") {
    const unit=await tx.stockUnit.findUnique({where:{id:operation.unitId}});
    if(unit?.status!=="WITH_PARTNER")throw new OperationError(409,"The partner-held device changed.");
    if(!input.amount || !input.method)throw new OperationError(400,"Record the actual partner payment amount and method.");
    if(input.method==="MPESA" && !/^[A-Z0-9]{6,32}$/i.test(input.reference??""))throw new OperationError(400,"Enter the verified M-Pesa reference.");
    if(input.reference && await tx.salePayment.findFirst({where:{reference:input.reference.toUpperCase()}}))throw new OperationError(409,"That payment reference is already recorded.");
    const product=await tx.product.findUniqueOrThrow({where:{id:unit.productId}});
    const sale=await tx.sale.create({data:{invoiceNumber:`GH-PARTNER-${input.requestKey.replaceAll("-","").slice(0,16).toUpperCase()}`,branchId:operation.branchId,cashierId:actor.id,total:input.amount,paidAmount:input.amount,status:"PAID",paymentMethod:input.method,saleItems:{create:{productId:unit.productId,quantity:1,unitPrice:input.amount,unitCost:product.costPrice,total:input.amount}},payments:{create:{amount:input.amount,method:input.method,reference:input.reference?.toUpperCase()}}},include:{saleItems:{select:{id:true}}}});
    await tx.stockUnit.update({where:{id:operation.unitId},data:{status:"SOLD",saleItemId:sale.saleItems[0].id,soldAt:new Date(),location:operation.party}});
    await tx.operation.update({where:{id:operation.id},data:{saleId:sale.id}});
    await snapshotSaleCosts(tx,sale.id);
  }
  const terminal=["COMPLETED","RETURNED","SETTLED","REJECTED"].includes(status);
  const updated=await tx.operation.updateMany({where:{id:operation.id,version:input.version},data:{status,paidAmount,version:{increment:1},proof:input.proof??operation.proof,costAmount:input.costAmount===undefined?undefined:input.action==="VALUE"?input.costAmount:(operation.costAmount??0)+input.costAmount,closedAt:terminal?new Date():null}});
  if(!updated.count)throw new OperationError(409,"This operation changed. Refresh before retrying.");
  await tx.deviceEvent.create({data:{requestKey:input.requestKey,requestHash:hash,branchId:operation.branchId,unitId:operation.unitId,userId:actor.id,kind:`${operation.kind} ${input.action}`,note:input.proof??input.note??input.action,operationId:operation.id,saleId:operation.saleId,amount:input.costAmount}});
  if(input.costAmount && input.action!=="VALUE")await tx.expenseEntry.create({data:{requestKey:input.requestKey,requestHash:hash,branchId:operation.branchId,userId:actor.id,category:operation.kind==="REPAIR"?"REPAIR":operation.kind==="DELIVERY"?"DELIVERY":operation.kind==="RETURN"?"REFUND":"DEVICE_PURCHASE",payee:operation.party,description:`${operation.kind} cost`,amount:input.costAmount,occurredAt:new Date(),reference:input.reference??operation.reference??operation.id,unitId:operation.unitId,operationId:operation.id}});
  return await tx.operation.findUniqueOrThrow({where:{id:operation.id}});
}
export function operationFailure(error:unknown) {
  if(error instanceof OperationError || error instanceof StockUnitError)return {status:error.status,error:error.message};
  if(error instanceof Prisma.PrismaClientKnownRequestError && ["P2002","P2034"].includes(error.code))return {status:409,error:"Another submission changed this record. Refresh and retry using the same request."};
  console.error("Operation transaction failed."); return {status:503,error:"The operation could not be saved. Reconnect and retry; success has not been confirmed."};
}
