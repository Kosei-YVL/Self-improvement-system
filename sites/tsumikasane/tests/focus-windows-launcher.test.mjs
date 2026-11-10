import assert from 'node:assert/strict';
import {mkdtemp,cp,copyFile,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {readConfig,probe,ensureServer,stopServer,openBrowser} from '../scripts/focus-windows-launcher.mjs';
import {blankData} from '../web/core.mjs';
import {shared,keyMaterial,encryptShared,decryptShared} from '../web/focus-sync-model.mjs';

const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'focus-desktop-'));
const checks=[];let config,manual,foreign,broken;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function freePort(){const server=createServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;await new Promise(done=>server.close(done));return port;}
async function waitFor(action){const deadline=Date.now()+8000;while(Date.now()<deadline){if(await action())return;await sleep(80);}throw Error('Timed out');}
async function pathExists(path){try{await access(path);return true;}catch{return false;}}
async function fixture(name){
  const target=resolve(temp,name);await mkdir(target,{recursive:true});
  await cp(resolve(root,'focus-sync'),resolve(target,'personal'),{recursive:true});
  await copyFile(resolve(root,'scripts/focus-windows-launcher.mjs'),resolve(target,'focus-launcher.mjs'));await copyFile(resolve(root,'scripts/focus-paths.mjs'),resolve(target,'focus-paths.mjs'));
  return target;
}
try{
  const target=await fixture('日本語 Focus & (test)'),port=await freePort();
  const env={...process.env,PORT:String(port)};delete env.FOCUS_DATA_DIR;delete env.SYNC_AUTH_HASH;
  config=await readConfig(target,env);
  assert.equal(config.appDir,resolve(target,'personal'));assert.equal(config.environment,'personal');
  assert.equal(config.dataDir,resolve(target,'focus-data/personal'));assert.equal(config.url,`http://127.0.0.1:${port}/focus.html`);
  await mkdir(config.dataDir,{recursive:true});await writeFile(resolve(config.dataDir,'keep.txt'),'既存データ');
  const results=await Promise.all(Array.from({length:6},()=>ensureServer(config,{env})));
  assert.equal(results.filter(r=>r.started).length,1);assert.equal(await probe(config),'ready');
  assert.equal(await pathExists(config.lock),false);
  const marker=JSON.parse(await readFile(config.marker,'utf8'));assert(marker.pid>0);
  checks.push('six_simultaneous_launches_start_only_one_server_with_unicode_and_spaces');
  const same=await ensureServer(config,{env});assert.equal(same.started,false);assert.equal(JSON.parse(await readFile(config.marker,'utf8')).pid,marker.pid);
  checks.push('running_server_is_reused_without_changing_origin');

  const secret=(await readFile(resolve(config.dataDir,'sync-key.txt'),'utf8')).trim(),material=await keyMaterial(secret);
  const data=blankData();data.logs.push({id:'desktop-retained-log',title:'読書',category:'learning',date:'2026-10-28',minutes:25,note:'保持する記録'});
  const snapshot=shared(data,[{id:'desktop-retained-routine',title:'読書',minutes:25}]),payload=await encryptShared(snapshot,material.key);
  const api=new URL('/api/focus-sync',config.url).href,headers={Authorization:'Bearer '+material.auth,'X-Focus-Environment':'personal','Content-Type':'application/json',Origin:new URL(config.url).origin};
  const saved=await fetch(api,{method:'POST',headers,body:JSON.stringify({expectedRevision:0,writeId:'desktop-preserved-write-01',payload})});assert.equal(saved.status,200);
  const serverConfig=await readFile(resolve(config.dataDir,'server-config.json'),'utf8');
  const googleKey=await readFile(resolve(config.dataDir,'google-token-key.txt'),'utf8');
  for(const name of ['desktop-session.json','desktop-server.log','sync-key.txt','server-config.json','google-token-key.txt'])assert.equal((await fetch(new URL('/'+name,config.url))).status,404);
  checks.push('sync_payload_saved_and_private_runtime_files_are_not_served');

  const invalid=await new Promise((done,reject)=>{
    const socket=createConnection(config.pipe);let body='';socket.once('error',reject);
    socket.on('connect',()=>socket.write(JSON.stringify({command:'stop',token:'invalid',instance:marker.instance})+'\n'));
    socket.on('data',chunk=>body+=chunk);socket.on('end',()=>done(JSON.parse(body)));
  });
  assert.equal(invalid.ok,false);assert.equal(await probe(config),'ready');
  checks.push('unauthenticated_local_stop_is_rejected');
  assert.equal((await stopServer(config)).stopped,true);assert.equal(await probe(config),'absent');
  await waitFor(async()=>!(await pathExists(config.marker)));
  assert.equal((await stopServer(config)).stopped,false);
  checks.push('authenticated_graceful_stop_and_repeated_stop');

  await writeFile(config.lock,JSON.stringify({pid:2147483647,time:Date.now(),nonce:'test-dead-process'}));
  await ensureServer(config,{env});
  const restored=await (await fetch(api,{headers})).json();assert.equal(restored.revision,1);
  assert.deepEqual(await decryptShared(restored.payload,material.key),snapshot);
  assert.equal((await readFile(resolve(config.dataDir,'sync-key.txt'),'utf8')).trim(),secret);
  assert.equal(await readFile(resolve(config.dataDir,'server-config.json'),'utf8'),serverConfig);
  assert.equal(await readFile(resolve(config.dataDir,'google-token-key.txt'),'utf8'),googleKey);
  assert.equal(await readFile(resolve(config.dataDir,'keep.txt'),'utf8'),'既存データ');
  checks.push('restart_preserves_records_routines_sync_identity_and_google_token_key');

  const crashed=JSON.parse(await readFile(config.marker,'utf8'));process.kill(crashed.pid,'SIGKILL');
  await waitFor(async()=>(await probe(config))==='absent');
  await ensureServer(config,{env});assert.notEqual(JSON.parse(await readFile(config.marker,'utf8')).pid,crashed.pid);
  assert.deepEqual(await decryptShared((await (await fetch(api,{headers})).json()).payload,material.key),snapshot);
  checks.push('recovery_after_crash_and_stale_control_socket');
  await stopServer(config);

  manual=spawn(process.execPath,['server.mjs'],{cwd:config.appDir,env:{...env,FOCUS_ENV:'personal',FOCUS_DATA_DIR:config.dataDir},stdio:'ignore'});
  await waitFor(async()=>(await probe(config))==='ready');
  assert.equal((await ensureServer(config,{env})).started,false);
  await assert.rejects(stopServer(config),/黒い起動画面/);
  assert.equal(await probe(config),'ready');manual.kill('SIGTERM');await new Promise(done=>manual.once('exit',done));manual=null;
  checks.push('legacy_cmd_server_reused_and_never_killed_without_control_identity');

  foreign=createServer((request,response)=>{response.end('another app');});
  await new Promise(done=>foreign.listen(config.port,'127.0.0.1',done));
  assert.equal(await probe(config),'occupied');await assert.rejects(ensureServer(config,{env}),/使用中/);
  assert.equal(await pathExists(config.lock),false);await new Promise(done=>foreign.close(done));foreign=null;
  checks.push('port_collision_is_reported_without_new_origin_or_data_store');

  const brokenRoot=await fixture('broken-startup');broken=await readConfig(brokenRoot,{...env,PORT:String(await freePort())});
  await writeFile(resolve(broken.appDir,'server.mjs'),'throw Error("synthetic startup failure");');
  await assert.rejects(ensureServer(broken,{env}),/起動できません/);
  await waitFor(async()=>!(await pathExists(broken.marker)));assert.equal(await pathExists(broken.lock),false);
  assert.match(await readFile(broken.log,'utf8'),/synthetic startup failure/);
  checks.push('startup_failure_reports_error_and_leaves_no_running_supervisor');

  const development=await readConfig(resolve(root,'focus-development'),{PORT:'4546'});
  assert.equal(development.environment,'development');assert.notEqual(development.dataDir,config.dataDir);
  assert.equal(development.url,'http://127.0.0.1:4546/focus.html');
  await assert.rejects(readConfig(target,{PORT:'bad'}),/ポート/);
  await assert.rejects(readConfig(temp,{}),/フォルダー/);
  checks.push('development_isolation_and_invalid_installation_errors');

  for(const browser of ['ChromeHTML','MSEdgeHTM','FirefoxURL']){
    const launches=[],registry=[];
    await openBrowser('http://127.0.0.1:4545/focus.html',{
      platform:'win32',env:{SystemRoot:'C:\\Windows',LOCALAPPDATA:'C:\\Users\\日本語 Name\\AppData\\Local',PROGRAMFILES:'C:\\Program Files'},
      run:async(file,args,options)=>{registry.push({file,args,options});return {stdout:'ProgId REG_SZ '+browser};},
      hasFile:async()=>true,
      start:(file,args,options)=>{launches.push({file,args,options});const process=new EventEmitter();process.unref=()=>{};queueMicrotask(()=>process.emit('spawn'));return process;}
    });
    assert.equal(launches.length,1);assert(registry[0].args[1].includes('\\http\\UserChoice'));
    assert.equal(launches[0].options.windowsHide,true);
    if(browser==='FirefoxURL'){
      assert(launches[0].file.endsWith('rundll32.exe'));assert.equal(launches[0].args[1],'http://127.0.0.1:4545/focus.html');
    }else{
      assert(launches[0].file.endsWith(browser==='ChromeHTML'?'chrome.exe':'msedge.exe'));
      assert.deepEqual(launches[0].args,['--app=http://127.0.0.1:4545/focus.html']);
      assert(launches[0].file.includes('日本語 Name'));
    }
  }
  checks.push('default_browser_app_window_selection_and_fallback_keep_normal_profile');

  for(const name of ['Focus.vbs','INSTALL-FOCUS.vbs']){
    const content=await readFile(resolve(root,'focus-sync',name));assert.deepEqual([...content.subarray(0,2)],[255,254]);
    assert(content.toString('utf16le').includes('Focus'));assert(!content.toString('utf16le').includes('\n')||content.toString('utf16le').includes('\r\n'));
  }
  console.log(JSON.stringify({result:'pass',checks,windows_native_tested:false},null,2));
}finally{
  manual?.kill('SIGTERM');
  if(foreign)await new Promise(done=>foreign.close(done));
  for(const current of [config,broken])if(current)try{await stopServer(current);}catch{}
  await rm(temp,{recursive:true,force:true});
}
