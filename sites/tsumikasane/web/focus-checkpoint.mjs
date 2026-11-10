const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export class DeviceCheckpoint{
 constructor({store,environment,getBackup,onStatus=()=>{},enabled=location.hostname==='127.0.0.1'}){Object.assign(this,{store,environment,getBackup,onStatus,enabled});this.busy=false;this.needsRun=false;this.message=enabled?'PCの控えを準備中':'この端末に保存';}
 status(message){this.message=message;this.onStatus(message);}
 changed(delay=1000){if(!this.enabled)return;clearTimeout(this.timer);this.status('PCの控え：保存待ち');this.timer=setTimeout(()=>this.run(),delay);}
 async run(){
  if(!this.enabled)return;if(this.busy){this.needsRun=true;this.status('PCの控え：保存待ち');return;}
  this.busy=true;this.status('PCの控え：保存中');
  try{
   if(!await this.store.flush())throw Error('端末への保存を確認してください。');
   // Freeze the exact payload before awaiting hashing; UI edits must not mutate the in-flight copy.
   const text=JSON.stringify(this.getBackup()),backup=JSON.parse(text),digest=await hash(text);
   if(digest===this.store.read('focus-device-backup-digest')){this.status('PCの控え：保存済み');return;}
   let deviceId=this.store.read('focus-device-id');if(!deviceId){deviceId=crypto.randomUUID();this.store.write('focus-device-id',deviceId);}
   const sequence=Number(this.store.read('focus-device-backup-seq')||0)+1;if(!Number.isSafeInteger(sequence))throw Error('PCの控えを確認してください。');
   this.store.write('focus-device-backup-seq',String(sequence));if(!await this.store.flush())throw Error('端末への保存を確認してください。');
   const response=await fetch('/api/focus-device-backup',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Focus-Local':'1','X-Focus-Environment':this.environment},body:JSON.stringify({deviceId,sequence,backup})});
   if(response.status===404){this.enabled=false;this.status('JSONから控えを保存できます');return;}
   if(response.status===409)throw Error('PCに新しい控えがあります。データを確認してください。');
   if(!response.ok)throw Error('PCの控えを保存できません。端末内の記録は保持しています。');
   this.store.write('focus-device-backup-digest',digest);await this.store.flush();this.status('PCの控え：保存済み');
  }catch(error){this.status(navigator.onLine?error.message:'PCの控え：接続後に保存');}
  finally{this.busy=false;if(this.needsRun){this.needsRun=false;this.changed(0);}}
 }
}
