import {minutesOf,timeOf} from './core.mjs';
import {validDate,validTime,validMinutes} from './focus-model.mjs';
import {definition} from './focus-planning.mjs';

export function calendarTask(data,routines,id){
 const event=data.events.find(e=>e.id===id);if(event)return event;
 const p=data.focusPlans?.find(p=>p.id===id),raw=p&&routines.find(r=>r.id===p.routineId);if(!raw)return null;
 const r=definition(raw),a=r.activities.find(a=>a.id===p.activityId);if(!a)return null;
 return {...p,title:r.title+' · '+a.title,taskTitle:r.title,activityTitle:a.title,category:r.category,taskId:null,note:'',prepareBefore:r.prepareBefore,prepareAfter:r.prepareAfter,duration:a.minutes||r.minutes,unplaced:true};
}
export function scheduledEvent(data,routines,id,change,busy=[],session=null){
 const task=calendarTask(data,routines,id);if(!task)throw Error('タスク設定を確認してください。');
 if(!task.unplaced)return movedEvent(data,id,change,busy,session);
 const {unplaced,duration,...prototype}=task;
 return movedEvent({...data,events:[...data.events,prototype]},id,change,busy,session);
}

export function movedEvent(data,id,{date,start,minutes},busy=[],session=null){
 const old=data.events.find(e=>e.id===id);if(!old)throw Error('予定が見つかりません。');
 if(session?.eventId===id)throw Error('計測中の予定は停止後に動かせます。');
 if(!validDate(date)||!validTime(start)||!validMinutes(minutes)||minutesOf(start)+minutes>1439)throw Error('同じ日の23:59までの時刻を選んでください。');
 const before=old.prepareBefore??0,after=old.prepareAfter??0;if(![before,after].every(v=>Number.isInteger(v)&&v>=0&&v<=240))throw Error('準備時間を確認してください。');
 const lo=minutesOf(start)-before,hi=minutesOf(start)+minutes+after;
 if(lo<0||hi>1439)throw Error('準備時間を含めて同じ日の範囲に収めてください。');
 return {...old,date,start,end:timeOf(minutesOf(start)+minutes),manual:true};
}
export const snapTime=(minutes,step=5)=>Math.round(minutes/step)*step;

// Only actual intersections are shaded. Preparation buffers remain an auto-planning rule.
export function overlapRanges(event,events){
 const start=minutesOf(event.start),end=minutesOf(event.end),ranges=[];
 for(const other of events){
  if(other===event||other.date!==event.date||other.busy===false||event.busy===false||other.focusOwned&&other.focusId===event.id||event.focusOwned&&event.focusId===other.id)continue;
  const lo=Math.max(start,other.allDay?0:other.startMinute??minutesOf(other.start)),hi=Math.min(end,other.allDay?1440:other.endMinute??minutesOf(other.end));
  if(lo<hi)ranges.push([lo,hi]);
 }
 ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push(range.slice());}return merged;
}
// Split connected overlapping blocks into columns so both remain selectable.
export function calendarColumns(events){
 const result=new Map(),sorted=events.filter(e=>!e.allDay).slice().sort((a,b)=>minutesOf(a.start)-minutesOf(b.start)||minutesOf(b.end)-minutesOf(a.end));
 let cluster=[],ends=[],clusterEnd=-1;
 const flush=()=>{for(const [event,column] of cluster)result.set(event,{column,columns:ends.length});cluster=[];ends=[];};
 for(const event of sorted){const start=minutesOf(event.start),end=minutesOf(event.end);if(start>=clusterEnd){flush();clusterEnd=-1;}let column=ends.findIndex(e=>e<=start);if(column<0)column=ends.length;ends[column]=end;cluster.push([event,column]);clusterEnd=Math.max(clusterEnd,end);}flush();return result;
}
export function overlapMarkup(event,events,scale=120){return overlapRanges(event,events).map(([start,end])=>`<i class="calendar-overlap" aria-hidden="true" data-overlap-start="${start}" data-overlap-end="${end}" style="top:${(start-minutesOf(event.start))/60*scale}px;height:${(end-start)/60*scale}px"></i>`).join('');}

