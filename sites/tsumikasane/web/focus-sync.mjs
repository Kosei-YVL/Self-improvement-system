import {shared,emptyShared,same,mergeShared,digest,keyMaterial,encryptShared,decryptShared,validShared} from './focus-sync-model.mjs';
export class FocusSync{
 constructor({store,environment,getLocal,apply,onStatus,canApply=()=>true}){Object.assign(this,{store,environment,getLocal,apply,onStatus,canApply});this.meta=JSON.parse(store.read('focus-sync-meta')||'{}');this.key=store.read('focus-sync-key')||'';this.busy=false;this.enabled=!!this.key;this.conflict=null;}
 status(message){this.message=message;this.onStatus(message);}
 async connect(secret){const material=await keyMaterial(secret);const old=this.key;this.key=secret;this.material=material;try{await this.request('GET');}catch(error){this.key=old;this.material=null;throw error;}const keyTag=await digest(material.auth);if(this.meta.keyTag!==keyTag){this.meta={keyTag};this.store.write('focus-sync-meta',JSON.stringify(this.meta));}this.store.write('focus-sync-key',secret);if(!await this.store.flush())throw Error('端末に接続設定を保存できません。');this.enabled=true;await this.run();}
 disconnect(){this.enabled=false;this.key='';this.material=null;this.store.write('focus-sync-key','');this.status('同期オフ');}
 changed(){if(!this.enabled)return;this.status('同期待ち');clearTimeout(this.delay);this.delay=setTimeout(()=>this.run(),400);}
 async request(method,body){
  this.material||=await keyMaterial(this.key);const conditional=method==='GET'&&Number.isSafeInteger(this.meta.revision)&&validShared(this.meta.base)?{'If-None-Match':'"focus-'+this.meta.revision+'"'}:{};const response=await fetch('/api/focus-sync',{method,cache:'no-store',headers:{'Authorization':'Bearer '+this.material.auth,'X-Focus-Environment':this.environment,...conditional,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(response.status===401)throw Error('同期キーを確認してください。');if(response.status===403)throw Error('接続先とデータ環境が一致しません。');if(response.status===413)throw Error('同期データが上限を超えています。ZIPを書き出してください。');if(response.status===503)throw Error('同期先が未設定です。');if(response.status===409)return {conflict:true};if(!response.ok)throw Error('同期できません。端末内の記録は保持しています。');const result=await response.json();if(!Number.isSafeInteger(result.revision)||result.revision<0)throw Error('同期先の形式が一致しません。');return result;
 }
 checkpoint(reason){const list=JSON.parse(this.store.read('focus-checkpoints')||'[]');list.unshift({createdAt:new Date().toISOString(),reason,value:this.getLocal()});this.store.write('focus-checkpoints',JSON.stringify(list.slice(0,5)));}
 async remember(remote,revision){if(this.meta.revision===revision&&(this.meta.base===remote||same(this.meta.base,remote)))return true;this.meta={...this.meta,base:remote,revision};this.store.write('focus-sync-meta',JSON.stringify(this.meta));return this.store.flush();}
 async run(){
  if(!this.enabled||this.busy||this.conflict)return;
  if(!this.canApply()){this.status('編集中・同期待ち');return;}
  this.busy=true;
  try{
   for(let attempt=0;attempt<4&&this.enabled;attempt++){
    if(!await this.store.flush())throw Error('端末の保存エラーを解消してから同期してください。');
    if(this.message!=='同期済み')this.status('同期中');const head=await this.request('GET');if(head.revision<(this.meta.revision||0))throw Error('同期先の保存履歴が戻っています。データを控えて確認してください。');if(head.unchanged&&(!validShared(this.meta.base)||head.revision!==this.meta.revision))throw Error('同期の基準データを確認してください。');const remote=head.unchanged?this.meta.base:head.payload?await decryptShared(head.payload,this.material.key):emptyShared();
    if(!this.enabled)return;if(!this.canApply()){this.status('編集中・同期待ち');return;}
    const local=this.getLocal(),base=this.meta.base||emptyShared(),merged=mergeShared(base,local,remote);
    if(merged.conflicts.length){this.conflict={base,local,remote,revision:head.revision,conflicts:merged.conflicts};this.status('同期の競合・設定で確認');return;}
    if(!same(local,merged.value)){this.checkpoint('before-sync');this.apply(merged.value);}
    if(!await this.remember(remote,head.revision))throw Error('端末に保存できないため同期を止めました。');
    if(same(merged.value,remote)){if(same(this.getLocal(),remote)){this.status('同期済み');return;}continue;}
    const payload=await encryptShared(merged.value,this.material.key);if(!this.enabled)return;const result=await this.request('POST',{expectedRevision:head.revision,writeId:crypto.randomUUID(),payload});
    if(result.conflict)continue;
    if(!await this.remember(merged.value,result.revision))throw Error('端末への保存を確認してください。');
    if(same(this.getLocal(),merged.value)){this.status('同期済み');return;}
   }
   this.status('同期待ち');
  }catch(error){this.status(navigator.onLine?error.message:'オフライン・端末に保存');}
  finally{this.busy=false;}
 }
 async resolve(choice){
  const conflict=this.conflict;if(!conflict)return;
  const current=this.getLocal(),result=mergeShared(conflict.base,current,conflict.remote,choice);
  if(!validShared(result.value))throw Error('削除と編集が重なっています。両方のJSONを控えて確認してください。');
  this.checkpoint('before-conflict-resolution');this.apply(result.value);this.conflict=null;
  await this.remember(conflict.remote,conflict.revision);await this.run();
 }
 start(){this.poll=setInterval(()=>this.run(),15000);window.addEventListener('online',()=>this.run());window.addEventListener('focus',()=>this.run());document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.run();});if(this.enabled)this.run();}
}
export {shared};
