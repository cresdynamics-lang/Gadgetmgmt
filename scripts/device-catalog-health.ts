import { PrismaClient } from "@prisma/client";
const db=new PrismaClient({datasourceUrl:process.env.CATALOG_DATABASE_URL||process.env.DATABASE_URL});
async function main(){const heartbeat=await db.scheduledJobRun.findUnique({where:{id:"device-catalog-heartbeat"},select:{status:true,finishedAt:true}});if(!heartbeat?.finishedAt||Date.now()-heartbeat.finishedAt.getTime()>90000||!["SUCCEEDED","PAUSED"].includes(heartbeat.status))throw new Error("Catalog worker heartbeat is stale.");console.log(`Catalog worker heartbeat current (${heartbeat.status.toLowerCase()}).`);}
main().catch(()=>{console.error("Catalog worker health check failed.");process.exitCode=1;}).finally(()=>db.$disconnect());
