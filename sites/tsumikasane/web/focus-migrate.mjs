import {blankData,dateKey,minutesOf} from './core.mjs';
import {decodeBackup} from './focus-portable.mjs';
import {validDate,validTime,validMinutes,validConfig,validFocusData} from './focus-model.mjs';

const normalize=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const yes=v=>v===true||['__YES__','Yes','true','1'].includes(v);
export const notionId=value=>String(value??'').match(/(?:^|\/)([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?:$|[?#/])/i)?.[1]?.replaceAll('-','').toLowerCase()||'';
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
function relation(value){try{const list=Array.isArray(value)?value:JSON.parse(value||'[]');return Array.isArray(list)?list.map(notionId).filter(Boolean):[];}catch{return [];}}
function jst(value){const ms=Date.parse(value);if(!Number.isFinite(ms))return null;const d=new Date(ms);return {date:dateKey(d),time:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(d),iso:d.toISOString(),ms};}
function date(value){if(!value)return '';return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:jst(value)?.date||'';}
const category=value=>/音楽|マーケ|制作|就活|仕事/.test(value)?'work':/運動|健康|食事/.test(value)?'health':/大学|工学|回路|課題|レポート|英語|TOEIC|読書|学習|勉強/.test(value)?'learning':'life';
const cell=value=>value===undefined||value===null?'':typeof value==='string'?value:JSON.stringify(value);

export async function notionMigration(snapshot,{today=dateKey(),legacySources=[]}={}){
  if(snapshot?.format!=='focus-notion-snapshot'||snapshot.version!==1||!snapshot.sources||!validDate(today))throw Error('Notion移行元の形式が一致しません。');
  const sources=snapshot.sources,rows=kind=>sources[kind]?.rows||[],data=blankData(),warnings=[],excluded=[];
  for(const source of Object.values(sources))if(!Array.isArray(source.rows)||source.rows.length>50000)throw Error('Notion移行元の行数を確認してください。');
  const metrics=rows('metrics')[0]||{},windowStart=validTime(metrics['作業開始'])?metrics['作業開始']:'09:00',windowEnd=validTime(metrics['作業終了'])&&metrics['作業終了']>windowStart?metrics['作業終了']:'20:30';
  const config={template:'focus',order:['capture','plan','progress','logs'],progress:'calendar',theme:'dark',routines:[],planning:{dayStart:windowStart,dayEnd:windowEnd,gapMinutes:Number.isInteger(metrics['休憩（分）'])?metrics['休憩（分）']:0,dailyLimit:validMinutes(metrics['1日上限（分）'])?metrics['1日上限（分）']:1440}};
  const menu=new Map(),daily=new Map(),activities=new Map();
  for(const row of rows('menu').slice().sort((a,b)=>(a['並び順']??999)-(b['並び順']??999))){
    const id=notionId(row.url),title=normalize(row['メニュー']);if(!id||!title){excluded.push({kind:'menu',url:row.url,reason:'名前またはIDがありません'});continue;}
    const minutes=Number(row['目安（分）']);
    const r={id:'notion-routine:'+id,title:title.slice(0,200),minutes:validMinutes(minutes)?minutes:25,category:category(row['分野']||title),preferredStart:windowStart,preferredEnd:windowEnd,prepareBefore:0,prepareAfter:0,archived:!yes(row['有効']),activities:[],sourceNotionId:id,sourceProperties:row};
    menu.set(id,r);activities.set(r.id,new Map());config.routines.push(r);
    if(!validMinutes(minutes))warnings.push({kind:'duration_default',url:row.url,minutes:r.minutes});
  }
  async function addActivity(r,title,minutes,origin){
    title=normalize(title);if(!r||!title)return null;const key=title.toLocaleLowerCase('ja');let a=activities.get(r.id).get(key);
    if(!a){a={id:'notion-activity:'+await digest(r.id+'|'+key),title:title.slice(0,200),minutes:validMinutes(minutes)?minutes:r.minutes,sourceNotionUrls:[origin].filter(Boolean)};activities.get(r.id).set(key,a);r.activities.push(a);}
    else if(origin&&!a.sourceNotionUrls.includes(origin))a.sourceNotionUrls.push(origin);
    return a;
  }
  // Recent named work first; empty ranking slots are retained in source tables only.
  for(const row of rows('daily').slice().sort((a,b)=>String(b['date:日付:start']||'').localeCompare(a['date:日付:start']||''))){
    const id=notionId(row.url);if(!id)continue;daily.set(id,row);
    const ids=relation(row['メニュー']),r=ids.length===1?menu.get(ids[0]):null,a=await addActivity(r,row['やること'],Number(row['目安（分）']),row.url);
    const title=normalize(row['やること'])||r?.title||(!/^\d+位$/.test(normalize(row['タスク']))?normalize(row['タスク']):'');
    if(!title){excluded.push({kind:'empty_slot',url:row.url});continue;}
    const due=date(row['date:日付:start']),done=yes(row['完了']),estimate=validMinutes(Number(row['目安（分）']))?Math.max(5,Number(row['目安（分）'])):Math.max(5,r?.minutes||25);
    const task={id:'notion-task:'+id,title:title.slice(0,2000),category:r?.category||category(row['分野']||title),estimate,due,priority:yes(row['最重要'])?'high':'normal',done,doneAt:done&&due?due:null,note:String(row['完了の基準']||'').slice(0,2000),sourceNotionId:id,sourceProperties:row,...(r?{routineId:r.id,activityId:a?.id}:{})};
    const past=due&&due<today;
    if(past||done)data.archive.tasks.push({...task,archivedAt:snapshot.capturedAt});else data.tasks.push(task);
    data.history.push({id:'notion-history:'+task.id,taskId:task.id,action:done?'completed':'imported',occurredAt:null,date:due||null,snapshot:{...task},origin:'notion'});
    const start=jst(row['date:時間枠:start']),end=jst(row['date:時間枠:end']);
    if(start&&end&&start.date===end.date&&end.ms>start.ms&&end.time>start.time){
      data.events.push({id:'notion-event:'+id,taskId:task.id,title:task.title,category:task.category,date:start.date,start:start.time,end:end.time,note:'',source:'notion',sourceNotionId:id,sourceProperties:row,syncGoogle:false,manual:true,...(r?{routineId:r.id,activityId:a?.id,taskTitle:r.title,activityTitle:a?.title}:{}),googleEventId:row['イベントID']||undefined,googleCalendarId:row['カレンダーID']||undefined});
    }else if(start||end)warnings.push({kind:'schedule_kept_in_source',url:row.url});
  }
  for(const row of rows('logs')){
    const id=notionId(row.url),start=jst(row['date:開始:start']),end=jst(row['date:終了:start']);
    if(!id||!start||!end||end.ms<=start.ms||start.date>today){excluded.push({kind:'unfinished_log',url:row.url,reason:!end?'終了日時なし':'日時を確認'});continue;}
    const seconds=Math.floor((end.ms-start.ms)/1000),minutes=Math.max(1,Math.round(seconds/60));
    if(minutes>525600){excluded.push({kind:'invalid_duration',url:row.url});continue;}
    const taskIds=relation(row['タスク']),t=taskIds.length===1?daily.get(taskIds[0]):null,menuIds=relation(t?.['メニュー']),r=menuIds.length===1?menu.get(menuIds[0]):null;
    const title=String(row['セッション']||'作業記録').trim(),work=String(row['やった内容']||t?.['やること']||'').trim(),a=await addActivity(r,work||title,r?.minutes,row.url);
    data.logs.push({id:'notion-log:'+id,title:title.slice(0,2000),category:r?.category||category(title+' '+work),date:start.date,start:start.time,minutes,elapsedSeconds:seconds,startedAt:start.iso,endedAt:end.iso,note:String(row['やった内容']||'').slice(0,2000),sourceNotionId:id,sourceProperties:row,source:'notion',...(r?{routineId:r.id,activityId:a?.id,taskTitle:r.title,activityTitle:a?.title}:{}),...(t?{eventId:'notion-event:'+notionId(t.url)}:{})});
  }
  for(const r of config.routines)if(!r.activities.length)await addActivity(r,r.title,r.minutes,undefined);
  for(const row of rows('deadline')){
    const id=notionId(row.url),title=String(row['タスク']||'').trim();if(!id||!title)continue;
    const done=['提出済','完了'].includes(row['状態']),due=date(row['date:期限:start']);
    const task={id:'notion-task:'+id,title:title.slice(0,2000),category:category(row['分野']||title),estimate:25,due,priority:row['優先度']==='高'?'high':'normal',done,doneAt:null,note:[row['次の一手'],row['逆算プラン']].filter(Boolean).join('\n').slice(0,2000),sourceNotionId:id,sourceProperties:row,estimateUnknown:true};
    if(done||due&&due<today)data.archive.tasks.push({...task,archivedAt:snapshot.capturedAt});else data.tasks.push(task);
    data.history.push({id:'notion-history:'+task.id,taskId:task.id,action:done?'completed':'imported',occurredAt:null,date:null,snapshot:{...task},origin:'notion'});
  }
  for(const row of rows('dailylog')){const d=date(row['date:日付:start']);if(validDate(d)&&row['振り返り'])data.reflections[d]=String(row['振り返り']).slice(0,2000);}
  for(const [kind,source] of Object.entries(sources)){
    const headers=[...new Set(source.rows.flatMap(row=>Object.keys(row)))];
    if(headers.length)data.sourceTables.push({id:'notion-live:'+kind+':'+await digest(JSON.stringify(source.rows)),name:'Notion / '+kind,headers,rows:source.rows.map(row=>headers.map(h=>cell(row[h]))),sourceUrl:source.url});
  }
  if(snapshot.pages?.length)data.sourceTables.push({id:'notion-live-pages:'+await digest(JSON.stringify(snapshot.pages)),name:'Notion / ページ本文',headers:['url','内容JSON'],rows:snapshot.pages.map(p=>[p.url||'',JSON.stringify(p)])});
  data.sourceTables.push(...legacySources);
  const backup=JSON.parse(JSON.stringify({format:'focus-device',version:1,data,config,timer:null}));decodeBackup(backup);
  const summary={routines:config.routines.filter(r=>!r.archived).length,archivedRoutines:config.routines.filter(r=>r.archived).length,activities:config.routines.filter(r=>!r.archived).reduce((n,r)=>n+r.activities.filter(a=>!a.archived).length,0),logs:data.logs.length,minutes:data.logs.reduce((n,l)=>n+l.minutes,0),schedule:data.events.length,completionHistory:data.history.filter(h=>h.action==='completed').length,emptySlots:excluded.filter(e=>e.kind==='empty_slot').length,unfinishedLogs:excluded.filter(e=>e.kind==='unfinished_log').length,sourceTables:data.sourceTables.length};
  return {format:'focus-migration',version:1,id:'notion-'+await digest(JSON.stringify(backup)),source:'notion',capturedAt:snapshot.capturedAt,timeZone:'Asia/Tokyo',backup,summary,warnings,excluded};
}

export function mergeMigration(current,packet){
  if(packet?.format!=='focus-migration'||packet.version!==1||typeof packet.id!=='string'||!/^notion-[a-f0-9]{64}$/.test(packet.id))throw Error('対応していない移行データです。');
  const old=decodeBackup(current),incoming=decodeBackup(packet.backup);if(!old.config||!incoming.config)throw Error('移行する設定がありません。');
  const result={...structuredClone(current),data:structuredClone(old.data)},d=result.data,c=result.config,conflicts=[],added={logs:0,events:0,tasks:0,routines:0,activities:0};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  for(const kind of ['tasks','events','logs']){
    const known=new Map([...d[kind],...d.archive[kind]].map(x=>[x.id,x]));
    for(const [archived,list] of [[false,incoming.data[kind]],[true,incoming.data.archive[kind]]])for(const row of list){
      const existing=known.get(row.id);
      if(existing){if(!same(existing,row))conflicts.push({kind,id:row.id});continue;}
      (archived?d.archive[kind]:d[kind]).push(structuredClone(row));known.set(row.id,row);added[kind]++;
    }
  }
  for(const kind of ['history','sourceTables']){const ids=new Set(d[kind].map(x=>x.id));for(const row of incoming.data[kind])if(!ids.has(row.id)){d[kind].push(structuredClone(row));ids.add(row.id);}}
  for(const [day,text] of Object.entries(incoming.data.reflections)){if(!Object.hasOwn(d.reflections,day))d.reflections[day]=text;else if(d.reflections[day]!==text)conflicts.push({kind:'reflection',id:day});}
  for(const r of incoming.config.routines){const existing=c.routines.find(v=>v.id===r.id);if(!existing){c.routines.push(structuredClone(r));added.routines++;continue;}
    const ids=new Set((existing.activities||[]).map(a=>a.id));existing.activities||=[];
    for(const a of r.activities||[])if(!ids.has(a.id)){existing.activities.push(structuredClone(a));ids.add(a.id);added.activities++;}
  }
  c.planning??=structuredClone(incoming.config.planning);
  const importedPlans=new Set((d.focusPlans||[]).map(p=>p.id));for(const p of incoming.data.focusPlans||[])if(!importedPlans.has(p.id)){(d.focusPlans||=[]).push(structuredClone(p));importedPlans.add(p.id);}
  const migrations=Array.isArray(d.migrations)?d.migrations:[];
  if(!migrations.some(m=>m.id===packet.id))d.migrations=[...migrations,{id:packet.id,source:packet.source,capturedAt:packet.capturedAt,summary:packet.summary,warnings:packet.warnings||[],excluded:packet.excluded||[]}];
  if(!validConfig(c)||!validFocusData(d))throw Error('移行結果を検証できませんでした。現在のデータは変更していません。');
  return {backup:result,added,conflicts};
}

export async function verifyMigration(packet){
  if(packet?.format!=='focus-migration'||packet.version!==1||packet.source!=='notion')throw Error('対応していない移行データです。');
  decodeBackup(packet.backup);
  if(packet.summary?.logs!==packet.backup.data.logs.length)throw Error('移行件数の整合性を確認できませんでした。');
  if(packet.id!=='notion-'+await digest(JSON.stringify(packet.backup)))throw Error('移行データの整合性を確認できませんでした。');
  return packet;
}
