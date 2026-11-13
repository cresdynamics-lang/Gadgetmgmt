import { prisma } from "@/lib/prisma";
export async function ownedStockValuation(scope:{branchId?:string}) {
  const [items,units]=await Promise.all([
    prisma.inventoryItem.findMany({where:scope,select:{id:true,branchId:true,productId:true,stockOnHand:true,product:{select:{costPrice:true}}}}),
    prisma.stockUnit.findMany({where:{...scope,status:{in:["IN_STOCK","RESERVED","IN_REPAIR","WITH_PARTNER"]}},select:{id:true,branchId:true,productId:true,status:true,ownership:true,product:{select:{costPrice:true}}}}),
  ]);
  const entries=await prisma.expenseEntry.findMany({where:{unitId:{in:units.map(unit=>unit.id)},category:{in:["DEVICE_PURCHASE","REPAIR","FREIGHT"]}},orderBy:{occurredAt:"desc"}});
  const reversed=new Set(entries.flatMap(entry=>entry.reversesId?[entry.reversesId]:[]));
  const known=new Map<string,number>(),listed=new Map<string,number>();let awayValue=0,awayCount=0;
  for(const unit of units) {
    const key=`${unit.branchId}:${unit.productId}`;const onHand=["IN_STOCK","RESERVED"].includes(unit.status);
    if(onHand)known.set(key,(known.get(key)??0)+1);
    if(unit.ownership!=="SHOP")continue;
    const costs=entries.filter(entry=>entry.unitId===unit.id);
    const purchase=costs.find(entry=>entry.category==="DEVICE_PURCHASE"&&entry.amount>0&&entry.description!=="Borrowed-device supplier settlement");
    const repairs=costs.filter(entry=>["REPAIR","FREIGHT"].includes(entry.category)&&(!purchase||entry.occurredAt>=purchase.occurredAt)).reduce((sum,entry)=>sum+entry.amount,0);
    const base=purchase?(reversed.has(purchase.id)?0:purchase.amount):unit.product.costPrice;
    const value=Math.max(0,base+repairs);
    if(onHand)listed.set(key,(listed.get(key)??0)+value);else{awayValue+=value;awayCount++;}
  }
  const byItem:Record<string,number|null>={};let total=awayValue;let mismatches=0;
  for(const item of items) {
    const key=`${item.branchId}:${item.productId}`;const identified=known.get(key)??0;
    if(identified>item.stockOnHand){byItem[item.id]=null;mismatches++;continue;}
    const value=(listed.get(key)??0)+(item.stockOnHand-identified)*item.product.costPrice;
    byItem[item.id]=value;total+=value;
  }
  return {byItem,awayValue,awayCount,mismatches,totalValue:mismatches?null:total};
}
