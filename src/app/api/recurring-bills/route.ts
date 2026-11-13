import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/owner-approval";
import { billInput } from "@/lib/expenses";
import { fingerprint, operationFailure } from "@/lib/operation-store";
import { OperationError } from "@/lib/operations";
export async function POST(request:Request) {
  const parsed=billInput.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"Enter a title, payee, category, whole-shilling amount, and due day."},{status:400});
  try {
    const actor=await requireOwner(request,parsed.data.password);
    if(!actor.branchId)throw new OperationError(403,"Assign a shop first.");
    const {password,...data}=parsed.data;void password;
    const hash=fingerprint({actor:actor.id,data});
    const previous=await prisma.recurringBill.findUnique({where:{requestKey:data.requestKey}});
    if(previous && previous.requestHash!==hash)throw new OperationError(409,"The request key belongs to another bill.");
    const bill=previous??await prisma.recurringBill.create({data:{...data,requestHash:hash,branchId:actor.branchId}});
    return Response.json(bill,{status:201,headers:{"Cache-Control":"no-store"}});
  }catch(error){const failure=operationFailure(error);return Response.json({error:failure.error},{status:failure.status});}
}

export async function PATCH(request:Request) {
  const parsed=z.object({id:z.string().cuid(),active:z.boolean(),password:z.string().min(1).max(256)}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"Select a bill and confirm your password."},{status:400});
  try {
    const actor=await requireOwner(request,parsed.data.password);
    const bill=await prisma.$transaction(async tx=>{
      const previous=await tx.recurringBill.findFirst({where:{id:parsed.data.id,branchId:actor.branchId??""}});
      if(!previous)throw new OperationError(404,"Bill not found in this shop.");
      const updated=await tx.recurringBill.update({where:{id:previous.id},data:{active:parsed.data.active}});
      if(previous.active!==updated.active)await tx.authEvent.create({data:{userId:actor.id,action:"RECURRING_BILL_UPDATED",deviceLabel:`${updated.id}: ${updated.active?"resumed":"paused"}`}});
      return updated;
    });
    return Response.json(bill,{headers:{"Cache-Control":"no-store"}});
  }catch(error){const failure=operationFailure(error);return Response.json({error:failure.error},{status:failure.status});}
}
