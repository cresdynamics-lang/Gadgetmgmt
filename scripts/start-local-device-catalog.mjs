// Local-development service only. Production uses the reviewed deployment migration workflow.
import {loadEnvFile} from 'node:process';
import {mkdirSync,readFileSync,writeFileSync,chmodSync,openSync,closeSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
try{loadEnvFile('.env');}catch{}
const database=process.env.DATABASE_URL;if(!database)throw new Error('Set DATABASE_URL for the local app.');
const target=new URL(database);if(!['localhost','127.0.0.1'].includes(target.hostname)||target.pathname!=='/gadgethub')throw new Error('This start command only supports the local gadgethub development database. Production must use the migration/deployment workflow.');
process.umask(0o077);mkdirSync('.catalog-state',{recursive:true,mode:0o700});
const db=new PrismaClient({datasourceUrl:database});
try{
  const rows=await db.$queryRaw`SELECT to_regclass('public."DeviceCatalogSource"')::text AS name`;
  if(!rows[0]?.name){
    const path=`.catalog-state/pre-catalog-${Date.now()}.dump`,fd=openSync(path,'wx',0o600);
    try{execFileSync('docker',['exec','gadgetmgmt-postgres-1','pg_dump','-Fc','-U',decodeURIComponent(target.username),'-d','gadgethub'],{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}
    console.log('Private local-development database backup created.');
    writeFileSync('.catalog-state/migration.sql','BEGIN;\n'+readFileSync('prisma/migrations/20261114140000_device_catalog/migration.sql','utf8')+'\nCOMMIT;\n',{mode:0o600});
    execFileSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--schema','prisma/schema.prisma','--file','.catalog-state/migration.sql'],{env:{...process.env,DATABASE_URL:database},stdio:'inherit'});
  }
  const workerDatabase=process.env.CATALOG_DATABASE_URL||database;const workerTarget=new URL(workerDatabase);
  if(workerTarget.hostname!==target.hostname||workerTarget.pathname!==target.pathname)throw new Error('The worker must target the same local app database.');
  const agent=process.env.CATALOG_USER_AGENT||'GadgetHubCatalogBot/1.0 (+https://development.gadgethubke.com)';
  if(/[\r\n]/.test(workerDatabase+agent))throw new Error('Invalid worker environment.');
  writeFileSync('.catalog-state/worker.env',`DATABASE_URL=${workerDatabase}\nCATALOG_USER_AGENT=${agent}\nCATALOG_DISCOVERY_ENABLED=true\n`,{mode:0o600});chmodSync('.catalog-state/worker.env',0o600);
  // Explicit first-run open-data sources; later pauses/blocks are never re-enabled by restart.
  for(const source of [{id:'appledb',name:'AppleDB',license:'MIT',licenseUrl:'https://github.com/littlebyteorg/appledb/blob/main/LICENSE',refreshSeconds:86400},{id:'wikidata',name:'Wikidata · Samsung',license:'CC0-1.0',licenseUrl:'https://www.wikidata.org/wiki/Wikidata:Licensing',refreshSeconds:900}])await db.deviceCatalogSource.upsert({where:{id:source.id},create:{...source,enabled:true,status:'WAITING'},update:{}});
}finally{await db.$disconnect();}
execFileSync(process.execPath,['scripts/build-device-catalog-worker.mjs'],{stdio:'inherit'});
execFileSync('docker',['compose','-f','compose.catalog.yaml','up','-d','--build'],{stdio:'inherit'});
console.log('Catalog collection runs independently against the local app database. Use docker compose -f compose.catalog.yaml ps/logs to monitor it.');