export class CalendarDrag{
 constructor({root,preview,commit,onError=()=>{},onEnd=()=>{}}){
  Object.assign(this,{root,preview,commit,onError,onEnd});this.drag=null;this.frame=0;this.suppressUntil=0;
  root.addEventListener('pointerdown',e=>this.start(e));root.addEventListener('pointermove',e=>this.move(e));root.addEventListener('pointerup',e=>this.end(e,false));root.addEventListener('pointercancel',e=>this.end(e,true));
  root.addEventListener('lostpointercapture',e=>this.end(e,true));
  const cancel=()=>{if(this.drag)this.end({pointerId:this.drag.pointer,preventDefault(){}},true);};
  window.addEventListener('resize',cancel,{passive:true});window.addEventListener('blur',cancel);window.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.drag){e.preventDefault();cancel();}});
  const followScroll=()=>{if(this.drag?.moved)this.request();};
  root.addEventListener('scroll',followScroll,{passive:true,capture:true});window.addEventListener('scroll',followScroll,{passive:true});
  root.addEventListener('click',e=>{if(Date.now()<this.suppressUntil&&e.target.closest('[data-plan-id]')){e.preventDefault();e.stopImmediatePropagation();}},true);
  root.addEventListener('click',e=>{if(Date.now()<this.suppressUntil&&e.target.closest('[data-task-plan-id]')){e.preventDefault();e.stopImmediatePropagation();}},true);
  root.addEventListener('dragstart',e=>{if(e.target.closest('[data-task-plan-id]'))e.preventDefault();});
  root.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&this.drag){e.preventDefault();this.end({pointerId:this.drag.pointer,preventDefault(){}},true);return;}
   if(this.drag)return;
   const block=e.target.closest('[data-plan-id]');if(!block||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
   const start=Number(block.dataset.startMinute)+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?15:5),id=block.dataset.planId;
   try{this.commit(id,start,{keepScroll:false});[...root.querySelectorAll('[data-plan-id]')].find(e=>e.dataset.planId===id)?.focus({preventScroll:true});}catch(error){this.onError(error.message);}
  });
 }
 get active(){return !!this.drag;}
 start(e){
  const source=e.target.closest('[data-task-plan-id]');if(source){this.startTask(e,source);return;}
  const block=e.target.closest('[data-plan-id]');if(!block||e.button!==0||this.drag)return;
  const resize=e.target.closest('[data-calendar-resize]')?.dataset.calendarResize;
  this.suppressUntil=0;if(e.pointerType!=='mouse'&&!resize&&!e.target.closest('[data-calendar-grip]'))return;
  const lane=block.parentElement,scroller=block.closest('.timeline-scroll'),rect=block.getBoundingClientRect();
  const laneRect=lane.getBoundingClientRect(),host=scroller.getBoundingClientRect();
  this.drag={id:block.dataset.planId,block,lane,scroller,pointer:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,offset:e.clientY-rect.top,start:Number(block.dataset.startMinute),minutes:Number(block.dataset.duration),initialStart:Number(block.dataset.startMinute),initialMinutes:Number(block.dataset.duration),mode:resize||'move',moved:false,
   laneTop:laneRect.top+window.scrollY+scroller.scrollTop,laneLeft:laneRect.left,laneRight:laneRect.right,hostTop:host.top+window.scrollY,hostBottom:host.bottom+window.scrollY,scale:Number(scroller.dataset.scale),lo:Number(scroller.dataset.start),maxScroll:Math.max(0,scroller.scrollHeight-scroller.clientHeight),lastFrame:performance.now()};block.setPointerCapture(e.pointerId);
 }
 startTask(e,source){
  if(e.button!==0||this.drag||!e.target.closest('.task-select,[data-task-calendar-grip]'))return;
  if(e.pointerType!=='mouse'&&!e.target.closest('[data-task-calendar-grip]'))return;
  const scroller=this.root.querySelector('.timeline-scroll'),lane=scroller?.querySelector('[data-lane=plan]');if(!lane)return;
  const host=scroller.getBoundingClientRect(),laneRect=lane.getBoundingClientRect(),nav=document.querySelector('#primary-nav');
  const bottomLimit=nav&&getComputedStyle(nav).position==='fixed'?nav.getBoundingClientRect().top:innerHeight;
  const minutes=Number(source.dataset.duration);if(!Number.isInteger(minutes)||minutes<1)return;
  const capture=e.target.closest('button')||source;this.suppressUntil=0;this.drag={capture,id:source.dataset.taskPlanId,block:source,lane,scroller,pointer:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,offset:0,start:0,minutes,initialStart:null,initialMinutes:minutes,mode:'move',fromList:true,moved:false,title:source.querySelector('strong')?.textContent||'タスク',bottomLimit,
   laneTop:laneRect.top+window.scrollY+scroller.scrollTop,laneLeft:laneRect.left,laneRight:laneRect.right,hostTop:host.top+window.scrollY,hostBottom:host.bottom+window.scrollY,scale:Number(scroller.dataset.scale),lo:Number(scroller.dataset.start),maxScroll:Math.max(0,scroller.scrollHeight-scroller.clientHeight),maxPageScroll:Math.max(0,document.documentElement.scrollHeight-innerHeight),lastFrame:performance.now()};capture.setPointerCapture(e.pointerId);
 }
 move(e){
  const d=this.drag;if(!d||d.pointer!==e.pointerId)return;d.lastX=e.clientX;d.lastY=e.clientY;
  if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<6)return;
  if(!d.moved){d.moved=true;d.block.classList.add('calendar-moving');d.ghost=document.createElement('div');d.ghost.className='calendar-ghost';d.ghost.setAttribute('aria-hidden','true');d.ghost.style.top='0px';d.ghost.style.height=Math.max(30,d.minutes/60*d.scale)+'px';d.lane.append(d.ghost);d.lastFrame=performance.now();if(d.fromList){d.scroller.classList.add('calendar-drop-target');d.pill=document.createElement('div');d.pill.className='task-drag-label';d.pill.textContent=d.title+' · '+d.minutes+'分';d.pill.setAttribute('aria-hidden','true');document.body.append(d.pill);}}
  e.preventDefault();this.request();
 }
 request(){if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
 draw({autoScroll=true}={}){
  const d=this.drag;if(!d?.moved)return;
  const now=performance.now(),dt=Math.min(32,Math.max(1,now-d.lastFrame));d.lastFrame=now;
  let scroll=d.scroller.scrollTop;
  const overCalendar=()=>d.lastX>=d.laneLeft&&d.lastX<=d.laneRight&&d.lastY>=Math.max(0,d.hostTop-window.scrollY)&&d.lastY<=Math.min(d.bottomLimit??innerHeight,d.hostBottom-window.scrollY);
  if(d.fromList&&autoScroll&&!overCalendar()){
   const pageDirection=d.lastY<70?-1:d.lastY>d.bottomLimit-35?1:0;
   if(pageDirection){const before=window.scrollY;window.scrollTo(0,Math.max(0,Math.min(d.maxPageScroll,before+pageDirection*600*dt/1000)));if(window.scrollY!==before)this.request();}
  }
  const direction=d.fromList&&!overCalendar()?0:d.lastY<d.hostTop-window.scrollY+30?-1:d.lastY>Math.min(d.bottomLimit??innerHeight,d.hostBottom-window.scrollY)-30?1:0;
  if(autoScroll&&direction){const next=Math.max(0,Math.min(d.maxScroll,scroll+direction*420*dt/1000));if(next!==scroll){d.scroller.scrollTop=next;scroll=d.scroller.scrollTop;this.request();}}
  const raw=d.lo+(d.lastY-(d.laneTop-window.scrollY-scroll)-d.offset)/d.scale*60;
  const initialEnd=d.initialStart+d.initialMinutes;
  let visualStart=raw,visualEnd=raw+d.initialMinutes;
  if(d.mode==='start'){
   visualStart=Math.min(initialEnd-1,raw);visualEnd=initialEnd;
   d.start=Math.min(initialEnd-1,snapTime(raw));d.minutes=initialEnd-d.start;
  }else if(d.mode==='end'){
   visualStart=d.initialStart;visualEnd=Math.max(d.initialStart+1,initialEnd+raw-d.initialStart);
   d.start=d.initialStart;d.minutes=Math.max(1,snapTime(initialEnd+raw-d.initialStart)-d.start);
  }else{d.start=snapTime(raw);d.minutes=d.initialMinutes;}
  d.inside=d.fromList?overCalendar():d.lastX>=d.laneLeft-24&&d.lastX<=d.laneRight+24;
  if(d.fromList){d.ghost.hidden=!d.inside;d.pill.hidden=d.inside;d.pill.style.transform='translate3d('+Math.max(8,Math.min(innerWidth-180,d.lastX+12))+'px,'+Math.max(8,d.lastY-42)+'px,0)';}
  if(d.checkedStart!==d.start||d.checkedMinutes!==d.minutes||d.checkedInside!==d.inside){
   let valid=d.inside&&d.start>=0&&d.minutes>=1&&d.start+d.minutes<=1439,markup='';try{if(valid)markup=this.preview(d.id,d.start,d.minutes)?.overlapMarkup||'';}catch{valid=false;}
   d.ghost.innerHTML=markup+'<span class="calendar-ghost-time"></span>';
   d.valid=valid;d.checkedStart=d.start;d.checkedMinutes=d.minutes;d.checkedInside=d.inside;d.ghost.dataset.valid=String(valid);
  }
  // Follow every pixel of the pointer; only the saved time snaps to five minutes.
  d.ghost.style.transform='translate3d(0,'+((visualStart-d.lo)/60*d.scale)+'px,0)';
  if(d.mode!=='move')d.ghost.style.height=Math.max(30,(visualEnd-visualStart)/60*d.scale)+'px';
  const text=d.start<0||d.start+d.minutes>1439?'範囲外':timeOf(d.start)+'–'+timeOf(d.start+d.minutes),label=d.ghost.querySelector('.calendar-ghost-time');if(label&&label.textContent!==text)label.textContent=text;
 }
 end(e,cancel){
  const d=this.drag;if(!d||d.pointer!==e.pointerId)return;if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}if(d.moved&&!cancel){d.lastX=e.clientX;d.lastY=e.clientY;this.draw({autoScroll:false});}
  this.drag=null;const capture=d.capture||d.block;if(capture.hasPointerCapture(e.pointerId))capture.releasePointerCapture(e.pointerId);d.block.classList.remove('calendar-moving');d.ghost?.remove();d.pill?.remove();if(d.fromList)d.scroller.classList.remove('calendar-drop-target');
  if(d.moved){e.preventDefault();this.suppressUntil=Date.now()+400;try{if(!cancel){if(!d.inside)return;if(!d.valid){this.preview(d.id,d.start,d.minutes);return;}if(d.start!==d.initialStart||d.minutes!==d.initialMinutes)this.commit(d.id,d.start,{keepScroll:true,minutes:d.minutes});}}catch(error){this.onError(error.message);}finally{this.onEnd();}}else setTimeout(()=>this.onEnd(),0);
 }
}
