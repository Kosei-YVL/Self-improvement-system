const DATABASE='tsumikasane-device-v1',TABLE='entries';
export async function openDeviceStore(factory=globalThis.indexedDB,{revisionKeys=[],databaseName=DATABASE}={}){
  if(!factory)throw Error('端末内の保存機能を利用できません。');
  const db=await new Promise((resolve,reject)=>{
    const request=factory.open(databaseName,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(TABLE))request.result.createObjectStore(TABLE,{keyPath:'key'});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('別の画面を閉じてから開き直してください。'));
  });
  const records=await new Promise((resolve,reject)=>{const request=db.transaction(TABLE).objectStore(TABLE).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  return new DeviceStore(db,records,revisionKeys);
}
export class DeviceStore {
  constructor(db,records,revisionKeys=[]){
    this.revisionKeys=new Set(revisionKeys);
    this.db=db;this.values=new Map(records.map(row=>[row.key,row.value]));this.versions=new Map(records.map(row=>[row.key,row.revision||0]));this.dirty=new Map();this.listeners=new Set();this.status='この端末に保存済み';this.lastError=null;this.flushing=null;
    db.onversionchange=()=>{db.close();this.closed=true;this.setStatus('画面を開き直してください。端末の保存形式が更新されました。');};
  }
  subscribe(listener){this.listeners.add(listener);listener(this.status);return()=>this.listeners.delete(listener);}
  setStatus(status){this.status=status;for(const listener of this.listeners)listener(status);}
  read(key){return this.values.get(key)??null;}
  write(key,value){
    this.values.set(key,value);this.dirty.set(key,value);
    if(this.closed){this.setStatus('保存できません。JSONを書き出して画面を開き直してください。');return false;}
    this.lastError=null;this.setStatus('この端末に保存中');queueMicrotask(()=>this.flush());return true;
  }
  async flush(){
    if(this.flushing)return this.flushing;
    if(this.closed)return false;
    this.flushing=this.drain();
    try{return await this.flushing;}finally{this.flushing=null;if(this.dirty.size&&!this.lastError)queueMicrotask(()=>this.flush());}
  }
  async drain(){
    while(this.dirty.size){
      const batch=new Map(this.dirty);
      try{
        const revisions=await new Promise((resolve,reject)=>{
          const tx=this.db.transaction(TABLE,'readwrite'),store=tx.objectStore(TABLE),saved=new Map();let failure;
          tx.oncomplete=()=>resolve(saved);tx.onabort=()=>reject(failure||tx.error||Error('保存できませんでした。'));tx.onerror=()=>{};
          for(const [key,value] of batch){
            const request=store.get(key);
            request.onsuccess=()=>{
              try{
              const revision=request.result?.revision||0;
              if((key.startsWith('tsumikasane-data-')||this.revisionKeys.has(key))&&revision!==(this.versions.get(key)||0)){
                failure=Error('別の画面と保存が重複しています。JSONを書き出して画面を開き直してください。');failure.name='DeviceConflictError';tx.abort();return;
              }
              store.put({key,value,revision:revision+1});saved.set(key,revision+1);
              }catch(error){failure=error;tx.abort();}
            };
          }
        });
        for(const [key,value] of batch){this.versions.set(key,revisions.get(key));if(this.dirty.get(key)===value)this.dirty.delete(key);}
      }catch(error){this.lastError=error;this.setStatus(error.name==='DeviceConflictError'?error.message:'端末に保存できません。空き容量を確認し、JSONを書き出してください。');return false;}
    }
    this.lastError=null;this.setStatus('この端末に保存済み');return true;
  }
  get pending(){return this.dirty.size>0;}
}
