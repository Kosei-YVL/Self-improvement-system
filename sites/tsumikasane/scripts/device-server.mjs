import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const assets=JSON.parse(await readFile(new URL('./app-assets.json',import.meta.url),'utf8'));
const host='127.0.0.1',port=4545;
const policy="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
const server=createServer((req,res)=>{
  if(req.headers.host!==host+':'+port){res.writeHead(403);res.end('Invalid host');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end('Read only');return;}
  const url=new URL(req.url,'http://'+host+':'+port),path=url.pathname==='/'?'/index.html':url.pathname,asset=assets[path];
  if(!asset){res.writeHead(404);res.end('Not found');return;}
  const body=Buffer.from(asset.body,asset.encoding==='base64'?'base64':'utf8');
  res.writeHead(200,{'Content-Type':asset.type,'Content-Length':body.length,'Cache-Control':path==='/sw.js'?'no-store':'no-cache','X-Tsumikasane-Asset':'1','Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(path==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})});
  res.end(req.method==='HEAD'?undefined:body);
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(port,host,()=>console.log('積みかさね 端末内テスト版: http://127.0.0.1:4545\nデータはブラウザの端末内保存領域に残ります。公開・クラウド送信は行いません。'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
