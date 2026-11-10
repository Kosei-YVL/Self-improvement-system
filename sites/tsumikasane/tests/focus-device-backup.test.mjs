import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {deviceBackup} from '../scripts/focus-device-backup.mjs';
import {blankData} from '../web/core.mjs';
const dir=await mkdtemp(resolve(tmpdir(),'focus-file-backup-'));
const backup={format:'focus-device',version:1,data:blankData(),config:{template:'focus',order:['capture','plan','progress','logs'],progress:'calendar',routines:[]},timer:null},id='12345678-1234-1234-1234-123456789abc';
backup.data.logs.push({id:'keep',title:'端末内の記録',category:'learning',date:'2026-10-28',minutes:25,note:'元の記録'});
const call=(sequence,value=backup,origin='http://127.0.0.1:4545')=>deviceBackup(new Request(origin+'/api/focus-device-backup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Focus-Local':'1','X-Focus-Environment':'personal'},body:JSON.stringify({deviceId:id,sequence,backup:value})}),{dataDir:dir,environment:'personal'});
try{
 assert.equal((await call(1)).status,200);const latest=resolve(dir,'device-backups',id,'latest.json'),first=JSON.parse(await readFile(latest,'utf8'));assert.deepEqual(first.data,backup.data);assert.equal((await call(1)).status,200);
 assert.equal((await call(1,{...backup,data:blankData()})).status,409);assert.equal((await call(0)).status,400);
 assert.equal((await call(2,{...backup,version:99})).status,422);assert.equal((await call(2,backup,'https://cloud.example')).status,403);
 const changed=structuredClone(backup);changed.data.logs[0].minutes=30;
 assert.equal((await call(2,changed)).status,200);assert.equal((await call(1)).status,409);
 assert.equal(JSON.parse(await readFile(latest,'utf8')).data.logs[0].minutes,30);
 let files=await readdir(resolve(dir,'device-backups',id));const prior=files.find(n=>n.startsWith('previous-'));assert.equal(JSON.parse(gunzipSync(await readFile(resolve(dir,'device-backups',id,prior)))).data.logs[0].minutes,25);
 const responses=await Promise.all([call(4,changed),call(3,backup)]);assert.deepEqual(responses.map(r=>r.status),[200,409]);
 for(let i=5;i<10;i++)assert.equal((await call(i,changed)).status,200);
 files=await readdir(resolve(dir,'device-backups',id));assert.equal(files.filter(n=>n.startsWith('previous-')).length,3);assert.equal(JSON.parse(await readFile(latest,'utf8')).metadata.localCheckpoint.sequence,9);
 console.log('Local file checkpoint checks passed: actual JSON saved, current records preserved, old/future/foreign writes rejected, idempotency, compressed recovery copies, bounded snapshots and serialized concurrent writes. No cloud plaintext backup.');
}finally{await rm(dir,{recursive:true,force:true});}
