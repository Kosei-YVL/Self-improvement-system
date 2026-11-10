import {mkdir,rm,writeFile,copyFile,cp,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {collectWebAssets} from './build-worker.mjs';
import './build-focus-skins.mjs';
const dev=process.argv.includes('--dev'),root=resolve(import.meta.dirname,'..'),environment=dev?'development':'personal',out=resolve(root,dev?'focus-development':'focus-sync');
const assets=await collectWebAssets(root,{deviceOnly:true,focus:true,focusEnvironment:environment,focusSync:true});
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await mkdir(resolve(out,'web'),{recursive:true});
await writeFile(resolve(out,'app-assets.json'),JSON.stringify(assets));
for(const [name,asset] of Object.entries(assets)){const path=resolve(out,'web',name.slice(1));await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,Buffer.from(asset.body,asset.encoding==='base64'?'base64':'utf8'));}
await cp(resolve(root,'focus-server'),resolve(out,'focus-server'),{recursive:true});
for(const [from,to] of [['scripts/focus-sync-server.mjs','server.mjs'],['scripts/sqlite-adapter.mjs','sqlite-adapter.mjs'],['scripts/focus-key.mjs','focus-key.mjs'],['scripts/setup-google-local.mjs','setup-google.mjs'],['FOCUS-THREE-SCREEN.md','README.md'],['FOCUS-SYNC.md','FOCUS-SYNC.md'],['FOCUS-DEVELOPMENT.md','FOCUS-DEVELOPMENT.md'],['FOCUS-GOOGLE.md','FOCUS-GOOGLE.md'],['deploy/google-config.example.json','google-config.example.json']])await copyFile(resolve(root,from),resolve(out,to));
await copyFile(resolve(root,'scripts/focus-windows-launcher.mjs'),resolve(out,'focus-launcher.mjs'));
await copyFile(resolve(root,'scripts/focus-paths.mjs'),resolve(out,'focus-paths.mjs'));
await copyFile(resolve(root,'scripts/focus-local-migration.mjs'),resolve(out,'local-migration.mjs'));
await copyFile(resolve(root,'scripts/focus-origin.mjs'),resolve(out,'origin.mjs'));
const networkSource=(await readFile(resolve(root,'scripts/setup-focus-network.mjs'),'utf8')).replace("'./focus-windows-launcher.mjs'","'./focus-launcher.mjs'").replace("'./focus-origin.mjs'","'./origin.mjs'");await writeFile(resolve(out,'setup-network.mjs'),networkSource);await cp(resolve(root,'scripts/vendor'),resolve(out,'vendor'),{recursive:true});
const backupSource=(await readFile(resolve(root,'scripts/focus-device-backup.mjs'),'utf8')).replace("'../web/focus-portable.mjs'","'./web/focus-portable.mjs'");await writeFile(resolve(out,'device-backup.mjs'),backupSource);
await copyFile(resolve(root,'deploy/windows/focus.ico'),resolve(out,'focus.ico'));
await copyFile(resolve(root,'FOCUS-WINDOWS.md'),resolve(out,'FOCUS-WINDOWS.md'));
await copyFile(resolve(root,'FOCUS-PRIVATE-NETWORK.md'),resolve(out,'FOCUS-PRIVATE-NETWORK.md'));
for(const name of ['Focus.vbs','INSTALL-FOCUS.vbs','SETUP-NETWORK.vbs']){
 const source=await readFile(resolve(root,'deploy/windows',name),'utf8');
 await writeFile(resolve(out,name),Buffer.from('\uFEFF'+source.replace(/\r?\n/g,'\r\n'),'utf16le'));
}
const port=dev?4546:4545;
await writeFile(resolve(out,'START-WINDOWS.cmd'),'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nset FOCUS_ENV='+environment+'\r\necho http://127.0.0.1:'+port+'/focus.html\r\nnode server.mjs\r\npause\r\n');
await writeFile(resolve(out,'SETUP-GOOGLE-WINDOWS.cmd'),'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nif exist "runtime\\node-v24.19.0\\node.exe" (\r\n  "runtime\\node-v24.19.0\\node.exe" setup-google.mjs\r\n) else (\r\n  node setup-google.mjs\r\n)\r\npause\r\n');
await writeFile(resolve(out,'package.json'),JSON.stringify({private:true,type:'module',engines:{node:'>=24'},scripts:{start:`node server.mjs`}},null,2));
await writeFile(resolve(out,'wrangler.jsonc'),JSON.stringify({name:'focus-personal',main:'focus-server/worker.mjs',compatibility_date:'2026-10-01',assets:{directory:'./web',binding:'ASSETS',run_worker_first:['/api/*','/oauth/*']},vars:{FOCUS_ENV:environment},d1_databases:[{binding:'DB',database_name:'focus-personal',database_id:'REPLACE_WITH_YOUR_DATABASE_ID'}]},null,2));
console.log('Built '+out+'; runtime data stays outside the build directory.');
