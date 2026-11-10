export const CATEGORIES = { learning: { label: '学習', color: '#5b8671' }, work: { label: '仕事', color: '#6989ad' }, health: { label: '健康', color: '#c39359' }, life: { label: '暮らし', color: '#9d84a9' } };
export const dateKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
export const dayAdd = (key, amount) => { const d = new Date(key + 'T12:00:00+09:00'); d.setUTCDate(d.getUTCDate() + amount); return dateKey(d); };
export const uid = () => globalThis.crypto.randomUUID();
export const blankData = () => ({ version: 2, tasks: [], events: [], logs: [], reflections: {}, history: [], archive: {tasks:[],events:[],logs:[]}, sourceTables: [] });
export const minutesOf = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const timeOf = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export function weekDays(key) { const d = new Date(key + 'T12:00:00+09:00'); const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d); const n = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday); return Array.from({length: 7}, (_, i) => dayAdd(key, i - n)); }
export function streak(logs, today) { const active = new Set(logs.map(l => l.date)); let cursor = active.has(today) ? today : dayAdd(today, -1); let count = 0; while (active.has(cursor)) { count++; cursor = dayAdd(cursor, -1); } return count; }
export function scheduleConflict(events, event, ignoredId) { return events.some(e => e.id !== ignoredId && e.date === event.date && minutesOf(e.start) < minutesOf(event.end) && minutesOf(e.end) > minutesOf(event.start)); }
export function demoData(today) {
  const data = blankData();
  const examples = [ ['英語を30分学習する','learning',30,'high',false], ['企画書のアイデアを整理する','work',60,'high',false], ['夕方に軽くランニング','health',30,'normal',false], ['本を20ページ読む','learning',25,'normal',true], ['朝のストレッチ','health',15,'normal',true] ];
  data.tasks = examples.map((e, i) => ({ id: 'demo-task-' + i, title: e[0], category: e[1], estimate: e[2], priority: e[3], due: today, done: e[4], doneAt: e[4] ? today : null, note: '' }));
  data.events = [ {id:'demo-event-1',taskId:'demo-task-0',title:examples[0][0],category:'learning',date:today,start:'09:00',end:'09:30'}, {id:'demo-event-2',taskId:'demo-task-1',title:examples[1][0],category:'work',date:today,start:'10:00',end:'11:00'}, {id:'demo-event-3',taskId:'demo-task-2',title:examples[2][0],category:'health',date:today,start:'18:00',end:'18:30'} ];
  for (let i = 30; i >= 1; i--) { if ([8,17,22].includes(i)) continue; const date = dayAdd(today, -i); data.logs.push({id:'demo-log-'+i,title:i % 3 ? '英語の学習' : '読書とノート',category:'learning',date,minutes:25 + (i % 4) * 10,note:'少しずつ、続ける。'}); if (i % 2) data.logs.push({id:'demo-health-'+i,title:'ランニング',category:'health',date,minutes:20 + (i % 3) * 10,note:''}); if (i % 3 === 0) data.logs.push({id:'demo-work-'+i,title:'企画と制作',category:'work',date,minutes:60,note:''}); }
  data.logs.push({id:'demo-today-1',title:'朝のストレッチ',category:'health',date:today,minutes:15,note:'体を動かして、気持ちよくスタート。'}, {id:'demo-today-2',title:'本を20ページ読む',category:'learning',date:today,minutes:25,note:'気づいたことをノートにまとめた。'});
  return data;
}
export function validateData(data) {
  const validDate = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v+'T12:00:00Z').getTime()) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const text = (v,max=2000) => typeof v==='string' && v.length<=max;
  const timestamp = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
  const base = i => i && text(i.id,2000) && i.id.length>0 && text(i.title) && i.title.trim() && Object.hasOwn(CATEGORIES,i.category);
  const validTime = v => typeof v==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const validators = {
    tasks: t => base(t) && (t.due===''||validDate(t.due)) && Number.isInteger(t.estimate) && t.estimate>=5 && t.estimate<=1440 && typeof t.done==='boolean' && ['high','normal'].includes(t.priority) && text(t.note) && (t.doneAt===null||validDate(t.doneAt)) && (t.preferredStart===undefined&&t.preferredEnd===undefined||validTime(t.preferredStart)&&validTime(t.preferredEnd)&&t.preferredEnd>t.preferredStart),
    events: e => base(e) && validDate(e.date) && validTime(e.start) && validTime(e.end) && e.end>e.start && (e.taskId===null||typeof e.taskId==='string') && (e.note===undefined||text(e.note)),
    logs: l => base(l) && validDate(l.date) && Number.isInteger(l.minutes) && l.minutes>0 && l.minutes<=525600 && text(l.note),
  };
  if(data?.archive&&(typeof data.archive!=='object'||Array.isArray(data.archive)))return false;
  if(!data||![1,2].includes(data.version)||!data.reflections||typeof data.reflections!=='object'||Array.isArray(data.reflections))return false;
  for(const key of ['tasks','events','logs']){
    if(!Array.isArray(data[key])||data[key].length>50000||!data[key].every(validators[key]))return false;
    const archived=data.archive?.[key]||[];
    if(!Array.isArray(archived)||archived.length>50000||!archived.every(i=>validators[key](i)&&timestamp(i.archivedAt)))return false;
    const ids=[...data[key],...archived].map(i=>i.id);if(new Set(ids).size!==ids.length)return false;
  }
  if(!Object.entries(data.reflections).every(([d,n])=>validDate(d)&&text(n)))return false;
  if(data.history!==undefined){
    if(!Array.isArray(data.history)||data.history.length>200000||!data.history.every(e=>e&&text(e.id)&&text(e.taskId)&&['created','updated','completed','reopened','archived','restored','imported'].includes(e.action)&&(e.occurredAt===null||timestamp(e.occurredAt))&&(e.date===null||validDate(e.date))&&validators.tasks(e.snapshot)&&text(e.origin)))return false;
    if(new Set(data.history.map(e=>e.id)).size!==data.history.length)return false;
  }
  if(data.sourceTables!==undefined&&(!Array.isArray(data.sourceTables)||data.sourceTables.length>200||!data.sourceTables.every(t=>t&&text(t.id)&&text(t.name)&&Array.isArray(t.headers)&&t.headers.length<=200&&t.headers.every(h=>text(h))&&Array.isArray(t.rows)&&t.rows.length<=50000&&t.rows.every(r=>Array.isArray(r)&&r.length===t.headers.length&&r.every(v=>text(v,200000))))))return false;
  return true;
}
