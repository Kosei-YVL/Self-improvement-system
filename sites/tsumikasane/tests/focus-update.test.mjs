import assert from 'node:assert/strict';
import {mkdtemp,cp,copyFile,writeFile,readFile,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {applyUpdate} from '../scripts/update-focus.mjs';
import {readConfig,ensureServer,stopServer,probe} from '../scripts/focus-windows-launcher.mjs';
import {blankData} from '../web/core.mjs';
import {shared,keyMaterial,encryptShared,decryptShared} from '../web/focus-sync-model.mjs';
const root=resolve(import.meta.dirname,'..'),sha=v=>createHash('sha256').update(v).digest('hex'),temp=await mkdtemp(join(tmpdir(),'focus-patch-'));
let config;
async function port(){const server=createServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;await new Promise(done=>server.close(done));return port;}
async function fixturePackage(directory,{broken=false}={}){
 const payload=resolve(directory,'payload');await cp(resolve(root,'focus-sync'),payload,{recursive:true});if(broken)await writeFile(resolve(payload,'server.mjs'),'throw Error("synthetic bad update");');
 const files=[];
 async function collect(path){for(const entry of await readdir(path,{withFileTypes:true})){const full=resolve(path,entry.name);if(entry.isDirectory())await collect(full);else{const name=full.slice(payload.length+1).replaceAll('\\','/');files.push({scope:'app',path:name,source:name,sha256:sha(await readFile(full))});}}}
 await collect(payload);for(const name of ['Focus.vbs','INSTALL-FOCUS.vbs','focus-paths.mjs','focus-launcher.mjs','focus.ico','FOCUS-WINDOWS.md'])files.push({scope:'root',path:name,source:name,sha256:sha(await readFile(resolve(payload,name)))});
 const manifest={format:'focus-update',version:1,environment:'personal',id:'test-update',files};await writeFile(resolve(directory,'update-manifest.json'),JSON.stringify(manifest));return manifest;
}
try{
 const target=resolve(temp,'既存の Focus (test)');await cp(resolve(root,'focus-sync'),resolve(target,'personal'),{recursive:true});await copyFile(resolve(root,'scripts/focus-windows-launcher.mjs'),resolve(target,'focus-launcher.mjs'));await copyFile(resolve(root,'scripts/focus-paths.mjs'),resolve(target,'focus-paths.mjs'));
 const env={...process.env,PORT:String(await port())};delete env.FOCUS_DATA_DIR;delete env.SYNC_AUTH_HASH;
 config=await readConfig(target,env);await ensureServer(config,{env});
 const secret=(await readFile(resolve(config.dataDir,'sync-key.txt'),'utf8')).trim(),material=await keyMaterial(secret),data=blankData();data.logs.push({id:'prior-record',title:'更新前の記録',category:'learning',date:'2026-10-28',minutes:45,note:'keep'});data.keep={extra:true};
 const value=shared(data,[{id:'prior-task',title:'更新前のタスク',minutes:45}]),payload=await encryptShared(value,material.key),api=new URL('/api/focus-sync',config.url).href;
 const headers={Authorization:'Bearer '+material.auth,'X-Focus-Environment':'personal',Origin:new URL(config.url).origin,'Content-Type':'application/json'};
 assert.equal((await fetch(api,{method:'POST',headers,body:JSON.stringify({expectedRevision:0,writeId:'before-update-write-001',payload})})).status,200);
 const keyBefore=await readFile(resolve(config.dataDir,'google-token-key.txt'),'utf8');
 const good=resolve(temp,'good-package');await mkdir(good);await fixturePackage(good);
 const result=await applyUpdate({target,packageRoot:good,env});assert(result.applied);assert.equal(await probe(config),'ready');
 assert.deepEqual(await decryptShared((await(await fetch(api,{headers})).json()).payload,material.key),value);
 assert.equal((await readFile(resolve(config.dataDir,'sync-key.txt'),'utf8')).trim(),secret);assert.equal(await readFile(resolve(config.dataDir,'google-token-key.txt'),'utf8'),keyBefore);
 assert(await readFile(resolve(result.backup,'data/focus.sqlite')));assert.equal(JSON.parse(await readFile(resolve(result.backup,'result.json'),'utf8')).status,'applied');
 const before=sha(await readFile(resolve(config.appDir,'server.mjs'))),bad=resolve(temp,'bad-package');await mkdir(bad);await fixturePackage(bad,{broken:true});
 await assert.rejects(applyUpdate({target,packageRoot:bad,env}),/更新前に戻しました/);assert.equal(sha(await readFile(resolve(config.appDir,'server.mjs'))),before);
 await ensureServer(config,{env});assert.deepEqual(await decryptShared((await(await fetch(api,{headers})).json()).payload,material.key),value);
 const manifest=JSON.parse(await readFile(resolve(good,'update-manifest.json'),'utf8'));
 manifest.files.push({scope:'root',path:'focus-data/personal/sync-key.txt',source:'server.mjs',sha256:sha(await readFile(resolve(good,'payload/server.mjs')))});await writeFile(resolve(good,'update-manifest.json'),JSON.stringify(manifest));
 await assert.rejects(applyUpdate({target,packageRoot:good,env}),/パス/);assert.equal(await probe(config),'ready');
 manifest.files.pop();manifest.files[0].sha256='0'.repeat(64);await writeFile(resolve(good,'update-manifest.json'),JSON.stringify(manifest));await assert.rejects(applyUpdate({target,packageRoot:good,env}),/壊れて/);assert.equal(await probe(config),'ready');
 manifest.files[0].sha256=sha(await readFile(resolve(good,'payload',manifest.files[0].source)));manifest.baseAssets=['0'.repeat(64)];await writeFile(resolve(good,'update-manifest.json'),JSON.stringify(manifest));await assert.rejects(applyUpdate({target,packageRoot:good,env}),/更新対象/);
 console.log('Update checks passed: preflight file hashes/paths/base version, authenticated stop, code/runtime separation, automatic DB/key backup, existing encrypted records and metadata retained, failed startup rolls code back without replacing data, Unicode paths. Windows COM and browser launch untested.');
}finally{if(config)try{await stopServer(config);}catch{}await rm(temp,{recursive:true,force:true});}
