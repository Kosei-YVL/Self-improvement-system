import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {sqliteAdapter} from '../scripts/sqlite-adapter.mjs';
import {handleGoogle} from '../focus-server/google.mjs';
const db=sqliteAdapter();db.exec(await readFile(new URL('../focus-server/google-schema.sql',import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),bearer=sha('owner-test-auth'),origin='https://focus.example';
let clock=1000000,refreshes=0,revoked=0,sequence=0,insertAttempts=0,patches=0,deletes=0,ambiguousInsert=false,ambiguousPatch=false,racePatch=false,lastVerifier='',account='owner@example.test',codeGate=null,statusGate=null,refreshGate=null,raceSame=false;
const eventStore=new Map(),calls=[],calendars=[{id:'owner@example.test',summary:'Main',primary:true,accessRole:'owner',timeZone:'Asia/Tokyo'},{id:'read@example.test',summary:'Read',accessRole:'reader',timeZone:'UTC'}];
const reply=(value,status=200)=>Response.json(value,{status});
const fake=async(url,options={})=>{url=new URL(url);calls.push({path:url.pathname,method:options.method||'GET'});
 if(url.href==='https://oauth2.googleapis.com/token'){
  const p=new URLSearchParams(options.body);assert.equal(p.get('client_secret'),'test-client-secret');
  if(p.get('grant_type')==='authorization_code'){lastVerifier=p.get('code_verifier');if(p.get('code')==='held-code'&&codeGate){codeGate.enter();await codeGate.block;}return reply({access_token:'access-'+(++sequence),refresh_token:p.get('code')==='no-refresh'?undefined:'refresh-secret',expires_in:120});}
  assert.equal(p.get('refresh_token'),'refresh-secret');if(refreshGate&&!refreshGate.used){refreshGate.used=true;refreshGate.enter();await refreshGate.block;}refreshes++;return reply({access_token:'refreshed-'+refreshes,expires_in:120});
 }
 if(url.href==='https://oauth2.googleapis.com/revoke'){assert.equal(new URLSearchParams(options.body).get('token'),'refresh-secret');revoked++;return new Response(null,{status:200});}
 assert.match(options.headers.Authorization,/^Bearer (access-|refreshed-)/);
 if(url.pathname==='/calendar/v3/users/me/calendarList'){
  if(statusGate&&!statusGate.used){statusGate.used=true;statusGate.enter();await statusGate.block;return reply({error:'old-token-invalid'},401);}
  if(url.searchParams.get('pageToken')==='calendar-page2')return reply({items:[calendars[1]]});
  return reply({items:[{...calendars[0],id:account}],nextPageToken:'calendar-page2'});
 }
 const listMatch=url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events$/),itemMatch=url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)$/);
 if(listMatch){
  const calendarId=decodeURIComponent(listMatch[1]);if((options.method||'GET')==='GET'){
   assert.equal(url.searchParams.get('singleEvents'),'true');assert.equal(url.searchParams.get('showDeleted'),'false');
   if(url.searchParams.get('pageToken')==='events-page2')return reply({items:[{id:'all-day',summary:'Holiday',start:{date:'2026-10-26'},end:{date:'2026-10-27'}}]});
   return reply({items:[{id:'external',summary:'Other',start:{dateTime:'2026-10-26T09:00:00+09:00'},end:{dateTime:'2026-10-26T10:00:00+09:00'},attendees:[{email:'private@example.test'}]},{id:'cancelled',status:'cancelled'}],nextPageToken:'events-page2'});
  }
  assert.equal(options.method,'POST');insertAttempts++;const body=JSON.parse(options.body),key=calendarId+'/'+body.id;if(eventStore.has(key))return reply({error:'exists'},409);const e={...body,etag:'"'+(++sequence)+'"',htmlLink:'https://calendar.google.com/event?eid='+body.id};eventStore.set(key,e);if(ambiguousInsert){ambiguousInsert=false;throw new TypeError('Simulated lost acknowledgement');}return reply(e);
 }
 if(itemMatch){const key=decodeURIComponent(itemMatch[1])+'/'+decodeURIComponent(itemMatch[2]),old=eventStore.get(key),method=options.method||'GET';if(!old)return reply({error:'missing'},404);
  if(method==='GET')return reply(structuredClone(old));
  if(method==='PATCH'){patches++;if(raceSame){raceSame=false;const winner={...old,...JSON.parse(options.body),etag:'\"parallel-winner\"'};eventStore.set(key,winner);return reply({error:'precondition'},412);}if(racePatch){racePatch=false;old.etag='"external-race"';return reply({error:'precondition'},412);}if(options.headers['If-Match']!==old.etag)return reply({error:'precondition'},412);const next={...old,...JSON.parse(options.body),etag:'"'+(++sequence)+'"'};eventStore.set(key,next);if(ambiguousPatch){ambiguousPatch=false;throw new TypeError('Simulated lost patch acknowledgement');}return reply(next);}
  assert.equal(method,'DELETE');deletes++;if(options.headers['If-Match']!==old.etag)return reply({error:'precondition'},412);eventStore.delete(key);return new Response(null,{status:204});
 }
 throw Error('Unexpected fake request '+url);
};
const env={DB:db,FOCUS_ENV:'personal',SYNC_AUTH_HASH:sha(bearer),GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-client-secret',GOOGLE_TOKEN_KEY:randomBytes(32).toString('base64url'),GOOGLE_FETCH:fake,GOOGLE_NOW:()=>clock};
const call=(path,body,extra={})=>handleGoogle(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+bearer,'X-Focus-Environment':'personal',Origin:origin,'Content-Type':'application/json',...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
const read=async response=>({status:response.status,body:await response.json()});
assert.equal((await call('/api/google/status',undefined,{Authorization:''})).status,401);assert.equal((await call('/api/google/connect',{}, {Origin:'https://evil.example'})).status,403);assert.equal((await call('/api/google/status',undefined,{'X-Focus-Environment':'development'})).status,403);
const unconfigured=await handleGoogle(new Request(origin+'/api/google/status',{headers:{Authorization:'Bearer '+bearer,'X-Focus-Environment':'personal'}}),{...env,GOOGLE_CLIENT_SECRET:''});assert.deepEqual(await unconfigured.json(),{configured:false,connected:false,calendars:[]});
assert.equal((await (await call('/api/google/status')).json()).connected,false);
async function authorize(code='valid-code'){
 const start=await read(await call('/api/google/connect',{}));assert.equal(start.status,200);const url=new URL(start.body.url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline');const state=url.searchParams.get('state');const stateRow=await db.prepare('SELECT * FROM focus_google_states WHERE state_hash=?').bind(sha(state)).first();assert(!stateRow.verifier_cipher.includes(state));
 const response=await handleGoogle(new Request(origin+'/oauth/google/callback?state='+state+'&code='+code),env);const html=await response.text();assert(!html.includes('refresh-secret'));return {status:response.status,state,url,html};
}
const first=await authorize();assert.equal(first.status,200);assert(first.html.includes('focus-google-connected'));assert.equal(first.url.searchParams.get('code_challenge'),createHash('sha256').update(lastVerifier).digest('base64url'));assert.equal((await handleGoogle(new Request(origin+'/oauth/google/callback?state='+first.state+'&code=again'),env)).status,400);
const tokenRow=await db.prepare('SELECT * FROM focus_google_tokens WHERE environment=?').bind('personal').first();assert(!tokenRow.token_cipher.includes('refresh-secret')&&!tokenRow.token_cipher.includes('access-'));
const status=await read(await call('/api/google/status'));assert.equal(status.status,200);assert.equal(status.body.connected,true);assert.equal(status.body.calendars.length,2);assert(!JSON.stringify(status.body).includes('refresh-secret'));
const refresh=await read(await call('/api/google/refresh',{calendarIds:['owner@example.test'],timeMin:'2026-10-01T00:00:00+09:00',timeMax:'2026-11-01T00:00:00+09:00'}));assert.equal(refresh.status,200);assert.equal(refresh.body.events.length,2);assert.equal(refresh.body.events[0].calendarId,'owner@example.test');assert.equal(refresh.body.events[0].attendees,undefined);assert.equal(refresh.body.events[1].start.date,'2026-10-26');
assert.equal((await call('/api/google/refresh',{calendarIds:['unknown'],timeMin:'2026-10-01',timeMax:'2026-11-01'})).status,403);assert.equal((await call('/api/google/refresh',{calendarIds:['owner@example.test'],timeMin:'2025-01-01',timeMax:'2027-01-01'})).status,400);
const event={id:'focus-plan-1',title:'Task · Work',date:'2026-10-26',start:'10:00',end:'10:30',prepareBefore:10,prepareAfter:5,note:'A note'};
const pub=(events,removedIds=[])=>call('/api/google/publish',{calendarId:'owner@example.test',events,removedIds});
assert.equal((await call('/api/google/publish',{calendarId:'read@example.test',events:[event]})).status,403);assert.equal((await pub([{...event,end:'09:00'}])).status,400);assert.equal((await pub([{...event,prepareBefore:-1}])).status,400);
let published=await read(await pub([event]));assert.equal(published.status,200);assert.equal(published.body.results.length,1);const id=published.body.results[0].googleId,key='owner@example.test/'+id;assert.match(id,/^[a-v0-9]{5,1024}$/);assert.equal(eventStore.get(key).extendedProperties.private.focusId,event.id);assert(eventStore.get(key).description.includes('前10分・後5分'));assert.equal(eventStore.get(key).start.dateTime,'2026-10-26T10:00:00+09:00');assert.equal(insertAttempts,1);
await pub([event]);assert.equal(insertAttempts,1);assert.equal(patches,0);
published=await read(await pub([{...event,start:'11:00',end:'11:30'}]));assert.equal(published.body.conflicts.length,0);assert.equal(patches,1);assert.equal(eventStore.get(key).start.dateTime,'2026-10-26T11:00:00+09:00');
// Google-side edits cannot be overwritten by stale Focus state.
eventStore.get(key).summary='User edited';eventStore.get(key).etag='"user-edited"';published=await read(await pub([{...event,start:'12:00',end:'12:30'}]));assert.equal(published.body.conflicts[0].reason,'google_changed');assert.equal(eventStore.get(key).summary,'User edited');assert.equal(patches,1);
// Explicitly adopting the exact remote content only acknowledges its new ETag.
published=await read(await pub([{...event,title:'User edited',start:'11:00',end:'11:30'}]));assert.equal(published.body.conflicts.length,0);assert.equal(patches,1);
// A race between GET and PATCH is protected by If-Match.
racePatch=true;published=await read(await pub([{...event,title:'User edited',start:'12:00',end:'12:30'}]));assert.equal(published.body.conflicts[0].reason,'google_changed');assert.equal(eventStore.get(key).start.dateTime,'2026-10-26T11:00:00+09:00');
// Omitting an event never deletes it. Explicit remove protects a changed event.
await pub([]);assert(eventStore.has(key));published=await read(await pub([],['focus-plan-1']));assert.equal(published.body.conflicts[0].reason,'google_changed');assert.equal(deletes,0);
await pub([{...event,title:'User edited',start:'11:00',end:'11:30'}]);published=await read(await pub([],['focus-plan-1']));assert.equal(published.body.results[0].deleted,true);assert(!eventStore.has(key));published=await read(await pub([],['focus-plan-1']));assert.equal(published.body.results[0].deleted,true);
// A deterministic id collision is never taken over.
const collision={...event,id:'collision'},collisionId='focus'+sha('personal\0collision');eventStore.set('owner@example.test/'+collisionId,{id:collisionId,summary:'Not Focus',etag:'"foreign"',start:{dateTime:'2026-10-26T10:00:00+09:00'},end:{dateTime:'2026-10-26T10:30:00+09:00'}});published=await read(await pub([collision]));assert.equal(published.body.conflicts[0].reason,'not_focus_owned');assert.equal(eventStore.get('owner@example.test/'+collisionId).summary,'Not Focus');
ambiguousInsert=true;const uncertain={...event,id:'lost-create-ack'};published=await read(await pub([uncertain]));assert.equal(published.body.results.length,1);assert.equal([...eventStore.values()].filter(e=>e.extendedProperties?.private?.focusId===uncertain.id).length,1);
ambiguousPatch=true;published=await read(await pub([{...uncertain,start:'12:00',end:'12:30'}]));assert.equal(published.body.results.length,1);assert.equal(published.body.conflicts.length,0);raceSame=true;published=await read(await pub([{...uncertain,start:'13:00',end:'13:30'}]));assert.equal(published.body.results.length,1);assert.equal(published.body.conflicts.length,0);
// Refresh response without refresh_token must retain the original refresh token.
clock+=180000;assert.equal((await call('/api/google/status')).status,200);clock+=180000;assert.equal((await call('/api/google/status')).status,200);assert.equal(refreshes,2);
// Missing refresh token cannot reuse credentials from another account.
account='different@example.test';const different=await authorize('no-refresh');assert.equal(different.status,400);account='owner@example.test';const sameAccount=await authorize('no-refresh');assert.equal(sameAccount.status,200);
// Expired state cannot exchange a code.
const pending=await (await call('/api/google/connect',{})).json();clock+=11*60000;const expired=await handleGoogle(new Request(origin+'/oauth/google/callback?state='+new URL(pending.url).searchParams.get('state')+'&code=late'),env);assert.equal(expired.status,400);
const disconnected=await read(await call('/api/google/disconnect',{}));assert.equal(disconnected.body.disconnected,true);assert.equal(revoked,1);assert.equal((await (await call('/api/google/status')).json()).connected,false);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM focus_google_tokens').first()).n,0);
// Disconnect/reconnect invalidates exchanges and stale credential responses already in flight.
function gate(){let enter,release;const entered=new Promise(r=>enter=r),block=new Promise(r=>release=r);return {enter,release,entered,block,used:false};}
await authorize();codeGate=gate();const flow=await (await call('/api/google/connect',{})).json(),pendingCallback=handleGoogle(new Request(origin+'/oauth/google/callback?state='+new URL(flow.url).searchParams.get('state')+'&code=held-code'),env);await codeGate.entered;await call('/api/google/disconnect',{});codeGate.release();assert.equal((await pendingCallback).status,400);assert.equal((await (await call('/api/google/status')).json()).connected,false);codeGate=null;
await authorize();statusGate=gate();const oldStatus=call('/api/google/status');await statusGate.entered;await authorize();statusGate.release();assert.equal((await oldStatus).status,409);assert.equal((await (await call('/api/google/status')).json()).connected,true);assert.equal((await db.prepare('SELECT needs_reauth FROM focus_google_tokens WHERE environment=?').bind('personal').first()).needs_reauth,0);statusGate=null;
clock+=180000;refreshGate=gate();const oldRefresh=call('/api/google/status');await refreshGate.entered;await authorize();refreshGate.release();assert.equal((await oldRefresh).status,409);assert.equal((await (await call('/api/google/status')).json()).connected,true);refreshGate=null;
db.close();console.log('Google server checks passed: OAuth PKCE/state/replay, encrypted tokens/account-bound refresh rotation, auth/CSRF/environment, paginated/all-day reads, strict inputs, owned-event writes, ETags and adoption, safe removals, deterministic retry recovery, expiry, disconnect-during-OAuth, stale401 and refresh/reconnect races.');
