import { dateKey, dayAdd } from './core.mjs';
const STEP = 38;
const pad = n => String(n).padStart(2, '0');
const dateLabel = d => new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',...(d.slice(0,4)!==dateKey().slice(0,4)?{year:'numeric'}:{}),month:'numeric',day:'numeric',weekday:'short'}).format(new Date(d+'T12:00:00+09:00'));
let picker, current;
function column(label, values, selected, kind) {
  const wrap = document.createElement('div'); wrap.className = 'wheel-column';
  const heading = document.createElement('div'); heading.className = 'wheel-label'; heading.textContent = label; wrap.append(heading);
  const el = document.createElement('div'); el.className = 'wheel-scroll'; el.dataset.kind = kind;
  el.tabIndex = 0; el.setAttribute('role','spinbutton'); el.setAttribute('aria-label',label); el.setAttribute('aria-valuemin','0'); el.setAttribute('aria-valuemax',values.length-1);
  const options = values.map(({label,value},i) => {const row=document.createElement('div');row.className='wheel-option';row.dataset.index=i;row.textContent=label;row.setAttribute('aria-hidden','true');el.append(row);return row;});
  const index = Math.max(0,values.findIndex(v=>v.value===selected));
  let selectedIndex=-1,timer,drag;
  const update = () => {const n=Math.max(0,Math.min(values.length-1,Math.round(el.scrollTop/STEP)));if(n===selectedIndex)return;if(selectedIndex>=0)options[selectedIndex].classList.remove('selected');options[n].classList.add('selected');selectedIndex=n;el.dataset.index=n;el.setAttribute('aria-valuenow',n);el.setAttribute('aria-valuetext',values[n].label);};
  const snap = () => {clearTimeout(timer);el.scrollTop=Math.round(el.scrollTop/STEP)*STEP;update();el.style.scrollSnapType='';};
  el.addEventListener('scroll',update,{passive:true});
  el.addEventListener('wheel',e=>{e.preventDefault();clearTimeout(timer);el.style.scrollSnapType='none';const unit=e.deltaMode===1?16:e.deltaMode===2?190:1;el.scrollTop+=e.deltaY*unit;update();timer=setTimeout(snap,90);},{passive:false});
  el.addEventListener('keydown',e=>{const move={ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5};let n=Math.round(el.scrollTop/STEP);if(e.key in move)n+=move[e.key];else if(e.key==='Home')n=0;else if(e.key==='End')n=values.length-1;else return;e.preventDefault();el.style.scrollSnapType='none';el.scrollTop=Math.max(0,Math.min(values.length-1,n))*STEP;update();el.style.scrollSnapType='';});
  el.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||drag)return;clearTimeout(timer);el.focus({preventScroll:true});el.style.scrollSnapType='none';drag={id:e.pointerId,y:e.clientY,top:el.scrollTop,moved:false,index:Number(e.target.dataset.index)};el.setPointerCapture(e.pointerId);e.preventDefault();});
  el.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;if(Math.abs(e.clientY-drag.y)>3)drag.moved=true;el.scrollTop=drag.top+drag.y-e.clientY;update();});
  const finish=e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(el.hasPointerCapture(d.id))el.releasePointerCapture(d.id);if(!d.moved&&Number.isInteger(d.index))el.scrollTop=d.index*STEP;snap();};
  el.addEventListener('pointerup',finish);el.addEventListener('pointercancel',finish);el.addEventListener('lostpointercapture',finish);
  wrap.append(el);
  return {wrap,initialize:()=>{el.scrollTop=index*STEP;update();},dispose:()=>{clearTimeout(timer);drag=null;},value:()=>values[Math.max(0,Math.min(values.length-1,Math.round(el.scrollTop/STEP)))].value};
}
function ensurePicker() {
  if(picker)return;
  picker=document.createElement('dialog');picker.id='wheel-picker';picker.className='wheel-dialog';
  picker.innerHTML='<div class="modal-head"><h2 id="wheel-title"></h2><button type="button" class="icon-button wheel-close" aria-label="閉じる">×</button></div><div class="wheel-help">上下にスワイプ・ドラッグして選択</div><div class="wheel-body"></div><div class="wheel-manual"></div><p class="form-error wheel-error" role="alert"></p><div class="wheel-footer"><button type="button" class="text-button wheel-clear">未設定にする</button><button type="button" class="secondary-button wheel-cancel">キャンセル</button><button type="button" class="primary-button wheel-done">決定</button></div>';
  document.body.append(picker);
  picker.addEventListener('close',()=>{if(!picker.open)current?.columns.forEach(col=>col.dispose());});
  picker.querySelector('.wheel-close').onclick=picker.querySelector('.wheel-cancel').onclick=()=>picker.close();
  picker.querySelector('.wheel-clear').onclick=()=>{current.input.value='';current.refresh();current.input.dispatchEvent(new Event('change',{bubbles:true}));picker.close();};
  picker.querySelector('.wheel-done').onclick=()=>{
    const c=current,values=c.columns.map(col=>col.value());
    if(c.kind==='duration'){const minutes=Number(values[0])*60+Number(values[1]);if(minutes<c.min||minutes>c.max){picker.querySelector('.wheel-error').textContent=`${c.min}〜${c.max}分の範囲で選んでください。`;return;}c.input.value=minutes;}
    else if(c.kind==='date')c.input.value=values[0];
    else {if(c.dateInput){c.dateInput.value=values[0];refreshInput(c.dateInput);}c.input.value=values.slice(-2).join(':');}
    c.refresh();c.input.dispatchEvent(new Event('change',{bubbles:true}));picker.close();
  };
}
function open(input,kind,title) {
  ensurePicker();
  const dateInput=kind==='time'?input.form?.querySelector('[name="date"]'):null;
  current={input,kind,dateInput,refresh:()=>refreshInput(input),columns:[],min:Number(input.min||1),max:Number(input.max||1440)};
  picker.querySelector('#wheel-title').textContent=title;
  picker.querySelector('.wheel-error').textContent='';
  picker.querySelector('.wheel-clear').hidden=kind!=='date'||input.required;
  const body=picker.querySelector('.wheel-body');body.replaceChildren();
  const dateTarget=kind==='date'?input:dateInput;
  let selectedDate=dateTarget?.value||dateKey();
  const draw=()=>{
    current.columns.forEach(col=>col.dispose());
    body.replaceChildren();current.columns=[];
    if(dateTarget){const dates=Array.from({length:367},(_,i)=>dayAdd(selectedDate,i-183)).filter(d=>(!dateTarget.min||d>=dateTarget.min)&&(!dateTarget.max||d<=dateTarget.max));const col=column('日付',dates.map(d=>({value:d,label:(d===dateKey()?'今日 ':d.slice(0,4)!==dateKey().slice(0,4)?d.slice(0,4)+'年 ':'')+dateLabel(d)})),selectedDate,'date');current.columns.push(col);body.append(col.wrap);col.initialize();}
    if(kind!=='date'){
      const duration=kind==='duration',minutes=Number(input.value||30),parts=duration?[Math.floor(minutes/60),minutes%60]:(input.value||'09:00').split(':').map(Number);
      for(const [i,label] of ['時','分'].entries()){const count=i===0?(duration?Math.min(Math.floor(current.max/60)+1,Math.max(25,Math.floor(minutes/60)+25)):24):60;const col=column(label,Array.from({length:count},(_,n)=>({value:pad(n),label:pad(n)})),pad(parts[i]),i===0?'hour':'minute');current.columns.push(col);body.append(col.wrap);col.initialize();}
    }
  };
  const manual=picker.querySelector('.wheel-manual');manual.replaceChildren();
  if(dateTarget){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='遠い日付を直接指定';const direct=document.createElement('input');direct.type='date';direct.value=selectedDate;direct.min=dateTarget.min;direct.max=dateTarget.max;direct.setAttribute('aria-label','日付を直接指定');direct.onchange=()=>{if(!direct.value||!direct.checkValidity())return;selectedDate=direct.value;draw();};details.append(summary,direct);manual.append(details);}
  picker.showModal();draw();
}
function refreshInput(input){const button=input.nextElementSibling;if(!button?.classList.contains('wheel-trigger'))return;const kind=input.dataset.wheel;button.textContent=kind==='duration'?`${Math.floor(Number(input.value)/60)}時間 ${Number(input.value)%60}分`:kind==='date'?input.value?dateLabel(input.value):'期限を設定':`${!input.hasAttribute('data-time-only')&&input.form?.querySelector('[name="date"]')?.value?dateLabel(input.form.querySelector('[name="date"]').value)+' ':''}${input.value||'時刻を選択'}`;}
export function enhanceInputs(root) {
  for(const input of root.querySelectorAll('input[type="date"],input[type="time"],input[name="estimate"],input[name="minutes"],input[name="duration"],input[name="timer-duration"],input[name="gapMinutes"],input[name="dailyLimit"]')){
    if(input.dataset.wheel)continue;
    const kind=input.type==='date'?'date':input.type==='time'?'time':'duration';
    input.dataset.wheel=kind;const label=root.querySelector(`label[for="${input.id}"]`),title=label?.textContent||input.getAttribute('aria-label')||'日付';
    const button=document.createElement('button');button.type='button';button.className='wheel-trigger';button.setAttribute('aria-label',title+'をホイールで選択');button.onclick=()=>open(input,kind,title);
    input.type='hidden';input.after(button);refreshInput(input);
    input.addEventListener('change',()=>{refreshInput(input);if(input.name==='date')for(const time of root.querySelectorAll('[data-wheel="time"]'))refreshInput(time);});
  }
}
export function refreshWheels(root){for(const input of root.querySelectorAll('[data-wheel]'))refreshInput(input);}
