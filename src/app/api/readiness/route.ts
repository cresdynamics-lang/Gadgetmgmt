import { requireOwner } from "@/lib/owner-approval";
import { getCompanyEmailSettings } from "@/lib/email-settings";
import { prisma } from "@/lib/prisma";
import { operationFailure } from "@/lib/operation-store";
export async function GET() {
  try {
    await requireOwner();
    const email=await getCompanyEmailSettings();
    const heartbeat=await prisma.scheduledJobRun.findUnique({where:{id:"staff-notifications-heartbeat"},select:{finishedAt:true,status:true}});
    const failedReceipts=await prisma.customerNotification.count({where:{kind:"SALE_RECEIPT",status:"FAILED"}});
    const pendingReceipts=await prisma.customerNotification.count({where:{kind:"SALE_RECEIPT",status:{in:["QUEUED","PROCESSING"]}}});
    const canonical=process.env.APP_BASE_URL||process.env.NEXTAUTH_URL||"";
    return Response.json({emailConfigured:email.configured,emailTestDomain:email.testMode,pushConfigured:Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT),httpsConfigured:canonical.startsWith("https://"),workerCurrent:Boolean(heartbeat?.finishedAt&&Date.now()-heartbeat.finishedAt.getTime()<120000&&heartbeat.status==="SUCCEEDED"),lastWorkerHeartbeat:heartbeat?.finishedAt,pendingReceipts,failedReceipts,deliveryVerified:false},{headers:{"Cache-Control":"no-store"}});
  }catch(error){const failure=operationFailure(error);return Response.json({error:failure.error},{status:failure.status});}
}
