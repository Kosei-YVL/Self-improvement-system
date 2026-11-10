import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(body,status=200)=>Response.json(body,{status,headers});
export async function localMigration(request,{dataDir,environment}){
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(new URL(request.url).hostname!=='127.0.0.1'||request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('X-Focus-Environment')!==environment||request.headers.get('X-Focus-Local')!=='1')return json({error:'invalid_origin'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'invalid_content_type'},415);
  const bytes=await request.arrayBuffer();if(bytes.byteLength>2048)return json({error:'too_large'},413);
  let action;try{action=JSON.parse(new TextDecoder().decode(bytes)).action;}catch{return json({error:'invalid_json'},400);}
  if(!['status','read'].includes(action))return json({error:'invalid_action'},400);
  let raw;try{raw=await readFile(resolve(dataDir,'pending-migration.json'),'utf8');}catch(error){if(error.code==='ENOENT')return json({available:false});throw error;}
  if(Buffer.byteLength(raw)>12*1024*1024)return json({error:'too_large'},413);
  let packet;try{packet=JSON.parse(raw);}catch{return json({error:'invalid_migration'},422);}
  if(packet.format!=='focus-migration'||packet.version!==1||!/^notion-[a-f0-9]{64}$/.test(packet.id))return json({error:'invalid_migration'},422);
  return json(action==='status'?{available:true,id:packet.id,summary:packet.summary}:{available:true,packet});
}
