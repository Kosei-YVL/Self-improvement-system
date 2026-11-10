import assert from 'node:assert/strict';
import {DeviceCheckpoint} from '../web/focus-checkpoint.mjs';
import {blankData} from '../web/core.mjs';
const saved=new Map([['focus-device-id','12345678-1234-1234-1234-123456789abc']]),store={read:key=>saved.get(key)||null,write:(key,value)=>saved.set(key,value),flush:async()=>true};
const backup={format:'focus-device',version:1,data:{...blankData(),asset:{value:'before'}},config:{routines:[],template:'focus',order:['capture','plan','progress','logs'],progress:'calendar'},timer:null};
const fetchBefore=globalThis.fetch,digestBefore=crypto.subtle.digest,posted=[];
try{
 crypto.subtle.digest=async function(...args){backup.data.asset.value='after';return digestBefore.apply(this,args);};
 globalThis.fetch=async(url,options)=>{posted.push(JSON.parse(options.body));return Response.json({saved:true});};
 const checkpoints=new DeviceCheckpoint({store,environment:'personal',getBackup:()=>backup,enabled:true});
 await checkpoints.run();assert.equal(posted[0].backup.data.asset.value,'before','Hashing must not change the payload snapshot by reference');
 await checkpoints.run();assert.equal(posted[1].backup.data.asset.value,'after');await checkpoints.run();assert.equal(posted.length,2,'Stable content must not post repeatedly');
 assert.equal(posted[0].sequence,1);assert.equal(posted[1].sequence,2);assert.equal(checkpoints.message,'PCの控え：保存済み');
 console.log('Checkpoint client checks passed: edits during async hashing never mutate the captured backup; follow-up saves the latest data once, idle requests are skipped.');
}finally{globalThis.fetch=fetchBefore;crypto.subtle.digest=digestBefore;}
