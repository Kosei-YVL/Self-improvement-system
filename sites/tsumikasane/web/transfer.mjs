import { CATEGORIES, dateKey, uid, validateData, blankData } from './core.mjs';
export const CSV_FIELDS = {
  tasks: {title:'タスク名',category:'分野',due:'期限',doneAt:'完了日',estimate:'目安の時間（分）',done:'状態',priority:'優先度',preferredStart:'希望開始',preferredEnd:'希望終了',note:'メモ',completedAt:'完了日時（UTC）',createdAt:'作成日時（UTC）',updatedAt:'更新日時（UTC）',archivedAt:'アーカイブ日時（UTC）',id:'ID'},
  logs: {title:'取り組んだこと',category:'分野',date:'日付',minutes:'実行時間（分）',note:'メモ',id:'ID'},
};
const ALIASES = {title:['名前','Name','Task','Title','タスク','タスク名','取り組んだこと','セッション'],category:['分野','Category','Area','カテゴリ'],due:['期限','Due','Due date','期日'],doneAt:['完了日','Completed at'],completedAt:['完了日時（UTC）'],createdAt:['作成日時（UTC）'],updatedAt:['更新日時（UTC）'],archivedAt:['アーカイブ日時（UTC）'],estimate:['目安の時間（分）','Estimate','Estimated minutes','見積もり','所要時間'],done:['状態','Status','ステータス','完了','Done','Completed'],priority:['優先度','Priority'],preferredStart:['希望開始','Preferred start'],preferredEnd:['希望終了','Preferred end'],note:['メモ','Notes','Note','Description','説明','やった内容','次の一手'],id:['ID','id'],date:['日付','Date','記録日','開始'],minutes:['実行時間（分）','Minutes','Duration','時間','分','実行時間','作業分']};
export function parseCSV(source) {
  const text=source.replace(/^\uFEFF/,''), rows=[];let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
    if(ch==='"'&&!cell&&!closed){quoted=true;continue;}
    if(closed&&ch!==','&&ch!=='\n'&&ch!=='\r')throw Error('引用符の後に不正な文字があります');
    if(ch===','){row.push(cell);cell='';closed=false;}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(c=>c!==''))rows.push(row);row=[];cell='';closed=false;}
    else cell+=ch;
  }
  if(quoted)throw Error('CSVの引用符が閉じられていません');
  row.push(cell);if(row.some(c=>c!==''))rows.push(row);
  if(!rows.length)throw Error('CSVが空です');
  const headers=rows.shift().map(h=>h.trim());
  if(new Set(headers).size!==headers.length||headers.some(h=>!h))throw Error('CSVの列名は空欄・重複をなくしてください');
  if(headers.length>100||rows.length>10000)throw Error('CSVは100列・10,000件以内にしてください');
  if(rows.some(r=>r.length!==headers.length))throw Error('CSVの列数が揃っていません');
  return {headers,rows};
}
export function detectMapping(headers,type){return Object.fromEntries(Object.keys(CSV_FIELDS[type]).map(k=>[k,headers.find(h=>ALIASES[k].some(a=>a.toLowerCase()===h.toLowerCase()))||'']));}
const unprotect = v => /^'[=+@\-\t\r]/.test(v)?v.slice(1):v;
const csvCell = v => {const value=String(v??'');const safe=/^[=+@\-\t\r]/.test(value)?"'"+value:value;return '"'+safe.replace(/"/g,'""')+'"';};
export function exportCSV(data,type){const fields=Object.keys(CSV_FIELDS[type]);return '\uFEFF'+[fields.map(k=>csvCell(CSV_FIELDS[type][k])).join(','),...data[type].map(item=>fields.map(k=>csvCell(k==='category'?CATEGORIES[item[k]].label:k==='done'?item.done?'完了':'未完了':k==='priority'?item.priority==='high'?'高':'通常':item[k])).join(','))].join('\r\n');}
const hash = s => {let h=2166136261;for(const ch of s){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
function normalizedDate(v){if(!v)return '';const s=v.trim();const jp=s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);if(jp)return `${jp[1]}-${jp[2].padStart(2,'0')}-${jp[3].padStart(2,'0')}`;const match=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T])/);if(match)return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;const date=new Date(s);if(Number.isNaN(date.getTime()))throw Error('日付を読み取れません');return date.toISOString().slice(0,10);}
function duration(v,fallback){if(!v)return fallback;if(/^\d+$/.test(v.trim()))return Number(v);const clock=v.match(/^(\d+):(\d{2})$/);if(clock&&Number(clock[2])<60)return Number(clock[1])*60+Number(clock[2]);const hours=v.match(/^(?:(\d+)\s*(?:時間|h)\s*)?(?:(\d+)\s*(?:分|min|m))?$/i);if(hours&&(hours[1]||hours[2]))return Number(hours[1]||0)*60+Number(hours[2]||0);throw Error('時間は分、HH:MM、または「1時間30分」で指定してください');}
export function importCSV(parsed,mapping,type,existing,today=dateKey()){
  if(!mapping.title)throw Error('名前の列を選んでください');
  const items=[],skipped=[],errors=[],counts=new Map();
  parsed.rows.forEach((row,i)=>{
    try{
      const get=k=>mapping[k]?unprotect(row[parsed.headers.indexOf(mapping[k])]||'').trim():'';
      const title=get('title');if(!title||title.length>2000)throw Error('名前が空欄、または長すぎます');
      const rawCategory=get('category');const category=Object.keys(CATEGORIES).find(k=>k===rawCategory.toLowerCase()||CATEGORIES[k].label===rawCategory)||'life';
      const rawNote=get('note');const note=(rawCategory&&category==='life'&&!['life','暮らし'].includes(rawCategory)?`[元の分野: ${rawCategory}]\n`:'')+rawNote;
      const rawId=get('id'),fingerprint=hash(JSON.stringify(row));const occurrence=counts.get(fingerprint)||0;counts.set(fingerprint,occurrence+1);
      const externalKey=rawId?`csv-${type}-id:${rawId}`:`csv-${type}:${fingerprint}:${occurrence}`;
      if(existing.some(e=>rawId&&e.id===rawId||e.externalKey===externalKey)){skipped.push({line:i+2,title});return;}
      let item={id:uid(),title,category,note,externalKey};
      if(type==='tasks'){
        const status=get('done').toLowerCase(),trueValues=['完了','済','done','complete','completed','true','yes','1','checked','提出済'],falseValues=['','未完了','未着手','進行中','実行中','not started','in progress','to do','todo','false','no','0','unchecked'];
        if(!trueValues.includes(status)&&!falseValues.includes(status))throw Error(`状態「${get('done')}」を読めません。状態の列を「取り込まない」にするか、完了・未完了に揃えてください`);
        const done=trueValues.includes(status),priority=get('priority').toLowerCase();
        item={...item,due:normalizedDate(get('due')),estimate:duration(get('estimate'),30),done,doneAt:done&&get('doneAt')?normalizedDate(get('doneAt')):null,priority:['high','高','高い'].includes(priority)?'high':'normal'};
        const start=get('preferredStart'),end=get('preferredEnd');if(start||end){if(!start||!end)throw Error('希望開始と希望終了を両方指定してください');item.preferredStart=start;item.preferredEnd=end;}
      }else{const date=normalizedDate(get('date'));if(!date)throw Error('日付が空欄です');if(date>today)throw Error('未来の実行記録は取り込めません');item={...item,date,minutes:duration(get('minutes'),30)};}
      const check=blankData();check[type]=[item];if(!validateData(check))throw Error('日付・時間・文字数を確認してください');items.push(item);
    }catch(e){errors.push({line:i+2,reason:e.message});}
  });return {items,skipped,errors};
}
const icsEscape = v => String(v??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const icsUnescape = v => v.replace(/\\([nN,;\\])/g,(_,c)=>/[nN]/.test(c)?'\n':c);
function foldLine(line){const enc=new TextEncoder();let lines=[],current='',count=0;for(const ch of line){const size=enc.encode(ch).length;if(count+size>75){lines.push(current);current=' ';count=1;}current+=ch;count+=size;}lines.push(current);return lines.join('\r\n');}
const utcStamp=d=>new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export function exportICS(events,now=new Date()){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tsumikasane//Schedule//JA','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for(const e of events)lines.push('BEGIN:VEVENT',`UID:${icsEscape(e.externalUid||e.id+'@tsumikasane')}`,`DTSTAMP:${utcStamp(now)}`,`DTSTART:${utcStamp(e.date+'T'+e.start+':00+09:00')}`,`DTEND:${utcStamp(e.date+'T'+e.end+':00+09:00')}`,`SUMMARY:${icsEscape(e.title)}`,`DESCRIPTION:${icsEscape(e.note||'')}`,`CATEGORIES:${icsEscape(CATEGORIES[e.category].label)}`,'END:VEVENT');
  lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';
}
function parseICSTime(property){
  const m=property.value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);if(!m)throw Error('終日予定は未対応です');
  const base=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  const raw=new Date(base);if(raw.getUTCFullYear()!==+m[1]||raw.getUTCMonth()!==+m[2]-1||raw.getUTCDate()!==+m[3]||raw.getUTCHours()!==+m[4]||raw.getUTCMinutes()!==+m[5]||raw.getUTCSeconds()!==+(m[6]||0))throw Error('日時が不正です');
  let stamp=base;
  if(!m[7]){
    const timezone=property.params.TZID||'Asia/Tokyo';
    const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let i=0;i<3;i++){const parts=Object.fromEntries(fmt.formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));const shown=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);stamp+=base-shown;}
  }
  const dt=new Date(stamp);if(Number.isNaN(dt.getTime()))throw Error('日時を読み取れません');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(dt).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`,stamp};
}
export function importICS(source,existing){
  const text=source.replace(/^\uFEFF/,'').replace(/\r?\n[ \t]/g,'');if(!/^BEGIN:VCALENDAR\r?$/m.test(text))throw Error('有効なICSファイルを選んでください');
  const blocks=text.match(/BEGIN:VEVENT\r?\n[\s\S]*?\r?\nEND:VEVENT/g)||[];if(blocks.length>10000)throw Error('予定は10,000件以内にしてください');
  const items=[],updates=[],skipped=[],errors=[],seen=new Set();
  for(const [index,block] of blocks.entries()){
    let title='予定 '+(index+1);
    try{
      const props={};for(const line of block.split(/\r?\n/)){const colon=line.indexOf(':');if(colon<0)continue;const [name,...params]=line.slice(0,colon).split(';');props[name]={value:line.slice(colon+1),params:Object.fromEntries(params.map(p=>{const i=p.indexOf('=');return[p.slice(0,i),p.slice(i+1).replace(/^"|"$/g,'')];}))};}
      title=icsUnescape(props.SUMMARY?.value||title);
      if(props.RRULE||props.RECURRENCE_ID)throw Error('繰り返し予定の展開は未対応です');
      if(props.STATUS?.value==='CANCELLED'){skipped.push({title,reason:'キャンセル済み'});continue;}
      if(!props.DTSTART||!props.DTEND)throw Error('開始または終了がありません');
      const start=parseICSTime(props.DTSTART),end=parseICSTime(props.DTEND);if(start.date!==end.date)throw Error('日付をまたぐ予定は未対応です');if(end.stamp<=start.stamp)throw Error('終了が開始より前です');
      const externalUid=icsUnescape(props.UID?.value||'');if(!externalUid||externalUid.length>2000)throw Error('予定のUIDがありません');if(seen.has(externalUid)){skipped.push({title,reason:'ファイル内の重複UID'});continue;}seen.add(externalUid);
      const old=existing.find(e=>e.externalUid===externalUid||e.id+'@tsumikasane'===externalUid);
      const rawCategory=icsUnescape(props.CATEGORIES?.value||'');const category=Object.keys(CATEGORIES).find(k=>CATEGORIES[k].label===rawCategory)||old?.category||'life';
      const item={id:old?.id||uid(),taskId:old?.taskId||null,title,category,date:start.date,start:start.time,end:end.time,note:icsUnescape(props.DESCRIPTION?.value||''),externalUid};
      const check=blankData();check.events=[item];if(!validateData(check)||item.note.length>2000)throw Error('日時・文字数を確認してください');
      if(old){if(['title','date','start','end','note','category'].every(k=>(old[k]||'')===(item[k]||'')))skipped.push({title,reason:'変更なし'});else updates.push(item);}else items.push(item);
    }catch(e){errors.push({line:index+1,title,reason:e.message});}
  }
  return {items,updates,skipped,errors};
}
