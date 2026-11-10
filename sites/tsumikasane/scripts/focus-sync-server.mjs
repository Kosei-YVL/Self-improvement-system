import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {sqliteAdapter} from './sqlite-adapter.mjs';
import {handleSync} from './focus-server/handler.mjs';
import {handleGoogle} from './focus-server/google.mjs';
import {localMigration} from './local-migration.mjs';
import {deviceBackup} from './device-backup.mjs';
import {privateOrigin,originForRequest} from './origin.mjs';
import {runtimeDataDir} from './focus-paths.mjs';
const root=resolve(import.meta.dirname),assets=JSON.parse(await readFile(resolve(root,'app-assets.json'),'utf8'));
const built=assets['/focus-runtime.mjs'].body,builtEnvironment=JSON.parse(built.match(/FOCUS_ENV=("[^"\n]+")/)[1]);
const environment=process.env.FOCUS_ENV||builtEnvironment;if(!['personal','development'].includes(environment)||environment!==builtEnvironment)throw Error('Build/environment mismatch');
const port=Number(process.env.PORT||(environment==='development'?4546:4545)),host='127.0.0.1';
const dataDir=await runtimeDataDir(root,environment);await mkdir(dataDir,{recursive:true,mode:0o700});
let authHash=process.env.SYNC_AUTH_HASH;
if(!authHash){try{authHash=JSON.parse(await readFile(resolve(dataDir,'server-config.json'),'utf8')).authHash;}catch(error){if(error.code!=='ENOENT')throw error;
 const secret=randomBytes(32).toString('base64url'),sha=s=>createHash('sha256').update(s).digest('hex');authHash=sha(sha('focus-auth-v1:'+secret));
 await writeFile(resolve(dataDir,'sync-key.txt'),secret+'\n',{mode:0o600,flag:'wx'});await writeFile(resolve(dataDir,'server-config.json'),JSON.stringify({authHash}),{mode:0o600,flag:'wx'});
 }}
const db=sqliteAdapter(resolve(dataDir,'focus.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');db.exec(await readFile(resolve(root,'focus-server/schema.sql'),'utf8'));db.exec(await readFile(resolve(root,'focus-server/google-schema.sql'),'utf8'));
let googleConfig={};try{googleConfig=JSON.parse(await readFile(resolve(dataDir,'google-config.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('google-config.jsonの形式を確認してください。');}
let googleTokenKey=process.env.GOOGLE_TOKEN_KEY||googleConfig.tokenKey;
if(!googleTokenKey){try{googleTokenKey=(await readFile(resolve(dataDir,'google-token-key.txt'),'utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;googleTokenKey=randomBytes(32).toString('base64url');await writeFile(resolve(dataDir,'google-token-key.txt'),googleTokenKey+'\n',{mode:0o600,flag:'wx'});}}
const googleEnv={DB:db,SYNC_AUTH_HASH:authHash,FOCUS_ENV:environment,GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID||googleConfig.clientId,GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET||googleConfig.clientSecret,GOOGLE_TOKEN_KEY:googleTokenKey,GOOGLE_REDIRECT_URI:process.env.GOOGLE_REDIRECT_URI||googleConfig.redirectUri};
let networkConfig={};try{networkConfig=JSON.parse(await readFile(resolve(dataDir,'local-network.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('local-network.jsonの形式を確認してください。');}
const privateURL=privateOrigin(networkConfig.httpsOrigin);
const origin='http://'+host+':'+port,policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
const server=createServer(async(req,res)=>{try{
 const clientOrigin=originForRequest(req,origin,privateURL);if(!clientOrigin){res.writeHead(403);res.end();return;}
 const url=new URL(req.url,clientOrigin);
 if(url.pathname==='/api/focus-device-backup'){
  let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>32*1024*1024){res.writeHead(413);res.end();return;}chunks.push(part);}
  const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),result=await deviceBackup(request,{dataDir,environment});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 if(url.pathname==='/api/focus-migration'){
  let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>2048){res.writeHead(413);res.end();return;}chunks.push(part);}
  const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),result=await localMigration(request,{dataDir,environment});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 if(url.pathname==='/api/focus-sync'||url.pathname.startsWith('/api/google/')||url.pathname==='/oauth/google/callback'){
  let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>16*1024*1024){res.writeHead(413);res.end();return;}chunks.push(part);}
  const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),result=url.pathname==='/api/focus-sync'?await handleSync(request,{DB:db,SYNC_AUTH_HASH:authHash,FOCUS_ENV:environment}):await handleGoogle(request,googleEnv);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 const path=url.pathname==='/'?'/index.html':url.pathname,asset=assets[path];if(!asset){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':asset.type,'Cache-Control':path==='/sw.js'?'no-store':'no-cache','Content-Security-Policy':policy,'X-Tsumikasane-Asset':'1','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Opener-Policy':'same-origin-allow-popups'});res.end(req.method==='HEAD'?undefined:Buffer.from(asset.body,asset.encoding==='base64'?'base64':'utf8'));
 }catch{res.writeHead(500);res.end('Server error');}});
server.requestTimeout=30000;server.headersTimeout=15000;server.listen(port,host,()=>console.log(`Focus (${environment}): ${origin}/focus.html\n同期キーの保存先: ${dataDir}/sync-key.txt\n同じキーを使う端末のみ同期できます。`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
