// A drag handle is shown only in layout mode. DOM order previews the final order.
export class BlockLayout {
 constructor({root,onSave,reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches}){
  this.root=root;this.onSave=onSave;this.reduced=reduced;this.drag=null;
  root.addEventListener('dragstart',e=>{const handle=e.target.closest('[data-layout-handle]');if(!handle)return;const block=handle.closest('[data-layout-id]');this.drag={block,pointer:false};block.classList.add('layout-dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',block.dataset.layoutId);});
  root.addEventListener('dragover',e=>{if(!this.drag)return;e.preventDefault();this.move(e.clientX,e.clientY);});
  root.addEventListener('drop',e=>{if(this.drag){e.preventDefault();this.move(e.clientX,e.clientY);this.finish();}});
  root.addEventListener('dragend',()=>this.finish());
  root.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-layout-handle]');if(!handle||e.pointerType==='mouse')return;const block=handle.closest('[data-layout-id]');this.drag={block,pointer:true,id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};handle.setPointerCapture(e.pointerId);});
  root.addEventListener('pointermove',e=>{if(!this.drag?.pointer||this.drag.id!==e.pointerId)return;const d=this.drag;if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<8)return;d.moved=true;d.block.classList.add('layout-dragging');e.preventDefault();this.move(e.clientX,e.clientY);if(e.clientY<90)window.scrollBy(0,-12);else if(e.clientY>innerHeight-110)window.scrollBy(0,12);});
  root.addEventListener('pointerup',()=>{if(this.drag?.pointer)this.finish();});
  root.addEventListener('pointercancel',()=>{if(this.drag?.pointer)this.finish();});
  root.addEventListener('keydown',e=>{const handle=e.target.closest('[data-layout-handle]');if(!handle||!['ArrowUp','ArrowDown'].includes(e.key))return;const block=handle.closest('[data-layout-id]'),siblings=[...block.parentElement.children].filter(el=>el.dataset.layoutId),i=siblings.indexOf(block),target=siblings[i+(e.key==='ArrowUp'?-1:1)];if(!target)return;e.preventDefault();block.parentElement.insertBefore(block,e.key==='ArrowUp'?target:target.nextElementSibling);this.onSave([...block.parentElement.children].filter(el=>el.dataset.layoutId).map(el=>el.dataset.layoutId));handle.focus();});
 }
 move(x,y){
  const block=this.drag?.block;if(!block)return;const target=document.elementFromPoint(x,y)?.closest('[data-layout-id]');
  if(!target||target===block||target.parentElement!==block.parentElement)return;
  const parent=block.parentElement,rect=target.getBoundingClientRect(),after=y>rect.top+rect.height/2;
  const nodes=[...parent.children].filter(e=>e.dataset.layoutId),before=new Map(nodes.map(e=>[e,e.getBoundingClientRect()]));
  const reference=after?target.nextElementSibling:target;if(reference===block||block.nextElementSibling===reference)return;
  parent.insertBefore(block,reference);
  if(!this.reduced())for(const node of nodes){if(node===block)continue;const prior=before.get(node),now=node.getBoundingClientRect(),dx=prior.left-now.left,dy=prior.top-now.top;if(dx||dy)node.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:160,easing:'cubic-bezier(.2,.7,.2,1)'});}
 }
 finish(){if(!this.drag)return;const {block}=this.drag;block.classList.remove('layout-dragging');const order=[...block.parentElement.children].filter(e=>e.dataset.layoutId).map(e=>e.dataset.layoutId);this.drag=null;this.onSave(order);}
}
export const layoutHandle=label=>`<button class="block-handle" data-layout-handle draggable="true" aria-label="${String(label).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}を並べ替え" title="ドラッグして並べ替え">⠿</button>`;
