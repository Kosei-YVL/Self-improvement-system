import {blankData} from './core.mjs';
import {validFocusData,validTimer,validRoutine,validPlanning} from './focus-model.mjs';
import {gzipSync,gunzipSync} from './vendor/fflate.mjs';
export const shared=(data,routines,...session)=>({format:'focus-shared',version:1,data:structuredClone(data),routines:structuredClone(routines),...(session.length?{session:structuredClone(session[0])}:{}),...(session[1]?{planning:structuredClone(session[1])}:{})});
export const emptyShared=()=>shared(blankData(),[],null);
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=v=>v===undefined?undefined:structuredClone(v);
export function validShared(s){return s?.format==='focus-shared'&&s.version===1&&validFocusData(s.data)&&Array.isArray(s.routines)&&s.routines.length<=1000&&s.routines.every(validRoutine)&&new Set(s.routines.map(r=>r.id)).size===s.routines.length&&(s.session===undefined||validTimer(s.session))&&validPlanning(s.planning);}
// Three-way merge: independent changes combine; competing edits are never silently overwritten.
export function mergeShared(base,local,remote,choice='local'){
 const conflicts=[];
 function merge(b,l,r,path){
  if(same(l,r))return clone(l);if(same(l,b))return clone(r);if(same(r,b))return clone(l);
  if(path==='/session'){conflicts.push({path,local:clone(l),remote:clone(r)});return clone(choice==='remote'?r:l);}
  const arrays=[b,l,r];
  if(arrays.every(Array.isArray)&&arrays.every(a=>a.every(v=>v&&typeof v.id==='string'))){
   const maps=arrays.map(a=>new Map(a.map(v=>[v.id,v]))),ids=new Set([...l,...r,...b].map(v=>v.id));
   return [...ids].map(id=>merge(...maps.map(m=>m.get(id)),path+'/'+id)).filter(v=>v!==undefined);
  }
  if([b,l,r].every(v=>v&&typeof v==='object'&&!Array.isArray(v))){const out={};for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){const v=merge(b[k],l[k],r[k],path+'/'+k);if(v!==undefined)Object.defineProperty(out,k,{value:v,enumerable:true,writable:true,configurable:true});}return out;}
  conflicts.push({path,local:clone(l),remote:clone(r)});return clone(choice==='remote'?r:l);
 }
 const value=merge(base,local,remote,'');if(!validShared(value))conflicts.push({path:'/integrity',local:null,remote:null});return {value,conflicts};
}
const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const utf8=new TextEncoder();
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function validKey(key){return typeof key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(key)&&decode(key.replaceAll('-','+').replaceAll('_','/')+'=').length===32;}
export async function keyMaterial(secret){
 if(!validKey(secret))throw Error('同期キーは43文字の専用キーを指定してください。');
 const auth=await digest('focus-auth-v1:'+secret),raw=await crypto.subtle.digest('SHA-256',utf8.encode('focus-encryption-v1:'+secret));
 return {auth,key:await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])};
}
const aad=utf8.encode('focus-shared/1');
const MAX_PLAIN=32*1024*1024;
async function streamBytes(stream,max){const reader=stream.getReader(),chunks=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('同期データが上限を超えています。JSONを書き出してください。');}chunks.push(value);}const out=new Uint8Array(size);let i=0;for(const chunk of chunks){out.set(chunk,i);i+=chunk.length;}return out;}
export async function encryptShared(value,key){
 const plain=utf8.encode(JSON.stringify(value));if(plain.length>MAX_PLAIN)throw Error('同期データが上限を超えています。JSONを書き出してください。');
 let version=1,bytes=plain,size;
 if(plain.length>65536){let compressed;try{compressed=typeof CompressionStream==='function'?await streamBytes(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip')),MAX_PLAIN+65536):gzipSync(plain,{level:3});}catch{compressed=gzipSync(plain,{level:3});}if(compressed.length<plain.length*.9){version=2;size=plain.length;bytes=compressed;}}
 const iv=crypto.getRandomValues(new Uint8Array(12)),additionalData=version===2?utf8.encode('focus-shared/2/gzip/'+size):aad,ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,bytes);
 return {format:'focus-cipher',version,...(version===2?{size}:{}),iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))};
}
export async function decryptShared(value,key){
 if(value?.format!=='focus-cipher'||![1,2].includes(value.version)||value.version===2&&(!Number.isSafeInteger(value.size)||value.size<1||value.size>MAX_PLAIN))throw Error('同期データの形式が一致しません。');
 const additionalData=value.version===2?utf8.encode('focus-shared/2/gzip/'+value.size):aad,plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv),additionalData},key,decode(value.ciphertext));
 let bytes=new Uint8Array(plain);
 if(value.version===2){bytes=typeof DecompressionStream==='function'?await streamBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),value.size):gunzipSync(bytes,{out:new Uint8Array(value.size)});if(bytes.length!==value.size)throw Error('同期データのサイズが一致しません。');}
 const s=JSON.parse(new TextDecoder().decode(bytes));if(!validShared(s))throw Error('同期データの形式が一致しません。');return s;
}
