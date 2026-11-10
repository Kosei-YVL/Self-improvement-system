// Build replaces these markers with the exact release and its generic UI assets.
const CACHE='tsumikasane-shell-__SHELL_VERSION__';
const PATHS=__SHELL_PATHS__;
const ALLOWED=new Set(PATHS);
const canonical=path=>path==='/'?'/index.html':path;
const usable=(response)=>response.ok&&!response.redirected&&response.headers.get('X-Tsumikasane-Asset')==='1';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // Do not cache login redirects, account data, API responses, or external content.
  for(const path of PATHS){const response=await fetch(path,{cache:'reload',credentials:'same-origin'});if(!usable(response))throw Error('App shell unavailable');await cache.put(path,response);}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('tsumikasane-shell-')&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const app=windows.find(client=>new URL(client.url).origin===self.location.origin&&['/','/focus.html'].includes(new URL(client.url).pathname));
    if(app){await app.navigate('/focus.html#dashboard');await app.focus();}
    else await self.clients.openWindow('/focus.html#dashboard');
  })());
});
self.addEventListener('fetch',event=>{
  const {request}=event,url=new URL(request.url),path=canonical(url.pathname);
  if(request.method!=='GET'||url.origin!==self.location.origin||!ALLOWED.has(path))return;
  // Cache-first keeps JS modules and HTML on the same release until an update is accepted.
  event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match(path);if(saved)return saved;return fetch(request);})());
});
