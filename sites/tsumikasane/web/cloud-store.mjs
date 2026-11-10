import { validateData, uid } from './core.mjs';
import { normalizeData } from './history.mjs';
export class CloudStore {
  constructor({read,write,onData,onStatus,onConflict}){Object.assign(this,{read,write,onData,onStatus,onConflict});this.revision=0;this.ready=false;this.busy=false;this.conflict=null;this.queued=null;this.meta={};}
  status(text){this.onStatus(text);}
  saveMeta(){this.write('tsumikasane-cloud-meta',JSON.stringify(this.meta));}
  disconnected(){this.status(this.signInPath?'ログインの更新が必要・端末に保存':'端末に保存・クラウド未接続');}
  async readResponse(res){
    if(res.status===401){const body=await res.json();if(typeof body.signInPath==='string'&&body.signInPath.startsWith('/')&&!body.signInPath.startsWith('//')&&!body.signInPath.includes('\\'))this.signInPath=body.signInPath;throw Error('sign_in_required');}
    if(!res.ok)throw Error('cloud_request_failed');this.signInPath=null;return res.json();
  }
  async get(){const res=await fetch('/api/data',{cache:'no-store',credentials:'same-origin'});const body=await this.readResponse(res);if(body.data&&!validateData(body.data))throw Error('cloud_data_invalid');return body;}
  async init(local){
    this.ready=false;this.status('クラウドを確認中');
    try{const saved=JSON.parse(this.read('tsumikasane-cloud-meta')||'{}');this.meta=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{this.meta={};}
    // An offline restart must keep the base revision of the cached data.
    this.revision=Number.isSafeInteger(this.meta.revision)&&this.meta.revision>=0?this.meta.revision:0;
    try{
      const remote=await this.get();this.revision=remote.revision;this.ready=true;
      if(!remote.data){this.meta={revision:0,dirty:!!local};if(local)this.schedule(local);else{this.saveMeta();this.status('クラウド保存の準備完了');}return;}
      const remoteData=normalizeData(remote.data);
      if(local&&this.meta.dirty){
        if(this.meta.revision===remote.revision||this.meta.pendingId===remote.lastWriteId){this.meta.revision=remote.revision;this.schedule(local);return;}
        this.setConflict(local,remoteData);return;
      }
      const hasLocal=local&&['tasks','events','logs','history','sourceTables'].some(k=>local[k]?.length);
      if(hasLocal&&!Number.isInteger(this.meta.revision)&&JSON.stringify(local)!==JSON.stringify(remoteData)){this.setConflict(local,remoteData);return;}
      this.meta={revision:remote.revision,dirty:false};this.saveMeta();this.onData(remoteData);this.status('クラウドに保存済み');
    }catch{this.ready=true;this.disconnected();}
  }
  setConflict(local,remote){this.conflict={local,remote};this.meta.dirty=true;this.saveMeta();this.status('保存の競合：確認が必要');this.onConflict(this.conflict);}
  schedule(data){this.queued=structuredClone(data);this.meta={...this.meta,revision:this.revision,dirty:true};this.saveMeta();if(this.conflict){this.conflict.local=this.queued;return;}this.status('クラウドに保存中');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),350);}
  async flush(){
    if(this.busy||!this.ready||!this.queued||this.conflict)return;
    this.busy=true;const data=this.queued;this.queued=null;const writeId=uid();this.meta.pendingId=writeId;this.saveMeta();
    try{
      const res=await fetch('/api/data',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,expectedRevision:this.revision,writeId})});
      if(res.status===409){const remote=await this.get();this.revision=remote.revision;this.setConflict(this.queued||data,normalizeData(remote.data));return;}
      const result=await this.readResponse(res);this.revision=result.revision;this.meta={revision:this.revision,dirty:!!this.queued};this.saveMeta();this.status(this.queued?'クラウドに保存中':'クラウドに保存済み');
    }catch{
      this.queued ||= data;
      try{const remote=await this.get();if(remote.lastWriteId===writeId){this.revision=remote.revision;this.meta={revision:this.revision,dirty:JSON.stringify(this.queued)!==JSON.stringify(data)};if(!this.meta.dirty)this.queued=null;this.saveMeta();this.status(this.queued?'クラウドに保存中':'クラウドに保存済み');}else this.disconnected();}catch{this.disconnected();}
    }finally{this.busy=false;if(this.queued&&!this.conflict&&this.meta.revision===this.revision&&this.meta.pendingId===undefined)this.flush();}
  }
  async refresh(){if(this.busy||this.meta.dirty||this.conflict)return;try{const remote=await this.get();if(remote.data&&remote.revision!==this.revision){this.revision=remote.revision;this.meta={revision:this.revision,dirty:false};this.saveMeta();this.onData(normalizeData(remote.data));}this.status('クラウドに保存済み');}catch{this.disconnected();}}
  resolve(useRemote){if(!this.conflict)return null;const data=useRemote?this.conflict.remote:this.conflict.local;this.conflict=null;this.queued=null;this.meta={revision:this.revision,dirty:false};this.saveMeta();this.onData(data);if(!useRemote)this.schedule(data);else this.status('クラウドに保存済み');return data;}
}
