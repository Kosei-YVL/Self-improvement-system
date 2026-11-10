export const checkSVG='<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m10 21 7 7L31 12" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export async function completionFeedback(button,{variant='pop',reduced=matchMedia('(prefers-reduced-motion:reduce)').matches}={}){
 if(!button)return;
 const rect=button.getBoundingClientRect();button.style.width=rect.width+'px';button.style.height=rect.height+'px';button.disabled=true;button.classList.add('is-complete');button.innerHTML=checkSVG;button.setAttribute('aria-label','記録済み');
 if(reduced||variant==='none'){await new Promise(done=>setTimeout(done,80));return;}
 const effect=document.createElement('span');effect.className='completion-burst';effect.dataset.variant=variant;effect.setAttribute('aria-hidden','true');effect.style.left=(rect.left+rect.width/2)+'px';effect.style.top=(rect.top+rect.height/2)+'px';
 effect.innerHTML='<span class="burst-check">'+checkSVG+'</span>'+(variant==='ripple'?'<span class="check-echo">'+checkSVG+'</span>':'');(button.closest('dialog[open]')||document.body).append(effect);
 await new Promise(done=>setTimeout(done,600));effect.remove();
}
