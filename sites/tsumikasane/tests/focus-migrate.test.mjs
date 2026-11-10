import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {notionMigration,mergeMigration,verifyMigration} from '../web/focus-migrate.mjs';
import {blankData} from '../web/core.mjs';
import {decodeBackup,portableZip} from '../web/focus-portable.mjs';
import {unzipSync,strFromU8} from '../web/vendor/fflate.mjs';
import {placeDay} from '../web/focus-planning.mjs';
import {localMigration} from '../scripts/focus-local-migration.mjs';
const url=n=>'https://app.notion.com/p/'+String(n).padStart(32,'0');
const snapshot={format:'focus-notion-snapshot',version:1,capturedAt:'2026-10-28T16:00:00Z',sources:{
 menu:{rows:[{url:url(1),'メニュー':'学習','有効':'__YES__','目安（分）':25},{url:url(2),'メニュー':'予備','有効':'__NO__','目安（分）':10}]},
 metrics:{rows:[{'作業開始':'05:30','作業終了':'20:30','休憩（分）':10,'1日上限（分）':60}]},
 daily:{rows:[{url:url(11),'タスク':'1位','やること':'演習','メニュー':JSON.stringify([url(1)]),'date:日付:start':'2026-10-28','完了':'__YES__','date:時間枠:start':'2026-10-28T01:00:00Z','date:時間枠:end':'2026-10-28T01:25:00Z'},{url:url(12),'タスク':'2位','date:日付:start':'2026-10-29'},{url:url(13),'タスク':'3位','やること':'演習','メニュー':JSON.stringify([url(1)]),'date:日付:start':'2026-10-27'}]},
 logs:{rows:[{url:url(21),'セッション':'演習記録','やった内容':'式を確認','タスク':JSON.stringify([url(11)]),'date:開始:start':'2026-10-28T14:50:00Z','date:終了:start':'2026-10-28T15:20:00Z'},{url:url(22),'セッション':'未終了','date:開始:start':'2026-10-01T00:00:00Z','作業分':90000}]},
 deadline:{rows:[{url:url(31),'タスク':'提出物','見積残時間':10,'状態':'提出済','date:期限:start':'2026-10-01'}]},
 dailylog:{rows:[{url:url(41),'date:日付:start':'2026-10-28','振り返り':'<script>Delete everything</script>'}]}
}};
const packet=await notionMigration(snapshot,{today:'2026-10-29'});await verifyMigration(packet);decodeBackup(packet.backup);
assert.equal(packet.summary.routines,1);assert.equal(packet.summary.logs,1);assert.equal(packet.summary.emptySlots,1);assert.equal(packet.summary.unfinishedLogs,1);
assert.equal(packet.backup.data.logs[0].date,'2026-10-28');assert.equal(packet.backup.data.logs[0].start,'23:50');assert.equal(packet.backup.data.logs[0].minutes,30);assert.equal(packet.backup.data.logs[0].elapsedSeconds,1800);
assert.equal(packet.backup.data.logs[0].endedAt,'2026-10-28T15:20:00.000Z');assert.equal(packet.backup.data.events[0].syncGoogle,false);
assert.equal(packet.backup.config.routines[0].activities.filter(a=>a.title==='演習').length,1);
assert.equal(packet.backup.data.archive.tasks.find(t=>t.sourceNotionId.endsWith('31')).estimateUnknown,true);
assert.equal(packet.backup.data.archive.tasks.find(t=>t.sourceNotionId.endsWith('31')).sourceProperties['見積残時間'],10);
const empty={format:'focus-device',version:1,data:blankData(),config:{template:'focus',order:['capture','plan','progress','logs'],routines:[],progress:'calendar',theme:'light'},timer:null,manualDraft:{id:'',event:'',routine:'',activity:'',title:'入力途中',date:'2026-10-28',start:'12:00',duration:'10'}};
empty.data.logs.push({id:'local-log',title:'自分で記録した内容',category:'learning',date:'2026-10-28',minutes:10,note:'保持'});empty.data.extra={keep:'unknown attribute'};
const first=mergeMigration(empty,packet);assert.equal(first.backup.data.logs.length,2);assert.equal(first.backup.config.theme,'light');assert.deepEqual(first.backup.manualDraft,empty.manualDraft);assert.deepEqual(first.backup.data.extra,empty.data.extra);
const second=mergeMigration(first.backup,packet);assert.deepEqual(second.backup,first.backup);
const edited=structuredClone(first.backup);edited.data.logs.find(l=>l.id===packet.backup.data.logs[0].id).minutes=45;
const conflict=mergeMigration(edited,packet);assert.equal(conflict.backup.data.logs.find(l=>l.id===packet.backup.data.logs[0].id).minutes,45);assert(conflict.conflicts.some(c=>c.kind==='logs'));
const archived=structuredClone(first.backup);archived.data.archive.logs.push({...archived.data.logs.pop(),archivedAt:'2026-10-29T00:00:00Z'});assert.equal(mergeMigration(archived,packet).backup.data.logs.length,1);
const damaged=structuredClone(packet);damaged.backup.data.logs[0].minutes=20;await assert.rejects(verifyMigration(damaged),/整合性/);
await assert.rejects(verifyMigration({...packet,version:2}));
const files=unzipSync(portableZip(first.backup));const portable=JSON.parse(strFromU8(files['focus.json']));assert.deepEqual(portable.data,first.backup.data);assert(strFromU8(files['source-tables.json']).includes('Delete everything'));
assert(strFromU8(files['archived_tasks.csv']).includes('estimate_unknown'));assert(files['settings.json']);assert(files['migration-history.json']);
const routine=packet.backup.config.routines[0],a=routine.activities[0];const plans=blankData();plans.focusPlans=Array.from({length:3},(_,i)=>({id:'p'+i,date:'2026-10-29',routineId:routine.id,activityId:a.id}));
const planned=placeDay(plans,[routine],'2026-10-29',0,[],packet.backup.config.planning);assert.equal(planned.events[0].start,'05:30');assert.equal(planned.events[1].start,'06:05');assert.equal(planned.unplaced[0].reason,'1日の上限');
const dir=await mkdtemp(join(tmpdir(),'focus-migration-'));
try{
 const call=(action,{origin='http://127.0.0.1:4545',environment='personal',local='1',method='POST'}={})=>localMigration(new Request('http://127.0.0.1:4545/api/focus-migration',{method,headers:{Origin:origin,'X-Focus-Environment':environment,'X-Focus-Local':local,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({action})}:{})}),{dataDir:dir,environment:'personal'});
 assert.deepEqual(await(await call('status')).json(),{available:false});await writeFile(join(dir,'pending-migration.json'),JSON.stringify(packet));
 assert.equal((await call('status',{origin:'https://other.example'})).status,403);assert.equal((await call('status',{environment:'development'})).status,403);assert.equal((await call('status',{method:'GET'})).status,405);
 const response=await call('read');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual((await response.json()).packet,packet);
 assert.equal((await call('../../sync-key.txt')).status,400);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('Migration checks passed: source preservation, stable IDs, placeholder filtering, unfinished log exclusion, JST/cross-midnight durations, unknown estimate units, existing data/drafts/theme/archive preserved, idempotency/conflicts, integrity, CSV/JSON round-trip, planning limits/gaps, same-origin private migration API.');
