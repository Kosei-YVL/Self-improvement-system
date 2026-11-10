import {readFile,writeFile,mkdir,cp,access,lstat,rename,rm,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readConfig,stopServer,probe} from './focus-windows-launcher.mjs';
import {applyUpdate} from './update-focus.mjs';
import {verifyMigration} from '../web/focus-migrate.mjs';
import {runtimeDataDir} from './focus-paths.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function atomic(path,bytes){const temp=path+'.install-'+randomBytes(8).toString('hex');await mkdir(dirname(path),{recursive:true});try{await writeFile(temp,bytes,{flag:'wx'});await rename(temp,path);}finally{await rm(temp,{force:true});}}
async function noLinks(path){for(let p=resolve(path);;p=dirname(p)){try{if((await lstat(p)).isSymbolicLink())throw Error('リンクされた保存先にはインストールしません。実体のあるフォルダーを選んでください。');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}}
function inside(root,path){if(typeof path!=='string'||path.includes('\\')||path.split('/').some(x=>!x||x==='.'||x==='..'||x.includes(':')||x.includes('\0')))throw Error('インストールファイルのパスが不正です。');const dest=resolve(root,path),rel=relative(root,dest);if(rel.startsWith('..')||isAbsolute(rel))throw Error('インストール先の範囲が不正です。');return dest;}
export async function installFocus({target,packageRoot,runtimeSource,defaultDataDir,platform=process.platform,env=process.env}){
 if(platform!=='win32')throw Error('このインストーラーはWindows用です。');
 target=resolve(target);await noLinks(target);
 if(await exists(resolve(target,'personal/server.mjs'))&&!await exists(resolve(target,'server.mjs')))throw Error('この中の personal フォルダーをインストール先に選んでください。既存の保存先を引き継ぎます。');
 const manifest=JSON.parse(await readFile(resolve(packageRoot,'update-manifest.json'),'utf8'));
 if(manifest.format!=='focus-update'||manifest.environment!=='personal'||manifest.version!==1||!manifest.files?.length)throw Error('インストール情報が正しくありません。');
 // Verify every payload before touching the current installation or its runtime.
 for(const file of manifest.files){const source=inside(resolve(packageRoot,'payload'),file.source);if(sha(await readFile(source))!==file.sha256)throw Error('インストールファイルが壊れています。ダウンロードし直してください。');}
 let packet;if(manifest.migration){if(manifest.migration!=='migration.json')throw Error('移行情報が正しくありません。');packet=await verifyMigration(JSON.parse(await readFile(resolve(packageRoot,'migration.json'),'utf8')));}
 const runtimeInfo=JSON.parse(await readFile(resolve(runtimeSource,'runtime.json'),'utf8'));
 if(runtimeInfo.version!=='24.19.0'||runtimeInfo.platform!=='win-x64'||!/^[a-f0-9]{64}$/.test(runtimeInfo.sha256))throw Error('実行環境を確認できません。');
 const node=await readFile(resolve(runtimeSource,'node.exe'));if(sha(node)!==runtimeInfo.sha256)throw Error('実行環境のファイルが壊れています。');
 let old=null;
 if(await exists(resolve(target,'server.mjs'))||await exists(resolve(target,'app-assets.json'))){old=await readConfig(target,env);if(old.environment!=='personal')throw Error('開発版ではなく、普段使いのFocusを選んでください。');}
 else if(await exists(target)){
  const {readdir}=await import('node:fs/promises');const names=await readdir(target);
  // A previous uninstall leaves installation.json; a fresh install never takes an unrelated folder.
  if(names.some(n=>!['installation.json','runtime','Focus.exe','Uninstall.exe','install-owned.json','desktop-tools.mjs'].includes(n)))throw Error('空のフォルダー、または現在のFocusフォルダーを選んでください。');
 }
 const dataDir=old?.dataDir||(await exists(resolve(target,'installation.json'))?await runtimeDataDir(target,'personal',env):resolve(defaultDataDir));
 const rel=relative(target,dataDir);if(!rel||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('記録の保存先はアプリの外側にしてください。');
 await noLinks(dataDir);
 const config=old||{port:Number(env.PORT||4545),environment:'personal'};
 if(!old&&await probe(config)!=='absent')throw Error('別のFocusが起動中です。画面を閉じ、現在のFocusフォルダーをインストール先に選んでください。');
 // Preserve existing installation metadata and the original data location, without copying/resetting keys.
 await mkdir(target,{recursive:true});await mkdir(dataDir,{recursive:true,mode:0o700});
 const runtime=resolve(target,'runtime/node-v24.19.0');await mkdir(runtime,{recursive:true});
 if(!await exists(resolve(runtime,'node.exe')))await atomic(resolve(runtime,'node.exe'),node);
 else if(sha(await readFile(resolve(runtime,'node.exe')))!==runtimeInfo.sha256)throw Error('既存の実行環境が一致しません。上書きせずに中止しました。');
 for(const name of ['LICENSE','runtime.json'])await atomic(resolve(runtime,name),await readFile(resolve(runtimeSource,name)));
 const metadata={format:'focus-installation',version:1,environment:'personal',dataDir,runtime:'runtime/node-v24.19.0/node.exe'};
 let result;
 if(old){
  result=await applyUpdate({target,packageRoot,env,open:false});
  await stopServer(await readConfig(target,env)); // Never leave the temporary installer's node.exe running.
 }else{
  const written=[];
  try{
   for(const file of manifest.files.filter(f=>f.scope==='app')){const dest=inside(target,file.path);await atomic(dest,await readFile(inside(resolve(packageRoot,'payload'),file.source)));written.push(dest);}
   if(packet&&!await exists(resolve(dataDir,'pending-migration.json')))await atomic(resolve(dataDir,'pending-migration.json'),JSON.stringify(packet));
  }catch(e){for(const file of written.reverse())await rm(file,{force:true});throw e;}
  result={applied:true,backup:null};
 }
 await atomic(resolve(target,'installation.json'),JSON.stringify(metadata,null,2));
 return {installed:true,updated:!!old,target,dataDir,backup:result.backup};
}
if(process.argv[1]&&await realpath(resolve(process.argv[1]))===await realpath(new URL(import.meta.url))){
 const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined;};
 try{const result=await installFocus({target:arg('--target'),packageRoot:arg('--package'),runtimeSource:arg('--runtime'),defaultDataDir:arg('--data')});if(arg('--result'))await writeFile(arg('--result'),JSON.stringify(result));console.log(JSON.stringify({installed:true,updated:result.updated}));}
 catch(e){if(arg('--error-file'))await writeFile(arg('--error-file'),Buffer.from('\uFEFF'+e.message,'utf16le'));console.error(e.message);process.exitCode=1;}
}
