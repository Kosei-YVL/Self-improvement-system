import { dateKey, uid } from './core.mjs';

export function normalizeData(input) {
  const data=structuredClone(input);
  data.version=2;
  data.history ||= [];
  data.archive ||= {tasks:[],events:[],logs:[]};
  for(const key of ['tasks','events','logs'])data.archive[key] ||= [];
  data.sourceTables ||= [];
  for(const task of [...data.tasks,...data.archive.tasks]) {
    if(task.done&&!data.history.some(e=>e.taskId===task.id&&e.action==='completed')) {
      data.history.push({id:uid(),taskId:task.id,action:'completed',occurredAt:null,date:task.doneAt||null,snapshot:structuredClone(task),origin:'legacy'});
    }
  }
  return data;
}
export function recordTask(data,task,action,now=new Date(),origin='app') {
  data.history ||= [];
  const entry={id:uid(),taskId:task.id,action,occurredAt:now.toISOString(),date:dateKey(now),snapshot:structuredClone(task),origin};
  data.history.push(entry);return entry;
}
export function archiveItem(data,type,id,now=new Date()) {
  const index=data[type].findIndex(item=>item.id===id);if(index<0)return;
  const [item]=data[type].splice(index,1);
  const archived={...item,archivedAt:now.toISOString()};
  data.archive ||= {tasks:[],events:[],logs:[]};data.archive[type].push(archived);
  if(type==='tasks')recordTask(data,archived,'archived',now);
  return archived;
}
export function restoreItem(data,type,id,now=new Date()) {
  const index=data.archive[type].findIndex(item=>item.id===id);if(index<0||data[type].some(item=>item.id===id))return;
  const [archived]=data.archive[type].splice(index,1),{archivedAt,...item}=archived;
  data[type].push(item);if(type==='tasks')recordTask(data,item,'restored',now);return item;
}
const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
export function exportHistory(data) {
  const headers=['履歴ID','タスクID','タスク名','操作','日時（UTC）','日付（日本時間）','日時の精度','分野','期限','見積分','元データ'];
  const rows=(data.history||[]).map(e=>[e.id,e.taskId,e.snapshot.title,e.action,e.occurredAt,e.date,e.occurredAt?'日時':e.date?'日付のみ':'不明',e.snapshot.category,e.snapshot.due,e.snapshot.estimate,e.origin]);
  return '\uFEFF'+[headers,...rows].map(row=>row.map(v=>cell(/^[=+@\-\t\r]/.test(String(v??''))?"'"+v:v)).join(',')).join('\r\n');
}
export function exportSourceTable(table) {return '\uFEFF'+[table.headers,...table.rows].map(row=>row.map(v=>cell(/^[=+@\-\t\r]/.test(String(v??''))?"'"+v:v)).join(',')).join('\r\n');}
