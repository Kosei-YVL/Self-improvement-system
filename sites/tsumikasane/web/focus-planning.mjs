import {minutesOf,timeOf,dateKey,dayAdd} from './core.mjs';
export const definition=r=>({...r,category:r.category||'learning',preferredStart:r.preferredStart||'09:00',preferredEnd:r.preferredEnd||'18:00',prepareBefore:r.prepareBefore||0,prepareAfter:r.prepareAfter||0,activities:r.activities||[{id:'default-'+r.id,title:r.title,minutes:r.minutes}]});
export function placeDay(data,routines,date,from=0,busy=[],planning={}){
 const definitions=new Map(routines.map(r=>[r.id,definition(r)])),intents=(data.focusPlans||[]).filter(p=>p.date===date),plannedIds=new Set(intents.map(p=>p.id));
 const fixed=data.events.filter(e=>e.date!==date||!plannedIds.has(e.id)||e.manual||data.logs.some(l=>l.eventId===e.id));
 const gap=planning.gapMinutes||0;
 const used=[...fixed.filter(e=>e.date===date).map(e=>[minutesOf(e.start)-(e.prepareBefore||0),minutesOf(e.end)+(e.prepareAfter||0)+gap]),...busy.filter(e=>e.date===date&&e.busy!==false).map(e=>[e.startMinute??minutesOf(e.start),e.endMinute??minutesOf(e.end)])],events=[],unplaced=[];
 let total=fixed.filter(e=>e.date===date).reduce((n,e)=>n+minutesOf(e.end)-minutesOf(e.start),0);
 for(const p of intents){if(fixed.some(e=>e.id===p.id))continue;const r=definitions.get(p.routineId),a=r?.activities.find(a=>a.id===p.activityId);if(!r||!a){unplaced.push({id:p.id,reason:'タスク設定を確認'});continue;}const duration=a.minutes||r.minutes,before=r.prepareBefore,after=r.prepareAfter,startMin=minutesOf(r.preferredStart),endMax=minutesOf(r.preferredEnd);let start=Math.max(startMin+before,Math.ceil(from/5)*5+before),found=false;
  if(total+duration>(planning.dailyLimit||1440)){unplaced.push({id:p.id,reason:'1日の上限'});continue;}
  start=Math.max(start,minutesOf(planning.dayStart||'00:00')+before);
  for(;start+duration+after<=Math.min(endMax,minutesOf(planning.dayEnd||'23:59'));start+=5){const lo=start-before,hi=start+duration+after+gap;if(!used.some(([s,e])=>s<hi&&e>lo)){used.push([lo,hi]);events.push({id:p.id,title:r.title+' · '+a.title,taskId:null,category:r.category,date,start:timeOf(start),end:timeOf(start+duration),note:'',routineId:r.id,activityId:a.id,taskTitle:r.title,activityTitle:a.title,prepareBefore:before,prepareAfter:after,auto:true});total+=duration;found=true;break;}}
  if(!found)unplaced.push({id:p.id,reason:'時間帯に空きなし'});
 }
 return {events:[...fixed,...events],unplaced};
}
export function currentTime(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());}
export function elapsedSession(s,now=Date.now()){if(!s)return 0;return s.elapsed+(s.running?Math.max(0,now-s.started):0);}
export function sessionRecord(s,now=Date.now()){
 const ms=elapsedSession(s,now);let end=s.running?now:(s.pausedAt&&Number.isFinite(Date.parse(s.pausedAt))?Date.parse(s.pausedAt):now);
 return {id:'session-'+s.id,title:s.title,category:s.category||'learning',date:s.date,start:s.start,minutes:Math.max(1,Math.round(ms/60000)),elapsedSeconds:Math.floor(ms/1000),...(s.startedAt?{startedAt:s.startedAt}:{}),endedAt:new Date(end).toISOString(),note:'',timerId:s.id,routineId:s.routineId,activityId:s.activityId,eventId:s.eventId,taskTitle:s.taskTitle,activityTitle:s.activityTitle,plannedMinutes:s.plannedMinutes??s.goal/60000,timerGoalMinutes:s.goal/60000,entryMode:s.mode,program:s.program,plannedPreparationBefore:s.prepareBefore||0,plannedPreparationAfter:s.prepareAfter||0};
}
export function periodRange(date,mode){if(mode==='week'){const weekday=new Date(date+'T12:00:00+09:00').getUTCDay();return [dayAdd(date,-((weekday+6)%7)),dayAdd(date,6-((weekday+6)%7))];}if(mode==='year')return [date.slice(0,4)+'-01-01',date.slice(0,4)+'-12-31'];const year=Number(date.slice(0,4)),month=Number(date.slice(5,7)),last=new Date(Date.UTC(year,month,0)).getUTCDate();return [date.slice(0,7)+'-01',date.slice(0,8)+String(last).padStart(2,'0')];}
