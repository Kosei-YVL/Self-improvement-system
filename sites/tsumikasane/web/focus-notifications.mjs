import {elapsedSession} from './focus-planning.mjs';

// Deadlines use absolute time; notifying never changes the ongoing measurement.
// Web Notifications cannot wake a terminated app. Reopening checks the deadline again.
export class TimerNotifications{
 constructor({store,getSession,onDue,onStatus=()=>{},host=globalThis}){
  Object.assign(this,{store,getSession,onDue,onStatus,host});this.signature='';this.timeout=null;
  try{this.seen=JSON.parse(store.read('focus-notified-timers')||'[]');}catch{this.seen=[];}
  if(!Array.isArray(this.seen))this.seen=[];
  host.addEventListener?.('pageshow',()=>this.check());host.addEventListener?.('focus',()=>this.check());
  host.document?.addEventListener('visibilitychange',()=>this.check());
 }
 get supported(){return this.host.isSecureContext&&!!this.host.Notification;}
 get enabled(){return this.store.read('focus-timer-notifications')!=='off';}
 get status(){return !this.supported?'端末通知はこのブラウザでは利用できません':!this.enabled?'端末通知オフ':this.host.Notification.permission==='granted'?'端末通知オン':this.host.Notification.permission==='denied'?'ブラウザの設定で通知を許可してください':'通知の許可が必要です';}
 async enable(){
  this.store.write('focus-timer-notifications','on');
  try{if(this.supported&&this.host.Notification.permission==='default')await this.host.Notification.requestPermission();}catch{}
  this.onStatus(this.status);return this.status;
 }
 disable(){this.store.write('focus-timer-notifications','off');this.onStatus(this.status);}
 check(){
  const s=this.getSession(),now=this.host.Date.now();
  const signature=s?.mode==='timer'?[s.id,s.started,s.elapsed,s.goal,s.running].join(':'):'';
  if(signature!==this.signature){this.signature=signature;this.host.clearTimeout(this.timeout);this.timeout=null;}
  if(!signature||this.seen.includes(s.id))return;
  const remaining=s.goal-elapsedSession(s,now);
  if(remaining<=0){
   this.host.clearTimeout(this.timeout);this.timeout=null;this.seen.push(s.id);this.seen=this.seen.slice(-256);
   this.store.write('focus-notified-timers',JSON.stringify(this.seen));this.onDue(s);
   if(this.supported&&this.enabled&&this.host.Notification.permission==='granted')void this.deliver(s);
  }else if(s.running&&this.timeout===null){
   this.timeout=this.host.setTimeout(()=>{this.timeout=null;this.check();},Math.min(remaining,2147483647));
  }
 }
 async deliver(s){
  const title=s.purpose==='break'?'休憩終了':'タイマー終了';
  const options={body:s.purpose==='break'?'5分の休憩が終了しました':s.title,tag:'focus-timer-'+s.id,silent:true,renotify:false,icon:'/icons/focus-192.png',data:{url:'/focus.html#dashboard'}};
  try{
   const registration=await this.host.navigator?.serviceWorker?.getRegistration('/');
   if(registration?.active&&registration.showNotification){await registration.showNotification(title,options);return;}
   const notification=new this.host.Notification(title,options);
   notification.onclick=()=>{this.host.focus?.();this.host.location.hash='dashboard';notification.close();};
  }catch{this.onStatus('端末通知を表示できませんでした。アプリ内で終了を表示します');}
 }
}
