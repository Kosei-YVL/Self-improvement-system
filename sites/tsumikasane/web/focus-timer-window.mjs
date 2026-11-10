import {elapsedSession} from './focus-planning.mjs';

export function timerWindowView(session,now=Date.now()){
 if(!session)return null;
 const elapsed=elapsedSession(session,now),ended=session.mode==='timer'&&elapsed>=session.goal;
 const format=ms=>{const seconds=Math.floor(ms/1000);return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':');};
 return {id:session.id,title:session.title,text:format(session.mode==='timer'&&!ended?session.goal-elapsed:elapsed),extraText:ended?'+'+format(elapsed-session.goal):'',ended,running:session.running,purpose:session.purpose};
}
export class TimerWindow{
 constructor({getSession,onPause,onFinish,canFinish=()=>true,host=globalThis}){
  Object.assign(this,{getSession,onPause,onFinish,canFinish,host});this.win=null;this.interval=null;this.pendingFinish=false;this.saveFailed=false;
  host.addEventListener?.('pagehide',()=>this.close());
 }
 get available(){return !!this.host.isSecureContext&&this.host.top===this.host&&!!this.host.documentPictureInPicture?.requestWindow;}
 button(){return this.available?'<button class="timer-popout quiet-button" data-action="timer-popout" aria-label="タイマーを小画面で表示" title="ピクチャーインピクチャー"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4.5" width="18" height="15" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="11.5" y="11" width="7" height="5.5" rx=".6" fill="currentColor"/></svg></button>':'';}
 async open(){
  if(!this.available)throw Error('小窓はWindowsのChrome・Edgeで利用できます。');
  if(!this.getSession())return;
  if(this.win&&!this.win.closed){this.win.focus();return;}
  let win;try{win=await this.host.documentPictureInPicture.requestWindow({width:320,height:200});}catch{throw Error('このブラウザーでは小窓を開けません。Chrome・Edgeの通常のFocus画面から操作してください。');}
  this.win=win;this.saveFailed=false;this.pendingFinish=false;this.lastView=null;this.colorSignature='';
  const doc=win.document;doc.title='Focus';doc.documentElement.lang='ja';
  const style=doc.createElement('style');style.textContent=`*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--paper);color:var(--ink);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;min-width:220px}header{display:flex;justify-content:space-between;gap:8px;align-items:start}strong{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:75%}small{font-size:10px;color:var(--muted);white-space:nowrap}.readout{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 9px}.extra{font-size:11px;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--muted) 75%,#b47f74);white-space:nowrap}[hidden]{display:none!important}.time{font-size:38px;font-variant-numeric:tabular-nums;letter-spacing:-1px;margin:10px 0;line-height:1.2;white-space:nowrap}.actions{display:flex;gap:8px}button{min-height:38px;padding:7px 12px;border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:default}.finish{flex:1;background:var(--green);color:var(--button-ink);border-color:transparent}.error{font-size:11px;min-height:0;color:var(--ink);margin:8px 0 0}.error:empty{display:none}`;doc.head.append(style);
  doc.body.innerHTML='<header><strong id="pip-task"></strong><small id="pip-state" role="status"></small></header><div class="readout"><div class="time" id="pip-time" role="timer" aria-live="off"></div><small id="pip-extra" class="extra" title="設定時間後の経過" hidden></small></div><div class="actions"><button id="pip-pause">一時停止</button><button id="pip-finish" class="finish">完了</button></div><p id="pip-error" class="error" role="alert"></p>';
  doc.querySelector('#pip-pause').onclick=()=>{if(this.getSession())this.onPause(this.getSession().id);this.update();};
  doc.querySelector('#pip-finish').onclick=async()=>{
   if(this.pendingFinish)return;this.pendingFinish=true;this.saveFailed=false;this.update();
   try{const saved=await this.onFinish(this.lastView?.id);if(saved){this.close();return;}this.saveFailed=true;}catch{this.saveFailed=true;}
   finally{this.pendingFinish=false;if(this.win&&!this.win.closed)this.update();}
  };
  win.addEventListener('pagehide',()=>{win.clearInterval(this.interval);if(this.win===win)this.win=null;});
  this.interval=win.setInterval(()=>this.update(),250);this.update();
 }
 update(){
  const win=this.win;if(!win||win.closed)return;
  const session=this.getSession(),next=timerWindowView(session);
  if(!next&&!this.pendingFinish&&!this.saveFailed){this.close();return;}
  if(next&&this.lastView?.id!==next.id)this.saveFailed=false;
  const view=next||this.lastView;if(!view)return;this.lastView=view;
  const doc=win.document,root=this.host.document.documentElement,signature=root.dataset.skin+':'+root.dataset.theme;
  if(signature!==this.colorSignature){const css=this.host.getComputedStyle(root);for(const name of ['paper','ink','muted','green','line'])doc.documentElement.style.setProperty('--'+name,css.getPropertyValue('--'+name));doc.documentElement.style.setProperty('--button-ink',css.getPropertyValue('--primary-ink')||'#10291e');this.colorSignature=signature;}
  const set=(id,text)=>{const el=doc.querySelector(id);if(el.textContent!==text)el.textContent=text;};
  set('#pip-task',view.title);set('#pip-time',view.text);set('#pip-extra',view.extraText);const extra=doc.querySelector('#pip-extra');if(extra.hidden!==!view.extraText)extra.hidden=!view.extraText;set('#pip-state',this.pendingFinish?'保存中':this.saveFailed?'保存を確認':view.running?'計測中':'一時停止');
  set('#pip-pause',view.running?'一時停止':'再開');doc.querySelector('#pip-pause').disabled=!session||this.pendingFinish;
  set('#pip-finish',this.saveFailed?'保存を再試行':view.purpose==='break'?'休憩終了':'完了');doc.querySelector('#pip-finish').disabled=this.pendingFinish||!this.canFinish();
  set('#pip-error',this.saveFailed?'端末への保存を確認できません。再試行するか、Focusで確認してください。':'');
 }
 close(){const win=this.win;this.win=null;if(win&&!win.closed){win.clearInterval(this.interval);win.close();}this.pendingFinish=false;this.saveFailed=false;}
}
