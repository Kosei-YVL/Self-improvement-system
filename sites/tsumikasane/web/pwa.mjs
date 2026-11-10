import {SYNC_ENABLED} from './focus-runtime.mjs';
import { DEVICE_ONLY } from './runtime.mjs';
let promptEvent=null,registration=null,updating=false;
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
export function pwaSettings(){return `<section class="install-card"><h3>ホーム画面から使う</h3><p data-install-status>${installed()?'ホーム画面から起動しています。':'アイコンから、アプリとして開けます。'}</p><button class="secondary-button" type="button" data-pwa="install">${installed()?'使い方を見る':'ホーム画面への追加方法'}</button><p class="install-help" data-install-help hidden></p><p class="field-hint">${DEVICE_ONLY?(document.title==='Focus'&&SYNC_ENABLED?'同期を接続すると暗号化して端末間で共有します。':'記録はこの端末内に保存します。通信が戻っても、クラウドへ送信しません。'):'一度開いた画面はオフラインでも起動できます。通信が戻ると記録を保存します。'}端末のデータ消去に備え、JSONの書き出しも利用できます。</p><button class="secondary-button" type="button" data-pwa="update" ${registration?.waiting?'':'hidden'}>新しいバージョンを開く</button><p data-update-status role="status" class="field-hint"></p></section>`;}
function refresh(){for(const el of document.querySelectorAll('[data-pwa="update"]'))el.hidden=!registration?.waiting;}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;});
window.addEventListener('appinstalled',()=>{promptEvent=null;for(const el of document.querySelectorAll('[data-install-status]'))el.textContent='ホーム画面に追加しました。';});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-pwa]');if(!button)return;
  if(button.dataset.pwa==='update'){if(registration?.waiting){updating=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}return;}
  if(promptEvent&&!installed()){const pending=promptEvent;promptEvent=null;await pending.prompt();await pending.userChoice;return;}
  const help=document.querySelector('[data-install-help]');if(!help)return;help.hidden=false;
  help.textContent=installed()?(document.title==='Focus'?'タスクは「タスク」、配置とバックアップは設定から変更できます。':'下のメニューからタスク・予定・記録を切り替えられます。保存状態は「履歴・データ」で確認できます。'):ios()?'SafariでこのURLを開き、共有ボタン →「ホーム画面に追加」→「追加」を選んでください。':/Android/.test(navigator.userAgent)?'Chromeのメニュー →「アプリをインストール」または「ホーム画面に追加」を選んでください。':'EdgeまたはChromeのアドレスバーのインストールアイコン、またはメニューの「アプリ」からインストールできます。';
});
if('serviceWorker'in navigator&&window.isSecureContext){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating)location.reload();});
  navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(value=>{
    registration=value;refresh();
    value.addEventListener('updatefound',()=>{value.installing?.addEventListener('statechange',refresh);});
  }).catch(()=>{if(!navigator.serviceWorker.controller)for(const el of document.querySelectorAll('[data-update-status]'))el.textContent='オフライン起動の準備ができませんでした。起動用サーバーに接続して再度開いてください。';});
}
