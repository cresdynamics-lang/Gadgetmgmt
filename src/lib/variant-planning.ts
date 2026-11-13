export function variantIdentity(productId:string,color:string|null,storage:string|null) {return `${productId}|${(color||"Not recorded").trim().toLowerCase()}|${(storage||"Not recorded").trim().toUpperCase()}`;}
export function restockAdvice(available:number,sold:number,target:number|null,windowDays=30) {
  const daily=sold>0?sold/windowDays:null;
  return {dailySales:daily,daysCover:daily?Math.round(available/daily*10)/10:null,suggested:target===null?null:Math.max(0,target-available),reason:target===null?"Set an approved variant target to calculate a restock quantity.":available<target?`${available} available against the configured target of ${target}.`:"Availability meets the configured target."};
}
