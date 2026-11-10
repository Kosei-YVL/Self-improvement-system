import {dateKey,dayAdd} from './core.mjs';
import {keyMaterial} from './focus-sync-model.mjs';
const DAY=86400000,ZONE='Asia/Tokyo',SETTINGS='focus-google-settings',CACHE='focus-google-cache',PUBLISHED='focus-google-publish';
const defaultSettings=()=>({calendarIds:[],publishCalendarId:'',autoPublish:false,selectionSet:false});
const clone=v=>structuredClone(v);
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const validTime=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=2048;
function calendarIds(ids){if(!Array.isArray(ids)||ids.length>20||!ids.every(validId))throw Error('カレンダーの選択を確認してください。');return [...new Set(ids)];}
function jsonRead(store,key,fallback){try{const raw=store.read(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function ownId(event,environment){const p=event.extendedProperties?.private;return p?.focusEnv===environment&&typeof p.focusId==='string'&&p.focusId?p.focusId:null;}
function parts(ms,timeZone){return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(ms).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function timestamp(value,timeZone){
 if(typeof value!=='string'||!validDate(value.slice(0,10)))return NaN;
 if(/(?:Z|[+-]\d\d:\d\d)$/.test(value))return Date.parse(value);
 // Google normally supplies an offset. If it supplies an IANA zone instead, honor its DST.
 const m=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d)(\.\d+)?)?$/.exec(value);
 if(!m||!validDate(m[1])||!timeZone||Number(m[2])>23||Number(m[3])>59||Number(m[4]||0)>59)return NaN;
 const [year,month,day]=m[1].split('-').map(Number),hour=Number(m[2]),minute=Number(m[3]),second=Number(m[4]||0),millisecond=Math.floor(Number(m[5]||0)*1000),wall=Date.UTC(year,month-1,day,hour,minute,second),candidates=[];
 try{for(const shift of [-36,0,36]){const probe=wall+shift*3600000,p=parts(probe,timeZone),offset=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-probe,candidate=wall-offset,c=parts(candidate,timeZone);if(c.year===year&&c.month===month&&c.day===day&&c.hour===hour&&c.minute===minute&&c.second===second)candidates.push(candidate+millisecond);}}catch{return NaN;}
 return candidates.length?Math.min(...candidates):NaN;
}
function minuteLabel(value){return value===1440?'24:00':String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
function segmentBase(event,environment,focusIds){const focusId=ownId(event,environment),focusOwned=!!focusId,mirrored=focusOwned&&focusIds.has(focusId);return {googleId:event.id,calendarId:event.calendarId||'',title:typeof event.summary==='string'&&event.summary?event.summary:'予定',source:'google',readOnly:true,etag:typeof event.etag==='string'?event.etag:'',htmlLink:typeof event.htmlLink==='string'&&/^https:\/\//.test(event.htmlLink)?event.htmlLink:'',focusId,focusOwned,mirrored,transparent:event.transparency==='transparent',busy:event.transparency!=='transparent'&&!mirrored,recurringEventId:event.recurringEventId||null};}
/** External calendar segments never enter Focus's domain data. End 24:00 is intentional. */
export function mapGoogleEvents(events,{environment='personal',focusIds=[],timeMin,timeMax}={}){
 if(!Array.isArray(events))return [];
 const known=new Set(focusIds),result=[],seen=new Set(),rangeMin=timeMin?Date.parse(timeMin):NaN,rangeMax=timeMax?Date.parse(timeMax):NaN;
 for(const event of events){
  if(!event||!validId(event.id)||event.status==='cancelled')continue;
  const base=segmentBase(event,environment,known);let first,last,start,end,allDay=false;
  if(validDate(event.start?.date)&&validDate(event.end?.date)){
   if(event.end.date<=event.start.date)continue;allDay=true;first=event.start.date;last=dayAdd(event.end.date,-1);
  }else{
   start=timestamp(event.start?.dateTime,event.start?.timeZone||event.timeZone);end=timestamp(event.end?.dateTime,event.end?.timeZone||event.timeZone);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
   first=dateKey(new Date(start));last=dateKey(new Date(end-1));
  }
  if(Number.isFinite(rangeMin)&&first<dateKey(new Date(rangeMin)))first=dateKey(new Date(rangeMin));
  if(Number.isFinite(rangeMax)&&last>dateKey(new Date(rangeMax-1)))last=dateKey(new Date(rangeMax-1));
  if(last<first)continue;
  // API reads use bounded windows. A malformed centuries-long item cannot freeze the UI.
  let count=0;
  for(let date=first;date<=last&&count<400;date=dayAdd(date,1),count++){
   const midnight=Date.parse(date+'T00:00:00+09:00'),startMinute=allDay?0:Math.max(0,Math.floor((Math.max(start,midnight)-midnight)/60000)),endMinute=allDay?1440:Math.min(1440,Math.ceil((Math.min(end,midnight+DAY)-midnight)/60000));
   if(endMinute<=startMinute)continue;
   const id='google:'+encodeURIComponent(base.calendarId)+':'+encodeURIComponent(event.id)+':'+date;if(seen.has(id))continue;seen.add(id);
   result.push({...base,id,date,start:minuteLabel(startMinute),end:minuteLabel(endMinute),startMinute,endMinute,allDay});
  }
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.startMinute-b.startMinute||a.id.localeCompare(b.id));
}
/** Publish the task interval itself. Preparation reserves Focus time but is not work duration. */
export function toGoogleEvent(event,{environment='personal'}={}){
 if(!event||!validId(event.id)||event.id.length>1024||!validDate(event.date)||!validTime(event.start)||!validTime(event.end)||event.end<=event.start||typeof event.title!=='string'||!event.title.trim()||event.title.length>2000)throw Error('Googleへ反映する予定の内容・日付・時間を確認してください。');
 const before=event.prepareBefore??0,after=event.prepareAfter??0;
 if(![before,after].every(v=>Number.isInteger(v)&&v>=0&&v<=240))throw Error('準備時間を確認してください。');
 const description=[typeof event.note==='string'?event.note:'',before||after?`Focus: 準備 前${before}分 / 後${after}分`:''].filter(Boolean).join('\n');
 return {summary:event.title,description,start:{dateTime:event.date+'T'+event.start+':00+09:00',timeZone:ZONE},end:{dateTime:event.date+'T'+event.end+':00+09:00',timeZone:ZONE},extendedProperties:{private:{focusId:event.id,focusEnv:environment}}};
}
export const googleBusyEvents=(events,options)=>mapGoogleEvents(events,options).filter(event=>event.busy);
function signature(event,environment){return JSON.stringify(toGoogleEvent(event,{environment}));}
function validateRange({timeMin,timeMax},now){const min=timeMin||new Date(now-30*DAY).toISOString(),max=timeMax||new Date(now+90*DAY).toISOString(),a=Date.parse(min),b=Date.parse(max);if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b||b-a>370*DAY)throw Error('Googleの取得期間は370日以内で指定してください。');return {timeMin:new Date(a).toISOString(),timeMax:new Date(b).toISOString()};}
function publishedKey(calendarId,focusId){return JSON.stringify([calendarId,focusId]);}
export class GoogleCalendar{
 constructor({store,environment='personal',onChange=()=>{},onStatus=()=>{},getFocusIds=()=>[],fetcher=(...args)=>globalThis.fetch(...args),clock=Date.now,pollMs=60000}){
  Object.assign(this,{store,environment,onChange,onStatus,getFocusIds,fetcher,clock,pollMs});
  const saved=jsonRead(store,SETTINGS,{});this.settings=defaultSettings();
  try{if(saved&&typeof saved==='object'){if(Array.isArray(saved.calendarIds))this.settings.calendarIds=calendarIds(saved.calendarIds);if(saved.publishCalendarId===''||validId(saved.publishCalendarId))this.settings.publishCalendarId=saved.publishCalendarId;this.settings.autoPublish=saved.autoPublish===true;this.settings.selectionSet=saved.selectionSet===true;}}catch{this.settings=defaultSettings();}
  const cache=jsonRead(store,CACHE,{});this.rawEvents=Array.isArray(cache.events)?cache.events:[];this.fetchedAt=Number.isFinite(cache.fetchedAt)?cache.fetchedAt:0;this.range={timeMin:cache.timeMin,timeMax:cache.timeMax};
  const state=jsonRead(store,PUBLISHED,{});this.published=state&&typeof state==='object'&&!Array.isArray(state)?state:{};
  this.conflicts=Object.values(this.published).filter(v=>v?.blocked).map(v=>v.conflict);this.calendars=[];this.connected=false;this.configured=false;this.message=this.status=this.rawEvents.length?'Google・保存済みの予定':'Google未接続';this.stale=!!this.rawEvents.length;this.refreshing=null;this.loading=null;this.publishQueue=Promise.resolve();this.events=[];this.generation=0;this.remap();
 }
 setStatus(message){this.message=this.status=message;this.onStatus(message);}
 async persist(key,value){this.store.write(key,JSON.stringify(value));if(this.store.flush&&!await this.store.flush())throw Error('端末に保存できません。記録を控えてから空き容量を確認してください。');}
 remap(){const ids=new Set(this.settings.calendarIds),raw=this.settings.selectionSet?this.rawEvents.filter(e=>ids.has(e.calendarId)):this.rawEvents;this.events=mapGoogleEvents(raw,{environment:this.environment,focusIds:this.getFocusIds(),...this.range});return this.events;}
 async request(path,body){
  const secret=this.store.read('focus-sync-key');if(!secret)throw Error('Google連携の前に同期キーを接続してください。');
  const {auth}=await keyMaterial(secret);let response;try{response=await this.fetcher('/api/google/'+path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{Authorization:'Bearer '+auth,'X-Focus-Environment':this.environment,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});}catch{throw Error('Googleに接続できません。保存済みの予定は保持しています。');}
  let result;try{result=await response.json();}catch{throw Error('Google連携の応答を確認できません。保存済みの予定は保持しています。');}
  if(!response.ok){const code=result?.error;if(response.status===401){if(/google|token|reconnect/.test(code||'')){this.connected=false;this.knownStatus=false;throw Error('Googleに再接続してください。');}throw Error('同期キーを確認してください。');}if(response.status===403)throw Error(code==='environment_mismatch'?'接続先の環境を確認してください。':'カレンダーの権限を確認してください。');if(response.status===503)throw Error('Google連携のOAuth設定が未完了です。');if(response.status===429)throw Error('Googleの利用上限に達しました。時間をおいて再試行します。');throw Error(result?.message||'Googleと接続できません。保存済みの予定は保持しています。');}
  if(!result||typeof result!=='object')throw Error('Google連携の応答形式が一致しません。');return result;
 }
 async configure(changes){
  const next={...this.settings};if('calendarIds'in changes){next.calendarIds=calendarIds(changes.calendarIds);next.selectionSet=true;}if('publishCalendarId'in changes){if(changes.publishCalendarId!==''&&!validId(changes.publishCalendarId))throw Error('書き込み先を選択してください。');next.publishCalendarId=changes.publishCalendarId;}if('autoPublish'in changes){if(typeof changes.autoPublish!=='boolean')throw Error('自動反映の設定を確認してください。');next.autoPublish=changes.autoPublish;}
  if(next.autoPublish&&!next.publishCalendarId)throw Error('自動反映の前に書き込み先を選択してください。');await this.persist(SETTINGS,next);this.settings=next;this.remap();this.onChange(this.events);return this.settings;
 }
 async loadStatus(){if(this.loading)return this.loading;this.loading=this._loadStatus();try{return await this.loading;}finally{this.loading=null;}}
 async _loadStatus(){const generation=this.generation;try{const result=await this.request('status');if(generation!==this.generation)return {...result,connected:this.connected};this.connected=result.connected===true;this.configured=result.configured===true;this.calendars=Array.isArray(result.calendars)?result.calendars.filter(c=>c&&validId(c.id)):[];
   if(this.connected&&!this.settings.selectionSet){this.settings={...this.settings,calendarIds:this.calendars.filter(c=>!c.deleted).slice(0,20).map(c=>c.id),selectionSet:true};await this.persist(SETTINGS,this.settings);if(generation!==this.generation)return {...result,connected:this.connected};this.remap();this.onChange(this.events);}
   this.knownStatus=true;this.setStatus(this.connected?(this.conflicts.length?'Googleの変更を確認してください。':'Google接続済み'):this.configured?'Google未接続':'GoogleのOAuth設定が未完了');return result;
  }catch(error){if(generation!==this.generation)return {connected:this.connected,configured:this.configured};this.stale=!!this.rawEvents.length;this.setStatus(error.message);throw error;}}
 async connect(){const result=await this.request('connect',{});let url;try{url=new URL(result.url);}catch{throw Error('Googleの認証URLを確認できません。');}if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw Error('Googleの認証先が一致しません。');this.setStatus('Googleの認証待ち');return {url:url.href};}
 async disconnect(){const result=await this.request('disconnect',{});this.generation++;this.connected=false;this.knownStatus=true;this.rawEvents=[];this.events=[];this.fetchedAt=0;this.stale=false;this.conflicts=[];this.published={};await this.persist(CACHE,{events:[],fetchedAt:0});await this.persist(PUBLISHED,{});this.onChange(this.events);this.setStatus('Google未接続');return result;}
 async refresh(options={}){const key=JSON.stringify([options.calendarIds||this.settings.calendarIds,options.timeMin||'',options.timeMax||'']);if(this.refreshing){if(key===this.refreshingKey)return this.refreshing;await this.refreshing.catch(()=>{});return this.refresh(options);}this.refreshingKey=key;this.refreshing=this._refresh(options);try{return await this.refreshing;}finally{this.refreshing=null;this.refreshingKey=null;}}
 async _refresh(options){const generation=this.generation;try{if(!this.knownStatus)await this.loadStatus();if(!this.connected){this.setStatus(this.configured?'Google未接続':'GoogleのOAuth設定が未完了');return this.events;}
   const range=validateRange(options,this.clock()),ids=options.calendarIds===undefined?this.settings.calendarIds:calendarIds(options.calendarIds);if(!ids.length){this.rawEvents=[];this.events=[];this.range=range;this.fetchedAt=this.clock();await this.persist(CACHE,{events:[],fetchedAt:this.fetchedAt,...range});this.onChange(this.events);this.setStatus('表示カレンダー未選択');return this.events;}
   this.setStatus('Googleの予定を取得中');const collected=[],calendars=new Map();
   for(let offset=0;offset<ids.length;offset+=5){const result=await this.request('refresh',{calendarIds:ids.slice(offset,offset+5),...range});if(!Array.isArray(result.events)||result.events.length>20000||!result.events.every(e=>e&&validId(e.id)&&validId(e.calendarId)))throw Error('Googleの予定の形式が一致しません。');collected.push(...result.events);if(collected.length>20000)throw Error('Googleの予定が多すぎるため取得期間を短くしてください。');for(const c of result.calendars||[])if(c&&validId(c.id))calendars.set(c.id,c);}
   const result={events:collected,...(calendars.size?{calendars:[...calendars.values()]}:{})};
   if(generation!==this.generation)return this.events;
   const raw=clone(result.events);let metaChanged=false;for(const event of raw){const id=ownId(event,this.environment),key=id&&publishedKey(event.calendarId,id),state=key&&this.published[key];if(state?.etag&&event.etag&&state.etag!==event.etag&&!state.blocked){state.needsCheck=true;metaChanged=true;}}
   await this.persist(CACHE,{events:raw,fetchedAt:this.clock(),...range});if(generation!==this.generation)return this.events;if(metaChanged)await this.persist(PUBLISHED,this.published);
   if(generation!==this.generation)return this.events;this.rawEvents=raw;this.range=range;this.fetchedAt=this.clock();this.stale=false;if(Array.isArray(result.calendars))this.calendars=result.calendars.filter(c=>c&&validId(c.id));this.remap();this.onChange(this.events);this.setStatus(this.conflicts.length?'Googleの変更を確認してください。':'Googleの予定を更新済み');return this.events;
  }catch(error){if(generation!==this.generation)return this.events;this.stale=!!this.rawEvents.length;this.setStatus(globalThis.navigator?.onLine===false?'オフライン・Googleの予定は保存済み':error.message);throw error;}}
 publish(events,{calendarId=this.settings.publishCalendarId,removedIds=[],forceCheck=false}={}){
  const batch=clone(events),removed=clone(removedIds),generation=this.generation;const operation=this.publishQueue.catch(()=>{}).then(()=>this._publish(batch,{calendarId,removedIds:removed,forceCheck,generation}));this.publishQueue=operation;return operation;
 }
 async _publish(events,{calendarId,removedIds,forceCheck,generation}){if(generation!==this.generation)return {results:[],conflicts:[],skipped:[]};try{
   if(!validId(calendarId))throw Error('Googleへの書き込み先を選択してください。');if(!Array.isArray(events)||events.length>10000||new Set(events.map(e=>e?.id)).size!==events.length)throw Error('反映する予定を確認してください。');if(!Array.isArray(removedIds)||removedIds.length>10000||!removedIds.every(validId))throw Error('削除するFocus予定を確認してください。');removedIds=[...new Set(removedIds)];
   const target=this.calendars.find(c=>c.id===calendarId);if(target?.accessRole&&!['owner','writer'].includes(target.accessRole))throw Error('選択したカレンダーには書き込めません。');
   const pending=[],signatures=new Map(),skipped=[];
   for(const event of events){const sig=signature(event,this.environment),key=publishedKey(calendarId,event.id),old=this.published[key];signatures.set(event.id,sig);if(!forceCheck&&old?.signature===sig&&(old.blocked||!old.needsCheck)){skipped.push(event.id);continue;}pending.push(event);}
   const deletes=removedIds.filter(id=>{const old=this.published[publishedKey(calendarId,id)];return forceCheck||!old?.blocked||old.signature!=='deleted';});
   if(!pending.length&&!deletes.length){this.conflicts=Object.values(this.published).filter(v=>v?.blocked).map(v=>v.conflict);this.setStatus(this.conflicts.length?'Googleの変更を確認してください。':'Googleへ反映済み');return {results:[],conflicts:this.conflicts,skipped};}
   this.setStatus('Googleへ予定を反映中');const operations=[...pending.map(event=>({event})),...deletes.map(id=>({id}))],allResults=[];
   for(let offset=0;offset<operations.length;offset+=5){if(generation!==this.generation)return {results:allResults,conflicts:[],skipped};
    const batch=operations.slice(offset,offset+5),batchEvents=batch.filter(v=>v.event).map(v=>v.event),batchDeletes=batch.filter(v=>v.id).map(v=>v.id),result=await this.request('publish',{calendarId,events:batchEvents,removedIds:batchDeletes});
    if(generation!==this.generation)return {results:allResults,conflicts:[],skipped};
    if(!Array.isArray(result.results)||result.conflicts!==undefined&&!Array.isArray(result.conflicts))throw Error('Googleへの反映結果を確認できません。');
    const byId=new Map(batchEvents.map(e=>[e.id,e])),next={...this.published},acknowledged=new Set();
    for(const row of result.results){if(!row||!validId(row.focusId))continue;const key=publishedKey(calendarId,row.focusId);if(batchDeletes.includes(row.focusId)&&!byId.has(row.focusId)){delete next[key];acknowledged.add(row.focusId);continue;}if(!byId.has(row.focusId))continue;next[key]={calendarId,focusId:row.focusId,signature:signatures.get(row.focusId),googleId:row.googleId||'',etag:row.etag||'',htmlLink:row.htmlLink||'',blocked:false,needsCheck:false};acknowledged.add(row.focusId);}
    for(const conflict of result.conflicts||[]){if(!conflict||!validId(conflict.focusId)||!byId.has(conflict.focusId)&&!batchDeletes.includes(conflict.focusId))continue;const key=publishedKey(calendarId,conflict.focusId);next[key]={...next[key],calendarId,focusId:conflict.focusId,signature:signatures.get(conflict.focusId)||'deleted',blocked:true,conflict:{...conflict,calendarId}};acknowledged.add(conflict.focusId);}
    await this.persist(PUBLISHED,next);if(generation!==this.generation)return {results:allResults,conflicts:[],skipped};this.published=next;this.conflicts=Object.values(next).filter(v=>v?.blocked).map(v=>v.conflict);allResults.push(...result.results);
    if([...byId.keys(),...batchDeletes].some(id=>!acknowledged.has(id)))throw Error('一部の予定の反映結果を確認できません。確認できた予定は保持しています。');
   }
   this.setStatus(this.conflicts.length?'Googleの変更を確認してください。':'Googleへ反映済み');return {results:allResults,conflicts:this.conflicts,skipped};
  }catch(error){if(generation!==this.generation)return {results:[],conflicts:[],skipped:[]};this.setStatus(error.message);throw error;}}

 async retryConflicts(){const next={...this.published};for(const [key,value] of Object.entries(next))if(value?.blocked)delete next[key];await this.persist(PUBLISHED,next);this.published=next;this.conflicts=[];}
 start(){if(this.poll)return;this.stopped=false;const run=()=>{if(this.stopped||globalThis.document?.hidden||!this.store.read('focus-sync-key'))return;this.refresh().catch(()=>{});};this.poll=setInterval(run,this.pollMs);this.listeners=[];
  if(globalThis.window){for(const name of ['focus','online']){window.addEventListener(name,run);this.listeners.push(()=>window.removeEventListener(name,run));}const message=event=>{if(event.origin===window.location.origin&&event.data?.type==='focus-google-connected'){this.knownStatus=false;run();}};window.addEventListener('message',message);this.listeners.push(()=>window.removeEventListener('message',message));}
  if(globalThis.document){const visible=()=>{if(!document.hidden)run();};document.addEventListener('visibilitychange',visible);this.listeners.push(()=>document.removeEventListener('visibilitychange',visible));}run();
 }
 stop(){this.stopped=true;clearInterval(this.poll);this.poll=null;for(const remove of this.listeners||[])remove();this.listeners=[];}
}
