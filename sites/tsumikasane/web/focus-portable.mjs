import {zipSync,strToU8} from './vendor/fflate.mjs';
import {exportICS} from './transfer.mjs';
import {normalizeData} from './history.mjs';
import {validConfig,validTimer,validDraft,validFocusData} from './focus-model.mjs';
const csv=rows=>'\uFEFF'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
export function decodeBackup(raw){
 const focus=raw?.format==='focus-device';
 if(focus&&raw.version!==1)throw Error('このバックアップは新しい形式です。対応する版で開いてください。');
 const source=focus?raw.data:raw;
 if(!source||![1,2].includes(source.version))throw Error('対応していないデータ形式です。');
 const data=normalizeData(source);
 if(!validFocusData(data))throw Error('データ形式が一致しません。');
 if(focus&&(!validConfig(raw.config)||!validTimer(raw.timer??null)||raw.draft!==undefined&&!validDraft(raw.draft)))throw Error('設定・計測・下書きの形式が一致しません。');
 if(focus&&raw.manualDraft!==undefined&&(!raw.manualDraft||typeof raw.manualDraft!=='object'||!['id','event','routine','activity','title','date','start','duration'].every(k=>typeof raw.manualDraft[k]==='string'&&raw.manualDraft[k].length<=2000)))throw Error('入力途中の記録の形式が一致しません。');
 return {data,...(focus?{config:raw.config,timer:raw.timer??null,draft:raw.draft,manualDraft:raw.manualDraft}:{})};
}
export function portableFiles(backup){
 decodeBackup(backup);
 const d=backup.data,files={'focus.json':strToU8(JSON.stringify({...backup,metadata:{...backup.metadata,schema:'focus-device/1',exportedAt:new Date().toISOString(),timeZone:'Asia/Tokyo',durationUnit:'minute'}},null,2))};
 const tables={routines:[['id','title','duration_minutes','category','preferred_start_time_jst','preferred_end_time_jst','preparation_before_minutes','preparation_after_minutes','archived'],backup.config.routines.map(r=>[r.id,r.title,r.minutes,r.category,r.preferredStart,r.preferredEnd,r.prepareBefore,r.prepareAfter,r.archived||false])],activities:[['id','routine_id','title','duration_minutes','archived'],backup.config.routines.flatMap(r=>(r.activities||[]).map(a=>[a.id,r.id,a.title,a.minutes||r.minutes,a.archived||false]))],tasks:[['id','title','category','estimate_minutes','due_date','done','done_date','note','priority','preferred_start_time_jst','preferred_end_time_jst','estimate_unknown','original_estimate_value'],d.tasks.map(t=>[t.id,t.title,t.category,t.estimateUnknown?'':t.estimate,t.due,t.done,t.doneAt,t.note,t.priority,t.preferredStart,t.preferredEnd,!!t.estimateUnknown,t.sourceProperties?.['見積残時間']])],records:[['id','title','date_jst','start_time_jst','duration_minutes','measured_seconds','category','note','timer_id','routine_id','activity_id','task_title','activity_title','planned_minutes','planned_preparation_before_minutes','planned_preparation_after_minutes','started_at_utc','ended_at_utc','source','source_notion_id','entry_mode','timer_goal_minutes','program'],d.logs.map(l=>[l.id,l.title,l.date,l.start,l.minutes,l.elapsedSeconds,l.category,l.note,l.timerId,l.routineId,l.activityId,l.taskTitle,l.activityTitle,l.plannedMinutes,l.plannedPreparationBefore,l.plannedPreparationAfter,l.startedAt,l.endedAt,l.source,l.sourceNotionId,l.entryMode,l.timerGoalMinutes,l.program])],schedule:[['id','title','date_jst','start_time_jst','end_time_jst','category','note','task_id','routine_id'],d.events.map(e=>[e.id,e.title,e.date,e.start,e.end,e.category,e.note,e.taskId,e.routineId])],history:[['id','task_id','action','occurred_at_utc','date_jst','origin','snapshot_json'],(d.history||[]).map(h=>[h.id,h.taskId,h.action,h.occurredAt,h.date,h.origin,JSON.stringify(h.snapshot)])]};
 for(const [name,[head,rows]] of Object.entries(tables))files[name+'.csv']=strToU8(csv([head,...rows]));
 for(const [kind,name] of [['tasks','tasks'],['logs','records'],['events','schedule']]){const archived=d.archive?.[kind]||[],rows=archived.map(i=>kind==='tasks'?[i.id,i.title,i.category,i.estimateUnknown?'':i.estimate,i.due,i.done,i.doneAt,i.note,i.priority,i.preferredStart,i.preferredEnd,!!i.estimateUnknown,i.sourceProperties?.['見積残時間']]:kind==='logs'?[i.id,i.title,i.date,i.start,i.minutes,i.elapsedSeconds,i.category,i.note,i.timerId,i.routineId,i.activityId,i.taskTitle,i.activityTitle,i.plannedMinutes,i.plannedPreparationBefore,i.plannedPreparationAfter,i.startedAt,i.endedAt,i.source,i.sourceNotionId,i.entryMode,i.timerGoalMinutes,i.program]:[i.id,i.title,i.date,i.start,i.end,i.category,i.note,i.taskId,i.routineId]);files['archived_'+name+'.csv']=strToU8(csv([[...tables[name][0],'archived_at_utc'],...rows.map((r,n)=>[...r,archived[n].archivedAt])]));}
 files['schedule.ics']=strToU8(exportICS(d.events));
 files['settings.json']=strToU8(JSON.stringify(backup.config,null,2));files['migration-history.json']=strToU8(JSON.stringify(d.migrations||[],null,2));
 files['archive.json']=strToU8(JSON.stringify(d.archive,null,2));files['source-tables.json']=strToU8(JSON.stringify(d.sourceTables,null,2));
 files['README.txt']=strToU8('Focus portable export v1\nfocus.json: full-fidelity backup; includes archived items, history, source data and extra fields.\nUnknown estimates have empty estimate_minutes with estimate_unknown=true; original values remain in JSON.\nCSV: UTF-8 BOM, RFC4180 quoting, stable IDs. Dates/times: Asia/Tokyo. Durations: minutes. measured_seconds: actual measurement. Missing start times stay empty.\nCSV formula-leading text is prefixed with an apostrophe for spreadsheet safety; original values remain in focus.json.\nICS: scheduled events only.\nOther apps require their own field mapping; JSON is the authoritative lossless copy.\nSync keys and access tokens are NEVER included.\n');
 return files;
}
export const portableZip=backup=>zipSync(portableFiles(backup));
export function recoveryZip(current,syncPoints=[],restorePoints=[]){
 const files={},manifest=[];
 for(const [kind,points] of [['sync',syncPoints],['restore',restorePoints]])for(const [i,p] of points.entries()){
  const backup=kind==='restore'?p.backup:{...current,data:p.value.data,config:{...current.config,routines:p.value.routines,...(p.value.planning?{planning:p.value.planning}:{})},timer:null,draft:undefined};
  decodeBackup(backup);const name=kind+'-'+(i+1)+'.json';files[name]=strToU8(JSON.stringify(backup,null,2));manifest.push({file:name,createdAt:p.createdAt,reason:p.reason||'before-restore'});
 }
 files['manifest.json']=strToU8(JSON.stringify({format:'focus-recovery',version:1,points:manifest},null,2));return zipSync(files);
}
