import assert from 'node:assert/strict';
import {TimerNotifications} from '../web/focus-notifications.mjs';
let now=1000,s={id:'one',title:'作業',mode:'timer',elapsed:0,goal:60000,started:now,running:true},due=[],sent=[],permissions=0;
const values=new Map(),store={read:k=>values.get(k),write:(k,v)=>values.set(k,v)},timeouts=new Map();let next=0;
const host={isSecureContext:true,Date:{now:()=>now},setTimeout:(fn,ms)=>{timeouts.set(++next,{fn,ms});return next;},clearTimeout:id=>timeouts.delete(id),Notification:class{static permission='default';static async requestPermission(){permissions++;this.permission='granted';return 'granted';}},navigator:{serviceWorker:{getRegistration:async()=>({active:true,showNotification:async(title,options)=>sent.push({title,...options})})}}};
const n=new TimerNotifications({store,getSession:()=>s,onDue:v=>due.push(v.id),host});
await n.enable();assert.equal(permissions,1);n.check();assert.equal([...timeouts.values()][0].ms,60000);
now+=15000;s={...s,elapsed:15000,running:false};n.check();assert.equal(timeouts.size,0);now+=100000;n.check();assert.equal(due.length,0);
s={...s,started:now,running:true};n.check();assert.equal([...timeouts.values()][0].ms,45000);
now+=45000;n.check();n.check();await new Promise(r=>setImmediate(r));assert.deepEqual(due,['one']);assert.equal(sent.length,1);assert(sent[0].silent);assert.equal(sent[0].renotify,false);assert.equal(sent[0].tag,'focus-timer-one');
const restored=new TimerNotifications({store,getSession:()=>s,onDue:v=>due.push(v.id),host});restored.check();assert.equal(due.length,1);
s={...s,id:'two',started:now,elapsed:0};n.check();n.disable();now+=60000;n.check();await new Promise(r=>setImmediate(r));assert.equal(due.length,2);assert.equal(sent.length,1);
s={...s,id:'watch',mode:'stopwatch'};n.check();assert.equal(timeouts.size,0);assert.equal(due.length,2);
s={...s,id:'rest',mode:'timer',purpose:'break'};await n.enable();n.check();await new Promise(r=>setImmediate(r));assert.equal(sent.at(-1).title,'休憩終了');
// OS permission denial leaves the in-app deadline available and never throws.
host.Notification.permission='denied';s={...s,id:'denied'};n.check();assert.equal(due.at(-1),'denied');
console.log('Notification checks passed: real deadline math, pause/resume, restore dedupe, quiet SW delivery, off/denied fallback, stopwatch exclusion, break notification.');
