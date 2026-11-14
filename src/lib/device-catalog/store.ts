import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { CATALOG_SOURCES } from "./adapters";
import { normalizedIdentifier, type CatalogRecord } from "./types";
import { CATALOG_DAILY_REQUEST_LIMIT, CATALOG_MIN_GAP_MS } from "./policy";

export function stableJson(value:unknown):string {if(Array.isArray(value))return "["+value.map(stableJson).join(",")+"]";if(value&&typeof value==="object")return "{"+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+":"+stableJson(item)).join(",")+"}";return JSON.stringify(value)??"null";}
export function recordHash(record:CatalogRecord){return createHash("sha256").update(stableJson(record)).digest("hex");}
export async function registerCatalogSources(db:PrismaClient){
  for(const [id,source] of Object.entries(CATALOG_SOURCES))await db.deviceCatalogSource.upsert({where:{id},create:{id,name:source.name,license:source.license,licenseUrl:source.licenseUrl,refreshSeconds:source.refreshSeconds},update:{name:source.name,license:source.license,licenseUrl:source.licenseUrl}});
}
export async function claimCatalogSource(db:PrismaClient,now=new Date()){
  const candidates=await db.deviceCatalogSource.findMany({where:{enabled:true,nextRunAt:{lte:now},AND:[{OR:[{leaseUntil:null},{leaseUntil:{lte:now}}]},{OR:[{cooldownUntil:null},{cooldownUntil:{lte:now}}]}]},orderBy:{nextRunAt:"asc"},take:5});
  for(const source of candidates){const leaseToken=randomUUID();const claim=await db.deviceCatalogSource.updateMany({where:{id:source.id,enabled:true,nextRunAt:{lte:now},AND:[{OR:[{leaseUntil:null},{leaseUntil:{lte:now}}]},{OR:[{cooldownUntil:null},{cooldownUntil:{lte:now}}]}]},data:{leaseToken,leaseUntil:new Date(now.getTime()+300000),status:"RUNNING"}});if(claim.count)return {...source,leaseToken};}
  return null;
}
export async function reserveCatalogRequest(db:PrismaClient,origin:string,now:Date,jitter:number){
  await db.deviceCatalogHost.upsert({where:{origin},create:{origin,windowStartedAt:now,nextAllowedAt:now},update:{}});
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT origin FROM "DeviceCatalogHost" WHERE origin=${origin} FOR UPDATE`;
    const host=await tx.deviceCatalogHost.findUniqueOrThrow({where:{origin}});
    if(host.nextAllowedAt>now)return host.nextAllowedAt;
    const newWindow=now.getTime()-host.windowStartedAt.getTime()>=86400000;
    if(!newWindow&&host.requestCount>=CATALOG_DAILY_REQUEST_LIMIT)return new Date(host.windowStartedAt.getTime()+86400000);
    await tx.deviceCatalogHost.update({where:{origin},data:{nextAllowedAt:new Date(now.getTime()+CATALOG_MIN_GAP_MS+Math.max(0,jitter)),requestCount:newWindow?1:host.requestCount+1,...(newWindow?{windowStartedAt:now}:{})}});
    return null;
  });
}
export async function persistCatalogRecord(db:PrismaClient,sourceId:string,leaseToken:string,record:CatalogRecord,now=new Date()){
  const contentHash=recordHash(record);const {identifiers,...facts}=record;
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "DeviceCatalogSource" WHERE id=${sourceId} FOR UPDATE`;
    const source=await tx.deviceCatalogSource.findFirst({where:{id:sourceId,enabled:true,leaseToken,leaseUntil:{gt:now}}});
    if(!source)throw new Error("Source lease ended; import stopped.");
    const existing=await tx.deviceCatalogEntry.findUnique({where:{sourceId_externalId:{sourceId,externalId:record.externalId}}});
    if(existing?.contentHash===contentHash){await tx.deviceCatalogEntry.update({where:{id:existing.id},data:{lastSeenAt:now}});return {created:0,changed:0};}
    const values={...facts,specifications:facts.specifications as Prisma.InputJsonObject,contentHash,lastSeenAt:now,changedAt:now};
    const entry=existing?await tx.deviceCatalogEntry.update({where:{id:existing.id},data:values}):await tx.deviceCatalogEntry.create({data:{...values,sourceId,firstSeenAt:now}});
    await tx.deviceCatalogIdentifier.updateMany({where:{entryId:entry.id},data:{active:false}});
    for(const identifier of identifiers){const normalizedValue=identifier.kind==="GTIN"?identifier.value.padStart(14,"0"):normalizedIdentifier(identifier.value);await tx.deviceCatalogIdentifier.upsert({where:{entryId_kind_normalizedValue:{entryId:entry.id,kind:identifier.kind,normalizedValue}},create:{entryId:entry.id,...identifier,normalizedValue},update:{value:identifier.value,active:true}});}
    await tx.deviceCatalogObservation.create({data:{entryId:entry.id,contentHash,snapshot:record as unknown as Prisma.InputJsonObject,observedAt:now}});
    await tx.deviceCatalogSource.update({where:{id:sourceId},data:{discoveredCount:{increment:existing?0:1},changedCount:{increment:existing?1:0}}});
    return {created:existing?0:1,changed:existing?1:0};
  });
}
