// Wheel input applies once, in the same event. Touch panning remains native.
export function installScrollRouting(doc=document){
 const positions=new WeakMap();
 const onWheel=e=>{
  if(e.defaultPrevented||!e.cancelable||e.ctrlKey||e.metaKey||e.shiftKey||!Number.isFinite(e.deltaY)||!e.deltaY||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
  const element=e.target?.closest?e.target:e.target?.parentElement;if(!element)return;
  if(doc.querySelector('dialog[open]')||element.closest('input,select,textarea,[contenteditable],.wheel-scroll,.data-table-wrap,.import-preview'))return;
  const calendar=element.closest('.day-panel')?.querySelector('.timeline-scroll')||element.closest('.timeline-scroll'),target=calendar||doc.scrollingElement;if(!target)return;
  const current=target.scrollTop,height=target.clientHeight,max=Math.max(0,target.scrollHeight-height);
  const delta=e.deltaY*(e.deltaMode===1?24:e.deltaMode===2?height:1);
  let state=positions.get(target);if(!state||Math.abs(state.actual-current)>.01)state={actual:current,desired:current};
  state.desired=Math.max(0,Math.min(max,state.desired+delta));
  e.preventDefault();target.scrollTop=state.desired;state.actual=target.scrollTop;positions.set(target,state);
 };
 doc.addEventListener('wheel',onWheel,{passive:false});
 return ()=>doc.removeEventListener('wheel',onWheel);
}
