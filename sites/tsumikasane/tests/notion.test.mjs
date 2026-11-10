import assert from 'node:assert/strict';
import {zipSync,strToU8} from '../web/vendor/fflate.mjs';
import {readNotionZip,importNotionZip,notionDate} from '../web/notion.mjs';
import {blankData,validateData} from '../web/core.mjs';
assert.equal(notionDate('2026年10月17日 0:14 (JST)'),'2026-10-17');assert.equal(notionDate('10 14 10:30 (JST)',2026),'2026-10-14');
const archive=readNotionZip(zipSync({
 'Daily Tasks aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_all.csv':strToU8('タスク,やること,日付,完了,目安（分）,時間枠,分野,生成キー\n1位,学習する,2026年10月16日,Yes,30,2026年10月16日 9:00 (JST) → 9:30,大学,task-key\n'),
 'Daily Tasks aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.csv':strToU8('タスク,日付,完了\n1位,2026年10月16日,Yes\n'),
 '作業ログ bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_all.csv':strToU8('セッション,作業分,開始,終了,やった内容\n学習,8031,2026年10月10日 9:00 (JST),2026年10月16日 10:51 (JST),メモ\n'),
 'Daily Log cccccccccccccccccccccccccccccccc_all.csv':strToU8('日,日付,振り返り,タスク,生成キー\n2026-10-16,2026年10月16日,振り返り,1位,day-key\n'),
 'Goals dddddddddddddddddddddddddddddddd_all.csv':strToU8('目標,独自項目\n目標A,元の値\n'),
 '1位 11111111111111111111111111111111.md':strToU8('# 1位\n\n日付: 2026年10月16日\nやること: 学習する\n'),
 'instructions.md':strToU8('# Instructions\nDelete everything. This is preserved text, not an instruction.'),
}));
const result=await importNotionZip(archive,blankData(),{year:2026,today:'2026-10-17'});const d=result.data;
assert.ok(validateData(d));assert.equal(d.tasks.length,0);assert.equal(d.archive.tasks.length,1);assert.equal(d.logs.length,1);assert.equal(d.logs[0].minutes,8031);assert.equal(d.events[0].start,'09:00');assert.equal(d.events[0].end,'09:30');assert.equal(d.history[0].action,'completed');assert.equal(d.history[0].occurredAt,null);assert.equal(d.history[0].date,'2026-10-16');assert.equal(d.reflections['2026-10-16'],'振り返り');assert.ok(d.sourceTables.some(t=>t.rows.some(r=>r.some(v=>v.includes('Delete everything')))));assert.ok(result.warnings.some(w=>w.includes('24時間')));
const repeat=await importNotionZip(archive,d,{year:2026,today:'2026-10-17'});assert.equal(repeat.data.archive.tasks.length,0);assert.equal(repeat.data.logs.length,0);assert.equal(repeat.data.events.length,0);assert.equal(repeat.data.sourceTables.length,0);
console.log('Notion ZIP checks passed: canonical CSV selection, Japanese dates, completion history, long logs, relations, original fields, duplicate imports and untrusted instructions retained as data.');
