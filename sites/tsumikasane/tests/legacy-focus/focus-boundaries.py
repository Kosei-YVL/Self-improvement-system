"""Input boundaries, interrupted edits and restore invariants. All fixtures synthetic."""
import copy,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
out=Path('qa/focus-iterations/round3');checks=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);c=b.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();errors=[];q.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',str(e),flush=True)));q.goto('http://127.0.0.1:4545/focus.html',wait_until='networkidle')
 def field(selector,value):q.locator(selector).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("change",{bubbles:true}));}',str(value))
 def export():
  if not q.locator('#settings-dialog').evaluate('e=>e.open'):q.locator('#settings').click()
  with q.expect_download() as d:q.locator('[data-action=export]').click()
  return json.loads(Path(d.value.path()).read_text())
 def close_settings():q.locator('#settings-dialog [data-close]').click()
 def restore(data):q.locator('#restore').set_input_files({'name':'test.json','mimeType':'application/json','buffer':json.dumps(data,ensure_ascii=False).encode()})
 q.locator('#settings').click();q.locator('#routine-form [name=title]').fill('検証');q.locator('#routine-form button').click();close_settings();q.locator('[data-action=select-routine]').click();q.locator('#capture-form button[type=submit]').click()
 # Interrupted edits resume as edits, never a new copy.
 q.locator('[data-action=log-edit]').click();q.locator('#content').fill('再読み込みして更新');expect(q.locator('#save-status')).to_have_text('この端末に保存済み');q.reload(wait_until='networkidle');expect(q.locator('#capture-form button[type=submit]')).to_have_text('記録を更新');q.locator('#capture-form button[type=submit]').click();expect(q.locator('.logs .row')).to_have_count(1)
 checks.append('editing_reload_updates_existing_id')
 q.locator('#content').fill('境界値')
 for value in ['0','-1','1.5','1441','']:
  field('#record-duration',value);q.locator('#capture-form button[type=submit]').click();expect(q.locator('#capture-error')).to_contain_text('整数');expect(q.locator('.logs .row')).to_have_count(1)
 field('#record-duration',1440);field('#record-start','00:00');q.locator('#capture-form button[type=submit]').click();expect(q.locator('.logs .row')).to_have_count(2)
 field('#record-date','2025-02-29');q.locator('#capture-form button[type=submit]').click();expect(q.locator('#capture-error')).to_contain_text('日付');q.locator('[data-action=date-today]').click()
 checks.append('record_zero_negative_fraction_blank_max_and_nonexistent_date')
 q.locator('[data-action=plan-add]').click()
 for value in ['0','-1','1.5','1441','']:
  field('#plan-duration',value);q.locator('#plan-form .primary-button').click();expect(q.locator('#plan-error')).to_contain_text('整数');expect(q.locator('.plan .row')).to_have_count(0)
 field('#plan-duration',1);field('#plan-start','24:00');q.locator('#plan-form .primary-button').click();expect(q.locator('#plan-error')).to_contain_text('開始')
 field('#plan-start','23:59');q.locator('#plan-form .primary-button').click();expect(q.locator('#plan-error')).to_contain_text('23:59')
 field('#plan-start','23:58');q.locator('#plan-form .primary-button').click();expect(q.locator('.plan .row')).to_have_count(1)
 q.locator('[data-action=plan-add]').click();field('#plan-start','23:58');field('#plan-duration',1);q.locator('#plan-form .primary-button').click();expect(q.locator('#plan-error')).to_contain_text('重なって');q.locator('#edit-dialog [data-close]').click()
 checks.append('plan_validation_no_invalid_mutation_overlap_and_2359_boundary')
 # Real mouse dragging of a wheel, plus the 24:59 invalid duration boundary.
 q.locator('#record-duration + .wheel-trigger').click();h=q.locator('[data-kind=hour]');m=q.locator('[data-kind=minute]');h.focus();h.press('Home');m.focus();m.press('Home');m.press('PageDown');box=m.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2;q.mouse.move(x,y);q.mouse.down();q.mouse.move(x,y-38,steps=8);q.mouse.up();q.locator('.wheel-done').click();assert q.locator('#record-duration').input_value()=='6'
 q.locator('#record-duration + .wheel-trigger').click();q.locator('[data-kind=hour]').focus();q.locator('[data-kind=hour]').press('End');q.locator('[data-kind=minute]').focus();q.locator('[data-kind=minute]').press('End');q.locator('.wheel-done').click();expect(q.locator('.wheel-error')).to_contain_text('1440');q.locator('.wheel-cancel').click()
 checks.append('actual_mouse_wheel_drag_and_2459_rejection')
 baseline=export()
 bads=[]
 def bad(change):
  v=copy.deepcopy(baseline);change(v);bads.append(v)
 bad(lambda v:v['config'].update(hidden=['capture']))
 bad(lambda v:v['config'].update(wide=['unknown']))
 bad(lambda v:v['config'].update(logLimit=-1))
 bad(lambda v:v['config'].update(heatDays=100000))
 bad(lambda v:v['config'].update(theme='bogus'))
 bad(lambda v:v['config']['routines'].append(copy.deepcopy(v['config']['routines'][0])))
 bad(lambda v:v['config']['routines'][0].update(minutes=1.5))
 bad(lambda v:v['data']['logs'][0].update(start='99:00'))
 bad(lambda v:v['data']['logs'][0].update(elapsedSeconds=-1))
 bad(lambda v:v.update(timer={'mode':'timer','title':'x','date':'bad','start':'12:00','elapsed':0,'started':1,'goal':60000,'running':True}))
 bad(lambda v:v['draft'].update(minutes=-1))
 bad(lambda v:v.update(timer={'mode':'stopwatch','title':'x','date':baseline['draft']['date'],'start':'12:00','elapsed':0,'started':9007199254740991,'goal':60000,'running':True}))
 for i,candidate in enumerate(bads):
  print('Invalid backup case',i,flush=True)
  q.locator('#settings-error').evaluate("e=>e.textContent=''");restore(candidate);expect(q.locator('#settings-error')).not_to_be_empty();stored=q.evaluate("""()=>new Promise((resolve,reject)=>{const r=indexedDB.open('tsumikasane-device-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('entries'),get=tx.objectStore('entries').get('tsumikasane-data-v1-personal');get.onsuccess=()=>{resolve(JSON.parse(get.result.value));db.close();};get.onerror=()=>reject(get.error);};})""");assert stored==baseline['data']
 checks.append('12_invalid_backups_leave_existing_data_intact')
 # Historical records without start time and long durations survive editing and export.
 fixture=copy.deepcopy(baseline);long=copy.deepcopy(fixture['data']['logs'][0]);long.update(id='legacy-long',title='元の長時間記録',minutes=8031);long.pop('start',None);fixture['data']['logs'].append(long)
 old=copy.deepcopy(fixture['data']['events'][0]);old.update(id='legacy-event',title='元の予定',start='09:00',end='09:30',note='保持するメモ',source={'preserved':True});fixture['data']['events'].append(old)
 restore(fixture);expect(q.locator('#notice')).to_have_text('復元しました');close_settings();q.locator('.logs .row').filter(has_text='元の長時間記録').locator('button').click();assert q.locator('#record-start').input_value()=='';q.locator('#content').fill('元の長時間記録を追記');q.locator('#capture-form button[type=submit]').click()
 q.locator('.plan .row').filter(has_text='元の予定').locator('[data-action=plan-edit]').click();field('#plan-duration',40);q.locator('#plan-form .primary-button').click()
 saved=export();restored=next(l for l in saved['data']['logs'] if l['id']=='legacy-long');assert restored['minutes']==8031 and 'start' not in restored;event=next(e for e in saved['data']['events'] if e['id']=='legacy-event');assert event['title']=='元の予定' and event['note']=='保持するメモ' and event['source']=={'preserved':True}
 checks.append('legacy_long_unknown_time_and_event_metadata_preserved')
 close_settings();q.locator('#content').fill('同じ分の別計測');field('#record-duration',1);q.clock.install()
 q.locator('[data-action=timer]').click();q.clock.fast_forward(61000);q.locator('[data-action=finish]').click()
 q.locator('[data-action=stopwatch]').click();q.clock.fast_forward(1000);q.locator('[data-action=finish]').click();q.locator('[data-action=stopwatch]').click();q.clock.fast_forward(1000);q.locator('[data-action=finish]').click();saved=export();sessions=[l for l in saved['data']['logs'] if l['title']=='同じ分の別計測'];assert len(sessions)==3 and len({l['timerId'] for l in sessions})==3;assert sessions[0]['elapsedSeconds']==60 and sessions[1]['elapsedSeconds']==1 and sessions[2]['elapsedSeconds']==1;assert sessions[1]['start']==sessions[2]['start']
 checks.append('different_sessions_same_minute_preserved_timer_capped_at_goal')
 # Configuration in a stale second tab must not overwrite a newer layout.
 close_settings();q2=c.new_page();q2.goto('http://127.0.0.1:4545/focus.html',wait_until='networkidle');q.locator('#settings').click();q.locator('#theme-mode').select_option('light');expect(q.locator('#save-status')).to_have_text('この端末に保存済み');q2.locator('#settings').click();q2.locator('#theme-mode').select_option('light');expect(q2.locator('#save-status')).to_contain_text('別の画面');q2.close();q.reload(wait_until='networkidle');assert q.locator('html').get_attribute('data-theme')=='light'
 checks.append('stale_tab_configuration_conflict_detected')
 # An IndexedDB write failure must not replace the previously committed value.
 storage=q.evaluate("""async()=>{const {openDeviceStore}=await import('/device-store.mjs');const s=await openDeviceStore(),key='tsumikasane-data-focus-quota-test';s.write(key,'prior');await s.flush();const put=IDBObjectStore.prototype.put;let ok;IDBObjectStore.prototype.put=function(row,...args){if(row.key===key)throw new DOMException('full','QuotaExceededError');return put.call(this,row,...args);};try{s.write(key,'unsaved');ok=await s.flush();}finally{IDBObjectStore.prototype.put=put;}const fresh=await openDeviceStore();const result={ok,pending:s.pending,current:fresh.read(key),unsaved:s.read(key),status:s.status};s.db.close();fresh.db.close();return result;}""")
 assert not storage['ok'] and storage['pending'] and storage['current']=='prior' and storage['unsaved']=='unsaved' and '保存できません' in storage['status']
 checks.append('quota_failure_preserves_committed_and_unsaved_values')
 assert not errors,errors;expect(q.locator('#save-status')).to_have_text('この端末に保存済み');c.close();b.close()
(out/'boundaries.json').write_text(json.dumps({'checks':checks,'result':'pass','page_errors':errors},ensure_ascii=False,indent=2));print(json.dumps(checks,ensure_ascii=False))
