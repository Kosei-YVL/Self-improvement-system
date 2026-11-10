import assert from 'node:assert/strict';
import { CloudStore } from '../web/cloud-store.mjs';
import { blankData } from '../web/core.mjs';
const originalFetch=globalThis.fetch;
const stored=new Map([['tsumikasane-cloud-meta',JSON.stringify({revision:4,dirty:false})]]),statuses=[];
let conflict=null;
const cloud=new CloudStore({read:key=>stored.get(key),write:(key,value)=>stored.set(key,value),onData:()=>{},onStatus:status=>statuses.push(status),onConflict:value=>conflict=value});
try{
  const cached=blankData();cached.reflections['2026-10-18']='以前に保存した記録';
  globalThis.fetch=async()=>{throw Error('offline');};
  await cloud.init(cached);assert.equal(cloud.ready,true);assert.equal(cloud.revision,4);
  const edited=structuredClone(cached);edited.reflections['2026-10-18']='オフライン再起動後の記録';
  cloud.schedule(edited);clearTimeout(cloud.timer);await cloud.flush();assert.equal(conflict,null);
  let sent;
  globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({revision:5,writeId:sent.writeId});};
  await cloud.flush();assert.equal(sent.expectedRevision,4);assert.deepEqual(sent.data,edited);assert.equal(cloud.revision,5);assert.equal(statuses.at(-1),'クラウドに保存済み');assert.equal(conflict,null);
  // A real edit from another device still requires review rather than overwrite.
  const remote=structuredClone(edited);remote.reflections['2026-10-18']='別端末からの記録';
  cloud.schedule(edited);clearTimeout(cloud.timer);
  globalThis.fetch=async(_url,options)=>options?.method==='POST'?Response.json({error:'revision_conflict'},{status:409}):Response.json({data:remote,revision:6});
  await cloud.flush();assert.ok(conflict);assert.deepEqual(conflict.local,edited);assert.deepEqual(conflict.remote,remote);
  console.log('Offline cloud checks passed: restart preserves cached revision, reconnect saves without a false conflict, genuine concurrent edits require review.');
}finally{clearTimeout(cloud.timer);globalThis.fetch=originalFetch;}
