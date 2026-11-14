import { PrismaClient } from "@prisma/client";
import { setTimeout as wait } from "node:timers/promises";
import { catalogHeartbeat, catalogTick, catalogUserAgent, registerCatalogSources } from "../src/lib/device-catalog/worker";

const db=new PrismaClient({datasourceUrl:process.env.CATALOG_DATABASE_URL||process.env.DATABASE_URL});const abort=new AbortController();
process.once("SIGTERM",()=>abort.abort());process.once("SIGINT",()=>abort.abort());
async function main(){
  let lastProgress=Date.now(),lastHeartbeat=Date.now();
  const beat=async()=>{await catalogHeartbeat(db,null,process.env.CATALOG_DISCOVERY_ENABLED==="false");lastHeartbeat=Date.now();};
  const heartbeat=setInterval(()=>{void beat().catch(()=>console.error("Device catalog heartbeat failed."));},30000);
  const watchdog=setInterval(()=>{if(Date.now()-lastProgress>300000||Date.now()-lastHeartbeat>90000){console.error("Catalog worker stalled; exiting for supervisor restart.");process.exit(1);}},30000);
  try{await registerCatalogSources(db);catalogUserAgent();await beat();do{if(process.env.CATALOG_DISCOVERY_ENABLED!=="false")await catalogTick(db,{signal:abort.signal});lastProgress=Date.now();if(process.argv.includes("--once"))break;await wait(3000,undefined,{signal:abort.signal}).catch(()=>{});}while(!abort.signal.aborted);}finally{clearInterval(heartbeat);clearInterval(watchdog);}
}
main().catch(async()=>{console.error("Device catalog worker stopped. Check its source status and database connection.");await catalogHeartbeat(db,"Worker stopped unexpectedly.").catch(()=>{});process.exitCode=1;}).finally(()=>db.$disconnect());
