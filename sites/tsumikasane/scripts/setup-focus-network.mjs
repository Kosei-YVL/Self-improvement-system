import {readFile,writeFile,rename,access,realpath,rm} from 'node:fs/promises';
import {resolve,win32} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readConfig,stopServer,ensureServer,openBrowser} from './focus-windows-launcher.mjs';
import {privateOrigin} from './focus-origin.mjs';
import qrcode from './vendor/qrcode.cjs';

const execute=promisify(execFile),sha=s=>createHash('sha256').update(s).digest('hex');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setupError=(step,message,enableURL='')=>Object.assign(Error(message),{step,enableURL});
export function enableServeURL(error){
 const text=[error?.stdout,error?.stderr,error?.message].filter(Boolean).join('\n');
 for(const value of text.match(/https:\/\/[^\s<>"']+/g)||[])try{const url=new URL(value);if(url.hostname==='login.tailscale.com'&&!url.username&&!url.password&&/^\/(?:f\/serve|admin\/dns)(?:[/?]|$)/.test(url.pathname))return url.href;}catch{}
 return 'https://login.tailscale.com/admin/dns';
}
export async function matchingLocalKey(config,env=process.env){
 const key=(await readFile(resolve(config.dataDir,'sync-key.txt'),'utf8')).trim();
 const expected=env.SYNC_AUTH_HASH||JSON.parse(await readFile(resolve(config.dataDir,'server-config.json'),'utf8')).authHash;
 if(!/^[A-Za-z0-9_-]{43}$/.test(key)||sha(sha('focus-auth-v1:'+key))!==expected)throw Error('保存中の同期キーを確認してください。現在のキーは変更していません。');
 return key;
}
export function chooseServePort(state,target){
 const occupied=port=>Object.keys(state.TCP||{}).includes(String(port))||Object.keys(state.Web||{}).some(host=>host.endsWith(':'+port));
 const own=port=>Object.entries(state.Web||{}).some(([host,value])=>host.endsWith(':'+port)&&value.Handlers?.['/']?.Proxy===target);
 for(const port of [443,8443])if(!occupied(port)||own(port))return port;
 throw Error('Tailscaleの443/8443番は別の用途で使用中です。既存の公開設定は変更していません。');
}
export function phoneGuide(url,key,localURL){
 const link=url+'/focus.html#sync='+encodeURIComponent(key),pc=localURL+'#sync='+encodeURIComponent(key),code=qrcode(0,'M');code.addData(link);code.make();
 return '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Focus 接続</title><style>body{max-width:560px;margin:50px auto;padding:20px;background:#101418;color:#e6ece8;font:15px/1.8 system-ui}a{color:#acd2bc}h1{font-size:24px}.qr{background:white;padding:20px;border-radius:15px;margin:24px 0;width:270px}.qr svg{width:100%;display:block}code{font-size:12px;overflow-wrap:anywhere}.note{color:#a0b0a8;font-size:13px}</style><h1>iPhone・iPadを接続</h1><ol><li>iPhoneとiPadのTailscaleで、PCと同じアカウントにログインし接続。</li><li>PCのFocusが「同期済み」になってから、各端末で下のQRをカメラで読み、Safariで開く。</li><li>Safariの共有 → ホーム画面に追加。</li><li>ホーム画面から開いたFocusの設定 → 連携で「同期済み」を確認。未接続なら下の同期キーをコピーして接続。</li></ol><div class="qr">'+code.createSvgTag({cellSize:5,margin:20,scalable:true})+'</div><p><a href="'+escape(link)+'">iPhone・iPad用リンク</a></p><details><summary>ホーム画面側で未接続の場合</summary><p>PCの画面にあるこのキーを、端末のFocus → 設定 → 連携に入力します。Safariとホーム画面で保存領域が分かれる場合の手順です。</p><code>'+escape(key)+'</code></details><p><a href="'+escape(pc)+'">このPCのFocusを接続</a></p><p class="note">1. PCでタスクを1件選ぶ → iPhone/iPadでも同じタスクを確認。2. iPhoneで開始 → PC/iPadへ切り替えて計測を確認。3. 完了後、3台で記録が1件だけ増えたことを確認。</p><p class="note">接続はTailscale内のみ。PCが起動・接続中は同期し、停止・スリープ中は端末内で記録して復帰後に反映します。QRとこの案内にはあなた専用の同期キーが含まれます。共有しないでください。</p><p class="note">Windowsログイン時は、同期用サーバーを非表示で起動します。一般公開するFunnelは使用しません。</p></html>';
}
export async function setupNetwork({target,env=process.env,run=execute,open=true,platform=process.platform}){
 if(platform!=='win32')throw Error('この接続ツールはWindows用です。');
 const config=await readConfig(target,env);if(config.environment!=='personal')throw Error('普段使いのFocusを選択してください。');
 const assets=JSON.parse(await readFile(resolve(config.appDir,'app-assets.json'),'utf8'));if(!assets['/focus-app.mjs']?.body.includes('bootstrapKey'))throw Error('先にUPDATE-FOCUS.vbsでFocusを更新してください。');
 let command=win32.resolve(env.PROGRAMFILES||'C:\\Program Files','Tailscale','tailscale.exe');try{await access(command);}catch{command='tailscale.exe';}
 let status;try{status=JSON.parse((await run(command,['status','--json'],{windowsHide:true,timeout:15000})).stdout);}catch{throw setupError('install','WindowsにTailscaleをインストールし、ログインしてから再実行してください。');}
 const name=status.Self?.DNSName?.replace(/\.$/,'');if(status.BackendState!=='Running'||!name||!/^[a-z0-9.-]+\.ts\.net$/i.test(name))throw setupError('login','TailscaleでこのPCを接続してから再実行してください。');
 const serving=JSON.parse((await run(command,['serve','status','--json'],{windowsHide:true,timeout:15000})).stdout||'{}'),upstream='http://127.0.0.1:'+config.port,port=chooseServePort(serving,upstream),origin=privateOrigin('https://'+name+(port===443?'':':'+port));
 await ensureServer(config,{env});const key=await matchingLocalKey(config,env);
 // Tailscale Serve is private to the tailnet. Never call Funnel or replace other services.
 try{await run(command,['serve','--bg','--https='+port,upstream],{windowsHide:true,timeout:20000});}catch(error){throw setupError('https','TailscaleのHTTPSを有効にして、再実行してください。既存のタスク・記録は変更していません。',enableServeURL(error));}
 const file=resolve(config.dataDir,'local-network.json');let previous;try{previous=await readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 await stopServer(config);
 try{const temp=file+'.tmp';await writeFile(temp,JSON.stringify({httpsOrigin:origin}),{mode:0o600});await rename(temp,file);await ensureServer(config,{env});}
 catch(error){if(previous)await writeFile(file,previous,{mode:0o600});else await rm(file,{force:true});try{await ensureServer(config,{env});}catch{}throw error;}
 const guide=resolve(config.dataDir,'phone-setup.html');await writeFile(guide,phoneGuide(origin,key,config.url),{mode:0o600});
 if(open){await openBrowser(config.url.replace('/focus.html','/focus-update.html')+'#sync='+encodeURIComponent(key));await openBrowser(pathToFileURL(guide).href);}
 return {origin,guide,privateOnly:true};
}
if(process.argv[1]&&!process.argv[1].startsWith('-')&&await realpath(resolve(process.argv[1]))===await realpath(fileURLToPath(import.meta.url))){
 try{const index=process.argv.indexOf('--target');if(index<0)throw Error('Focusフォルダーを選択してください。');await setupNetwork({target:process.argv[index+1]});}
 catch(error){const index=process.argv.indexOf('--error-file');if(index>=0&&process.argv[index+1])try{await writeFile(process.argv[index+1],Buffer.from('\uFEFF'+error.message,'utf16le'));}catch{}console.error(error.message);process.exitCode=1;}
}
