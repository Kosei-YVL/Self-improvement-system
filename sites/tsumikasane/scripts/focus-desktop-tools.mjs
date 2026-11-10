import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readConfig,ensureServer,stopServer,openBrowser} from './focus-launcher.mjs';
import {setupNetwork,matchingLocalKey} from './setup-network.mjs';
const root=import.meta.dirname;
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
 const config=await readConfig(root);
 if(process.argv.includes('--stop'))await stopServer(config);
 else{
  await ensureServer(config);
  const key=await matchingLocalKey(config),start=(process.argv.includes('--updated')?config.url.replace('/focus.html','/focus-update.html'):config.url)+'#sync='+encodeURIComponent(key);
  if(process.argv.includes('--connect')){
   let guide;
   try{guide=(await setupNetwork({target:root,open:false})).guide;}
   catch(e){
    if(!['install','login','https'].includes(e.step))throw e;
    guide=resolve(config.dataDir,'connection-setup.html');
    let enable='https://login.tailscale.com/admin/dns';try{const u=new URL(e.enableURL);if(u.protocol==='https:'&&u.hostname==='login.tailscale.com'&&!u.username&&!u.password)enable=u.href;}catch{}
    await writeFile(guide,'<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Focus 接続</title><style>body{max-width:620px;margin:40px auto;padding:24px;background:#101418;color:#e6ece8;font:15px/1.8 system-ui}a{color:#b8d9c9}h1{font-size:24px}</style><h1>iPhone・iPadを接続</h1><ol><li><a href="https://tailscale.com/download/windows">Windows</a>と<a href="https://tailscale.com/download/ios">iPhone・iPad</a>へTailscaleを入れます。</li><li>3台で同じ個人アカウントにログインし、接続します。</li><li>HTTPSの有効化が必要なら<a href="'+esc(enable)+'">Tailscaleの設定</a>を開きます。</li><li>スタートメニューの「Focus → iPhone・iPadを接続」をもう一度開きます。</li><li>表示されたQRをSafariで開き、共有 → ホーム画面に追加。追加後も設定 → 連携で同期済みを確認します。</li></ol><p>PC起動中は同期。PC停止中は各端末へ保存し、再接続後に同期します。</p></html>',{mode:0o600});
   }
   await openBrowser(start);await openBrowser(pathToFileURL(guide).href);
  }else if(!process.argv.includes('--server-only'))await openBrowser(start);
 }
}catch(e){const i=process.argv.indexOf('--error-file');if(i>=0&&process.argv[i+1])await writeFile(process.argv[i+1],Buffer.from('\uFEFF'+e.message,'utf16le'));console.error(e.message);process.exitCode=1;}
