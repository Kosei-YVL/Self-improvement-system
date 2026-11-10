import { validateData } from '../web/core.mjs';

const MAX_BYTES=10*1024*1024,CHUNK_CHARS=32000;
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function createWorker(assets={}) {
  return {async fetch(request,env) {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')) {
      if(!['GET','HEAD'].includes(request.method))return response({error:'method_not_allowed'},405);
      const path=url.pathname==='/'?'/index.html':url.pathname,asset=assets[path];
      if(!asset)return new Response('Not found',{status:404});
      const body=asset.encoding==='base64'?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
      return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':asset.type,'Cache-Control':path==='/sw.js'?'private, no-store':'private, no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Tsumikasane-Asset':'1',...(path==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})}});
    }
    const user=request.headers.get('oai-authenticated-user-id');
    if(!user)return response({error:'sign_in_required',signInPath:'/signin-with-chatgpt?return_to=%2F'},401);
    if(url.pathname==='/api/session')return request.method==='GET'?response({authMode:'sites'}):response({error:'method_not_allowed'},405);
    if(!env.DB)return response({error:'storage_unavailable'},503);
    if(url.pathname!=='/api/data')return response({error:'not_found'},404);
    try {
      if(request.method==='GET') {
        const state=await env.DB.prepare('SELECT * FROM user_state WHERE user_id = ?').bind(user).first();
        if(!state)return response({data:null,revision:0,updatedAt:null});
        const snapshot=url.searchParams.get('previous')==='1'?state.previous_snapshot_id:state.snapshot_id;
        if(!snapshot)return response({error:'previous_snapshot_unavailable'},404);
        const result=await env.DB.prepare('SELECT body FROM state_chunks WHERE user_id = ? AND snapshot_id = ? ORDER BY part').bind(user,snapshot).all();
        if(!result.results.length)return response({error:'snapshot_incomplete'},500);
        const data=JSON.parse(result.results.map(p=>p.body).join(''));
        if(!validateData(data))return response({error:'snapshot_invalid'},500);
        return response({data,revision:state.revision,updatedAt:state.updated_at,lastWriteId:state.last_write_id,previous:url.searchParams.get('previous')==='1'});
      }
      if(request.method!=='POST')return response({error:'method_not_allowed'},405);
      if(request.headers.get('origin')!==url.origin)return response({error:'invalid_origin'},403);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return response({error:'invalid_content_type'},415);
      if(Number(request.headers.get('content-length')||0)>MAX_BYTES)return response({error:'data_too_large'},413);
      const body=await request.text();if(new TextEncoder().encode(body).length>MAX_BYTES)return response({error:'data_too_large'},413);
      let payload;try{payload=JSON.parse(body);}catch{return response({error:'invalid_json'},400);}
      const {data,expectedRevision,writeId}=payload;
      if(!validateData(data)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||typeof writeId!=='string'||!/^[-a-zA-Z0-9]{10,100}$/.test(writeId))return response({error:'invalid_data'},400);
      const old=await env.DB.prepare('SELECT revision, last_write_id FROM user_state WHERE user_id = ?').bind(user).first();
      if(old?.last_write_id===writeId)return response({revision:old.revision,writeId,duplicate:true});
      if((old?.revision||0)!==expectedRevision)return response({error:'revision_conflict',revision:old?.revision||0},409);
      const serialized=JSON.stringify(data),snapshot=crypto.randomUUID(),updated=new Date().toISOString();
      const statements=[env.DB.prepare('INSERT INTO user_state (user_id,revision,snapshot_id,previous_snapshot_id,updated_at,last_write_id) VALUES (?,1,?,NULL,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=user_state.revision+1, previous_snapshot_id=user_state.snapshot_id,snapshot_id=excluded.snapshot_id,updated_at=excluded.updated_at,last_write_id=excluded.last_write_id WHERE user_state.revision=? RETURNING revision').bind(user,snapshot,updated,writeId,expectedRevision)];
      for(let offset=0,part=0;offset<serialized.length;part++){let end=Math.min(offset+CHUNK_CHARS,serialized.length);if(end<serialized.length&&serialized.charCodeAt(end-1)>=0xD800&&serialized.charCodeAt(end-1)<=0xDBFF)end--;statements.push(env.DB.prepare('INSERT INTO state_chunks (user_id,snapshot_id,part,body) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM user_state WHERE user_id=? AND snapshot_id=?)').bind(user,snapshot,part,serialized.slice(offset,end),user,snapshot));offset=end;}
      statements.push(env.DB.prepare('DELETE FROM state_chunks WHERE user_id=? AND snapshot_id NOT IN (SELECT snapshot_id FROM user_state WHERE user_id=? UNION SELECT previous_snapshot_id FROM user_state WHERE user_id=? AND previous_snapshot_id IS NOT NULL) AND EXISTS (SELECT 1 FROM user_state WHERE user_id=? AND snapshot_id=?)').bind(user,user,user,user,snapshot));
      const result=await env.DB.batch(statements),revision=result[0].results?.[0]?.revision;
      if(!revision)return response({error:'revision_conflict'},409);
      return response({revision,writeId,updatedAt:updated});
    }catch{return response({error:'storage_error'},500);}
  }};
}
export default createWorker(typeof SITE_ASSETS==='undefined'?{}:SITE_ASSETS);
