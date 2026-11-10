import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {applyUpdate} from './update-focus.mjs';
import {readConfig,ensureServer,openBrowser} from './focus-windows-launcher.mjs';
import {setupNetwork,matchingLocalKey} from './setup-focus-network.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inside(root,path){
 if(typeof path!=='string'||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'||p.includes(':')||p.includes('\0')))throw Error('更新ファイルのパスが不正です。');
 const full=resolve(root,path),rel=relative(root,full);if(rel.startsWith('..')||isAbsolute(rel))throw Error('更新ファイルの範囲が不正です。');return full;
}
export async function alreadyUpdated(config,packageRoot){
 const manifest=JSON.parse(await readFile(resolve(packageRoot,'update-manifest.json'),'utf8'));
 if(manifest.format!=='focus-update'||manifest.version!==1||manifest.environment!==config.environment||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1000)throw Error('対応したFocus更新パッケージではありません。');
 for(const file of manifest.files){
  if(!['app','root'].includes(file.scope)||!/^[a-f0-9]{64}$/.test(file.sha256||''))throw Error('更新ファイルの一覧が不正です。');
  if(sha(await readFile(inside(resolve(packageRoot,'payload'),file.source)))!==file.sha256)throw Error('更新ファイルが壊れています。');
  try{if(sha(await readFile(inside(file.scope==='app'?config.appDir:config.root,file.path)))!==file.sha256)return false;}catch(error){if(error.code==='ENOENT')return false;throw error;}
 }
 if(manifest.migration){
  if(manifest.migration!=='migration.json')throw Error('移行ファイルのパスが不正です。');
  const incoming=JSON.parse(await readFile(resolve(packageRoot,'migration.json'),'utf8'));
  try{const saved=JSON.parse(await readFile(resolve(config.dataDir,'pending-migration.json'),'utf8'));if(saved.id!==incoming.id||sha(JSON.stringify(saved.backup))!==sha(JSON.stringify(incoming.backup)))return false;}catch(error){if(error.code==='ENOENT')return false;throw error;}
 }
 return true;
}
export function preparationGuide(step='install',enableURL=''){
 const headings={install:'Tailscaleを3台へ入れる',login:'Tailscaleにログイン',https:'私用HTTPSを有効にする'};
 let enable='https://login.tailscale.com/admin/dns';try{const u=new URL(enableURL);if(u.protocol==='https:'&&u.hostname==='login.tailscale.com'&&!u.username&&!u.password)enable=u.href;}catch{}
 return '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Focus 接続の準備</title><style>body{max-width:650px;margin:40px auto;padding:24px;font:15px/1.8 system-ui;background:#101418;color:#e6ece8}a{display:inline-block;color:#b9d6c7;border:1px solid #38443e;border-radius:9px;padding:9px 14px;margin:5px}h1{font-size:25px}h2{font-size:18px}.note{color:#9eaca5}code{padding:3px 6px;background:#242d28}</style><h1>Focusの更新は完了</h1><h2>'+escape(headings[step]||headings.install)+'</h2><ol><li>WindowsにTailscaleをインストール。<br><a href="https://tailscale.com/download/windows" target="_blank" rel="noreferrer">Windows版</a></li><li>iPhoneとiPadにもインストール。<br><a href="https://tailscale.com/download/ios" target="_blank" rel="noreferrer">iPhone・iPad版</a></li><li>3台とも同じアカウントでログインし、Tailscaleを接続します。個人向け無料プランを使います。</li>'+(step==='https'?'<li><a href="'+escape(enable)+'" target="_blank" rel="noreferrer">TailscaleのHTTPS設定を開く</a><br>必要に応じてMagicDNSとHTTPS certificatesを有効にします。</li>':'')+'<li>Focusの画面を閉じてから、展開したフォルダーの <code>START-HERE.vbs</code> をもう一度開き、同じFocusフォルダーを選択します。</li></ol><p>準備ができていれば、iPhone・iPad用のQRを表示します。更新済みのファイルは繰り返し上書きせず、記録と同期キーを保持して接続を再開します。</p><p class="note">WindowsのPCが同期先です。PC停止・スリープ中は各端末内へ記録し、再接続後に反映します。Tailscaleのインストールと本人のログインは、この案内から行ってください。</p></html>';
}
export async function connectFocus({target,packageRoot=resolve(import.meta.dirname),env=process.env,platform=process.platform,open=true,run,openPage=openBrowser}){
 if(platform!=='win32')throw Error('この接続ツールはWindows用です。');
 let config=await readConfig(target,env);if(config.environment!=='personal')throw Error('普段使いのFocusフォルダーを選択してください。');
 const current=await alreadyUpdated(config,packageRoot),update=current?null:await applyUpdate({target,packageRoot,env,open:false});
 config=await readConfig(target,env);await ensureServer(config,{env});const key=await matchingLocalKey(config,env);
 let network,guide,step='ready';
 try{network=await setupNetwork({target,env,platform,run,open:false});guide=network.guide;}
 catch(error){if(!['install','login','https'].includes(error.step))throw error;step=error.step;guide=resolve(config.dataDir,'connection-setup.html');await mkdir(config.dataDir,{recursive:true,mode:0o700});await writeFile(guide,preparationGuide(step,error.enableURL),{mode:0o600});}
 if(open){await openPage(config.url.replace('/focus.html','/focus-update.html')+'#sync='+encodeURIComponent(key));await openPage(pathToFileURL(guide).href);}
 return {updated:!current,networkConfigured:!!network,step,guide,backup:update?.backup||null};
}
if(process.argv[1]&&!process.argv[1].startsWith('-')&&await realpath(resolve(process.argv[1]))===await realpath(fileURLToPath(import.meta.url))){
 try{const i=process.argv.indexOf('--target');if(i<0||!process.argv[i+1])throw Error('Focusフォルダーを選択してください。');const result=await connectFocus({target:process.argv[i+1],open:!process.argv.includes('--no-open')});console.log(JSON.stringify(result));process.exitCode=result.networkConfigured?0:2;}
 catch(error){const i=process.argv.indexOf('--error-file');if(i>=0&&process.argv[i+1])try{await writeFile(process.argv[i+1],Buffer.from('\uFEFF'+error.message,'utf16le'));}catch{}console.error(error.message);process.exitCode=1;}
}
