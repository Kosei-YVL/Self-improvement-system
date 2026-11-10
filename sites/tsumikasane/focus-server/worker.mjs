import {handleSync} from './handler.mjs';
import {handleGoogle} from './google.mjs';
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/google/')||path==='/oauth/google/callback')return handleGoogle(request,env);
 if(path==='/api/focus-sync')return handleSync(request,env);
 const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
 headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');headers.set('X-Tsumikasane-Asset','1');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
 headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");
 return new Response(response.body,{status:response.status,headers});
}};
