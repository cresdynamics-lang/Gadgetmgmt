import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {catalogTick,registerCatalogSources} from "../src/lib/device-catalog/worker";
import {claimCatalogSource,reserveCatalogRequest} from "../src/lib/device-catalog/store";

const url=process.env.CATALOG_TEST_DATABASE_URL||"postgresql://gadgethub:gadgethub@localhost:5432/gadgethub_auth_review";
if(new URL(url).pathname!=="/gadgethub_auth_review"||!["localhost","127.0.0.1"].includes(new URL(url).hostname))throw new Error("Catalog tests require the isolated local review database.");
const db=new PrismaClient({datasourceUrl:url});let now=new Date(Date.now()+5000);
const fixture={key:`review-${Date.now()}`,name:"Fixture catalog phone",type:"iPhone",model:["A-FIXTURE"],identifier:["iPhoneFixture,1"],colors:[{name:"Blue"}]};
const options={now:()=>now,jitter:()=>0,userAgent:"GadgetHubCatalogBot/1.0 (+https://example.test)"};
async function due(){now=new Date(now.getTime()+86400001);await db.deviceCatalogSource.updateMany({data:{enabled:false,leaseToken:null,leaseUntil:null}});await db.deviceCatalogSource.update({where:{id:"appledb"},data:{enabled:true,nextRunAt:now,cooldownUntil:null}});}
async function main(){await registerCatalogSources(db);const sourcesBefore=await db.deviceCatalogSource.findMany();const hostsBefore=await db.deviceCatalogHost.findMany();try{const stockBefore=await db.stockUnit.count(),productsBefore=await db.product.count(),salesBefore=await db.sale.count();await due();
  const claims=await Promise.all(Array.from({length:6},()=>claimCatalogSource(db,now)));assert.equal(claims.filter(Boolean).length,1);await db.deviceCatalogSource.update({where:{id:"appledb"},data:{leaseToken:null,leaseUntil:null}});
  let calls=0;const good:typeof fetch=async()=>{calls++;return Response.json([fixture],{headers:{ETag:'"fixture"'}});};
  assert.equal(await catalogTick(db,{...options,fetcher:good}),"imported");assert.equal(calls,1);const entry=await db.deviceCatalogEntry.findUniqueOrThrow({where:{sourceId_externalId:{sourceId:"appledb",externalId:fixture.key}}});assert.equal(await db.deviceCatalogObservation.count({where:{entryId:entry.id}}),1);
  await due();assert.equal(await catalogTick(db,{...options,fetcher:good}),"imported");assert.equal(await db.deviceCatalogObservation.count({where:{entryId:entry.id}}),1);
  await due();assert.equal(await catalogTick(db,{...options,fetcher:async()=>Response.json([{...fixture,model:["A-CHANGED"]}])}),"imported");assert.equal(await db.deviceCatalogObservation.count({where:{entryId:entry.id}}),2);assert.equal((await db.deviceCatalogIdentifier.findFirstOrThrow({where:{entryId:entry.id,value:"A-FIXTURE"}})).active,false);
  await due();await catalogTick(db,{...options,fetcher:good});assert.equal(await db.deviceCatalogObservation.count({where:{entryId:entry.id}}),3);assert.equal((await db.deviceCatalogIdentifier.findFirstOrThrow({where:{entryId:entry.id,value:"A-FIXTURE"}})).active,true);
  await due();assert.equal(await catalogTick(db,{...options,fetcher:async(_url,init)=>{assert.equal((init?.headers as Record<string,string>)["If-None-Match"],'"fixture"');return new Response(null,{status:304});}}),"unchanged");
  await due();assert.equal(await catalogTick(db,{...options,fetcher:async()=>new Response("busy",{status:429,headers:{"Retry-After":"172800"}})}),"failed");const delayed=await db.deviceCatalogSource.findUniqueOrThrow({where:{id:"appledb"}});assert.ok(delayed.cooldownUntil!.getTime()>=now.getTime()+172800000);assert.equal(await catalogTick(db,{...options,fetcher:good}),"idle");assert.ok((await db.deviceCatalogHost.findUniqueOrThrow({where:{origin:"https://api.appledb.dev"}})).nextAllowedAt>=delayed.cooldownUntil!);
  await due();now=new Date(now.getTime()+86400001);await db.deviceCatalogSource.update({where:{id:"appledb"},data:{nextRunAt:now}});assert.equal(await catalogTick(db,{...options,fetcher:async()=>new Response("forbidden",{status:403})}),"blocked");assert.equal((await db.deviceCatalogSource.findUniqueOrThrow({where:{id:"appledb"}})).enabled,false);
  await due();assert.equal(await catalogTick(db,{...options,fetcher:async()=>Response.json([{invalid:true}])}),"failed");assert.equal((await db.deviceCatalogEntry.findUniqueOrThrow({where:{id:entry.id}})).name,fixture.name);
  const origin="https://budget-fixture.invalid";await db.deviceCatalogHost.upsert({where:{origin},create:{origin,nextAllowedAt:now,windowStartedAt:now},update:{nextAllowedAt:now,windowStartedAt:now,requestCount:0}});const slots=await Promise.all(Array.from({length:5},()=>reserveCatalogRequest(db,origin,now,0)));assert.equal(slots.filter(value=>value===null).length,1);await db.deviceCatalogHost.update({where:{origin},data:{nextAllowedAt:now,requestCount:60,windowStartedAt:now}});assert.equal((await reserveCatalogRequest(db,origin,now,0))?.getTime(),now.getTime()+86400000);
  assert.equal(await db.stockUnit.count(),stockBefore);assert.equal(await db.product.count(),productsBefore);assert.equal(await db.sale.count(),salesBefore);
  console.log("PASS catalog: concurrent leases/budgets; idempotent imports; append-only revisions and reversions; retained old identifiers; conditional caching; persistent Retry-After; 403 stop; malformed-data preservation; daily caps; no stock/product/sale mutations.");
  }finally{
    const own=await db.deviceCatalogEntry.findUnique({where:{sourceId_externalId:{sourceId:"appledb",externalId:fixture.key}}});
    if(own){await db.deviceCatalogObservation.deleteMany({where:{entryId:own.id}});await db.deviceCatalogIdentifier.deleteMany({where:{entryId:own.id}});await db.deviceCatalogEntry.delete({where:{id:own.id}});}
    for(const source of sourcesBefore)await db.deviceCatalogSource.update({where:{id:source.id},data:source});
    for(const host of hostsBefore)await db.deviceCatalogHost.upsert({where:{origin:host.origin},create:host,update:host});
    await db.deviceCatalogHost.deleteMany({where:{origin:{notIn:hostsBefore.map(host=>host.origin)}}});
  }
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
