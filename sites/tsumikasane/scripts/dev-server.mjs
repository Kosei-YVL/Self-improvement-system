import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sqliteAdapter } from './sqlite-adapter.mjs';
const root=resolve(import.meta.dirname,'..');await mkdir(resolve(root,'.sites-runtime'),{recursive:true});
const db=sqliteAdapter(resolve(root,'.sites-runtime/preview.sqlite'));
db.exec('CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY)');
for(const name of (await readdir(resolve(root,'drizzle'))).filter(n=>n.endsWith('.sql')).sort()){
  if(!await db.prepare('SELECT name FROM _local_migrations WHERE name=?').bind(name).first()){db.exec(await readFile(resolve(root,'drizzle',name),'utf8'));db.prepare('INSERT INTO _local_migrations(name) VALUES (?)').bind(name).run();}
}
await import('../dist/server/index.js?time='+Date.now());
const {default:worker}=await import('../dist/server/index.js');
const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers(req.headers);
  // Loopback development only. Production identity is injected by Sites dispatch.
  headers.set('oai-authenticated-user-id','local-preview-user');
  const request=new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const result=await worker.fetch(request,{DB:db});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
