import {dateKey,dayAdd,minutesOf,timeOf} from './core.mjs';
export function availableEvent(data,chosen,date=dateKey()){
 const events=data.events.filter(e=>e.date===date);
 return events.find(e=>e.id===chosen)||events.filter(e=>!data.logs.some(l=>l.eventId===e.id)).sort((a,b)=>a.start.localeCompare(b.start))[0];
}
export function unrecordedEvents(data,today=dateKey(),days=7){
 const done=new Set([...data.tasks,...data.archive.tasks].filter(t=>t.done).map(t=>t.id));
 return data.events.filter(e=>e.date<today&&e.date>=dayAdd(today,-days)&&!done.has(e.taskId)&&!data.logs.some(l=>l.eventId===e.id&&l.date===e.date)).sort((a,b)=>b.date.localeCompare(a.date)||a.start.localeCompare(b.start));
}
export function priorStart(minutes,now=new Date()){
 const date=dateKey(now),time=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
 const start=minutesOf(time)-minutes;return {date:start<0?dayAdd(date,-1):date,start:timeOf((start%1440+1440)%1440)};
}
export const recordSeconds=log=>Number.isSafeInteger(log.elapsedSeconds)?log.elapsedSeconds:log.minutes*60;
export function durationText(seconds){const m=Math.floor(seconds/60),h=Math.floor(m/60);return h?`${h}時間${m%60?String(m%60)+'分':''}`:m?m+'分':Math.max(0,Math.floor(seconds))+'秒';}
export function orderedItems(items,order=[]){const ranks=new Map(order.map((id,i)=>[id,i]));return items.map((value,i)=>({value,i})).sort((a,b)=>(ranks.get(a.value.id)??100000+a.i)-(ranks.get(b.value.id)??100000+b.i)).map(v=>v.value);}
