import { unzipSync } from './vendor/fflate.mjs';
import { parseCSV } from './transfer.mjs';
import { blankData, dateKey, validateData } from './core.mjs';

const clean=v=>String(v||'').replace(/\s*\([^)]*\.(?:md|csv)\)/g,'').replace(/\s+/g,' ').trim();
export function notionDate(value,year=Number(dateKey().slice(0,4))) {
  if(!value)return '';
  const s=String(value).trim();
  let m=s.match(/^(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})/);
  if(!m){const short=s.match(/^(\d{1,2})[ /](\d{1,2})(?:$|\s)/);if(short)m=['',String(year),short[1],short[2]];}
  if(!m)throw Error('日付を読めません：'+s.slice(0,60));
  const d=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  if(new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw Error('存在しない日付です');
  return d;
}
function notionStamp(value,year) {
  const date=notionDate(value,year);if(!date)return null;
  const m=value.match(/(?:日\s*|\s)(\d{1,2}):(\d{2})/);if(!m)return null;
  const time=m[1].padStart(2,'0')+':'+m[2];if(time>'23:59')throw Error('時刻が不正です');
  return {date,time,iso:new Date(date+'T'+time+':00+09:00').toISOString()};
}
const category=value=>/大学|英語|読書|学習|勉強/.test(value)?'learning':/音楽|制作|マーケ|仕事|業務/.test(value)?'work':/健康|運動|睡眠|食事|トレーニング/.test(value)?'health':'life';
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
export function readNotionZip(bytes) {
  if(bytes.length>25*1024*1024)throw Error('ZIPは25MB以内にしてください');
  let entries=0,total=0;
  const files=unzipSync(bytes,{filter:e=>{entries++;total+=e.originalSize;if(entries>2000||total>40*1024*1024||e.originalSize>5*1024*1024)throw Error('ZIPの展開後サイズまたは件数が上限を超えています');return /\.(csv|md)$/i.test(e.name)&&!e.name.startsWith('__MACOSX/');}});
  const tables=[],documents=[];
  for(const [path,content] of Object.entries(files)) {
    const text=new TextDecoder('utf-8',{fatal:true}).decode(content);
    if(path.toLowerCase().endsWith('.csv')){const parsed=parseCSV(text);tables.push({path,name:path.split('/').pop().replace(/\s+[a-f0-9]{32}(?:_all)?\.csv$/i,''),...parsed});}
    else {
      const props={};for(const line of text.split(/\r?\n/)){const m=line.match(/^([^:\n]{1,100}):\s*(.*)$/);if(m)props[m[1]]=m[2];}
      documents.push({path,heading:clean(text.match(/^#\s+(.+)/m)?.[1]||''),props,text,id:path.match(/([a-f0-9]{32})\.md$/i)?.[1]});
    }
  }
  if(!tables.length)throw Error('ZIPにCSVがありません。Notionで「Markdown & CSV」形式でエクスポートしてください');
  return {tables,documents,totalFiles:Object.keys(files).length};
}
export async function importNotionZip(archive,existing,options={}) {
  const year=options.year||Number(dateKey().slice(0,4)),today=options.today||dateKey(),now=options.now||new Date().toISOString(),data=blankData(),warnings=[],errors=[];
  let duplicates=0;
  const seen=new Set([...existing.tasks,...existing.events,...existing.logs,...(existing.archive?.tasks||[]),...(existing.archive?.logs||[]),...(existing.archive?.events||[])].map(i=>i.id));
  const grouped=new Map();
  for(const t of archive.tables){const key=t.path.replace(/_all\.csv$/i,'.csv');const old=grouped.get(key);if(!old||t.headers.length>old.headers.length)grouped.set(key,t);}
  const selected=[...grouped.values()].filter(t=>t.name!=='無題');
  const findDocument=(title,props)=>archive.documents.find(d=>d.id&&d.heading===clean(title)&&Object.entries(props).every(([k,v])=>!v||clean(d.props[k])===clean(v)));
  const keyFor=async(kind,t,row,identity,doc)=>'notion-'+kind+':'+(doc?.id||await digest((t.path.match(/[a-f0-9]{32}/i)?.[0]||t.name)+'|'+identity));
  const addTask=(task,past=false)=>{
    if(seen.has(task.id)){duplicates++;return;}seen.add(task.id);
    if(past&&options.archivePast!==false)data.archive.tasks.push({...task,archivedAt:now});else data.tasks.push(task);
    data.history.push({id:'notion-history:'+task.id,taskId:task.id,action:task.done?'completed':'imported',occurredAt:null,date:task.done?task.doneAt:task.due||null,snapshot:{...task},origin:'notion'});
  };
  for(const table of selected) {
    const daily=/Daily Tasks/i.test(table.name)||table.headers.includes('生成キー')&&table.headers.includes('タスク')&&table.headers.includes('完了');
    const deadline=/締切|Deadline/i.test(table.name)&&table.headers.includes('タスク');
    const logs=table.headers.includes('セッション')&&table.headers.includes('作業分')&&table.headers.includes('開始');
    const reflections=/Daily Log/i.test(table.name)&&table.headers.includes('振り返り');
    if(!daily&&!deadline&&!logs&&!reflections)continue;
    for(const [index,values] of table.rows.entries()) {
      const row=Object.fromEntries(table.headers.map((h,i)=>[h,values[i]]));
      try {
        if(daily||deadline) {
          const rawTitle=row.タスク,menu=clean(row.メニュー),title=clean(row.やること)||menu||rawTitle||'名称未設定のタスク';
          const due=notionDate(daily?row.日付:row.期限,year),originalCategory=row.分野||menu||'',done=/^(Yes|true|1|完了|提出済|済|Done)$/i.test(row.完了||row.状態||'');
          const doc=findDocument(rawTitle,daily?{'日付':row.日付}:{'期限':row.期限});
          const id=await keyFor('task',table,row,row.生成キー||[rawTitle,due].join('|'),doc);
          let estimate=Number(row['目安（分）']||row.予定分||0);
          if(!estimate&&row.見積残時間){estimate=options.estimateUnit==='hours'?Number(row.見積残時間)*60:options.estimateUnit==='minutes'?Number(row.見積残時間):30;if(!options.estimateUnit)warnings.push('「見積残時間」の単位未指定：30分を仮設定し元の値を保持');}
          if(!Number.isInteger(estimate)||estimate<5||estimate>1440){estimate=30;warnings.push('所要時間が空欄・範囲外のタスクは30分を仮設定し元の値を保持');}
          const note=[row.次の一手,row.完了の基準,row.逆算プラン].filter(Boolean).join('\n').slice(0,2000);
          const task={id,title,category:category(originalCategory),originalCategory,estimate,due,priority:row.優先度==='高'||row.最重要==='Yes'?'high':'normal',done,doneAt:done?(daily?due:null):null,note,sourceProperties:row,sourceNotionId:doc?.id||null};
          addTask(task,daily&&due<today);
          if(row.時間枠){const [a,b]=row.時間枠.split(/\s*→\s*/),start=notionStamp(a,year);const endStamp=/^\d{4}[年/-]/.test(b||'')?notionStamp(b,year):null;const end=endStamp?.time||b?.match(/^(\d{1,2}):(\d{2})/)?.slice(1).map(v=>v.padStart(2,'0')).join(':');
            if(start&&end&&end>start.time){const event={id:'notion-event:'+id,taskId:id,title,category:task.category,date:start.date,start:start.time,end,note:'Notionから取り込み'};if(!seen.has(event.id)){seen.add(event.id);data.events.push(event);}else duplicates++;}else warnings.push('日をまたぐなど対応外の時間枠は元データに保持');}
        } else if(logs) {
          const start=notionStamp(row.開始,year),end=row.終了?notionStamp(row.終了,year):null,minutes=Number(row.作業分);
          if(!start||!Number.isInteger(minutes)||minutes<1||minutes>525600)throw Error('開始日時・作業分を確認してください');
          if(start.date>today)throw Error('未来の実行記録は元データとして保管します');
          const title=row.セッション||'作業記録',doc=findDocument(title,{'開始':row.開始});const id=await keyFor('log',table,row,title+'|'+row.開始,doc);
          if(seen.has(id)){duplicates++;continue;}seen.add(id);
          if(minutes>1440)warnings.push('24時間を超える作業ログが1件あります。元の値を保持して取り込みます');
          data.logs.push({id,title,category:category(clean(row.タスク)||title),date:start.date,minutes,note:(row.やった内容||'').slice(0,2000),startedAt:start.iso,endedAt:end?.iso||null,sourceProperties:row,sourceNotionId:doc?.id||null});
        } else if(reflections) {
          const value=row.振り返り;if(!value)continue;const d=notionDate(row.日付||(/^\d{4}-/.test(row.日)?row.日:''),year);
          if(!d){warnings.push('日付のない振り返りは元データとして保管');continue;}
          if(existing.reflections[d]){if(existing.reflections[d]!==value)warnings.push('既存の振り返りがある日は上書きせず元データとして保管');else duplicates++;}else data.reflections[d]=value.slice(0,2000);
        }
      }catch(error){errors.push({table:table.name,line:index+2,reason:error.message});}
    }
  }
  const existingSources=new Set((existing.sourceTables||[]).map(t=>t.id));
  for(const table of archive.tables){const id='notion-source:'+await digest(table.path+'|'+JSON.stringify(table.rows));if(!existingSources.has(id))data.sourceTables.push({id,name:table.name+' / '+table.path.split('/').pop(),headers:table.headers,rows:table.rows});}
  if(archive.documents.length){const rows=archive.documents.map(d=>[d.path,d.text]),id='notion-documents:'+await digest(JSON.stringify(rows));if(!existingSources.has(id))data.sourceTables.push({id,name:'Notionページ本文',headers:['ファイル','本文'],rows});}
  if(!validateData(data))throw Error('Notionの取り込み結果を検証できませんでした。元データは変更していません');
  return {data,duplicates,warnings:[...new Set(warnings)],errors};
}
