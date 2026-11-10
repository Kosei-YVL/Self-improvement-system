import {readFile,mkdir,writeFile,rename,rm,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
import {decodeBackup} from '../web/focus-portable.mjs';
const compress=promisify(gzip),queues=new Map();
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function atomic(path,bytes){const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';try{await writeFile(temp,bytes,{mode:0o600,flag:'wx'});await rename(temp,path);}finally{await rm(temp,{force:true});}}
export async function deviceBackup(request,{dataDir,environment}){
 const origin=new URL(request.url).origin;
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(new URL(origin).hostname!=='127.0.0.1'||request.headers.get('Origin')!==origin||request.headers.get('X-Focus-Local')!=='1'||request.headers.get('X-Focus-Environment')!==environment)return json({error:'invalid_origin'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'invalid_content_type'},415);
 const body=await request.arrayBuffer();if(body.byteLength>32*1024*1024)return json({error:'too_large'},413);
 let packet;try{packet=JSON.parse(new TextDecoder().decode(body));}catch{return json({error:'invalid_json'},400);}
 const {deviceId,sequence,backup}=packet;
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(deviceId||'')||!Number.isSafeInteger(sequence)||sequence<1||backup?.format!=='focus-device')return json({error:'invalid_backup'},400);
 try{decodeBackup(backup);}catch{return json({error:'invalid_backup'},422);}
 const path=resolve(dataDir,'device-backups',deviceId),key=path;
 const task=(queues.get(key)||Promise.resolve()).then(async()=>{
  await mkdir(path,{recursive:true,mode:0o700});
  const latest=resolve(path,'latest.json');let old;
  try{old=await readFile(latest,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const value={...backup,metadata:{...backup.metadata,localCheckpoint:{deviceId,sequence}}},text=JSON.stringify(value,null,2),digest=createHash('sha256').update(text).digest('hex');
  if(old){const prior=JSON.parse(old).metadata?.localCheckpoint?.sequence||0;if(sequence<prior||sequence===prior&&old!==text)return json({error:'older_checkpoint'},409);if(old===text)return json({saved:true,sequence,digest});
   await atomic(resolve(path,'previous-'+Date.now()+'-'+randomBytes(4).toString('hex')+'.json.gz'),await compress(old));}
  await atomic(latest,text);
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());await atomic(resolve(path,day+'.json.gz'),await compress(text));
  const names=await readdir(path),previous=names.filter(n=>/^previous-\d+-[a-f0-9]+\.json\.gz$/.test(n)).sort().reverse(),days=names.filter(n=>/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n)).sort().reverse();
  for(const name of [...previous.slice(3),...days.slice(30)])await rm(resolve(path,name),{force:true});
  return json({saved:true,sequence,digest});
 });
 const settled=task.catch(()=>{});queues.set(key,settled);
 try{return await task;}finally{if(queues.get(key)===settled)queues.delete(key);}
}
