// Apply only this release's additive migrations, with a private pre-change backup.
import {readFileSync,openSync,closeSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
const env=Object.fromEntries(readFileSync('.runtime.env','utf8').split('\n').filter(line=>line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const url=new URL(env.DATABASE_URL),database=decodeURIComponent(url.pathname.slice(1));
if(!['localhost','127.0.0.1'].includes(url.hostname)||database!=='gadgethub_ops')throw new Error('Unexpected migration target');
const sql=query=>execFileSync('sudo',['-n','-u','postgres','psql','-X','-At','-v','ON_ERROR_STOP=1','-d',database],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const literal=value=>"'"+value.replaceAll("'","''")+"'";
if(sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()")!=='gadgethub_ops_app')throw new Error('Unexpected database ownership');
mkdirSync('backups',{recursive:true,mode:0o700});
const backup=`backups/pre-pwa-${new Date().toISOString().replaceAll(':','-')}.dump`,fd=openSync(backup,'wx',0o600);
try{execFileSync('sudo',['-n','-u','postgres','pg_dump','-Fc',database],{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}
console.log('Private pre-migration database backup created.');
const migrations=[
 ['20261012143000_pos_payments_and_catalog_idempotency','SalePayment'],
 ['20261012160000_layaway_orders','LayawayOrder'],
 ['20261013103000_payment_requests_and_notifications','PaymentRequest'],
 ['20261013120000_credit_agreements','CreditInstallment'],
 ['20261014103000_payer_link_sms_target','PaymentRequest','targetPhone'],
 ['20261014110000_collections_job_runs','ScheduledJobRun'],
 ['20261014110100_stk_callback_reconciliation','PaymentRequest','receivedAmount'],
 ['20261014120000_credit_autopilot_foundation','CreditPlan','kind'],
 ['20261110120000_staff_messages_and_alerts','StaffAlert'],
 ['20261110150000_notification_sender_and_idempotency','StaffAlert','requestKey'],
 ['20261110170000_company_email_settings','NotificationEmailSettings'],
 ['20261111110000_stock_units','StockUnit'],
 ['20261111120000_notification_rate_limits','NotificationRateLimit'],
 ['20261113120000_device_auth','AuthDevice'],
 ['20261113170000_pwa_operations','Operation'],
 ['20261113180000_role_entitlement_baseline','RoleEntitlement'],
];
for(const [name,sentinel,column] of migrations){
 const body=readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8');const checksum=createHash('sha256').update(body).digest('hex');
 const exists=column?sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=${literal(sentinel)} AND column_name=${literal(column)}`)==='1':sql(`SELECT to_regclass('public."${sentinel}"') IS NOT NULL`) === 't';
 if(exists){console.log(`${name}: existing schema detected; leaving unchanged.`);continue;}
 const ownership=[...body.matchAll(/CREATE TABLE "([^";]+)"/g)].map(([,table])=>`ALTER TABLE "${table}" OWNER TO gadgethub_ops_app;`).join(' ')+[...body.matchAll(/CREATE TYPE "([^";]+)"/g)].map(([,type])=>`ALTER TYPE "${type}" OWNER TO gadgethub_ops_app;`).join(' ');
 try{sql(`BEGIN; SELECT pg_advisory_xact_lock(281113); ${body}\n ${ownership} COMMIT;`);}catch(error){
   const detail=String(error.stderr??'').split('\n').find(line=>line.includes('ERROR:'))??'Database rejected the schema change';
   console.error(detail.slice(0,300));throw new Error(`Migration ${name} failed; transaction rolled back. Backup retained.`);
 }
 console.log(`${name}: applied (${checksum.slice(0,12)}).`);
}
for(const [table,column] of [['User','accessExpiresAt'],['AuthDevice','activeUntil'],['SaleItem','totalCost'],['Customer','marketingSource']]){
 if(sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=${literal(table)} AND column_name=${literal(column)}`)!=='1')throw new Error(`Incomplete schema: ${table}.${column}`);
}
const columns=JSON.parse(sql("SELECT json_agg(json_build_object('table',table_name,'column',column_name)) FROM information_schema.columns WHERE table_schema='public'"));
const available=new Set(columns.map(row=>`${row.table}.${row.column}`));
const missing=Prisma.dmmf.datamodel.models.flatMap(model=>model.fields.filter(field=>field.kind!=='object'&&!available.has(`${model.dbName??model.name}.${field.dbName??field.name}`)).map(field=>`${model.name}.${field.name}`));
if(missing.length)throw new Error(`Production schema is missing required columns: ${missing.join(', ')}`);
console.log('All application model columns verified against production schema.');
