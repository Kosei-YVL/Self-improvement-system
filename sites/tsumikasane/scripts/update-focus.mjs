import {readFile,writeFile,mkdir,copyFile,rename,rm,lstat,realpath,mkdtemp} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute,join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readConfig,probe,stopServer,ensureServer,openBrowser} from './focus-windows-launcher.mjs';
import {verifyMigration} from '../web/focus-migrate.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const privateNames=new Set(['installation.json','runtime','Focus.exe','Uninstall.exe','focus-data','sync-key.txt','server-config.json','google-config.json','google-token-key.txt','desktop-session.json','desktop-start.lock','desktop-server.log','pending-migration.json','local-network.json','phone-setup.html','connection-setup.html','.env']);
async function exists(path){try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function safePath(root,path){if(typeof path!=='string'||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'||privateNames.has(p)||p.includes(':')||p.includes('\0')||p.includes('.sqlite')))throw Error('更新ファイルのパスが不正です。');const target=resolve(root,path),rel=relative(root,target);if(rel.startsWith('..')||isAbsolute(rel))throw Error('更新先の範囲が不正です。');return target;}
async function noSymlink(root,path){for(let current=path;current!==root;current=dirname(current)){if(await exists(current)&&(await lstat(current)).isSymbolicLink())throw Error('更新先にリンクされたファイルがあります。適用を中止しました。');}}
async function atomicWrite(path,bytes){await mkdir(dirname(path),{recursive:true,mode:0o700});const temporary=path+'.update-'+randomBytes(8).toString('hex');try{await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await rename(temporary,path);}finally{await rm(temporary,{force:true});}}

export async function applyUpdate({target,packageRoot=resolve(import.meta.dirname),env=process.env,open=false}){
  const root=await realpath(resolve(target)),config=await readConfig(root,env),manifest=JSON.parse(await readFile(resolve(packageRoot,'update-manifest.json'),'utf8'));
  if((await lstat(config.appDir)).isSymbolicLink())throw Error('アプリフォルダーがリンクになっています。実体のあるFocusフォルダーを選択してください。');
  if(manifest.format!=='focus-update'||manifest.version!==1||manifest.environment!==config.environment||!Array.isArray(manifest.files)||manifest.files.length>1000)throw Error('このFocus環境に対応した更新ファイルではありません。');
  const baseHash=sha(await readFile(resolve(config.appDir,'app-assets.json')));
  if(manifest.baseAssets?.length&&!manifest.baseAssets.includes(baseHash))throw Error('このアプリの版は更新対象に含まれていません。ソースを変更した場合は、開発版のコードを控えてから対応パッチを使ってください。');
  const files=new Map();
  for(const file of manifest.files){
    if(!['app','root'].includes(file.scope)||!/^[-a-f0-9]{64}$/.test(file.sha256||''))throw Error('更新ファイルの一覧が不正です。');
    const source=safePath(resolve(packageRoot,'payload'),file.source),destination=safePath(file.scope==='app'?config.appDir:root,file.path);
    await noSymlink(resolve(packageRoot,'payload'),source);await noSymlink(file.scope==='app'?config.appDir:root,destination);
    const bytes=await readFile(source);if(sha(bytes)!==file.sha256)throw Error('更新ファイルが壊れています。ダウンロードし直してください。');
    if(files.has(destination)&&files.get(destination).hash!==file.sha256)throw Error('更新先のファイルが重複しています。');
    files.set(destination,{bytes,hash:file.sha256,path:file.path,scope:file.scope});
  }
  let migration;
  if(manifest.migration){if(config.environment!=='personal'||manifest.migration!=='migration.json')throw Error('移行先は普段使いのFocusを選んでください。');migration=await verifyMigration(JSON.parse(await readFile(resolve(packageRoot,'migration.json'),'utf8')));}
  // Stop only the authenticated instance started by the Focus launcher.
  await stopServer(config);
  if(await probe(config)!=='absent')throw Error('Focusを終了できませんでした。画面を閉じてから再度お試しください。');
  await mkdir(resolve(config.dataDir,'updates'),{recursive:true,mode:0o700});
  const backup=await mkdtemp(resolve(config.dataDir,'updates',new Date().toISOString().replace(/[:.]/g,'-')+'-'));
  const journal=[],dataFiles=['focus.sqlite','focus.sqlite-wal','focus.sqlite-shm','sync-key.txt','server-config.json','google-config.json','google-token-key.txt','pending-migration.json','local-network.json'];
  await mkdir(resolve(backup,'data'),{mode:0o700});
  for(const name of dataFiles){const from=resolve(config.dataDir,name);if(await exists(from))await copyFile(from,resolve(backup,'data',name));}
  let written=false;
  try{
    for(const [destination,file] of files){
      const before=await exists(destination),saved=resolve(backup,'code',file.scope,file.path);
      if(before){await mkdir(dirname(saved),{recursive:true,mode:0o700});await copyFile(destination,saved);}
      journal.push({destination,saved,before});
    }
    await writeFile(resolve(backup,'journal.json'),JSON.stringify({version:1,update:manifest.id,root,appDir:config.appDir,files:journal},null,2),{mode:0o600});
    for(const [destination,file] of files){written=true;await atomicWrite(destination,file.bytes);}
    if(migration)await atomicWrite(resolve(config.dataDir,'pending-migration.json'),JSON.stringify(migration));
    const updated=await readConfig(root,env);await ensureServer(updated,{env});
    await writeFile(resolve(backup,'result.json'),JSON.stringify({status:'applied',update:manifest.id,at:new Date().toISOString()}),{mode:0o600});
    if(open)try{let fragment='';try{const key=(await readFile(resolve(updated.dataDir,'sync-key.txt'),'utf8')).trim(),expected=env.SYNC_AUTH_HASH||JSON.parse(await readFile(resolve(updated.dataDir,'server-config.json'),'utf8')).authHash;if(/^[A-Za-z0-9_-]{43}$/.test(key)&&sha(sha('focus-auth-v1:'+key))===expected)fragment='#sync='+encodeURIComponent(key);}catch{}await openBrowser(updated.url.replace('/focus.html','/focus-update.html')+fragment);}catch{return {applied:true,backup,url:updated.url,migration:migration?.id||null,openError:true};}
    return {applied:true,backup,url:updated.url,migration:migration?.id||null};
  }catch(error){
    let rollbackError;
    if(written){
      try{
        await stopServer(config);
        for(const entry of journal.slice().reverse())if(entry.before)await atomicWrite(entry.destination,await readFile(entry.saved));else await rm(entry.destination,{force:true});
        if(migration){const previous=resolve(backup,'data/pending-migration.json');if(await exists(previous))await atomicWrite(resolve(config.dataDir,'pending-migration.json'),await readFile(previous));else await rm(resolve(config.dataDir,'pending-migration.json'),{force:true});}
      }catch(failure){rollbackError=failure;}
    }
    await writeFile(resolve(backup,'result.json'),JSON.stringify({status:rollbackError?'recovery_required':'rolled_back',error:error.message,rollbackError:rollbackError?.message}),{mode:0o600});
    throw Error(rollbackError?'更新を完了できませんでした。控え '+backup+' から復旧できます。':error.message+' アプリ本体は更新前に戻しました。データは保存先に残っています。');
  }
}

const self=fileURLToPath(import.meta.url);
if(process.argv[1]&&!process.argv[1].startsWith('-')&&await realpath(resolve(process.argv[1]))===await realpath(self)){
  try{const index=process.argv.indexOf('--target');if(index<0||!process.argv[index+1])throw Error('更新先のFocusフォルダーを選択してください。');const result=await applyUpdate({target:process.argv[index+1],open:!process.argv.includes('--no-open')});if(result.openError)throw Error('更新は完了しました。'+result.url+' をブラウザで開いてください。');console.log(JSON.stringify(result));}
  catch(error){const index=process.argv.indexOf('--error-file');if(index>=0&&process.argv[index+1])try{await writeFile(process.argv[index+1],Buffer.from('\uFEFF'+error.message,'utf16le'));}catch{}console.error(error.message);process.exitCode=1;}
}
