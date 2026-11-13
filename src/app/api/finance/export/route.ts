import { requireOwner } from "@/lib/owner-approval";
import { prisma } from "@/lib/prisma";
import { csvCell } from "@/lib/operations";
import { operationFailure } from "@/lib/operation-store";
export async function POST(request:Request) {
  try {
    const body=await request.json().catch(()=>({}));
    const actor=await requireOwner(request,typeof body.password==="string"?body.password:undefined);
    const entries=await prisma.expenseEntry.findMany({orderBy:{occurredAt:"desc"}});
    const csv=[['Date','Category','Payee','Description','Amount KES','Reference','Reverses entry'],...entries.map(entry=>[entry.occurredAt.toISOString(),entry.category,entry.payee,entry.description,entry.amount,entry.reference,entry.reversesId])].map(row=>row.map(csvCell).join(',')).join('\r\n');
    await prisma.authEvent.create({data:{userId:actor.id,action:"Financial entries exported",deviceLabel:"Owner finance"}});
    return new Response('\uFEFF'+csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=gadgethub-expenses.csv","Cache-Control":"no-store"}});
  }catch(error){const failure=operationFailure(error);return Response.json({error:failure.error},{status:failure.status});}
}
