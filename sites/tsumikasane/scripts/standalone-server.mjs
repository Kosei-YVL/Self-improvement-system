// Single-owner server. No ChatGPT account, credentials, or identity headers are trusted.
import { createServer } from 'node:http';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sqliteAdapter } from './sqlite-adapter.mjs';
import { standaloneConfig } from './standalone-config.mjs';
const derive=promisify(scrypt),SESSION_MS=30*86400000,MAX_BODY=10*1024*1024+4096;
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const htmlEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const noStore={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const json=(data,status=200)=>Response.json(data,{status,headers:noStore});
const loginPage=(message='')=>new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#326653"><title>積みかさねにログイン</title><style>html{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/1.8 system-ui;background:light-dark(#f7f9f5,#101b14);color:light-dark(#35463b,#e1ebe1);padding:24px}main{width:min(100%,380px)}h1{font-size:28px}p{font-size:14px}label{display:block;margin:24px 0 8px}input,button{width:100%;padding:14px;border-radius:10px;font:inherit;border:1px solid #789782}button{margin-top:18px;background:#326653;color:white}a{color:inherit}.error{color:light-dark(#a13725,#ffb3a7)}</style></head><body><main><h1>積みかさね</h1><p>小さな一歩を、自分の資産に。</p><form method="post" action="/login"><label for="password">パスワード</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024" autofocus>${message?`<p class="error" role="alert">${htmlEscape(message)}</p>`:''}<button>ログイン</button></form></main></body></html>`,{headers:{...noStore,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});

export async function createStandalone({origin,passwordHash,dataDir,worker,clock=Date.now}){
  const url=new URL(origin);
  if(url.origin!==origin||(!['http:','https:'].includes(url.protocol)))throw Error('APP_ORIGINは末尾スラッシュなしの公開URLにしてください。');
  if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('公開URLにはHTTPSが必要です。');
  if(!/^scrypt:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{86}$/.test(passwordHash||''))throw Error('APP_PASSWORD_HASHを設定してください。');
  const [,salt,hash]=passwordHash.split(':'),expected=Buffer.from(hash,'base64url'),secure=url.protocol==='https:';
  const cookieName=secure?'__Host-tsumikasane':'tsumikasane_session';
  await mkdir(dataDir,{recursive:true,mode:0o700});const db=sqliteAdapter(resolve(dataDir,'tsumikasane.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, credential_id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS auth_attempts(id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);');
  for(const name of (await readdir(new URL('./drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
    if(!await db.prepare('SELECT name FROM _local_migrations WHERE name=?').bind(name).first()){
      db.exec('BEGIN');try{db.exec(await readFile(new URL('./drizzle/'+name,import.meta.url),'utf8'));db.prepare('INSERT INTO _local_migrations(name) VALUES (?)').bind(name).run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
    }
  }
  const credentialId=tokenHash(passwordHash);
  db.prepare('DELETE FROM auth_sessions WHERE credential_id<>? OR expires_at<=?').bind(credentialId,clock()).run();
  const cookie=value=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value?SESSION_MS/1000:0}${secure?'; Secure':''}`;
  const getToken=request=>{const value=(request.headers.get('cookie')||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value||'')?value:null;};
  async function handle(request){
    const path=new URL(request.url).pathname;
    if(new URL(request.url).origin!==origin)return json({error:'invalid_host'},403);
    if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&request.headers.get('origin')!==origin)return json({error:'invalid_origin'},403);
    if(path==='/healthz'){
      if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
      await db.prepare('SELECT 1 AS ready').first();
      return request.method==='HEAD'?new Response(null,{headers:noStore}):json({ok:true});
    }
    if(path==='/login'){
      if(request.method==='GET')return loginPage();
      if(request.method!=='POST')return json({error:'method_not_allowed'},405);
      if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return json({error:'invalid_content_type'},415);
      const now=clock(),body=await request.text();if(Buffer.byteLength(body)>8192)return json({error:'data_too_large'},413);
      const limit=await db.prepare('SELECT * FROM auth_attempts WHERE id=1').first();
      if(limit?.reset_at>now&&limit.attempts>=10)return new Response(loginPage('試行回数が多いため、15分ほど待ってから再度お試しください。').body,{status:429,headers:{...Object.fromEntries(loginPage().headers),'Retry-After':String(Math.ceil((limit.reset_at-now)/1000))}});
      db.prepare('INSERT INTO auth_attempts(id,attempts,reset_at) VALUES(1,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').bind(now+15*60000,now,now).run();
      const password=new URLSearchParams(body).get('password')||'';
      const candidate=password.length<=1024?await derive(password,salt,64):Buffer.alloc(64);
      if(!timingSafeEqual(candidate,expected))return new Response(loginPage('パスワードを確認してください。').body,{status:401,headers:loginPage().headers});
      db.exec('DELETE FROM auth_attempts;');db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(now).run();
      const token=randomBytes(32).toString('base64url');db.prepare('INSERT INTO auth_sessions(token_hash,expires_at,credential_id) VALUES(?,?,?)').bind(tokenHash(token),now+SESSION_MS,credentialId).run();
      return new Response(null,{status:303,headers:{...noStore,Location:'/', 'Set-Cookie':cookie(token)}});
    }
    const token=getToken(request),session=token?await db.prepare('SELECT expires_at FROM auth_sessions WHERE token_hash=? AND credential_id=?').bind(tokenHash(token),credentialId).first():null;
    const authenticated=session?.expires_at>clock();
    if(path==='/logout'){
      if(request.method!=='POST')return json({error:'method_not_allowed'},405);
      if(token)db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(tokenHash(token)).run();
      return new Response(JSON.stringify({ok:true}),{headers:{...noStore,'Content-Type':'application/json','Set-Cookie':cookie(''),'Clear-Site-Data':'"cache", "storage"'}});
    }
    if(!authenticated){
      if(path.startsWith('/api/'))return json({error:'sign_in_required',signInPath:'/login'},401);
      return new Response(null,{status:303,headers:{...noStore,Location:'/login'}});
    }
    if(path==='/api/session')return json({authMode:'standalone',signOutPath:'/logout'});
    // Never forward an internet-supplied identity. Only a validated server session sets it.
    const headers=new Headers(request.headers);headers.delete('oai-authenticated-user-id');headers.set('oai-authenticated-user-id','self-hosted-owner');
    return worker.fetch(new Request(request,{headers}),{DB:db});
  }
  const server=createServer(async(req,res)=>{
    try{
      const healthCheck=['GET','HEAD'].includes(req.method)&&req.url==='/healthz';
      if(req.headers.host!==url.host&&!healthCheck){res.writeHead(403,noStore);res.end('Invalid host');return;}
      let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BODY){res.writeHead(413,noStore);res.end('Too large');return;}chunks.push(chunk);}
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
      const request=new Request(origin+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
      const result=await handle(request),responseHeaders=Object.fromEntries(result.headers);
      if(secure)responseHeaders['Strict-Transport-Security']='max-age=31536000';
      res.writeHead(result.status,responseHeaders);res.end(req.method==='HEAD'?undefined:Buffer.from(await result.arrayBuffer()));
    }catch{if(!res.headersSent)res.writeHead(500,noStore);res.end('Server error');}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;server.maxRequestsPerSocket=1000;
  return {server,handle,close:()=>db.close()};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {default:worker}=await import('./server/index.js');
  const config=standaloneConfig(process.env);
  const {server,close}=await createStandalone({...config,worker});
  server.listen(config.port,config.host,()=>console.log('積みかさね: '+config.origin));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{close();process.exit(0);}));
}
