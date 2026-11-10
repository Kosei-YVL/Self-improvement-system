// Same-origin, single-owner encrypted document transport. The server never receives the encryption key.
const MAX=16*1024*1024,CHUNK=400000;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(value,status=200)=>Response.json(value,{status,headers});
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
function equal(a,b){if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;}
export async function handleSync(request,{DB,SYNC_AUTH_HASH,FOCUS_ENV='personal'}){
 const url=new URL(request.url);
 if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(request.headers.get('x-focus-environment')!==FOCUS_ENV)return json({error:'environment_mismatch'},403);
 if(!/^[a-f0-9]{64}$/.test(SYNC_AUTH_HASH||''))return json({error:'sync_not_configured'},503);
 const auth=request.headers.get('authorization')||'';
 if(!/^Bearer [a-f0-9]{64}$/.test(auth)||!equal(await sha(auth.slice(7)),SYNC_AUTH_HASH))return json({error:'unauthorized'},401);
 if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return json({error:'invalid_origin'},403);
 const head=await DB.prepare('SELECT * FROM focus_head WHERE id=1').first();
 if(!head)return json({error:'schema_not_ready'},503);
 if(request.method==='GET'){
  if(request.headers.get('If-None-Match')==='"focus-'+head.revision+'"')return json({revision:head.revision,lastWriteId:head.write_id,unchanged:true});
  const consistent=await DB.batch([DB.prepare('SELECT * FROM focus_head WHERE id=1'),DB.prepare('SELECT body FROM focus_chunks WHERE revision=(SELECT revision FROM focus_head WHERE id=1) ORDER BY part')]);
  const current=consistent[0].results[0];
  return json({revision:current.revision,lastWriteId:current.write_id,payload:current.revision?JSON.parse(consistent[1].results.map(r=>r.body).join('')):null});
 }
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'invalid_content_type'},415);
 if(Number(request.headers.get('content-length'))>MAX)return json({error:'too_large'},413);
 let raw='';try{const reader=request.body.getReader(),decoder=new TextDecoder();let bytes=0;for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX){await reader.cancel();return json({error:'too_large'},413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}catch{return json({error:'invalid_body'},400);}
 let body;try{body=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
 const {expectedRevision,writeId,payload}=body;
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||typeof writeId!=='string'||!/^[-\w]{16,100}$/.test(writeId)||payload?.format!=='focus-cipher'||![1,2].includes(payload.version)||payload.version===2&&(!Number.isSafeInteger(payload.size)||payload.size<1||payload.size>32*1024*1024)||!/^[-A-Za-z0-9+/]{16}={0,2}$/.test(payload.iv||'')||typeof payload.ciphertext!=='string'||payload.ciphertext.length<24||!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.ciphertext))return json({error:'invalid_payload'},400);
 if(head.write_id===writeId)return json({revision:head.revision});
 if(head.revision!==expectedRevision)return json({error:'revision_conflict',revision:head.revision},409);
 const revision=expectedRevision+1,text=JSON.stringify(payload),statements=[DB.prepare('UPDATE focus_head SET revision=?,write_id=?,updated_at=? WHERE id=1 AND revision=?').bind(revision,writeId,new Date().toISOString(),expectedRevision)];
 for(let i=0;i<text.length;i+=CHUNK)statements.push(DB.prepare('INSERT INTO focus_chunks(revision,part,body) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM focus_head WHERE id=1 AND revision=? AND write_id=?)').bind(revision,i/CHUNK,text.slice(i,i+CHUNK),revision,writeId));
 statements.push(DB.prepare('DELETE FROM focus_chunks WHERE revision < (SELECT MAX(0,revision-2) FROM focus_head WHERE id=1)'));
 const result=await DB.batch(statements);
 if(!Number(result[0].meta?.changes))return json({error:'revision_conflict'},409);
 return json({revision});
}
