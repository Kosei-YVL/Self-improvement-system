import assert from 'node:assert/strict';
import {mkdtemp,cp,copyFile,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {connectFocus,alreadyUpdated,preparationGuide} from '../scripts/connect-focus.mjs';
import {enableServeURL,phoneGuide} from '../scripts/setup-focus-network.mjs';
import {readConfig,ensureServer,stopServer} from '../scripts/focus-windows-launcher.mjs';
const root=resolve(import.meta.dirname,'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(enableServeURL({stderr:'Enable at https://login.tailscale.com/f/serve?node=fixture'}),'https://login.tailscale.com/f/serve?node=fixture');
assert.equal(enableServeURL({stderr:'https://login.tailscale.com.evil.example/f/serve'}),'https://login.tailscale.com/admin/dns');
assert(!preparationGuide('https','https://evil.example').includes('href="https://evil.example'));
assert(preparationGuide().includes('iPhoneとiPad'));
const temp=await mkdtemp(resolve(tmpdir(),'focus-connect-'));let config;
try{
 const target=resolve(temp,'既存の Focus');let packageRoot=resolve(temp,'接続ツール');
 await cp('/workspace/artifacts/Focus-windows-20261028/personal',resolve(target,'personal'),{recursive:true});await copyFile(resolve(root,'scripts/focus-windows-launcher.mjs'),resolve(target,'focus-launcher.mjs'));await copyFile(resolve(root,'scripts/focus-paths.mjs'),resolve(target,'focus-paths.mjs'));
 await mkdir(packageRoot);await cp(resolve(root,'focus-sync'),resolve(packageRoot,'payload'),{recursive:true});
 const files=[];async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=resolve(dir,entry.name);if(entry.isDirectory())await collect(full);else{const name=full.slice(resolve(packageRoot,'payload').length+1).replaceAll('\\','/');files.push({scope:'app',source:name,path:name,sha256:sha(await readFile(full))});}}}
 await collect(resolve(packageRoot,'payload'));for(const name of ['Focus.vbs','INSTALL-FOCUS.vbs','focus-paths.mjs','focus-launcher.mjs','focus.ico','FOCUS-WINDOWS.md'])files.push({scope:'root',path:name,source:name,sha256:sha(await readFile(resolve(packageRoot,'payload',name)))});
 await writeFile(resolve(packageRoot,'update-manifest.json'),JSON.stringify({format:'focus-update',version:1,id:'connect-test',environment:'personal',baseAssets:[sha(await readFile(resolve(target,'personal/app-assets.json')))],files}));
 if(process.env.FOCUS_CONNECT_PACKAGE)packageRoot=resolve(process.env.FOCUS_CONNECT_PACKAGE);const connect=process.env.FOCUS_CONNECT_PACKAGE?(await import(pathToFileURL(resolve(packageRoot,'connect-focus.mjs')).href)).connectFocus:connectFocus;
 const listener=createServer();await new Promise(done=>listener.listen(0,'127.0.0.1',done));const port=listener.address().port;await new Promise(done=>listener.close(done));
 const env={...process.env,PORT:String(port)};delete env.FOCUS_DATA_DIR;delete env.SYNC_AUTH_HASH;
 config=await readConfig(target,env);await ensureServer(config,{env});const key=await readFile(resolve(config.dataDir,'sync-key.txt'),'utf8');
 const phases=['install','login','https','ready'],calls=[];let phase=0;
 const run=async(file,args)=>{calls.push(args);if(phases[phase]==='install')throw Object.assign(Error('missing'),{code:'ENOENT'});if(args[0]==='status')return {stdout:JSON.stringify(phases[phase]==='login'?{BackendState:'NeedsLogin'}:{BackendState:'Running',Self:{DNSName:'focus-three.demo.ts.net.'}})};if(args[0]==='serve'&&args[1]==='status')return {stdout:'{}'};if(phases[phase]==='https')throw {stderr:'Enable at https://login.tailscale.com/f/serve?node=fixture'};return {stdout:''};};
 const results=[];
 for(phase=0;phase<phases.length;phase++){
  const result=await connect({target,packageRoot,env,run,open:false,platform:'win32'});results.push(result);
  assert.equal(result.step,phases[phase]);assert.equal(result.updated,phase===0);assert.equal(result.networkConfigured,phase===3);
  assert.equal(await readFile(resolve(config.dataDir,'sync-key.txt'),'utf8'),key);assert.equal((await readdir(resolve(config.dataDir,'updates'))).length,1);
  assert(!JSON.stringify(result).includes(key.trim()));
  const guide=await readFile(result.guide,'utf8');assert(guide.includes('iPad'));if(phase===2)assert(guide.includes('https://login.tailscale.com/f/serve?node=fixture'));
 }
 assert(await alreadyUpdated(config,packageRoot));assert(!calls.some(args=>args.includes('funnel')||args.includes('reset')));
 console.log('Combined update/connect checks passed: old release updates once, keys retained, install/login/HTTPS guides resume without repeat backups, iPhone+iPad local QR, trusted enable links only; no real Tailscale or Windows COM used.');
}finally{if(config)try{await stopServer(config);}catch{}await rm(temp,{recursive:true,force:true});}
