import { DEVICE_ONLY } from './runtime.mjs';
let standalone=false;
if(!DEVICE_ONLY)fetch('/api/session',{cache:'no-store',credentials:'same-origin'}).then(async response=>{const session=await response.json();if(response.ok)standalone=session.authMode==='standalone';}).catch(()=>{});
export const sessionSettings=()=>standalone?'<h3>ログイン</h3><p>ログアウトすると、この端末に残したデータの控えも消去します。サーバーの記録は残ります。未送信の記録がある場合は、先にJSONを書き出してください。</p><button type="button" class="secondary-button" data-session="logout">この端末からログアウト</button><p class="form-error" data-session-error role="alert"></p>':'';
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-session="logout"]');if(!button||!standalone)return;button.disabled=true;
  try{
    const response=await fetch('/logout',{method:'POST',credentials:'same-origin'});if(!response.ok)throw Error();
    for(const key of Object.keys(localStorage))if(key.startsWith('tsumikasane-'))localStorage.removeItem(key);
    if('caches'in window)for(const name of await caches.keys())if(name.startsWith('tsumikasane-shell-'))await caches.delete(name);
    if('serviceWorker'in navigator)for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();
    location.replace('/login');
  }catch{button.disabled=false;const error=document.querySelector('[data-session-error]');if(error)error.textContent='ログアウトできませんでした。接続を確認してください。';}
});
