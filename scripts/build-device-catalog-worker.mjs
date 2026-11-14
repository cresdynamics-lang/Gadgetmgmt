import {cpSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root='.catalog-context';mkdirSync(`${root}/worker`,{recursive:true});
for(const [entry,out]of [['scripts/device-catalog-worker.ts','device-catalog'],['scripts/device-catalog-health.ts','device-catalog-health']])execFileSync('node_modules/.bin/esbuild',[entry,'--bundle','--platform=node','--external:@prisma/client',`--outfile=${root}/worker/${out}.cjs`],{stdio:'inherit'});
for(const folder of ['@prisma/client','.prisma/client']){mkdirSync(`${root}/node_modules/${folder}`,{recursive:true});cpSync(`node_modules/${folder}`,`${root}/node_modules/${folder}`,{recursive:true});}
mkdirSync(`${root}/licenses`,{recursive:true});
cpSync('node_modules/zod/LICENSE',`${root}/licenses/zod-MIT.txt`);
cpSync('docs/licenses/appledb-MIT.txt',`${root}/licenses/appledb-MIT.txt`);
cpSync('Dockerfile.catalog',`${root}/Dockerfile`);
console.log('Standalone catalog worker built; no web server or AI runtime is included.');
