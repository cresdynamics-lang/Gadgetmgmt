import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/owner-approval";
import { expenseInput } from "@/lib/expenses";
import { OperationError } from "@/lib/operations";
import { fingerprint, operationFailure } from "@/lib/operation-store";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET() {
  try {
    const actor=await requireOwner();
    const [entries,bills,units]=await Promise.all([
      prisma.expenseEntry.findMany({orderBy:{occurredAt:"desc"},take:250}),
      prisma.recurringBill.findMany({where:{branchId:actor.branchId??""},orderBy:{dueDay:"asc"}}),
      prisma.stockUnit.findMany({where:{branchId:actor.branchId??""},select:{id:true,imei:true,serialNumber:true,product:{select:{name:true}}},take:500}),
    ]);
    return json({entries,bills,units});
  }catch(error){const failure=operationFailure(error);return json({error:failure.error},failure.status);}
}
export async function POST(request:Request) {
  const input=expenseInput.safeParse(await request.json().catch(()=>null));
  if(!input.success)return json({error:input.error.issues[0]?.message??"Check the expense details."},400);
  try {
    const actor=await requireOwner(request,input.data.password);
    if(!actor.branchId)throw new OperationError(403,"Assign a shop first.");
    const {password,...data}=input.data;void password;
    if(new Date(data.occurredAt)>new Date())throw new OperationError(400,"Record actual payments, not future expenses. Use a recurring bill for future obligations.");
    const requestHash=fingerprint({actor:actor.id,data});
    const result=await prisma.$transaction(async tx=>{
      const previous=await tx.expenseEntry.findUnique({where:{requestKey:data.requestKey}});
      if(previous){if(previous.requestHash!==requestHash)throw new OperationError(409,"The request key belongs to different details.");return previous;}
      let amount=data.amount;
      let category:string=data.category;
      let unitId=data.unitId;
      let payee=data.payee;
      if(data.reversesId) {
        const original=await tx.expenseEntry.findUnique({where:{id:data.reversesId}});
        if(!original || original.amount<=0 || await tx.expenseEntry.findUnique({where:{reversesId:original.id}}))throw new OperationError(409,"Only an unreversed positive entry can be reversed.");
        if(original.branchId!==actor.branchId)throw new OperationError(400,"Select this entry’s shop before reversing it.");
        if(data.amount!==original.amount)throw new OperationError(400,"A reversal must match the original amount; record a corrected entry separately.");
        amount=-original.amount;category=original.category;unitId=original.unitId??undefined;payee=original.payee;
      }
      if(unitId && !await tx.stockUnit.findFirst({where:{id:unitId,branchId:actor.branchId!}}))throw new OperationError(400,"The device is not at this shop.");
      if(data.billId) {
        const bill=await tx.recurringBill.findFirst({where:{id:data.billId,branchId:actor.branchId!,active:true}});
        if(!bill || !data.period || bill.amount!==amount || bill.category!==category)throw new OperationError(400,"The bill, period and payment amount must match the configured obligation.");
      }
      const entry=await tx.expenseEntry.create({data:{requestKey:data.requestKey,requestHash,branchId:actor.branchId!,userId:actor.id,category,payee,description:data.description,amount,occurredAt:new Date(data.occurredAt),reference:data.reference,unitId,billId:data.billId,period:data.period,reversesId:data.reversesId}});
      if(unitId)await tx.deviceEvent.create({data:{branchId:actor.branchId!,unitId,userId:actor.id,kind:`${category} recorded`,note:"Owner financial entry",amount}});
      await tx.authEvent.create({data:{userId:actor.id,action:data.reversesId?"Expense reversed":"Expense recorded",deviceLabel:"Owner finance"}});
      return entry;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return json(result,201);
  }catch(error){const failure=operationFailure(error);return json({error:failure.error},failure.status);}
}
