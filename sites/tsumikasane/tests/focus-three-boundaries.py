import os,json,tempfile,subprocess,time,urllib.request,datetime
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parent.parent;out=root/'qa/focus-three-screen';checks=[]
with tempfile.TemporaryDirectory(prefix='focus-boundaries-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=root/'focus-sync',env={**os.environ,'FOCUS_DATA_DIR':temp,'SYNC_AUTH_HASH':'0'*64},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen('http://127.0.0.1:4545/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.05)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);c=b.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.clock.install(time=datetime.datetime(2026,10,26,0,0,tzinfo=datetime.timezone.utc));q.clock.pause_at(datetime.datetime(2026,10,26,0,0,10,tzinfo=datetime.timezone.utc));q.goto('http://127.0.0.1:4545/focus.html',wait_until='domcontentloaded');errors=[];q.on('dialog',lambda d:d.accept());q.on('pageerror',lambda e:errors.append(str(e)))
   def field(selector,value):q.locator(selector).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("change",{bubbles:true}));}',str(value))
   q.locator('a[href="#tasks"]').click();q.locator('[data-action=task-new]').first.click();q.locator('#task-form [name=title]').fill('検証');field('#task-form [name=minutes]',0);q.locator('#task-form .primary-button').click();expect(q.locator('#task-form .form-error')).not_to_be_empty();field('#task-form [name=minutes]',25);field('#task-form [name=preferredEnd]','08:00');q.locator('#task-form .primary-button').click();expect(q.locator('#task-form .form-error')).not_to_be_empty();field('#task-form [name=preferredEnd]','18:00');q.locator('#task-form .primary-button').click();q.locator('#edit-dialog [data-close]').click();checks.append('invalid_task_minutes_and_reversed_window_rejected')
   q.locator('a[href="#dashboard"]').click();q.locator('[data-action=backdate]').click();q.locator('#log-form [name=title]').fill('直接入力');q.wait_for_function("() => document.querySelector('#save-status').textContent==='この端末に保存済み'");q.reload(wait_until='domcontentloaded');q.locator('[data-action=backdate]').click();expect(q.locator('#log-form [name=title]')).to_have_value('直接入力')
   for value in ['0','-1','1.5','1441','']:
    field('#log-form [name=duration]',value);q.locator('#log-form .primary-button').click();expect(q.locator('#log-form .form-error')).not_to_be_empty();expect(q.locator('[data-card=logs] .row')).to_have_count(0)
   field('#log-form [name=duration]',10);field('#log-form [name=date]','2099-01-01');q.locator('#log-form .primary-button').click();expect(q.locator('#log-form .form-error')).not_to_be_empty();q.locator('[data-action=log-today]').click();q.locator('#log-form .primary-button').click();expect(q.locator('[data-card=logs] .row')).to_have_count(1);checks.append('zero_negative_fraction_blank_over_max_future_date_rejected')
   q.locator('[data-card=logs] [data-action=log-edit]').click();q.locator('#log-form [name=title]').fill('更新途中');q.wait_for_function("() => document.querySelector('#save-status').textContent==='この端末に保存済み'");q.reload(wait_until='domcontentloaded');q.locator('[data-action=backdate]').click();expect(q.locator('#log-form [name=title]')).to_have_value('更新途中');q.locator('#log-form .primary-button').click();expect(q.locator('[data-card=logs] .row')).to_have_count(1);checks.append('manual_draft_and_edit_identity_survive_reload')
   # A historical record without a task mapping/start must not be assigned to an arbitrary task.
   q.locator('#settings').click();q.locator('[data-settings-tab=data]').click()
   with q.expect_download() as d:q.locator('[data-action=export]').click()
   backup=json.loads(Path(d.value.path()).read_text());old=backup['data']['logs'][0].copy();old.update(id='legacy',title='古い記録',minutes=8031);old.pop('start',None);old.pop('routineId',None);old.pop('activityId',None);backup['data']['logs'].append(old)
   q.locator('#restore').set_input_files({'name':'old.json','mimeType':'application/json','buffer':json.dumps(backup).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click();q.locator('[data-card=logs] .row').filter(has_text='古い記録').locator('[data-action=log-edit]').click();assert q.locator('#log-form [name=start]').input_value()=='';assert q.locator('#log-routine').input_value()=='';q.locator('#log-form .primary-button').click();q.locator('#settings').click();q.locator('[data-settings-tab=data]').click()
   with q.expect_download() as d:q.locator('[data-action=export]').click()
   result=json.loads(Path(d.value.path()).read_text());legacy=next(l for l in result['data']['logs'] if l['id']=='legacy');assert legacy['minutes']==8031 and 'start' not in legacy and 'routineId' not in legacy;checks.append('legacy_long_record_unknown_start_and_unmapped_task_preserved')
   q.locator('#settings-dialog [data-close]').click();q.locator('a[href="#review"]').click();expect(q.locator('.review-calendar')).to_have_count(1)
   # Actual dark calendar intensity must retain readable text.
   sample=q.locator('.review-calendar button').filter(has=q.locator('small')).last
   colors=sample.evaluate("e=>{e.style.setProperty('--level',2);e.classList.remove('heat-high');let c=document.createElement('canvas').getContext('2d');c.fillStyle=getComputedStyle(e).backgroundColor;c.fillRect(0,0,1,1);return {fg:getComputedStyle(e).color,bg:[...c.getImageData(0,0,1,1).data].slice(0,3)}}")
   assert colors['fg']=='rgb(255, 255, 255)';checks.append('mid_intensity_dark_calendar_white_text')
   # A future database format stays untouched and can be exported raw without sync keys.
   future=c.new_page();future.goto('http://127.0.0.1:4545/focus.html',wait_until='domcontentloaded');future.evaluate("""async()=>{const {openDeviceStore}=await import('/device-store.mjs');const s=await openDeviceStore();const raw=JSON.parse(s.read('tsumikasane-data-v1-personal'));raw.version=99;raw.futureField={preserve:true};s.write('tsumikasane-data-v1-personal',JSON.stringify(raw));s.write('focus-sync-key','never-export');await s.flush();s.db.close();}""");future.reload(wait_until='domcontentloaded');expect(future.locator('h2')).to_have_text('データを開けません')
   with future.expect_download() as d:future.get_by_role('button',name='元データを書き出す').click()
   raw=json.loads(Path(d.value.path()).read_text());saved=json.loads(raw['entries']['tsumikasane-data-v1-personal']);assert saved['version']==99 and saved['futureField']=={'preserve':True};assert 'focus-sync-key' not in raw['entries'];checks.append('unknown_future_schema_safe_stop_raw_export_without_credentials')
   assert not errors,errors;b.close()
 finally:server.terminate();server.wait(timeout=5)
(out/'boundaries.json').write_text(json.dumps({'result':'pass','checks':checks,'page_errors':errors},ensure_ascii=False,indent=2));print(json.dumps(checks,ensure_ascii=False))
