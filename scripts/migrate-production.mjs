// Apply only this release's additive migrations, with a private pre-change backup.
import {readFileSync,openSync,closeSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
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
for(const [name,sentinel] of [['20261113120000_device_auth','AuthDevice'],['20261113170000_pwa_operations','Operation']]){
 const body=readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8');const checksum=createHash('sha256').update(body).digest('hex');
 const exists=sql(`SELECT to_regclass('public."${sentinel}"') IS NOT NULL`) === 't';
 if(exists){console.log(`${name}: existing schema detected; leaving unchanged.`);continue;}
 const ownership=name.endsWith('pwa_operations')?['Operation','DeviceEvent','ExpenseEntry','RecurringBill','VariantTarget'].map(table=>`ALTER TABLE "${table}" OWNER TO gadgethub_ops_app;`).join(' ')+' ALTER TYPE "OperationKind" OWNER TO gadgethub_ops_app;':'';
 try{sql(`BEGIN; SELECT pg_advisory_xact_lock(281113); ${body}\n ${ownership} COMMIT;`);}catch(error){
   const detail=String(error.stderr??'').split('\n').find(line=>line.includes('ERROR:'))??'Database rejected the schema change';
   console.error(detail.slice(0,300));throw new Error(`Migration ${name} failed; transaction rolled back. Backup retained.`);
 }
 console.log(`${name}: applied (${checksum.slice(0,12)}).`);
}
for(const [table,column] of [['User','accessExpiresAt'],['AuthDevice','activeUntil'],['SaleItem','totalCost'],['Customer','marketingSource']]){
 if(sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=${literal(table)} AND column_name=${literal(column)}`)!=='1')throw new Error(`Incomplete schema: ${table}.${column}`);
}
console.log('Release schema verified.');
