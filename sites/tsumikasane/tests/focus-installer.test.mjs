import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,cp,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
const {installFocus}=await import(process.env.FOCUS_INSTALL_MODULE||'../scripts/install-focus-windows.mjs');
import {runtimeDataDir} from '../scripts/focus-paths.mjs';
import {readConfig,ensureServer,stopServer} from '../scripts/focus-windows-launcher.mjs';
const root=resolve(import.meta.dirname,'..'),temporary=await mkdtemp(join(tmpdir(),'focus-native-install-')),sha=b=>createHash('sha256').update(b).digest('hex');
const packageRoot=process.env.FOCUS_INSTALL_PACKAGE||'/workspace/artifacts/Focus-windows-installer-20261029/package';
const port=await new Promise(done=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>done(p));});});
const env={...process.env,PORT:String(port)};delete env.FOCUS_DATA_DIR;delete env.SYNC_AUTH_HASH;
const target=resolve(temporary,'日本語 Focus app'),defaultDataDir=resolve(temporary,'separate data/personal'),runtimeSource=resolve(temporary,'runtime');
const args={target,packageRoot,defaultDataDir,runtimeSource,platform:'win32',env};let config;
try{
 await mkdir(runtimeSource);await writeFile(resolve(runtimeSource,'node.exe'),'synthetic-runtime-not-executed');await writeFile(resolve(runtimeSource,'LICENSE'),'synthetic test only');await writeFile(resolve(runtimeSource,'runtime.json'),JSON.stringify({version:'24.19.0',platform:'win-x64',sha256:sha('synthetic-runtime-not-executed')}));
 await assert.rejects(()=>installFocus({...args,platform:'linux'}),/Windows/);
 const fresh=await installFocus(args);assert.equal(fresh.updated,false);assert.equal(fresh.dataDir,defaultDataDir);
 config=await readConfig(target,env);assert.equal(config.dataDir,defaultDataDir);assert.equal(await runtimeDataDir(target,'personal',{}),defaultDataDir);assert.equal(await runtimeDataDir(target,'personal',{FOCUS_DATA_DIR:resolve(temporary,'override')}),resolve(temporary,'override'));
 await ensureServer(config,{env});await stopServer(config);
 const key=await readFile(resolve(defaultDataDir,'sync-key.txt'),'utf8'),google=await readFile(resolve(defaultDataDir,'google-token-key.txt'),'utf8');await writeFile(resolve(defaultDataDir,'personal-asset.txt'),'keep');
 const update=await installFocus(args);assert.equal(update.updated,true);assert(update.backup);assert.equal(await readFile(resolve(defaultDataDir,'sync-key.txt'),'utf8'),key);assert.equal(await readFile(resolve(defaultDataDir,'google-token-key.txt'),'utf8'),google);assert.equal(await readFile(resolve(defaultDataDir,'personal-asset.txt'),'utf8'),'keep');
 // Legacy data remains at its original location; no second blank database is created.
 const legacy=resolve(temporary,'old Focus');await cp(resolve(root,'focus-sync'),legacy,{recursive:true});const old=await readConfig(legacy,env);await mkdir(old.dataDir,{recursive:true});await writeFile(resolve(old.dataDir,'keep.txt'),'legacy');
 const migrated=await installFocus({...args,target:legacy});assert.equal(migrated.dataDir,old.dataDir);assert.equal(await readFile(resolve(old.dataDir,'keep.txt'),'utf8'),'legacy');assert.equal((await readConfig(legacy,env)).dataDir,old.dataDir);
 // Tampered payload aborts before changing app files, runtime, or records.
 const broken=resolve(temporary,'broken');await cp(packageRoot,broken,{recursive:true});await writeFile(resolve(broken,'payload/server.mjs'),'corrupt');const before=await readFile(resolve(target,'app-assets.json'));
 await assert.rejects(()=>installFocus({...args,packageRoot:broken}),/壊れています/);assert.deepEqual(await readFile(resolve(target,'app-assets.json')),before);assert.equal(await readFile(resolve(defaultDataDir,'sync-key.txt'),'utf8'),key);
 const unrelated=resolve(temporary,'unrelated');await mkdir(unrelated);await writeFile(resolve(unrelated,'notes.txt'),'keep');await assert.rejects(()=>installFocus({...args,target:unrelated}),/空のフォルダー/);assert.equal(await readFile(resolve(unrelated,'notes.txt'),'utf8'),'keep');
 const link=resolve(temporary,'linked');await symlink(target,link,'dir');await assert.rejects(()=>installFocus({...args,target:link}),/リンク/);
 const bad=resolve(temporary,'bad metadata');await mkdir(bad);await writeFile(resolve(bad,'installation.json'),'{');await assert.rejects(()=>runtimeDataDir(bad,'personal',{}),/保存先設定/);
 console.log('Installer checks passed: fresh install, separate/persistent data location, metadata reuse, in-place legacy update, DB/key backups, same identity, payload corruption rejection, unrelated folder and symlink protection. Native Windows UI not executed by this test.');
}finally{if(config)try{await stopServer(config);}catch{}await rm(temporary,{recursive:true,force:true});}
