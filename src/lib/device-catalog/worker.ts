import { catalogFetch } from "./http";
import { randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CATALOG_SOURCES, isCatalogSource, parseSource, sourceRequest } from "./adapters";
import { boundedJson, nextFailureAt } from "./policy";
import { claimCatalogSource, persistCatalogRecord, registerCatalogSources, reserveCatalogRequest } from "./store";

export function catalogUserAgent(env:NodeJS.ProcessEnv=process.env){
  if(env.CATALOG_USER_AGENT){const match=env.CATALOG_USER_AGENT.match(/^GadgetHubCatalogBot\/[\d.]+ \(\+(https:\/\/[^\s]+)\)$/);if(!match)throw new Error("CATALOG_USER_AGENT must identify GadgetHubCatalogBot and a public HTTPS contact URL.");const contact=new URL(match[1]);if(contact.username||contact.password||contact.search||contact.hash||contact.hostname==="localhost")throw new Error("Catalog contact URLs cannot contain credentials or private query parameters.");return env.CATALOG_USER_AGENT;}
  const url=new URL(env.APP_BASE_URL||env.NEXTAUTH_URL||"https://development.gadgethubke.com");
  if(url.protocol!=="https:"||url.username||url.password||url.hostname==="localhost")throw new Error("Catalog requests require a public HTTPS contact URL.");
  return `GadgetHubCatalogBot/1.0 (+${url.origin})`;
}
export async function catalogHeartbeat(db:PrismaClient,errorMessage:string|null=null,paused=false){const now=new Date();const status=errorMessage?"FAILED":paused?"PAUSED":"SUCCEEDED";await db.scheduledJobRun.upsert({where:{id:"device-catalog-heartbeat"},create:{id:"device-catalog-heartbeat",jobName:"device-catalog-worker",status,finishedAt:now,errorMessage},update:{status,finishedAt:now,errorMessage}});}
type WorkerOptions={fetcher?:typeof fetch;now?:()=>Date;jitter?:()=>number;userAgent?:string;signal?:AbortSignal};
export async function catalogTick(db:PrismaClient,options:WorkerOptions={}){
  const clock=options.now??(()=>new Date()),jitter=options.jitter??(()=>randomInt(0,15001));const source=await claimCatalogSource(db,clock());if(!source)return "idle";
  const owned={id:source.id,leaseToken:source.leaseToken};let httpStatus:number|null=null,retryAfter:string|null=null;
  try{
    if(!isCatalogSource(source.id))throw new Error("Unknown catalog source. Add a reviewed adapter before enabling it.");
    const url=sourceRequest(source.id,source.cursor);
    if(url.origin!==CATALOG_SOURCES[source.id].origin||url.protocol!=="https:"||url.username||url.password)throw new Error("Source URL is outside its approved API origin.");
    const waitUntil=await reserveCatalogRequest(db,url.origin,clock(),jitter());
    if(waitUntil){await db.deviceCatalogSource.updateMany({where:owned,data:{nextRunAt:waitUntil,leaseToken:null,leaseUntil:null,status:"WAITING"}});return "waiting";}
    const headers:Record<string,string>={"User-Agent":options.userAgent??catalogUserAgent(),Accept:"application/json, application/sparql-results+json"};
    if(source.id==="appledb"&&source.etag)headers["If-None-Match"]=source.etag;
    if(source.id==="appledb"&&source.lastModified)headers["If-Modified-Since"]=source.lastModified;
    const response=await (options.fetcher??catalogFetch)(url,{headers,redirect:"error",signal:options.signal?AbortSignal.any([AbortSignal.timeout(20000),options.signal]):AbortSignal.timeout(20000)});
    httpStatus=response.status;retryAfter=response.headers.get("retry-after");
    if(response.status===304&&!(source.id==="appledb"&&source.lastSuccessAt&&(source.etag||source.lastModified)))throw new Error("Unexpected cache response; previous catalog data was preserved.");
    if(response.status===304){await db.deviceCatalogSource.updateMany({where:owned,data:{lastCheckedAt:clock(),lastSuccessAt:clock(),lastHttpStatus:304,status:"SUCCEEDED",failureCount:0,lastError:null,nextRunAt:new Date(clock().getTime()+source.refreshSeconds*1000),leaseToken:null,leaseUntil:null}});return "unchanged";}
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new Error(`Source returned HTTP ${response.status}.`);}
    const page=parseSource(source.id,await boundedJson(response),source.cursor);
    for(const record of page.records){if(options.signal?.aborted)throw new Error("Worker stopped.");await persistCatalogRecord(db,source.id,source.leaseToken,record,clock());}
    const nextRunAt=new Date(clock().getTime()+(page.complete?Math.max(86400,source.refreshSeconds):Math.max(60,page.nextDelaySeconds??source.refreshSeconds))*1000);
    await db.deviceCatalogSource.updateMany({where:owned,data:{lastCheckedAt:clock(),lastSuccessAt:clock(),lastHttpStatus:response.status,status:"SUCCEEDED",failureCount:0,lastError:null,cooldownUntil:null,etag:source.id==="appledb"?response.headers.get("etag"):null,lastModified:source.id==="appledb"?response.headers.get("last-modified"):null,cursor:page.complete?null:page.nextCursor,nextRunAt,rejectedCount:{increment:page.rejected},leaseToken:null,leaseUntil:null}});
    return "imported";
  }catch(error){
    if(options.signal?.aborted&&(httpStatus===null||httpStatus>=200&&httpStatus<300)){await db.deviceCatalogSource.updateMany({where:owned,data:{status:"WAITING",leaseToken:null,leaseUntil:null}});return "stopped";}
    const now=clock();const until=nextFailureAt(httpStatus,retryAfter,source.failureCount,now.getTime(),jitter());
    if(isCatalogSource(source.id))await db.deviceCatalogHost.updateMany({where:{origin:CATALOG_SOURCES[source.id].origin,nextAllowedAt:{lt:until}},data:{nextAllowedAt:until}});
    const blocked=httpStatus===401||httpStatus===403;
    await db.deviceCatalogSource.updateMany({where:owned,data:{lastCheckedAt:now,lastHttpStatus:httpStatus,status:blocked?"BLOCKED":"FAILED",lastError:error instanceof Error?error.message.slice(0,250):"Catalog request failed.",failureCount:{increment:1},cooldownUntil:until,nextRunAt:until,leaseToken:null,leaseUntil:null,...(blocked?{enabled:false}:{})}});
    return blocked?"blocked":"failed";
  }
}
export {registerCatalogSources};
