import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function worker(active) {
  const handlers={},cached=[],removed=[];let skipped=0,claimed=0,fetches=0;
  const scope={self:{registration:{active},location:{origin:'https://gadget.test'},clients:{claim:async()=>{claimed++;}},skipWaiting(){skipped++;},addEventListener(name,handler){handlers[name]=handler;}},caches:{open:async()=>({addAll:async paths=>cached.push(...paths)}),keys:async()=>['gadgethub-notifications-static-v1','gadgethub-notifications-static-v2','gadgethub-notifications-static-v3','other-app'],delete:async key=>removed.push(key),match:async()=>new Response('public offline')},URL,Response,fetch:async()=>{fetches++;throw new Error('offline');}};
  vm.runInNewContext(readFileSync(new URL('../../public/notifications-sw.js',import.meta.url),'utf8'),scope);
  return {handlers,cached,removed,get skipped(){return skipped;},get claimed(){return claimed;},get fetches(){return fetches;}};
}
test('updates wait for explicit restart while a first installation takes control',async()=>{
  const update=worker({});let installed;update.handlers.install({waitUntil:p=>installed=p});await installed;assert.equal(update.skipped,0);
  update.handlers.message({data:{type:'UNRELATED'}});assert.equal(update.skipped,0);update.handlers.message({data:{type:'APPLY_UPDATE'}});assert.equal(update.skipped,1);
  const first=worker(null);first.handlers.install({waitUntil:()=>{}});assert.equal(first.skipped,1);
});
test('activation removes only obsolete GadgetHub public caches',async()=>{
  const state=worker({});let activated;state.handlers.activate({waitUntil:p=>activated=p});await activated;assert.deepEqual(state.removed,['gadgethub-notifications-static-v1','gadgethub-notifications-static-v2']);assert.equal(state.claimed,1);
});
test('authenticated API requests and mutations are never intercepted or stored',async()=>{
  const state=worker({});let install;state.handlers.install({waitUntil:p=>install=p});await install;
  assert.deepEqual(state.cached,['/notifications-offline.html','/notifications-icon-192.png','/notifications-icon-512.png']);
  for(const [url,method] of [['/api/finance/export','POST'],['/api/operations','GET'],['/api/customers','GET']])state.handlers.fetch({request:{url:'https://gadget.test'+url,method,mode:'cors'},respondWith:()=>assert.fail('Protected data was intercepted')});
  let navigation;state.handlers.fetch({request:{url:'https://gadget.test/finance',method:'GET',mode:'navigate'},respondWith:p=>navigation=p});assert.equal(await(await navigation).text(),'public offline');assert.equal(state.fetches,1);
});
