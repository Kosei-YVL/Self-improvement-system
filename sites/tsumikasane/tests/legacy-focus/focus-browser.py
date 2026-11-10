import json,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4545';out=Path('qa/focus');out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for mobile in [False,True]:
  for template in ['focus','plan','log','progress']:
   context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1050},is_mobile=mobile,has_touch=mobile,accept_downloads=True,timezone_id='Asia/Tokyo')
   page=context.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append((r.method,r.url)));page.goto(BASE,wait_until='networkidle')
   expect(page.locator('.brand')).to_have_text('Focus');assert 'A LITTLE' not in page.locator('body').inner_text()
   page.locator('#settings').click();page.locator('#routine-form [name=title]').fill('読書');page.locator('#routine-form button').click()
   page.locator(f'[data-template={template}]').click();page.locator('#settings-dialog [data-close]').click()
   page.locator('[data-action=select-routine]').first.click()
   # One explicit submit after selecting a predefined routine.
   page.locator('#capture-form button[type=submit]').click();expect(page.locator('.logs .row')).to_have_count(1)
   # Backdating is a single click; content/start/duration remain editable.
   page.locator('[data-action=date-yesterday]').click();page.locator('#capture-form button[type=submit]').click();expect(page.locator('.logs .row')).to_have_count(1)
   expect(page.locator('.logs h2')).not_to_contain_text('今日')
   # Correction must replace a record, not duplicate it.
   page.locator('[data-action=log-edit]').click();page.locator('#content').fill('読書の追記');page.locator('#capture-form button[type=submit]').click();expect(page.locator('.logs .row')).to_have_count(1)
   # Date / start / duration use drag-scroll wheels.
   page.locator('#record-start + .wheel-trigger').click();expect(page.locator('#wheel-picker .wheel-scroll')).to_have_count(3);page.locator('.wheel-done').click()
   page.locator('#record-duration + .wheel-trigger').click();minute=page.locator('[data-kind=minute]');minute.focus();minute.press('Home');minute.press('PageDown');page.locator('.wheel-done').click();assert page.locator('#record-duration').input_value()=='5'
   # Place a routine, then use the schedule shortcut to prepare a record.
   page.locator('[data-action=plan-add]').click();page.locator('#plan-form button[type=submit], #plan-form button.primary-button').click();expect(page.locator('.plan .row')).to_have_count(1)
   page.locator('[data-action=plan-log]').click();assert page.locator('#content').input_value()=='読書'
   # Stopwatch survives a page reload, can be paused, and returns a record draft.
   page.locator('[data-action=stopwatch]').click();expect(page.locator('#timer-output')).to_be_visible();expect(page.locator('#save-status')).to_have_text('この端末に保存済み');page.reload(wait_until='networkidle');expect(page.locator('#timer-output')).to_be_visible();page.locator('[data-action=pause]').click();expect(page.locator('[data-action=pause]')).to_have_text('再開');page.locator('[data-action=finish]').click();expect(page.locator('.timer')).to_have_count(0)
   page.locator('[data-action=timer]').click();expect(page.locator('.timer-label')).to_contain_text('タイマー');page.locator('[data-action=discard-timer]').click()
   page.locator('#settings').click()
   for mode in ['calendar','numbers','level','blocks']:page.locator('#progress-mode').select_option(mode)
   if not mobile:
    handles=page.locator('.drag-handle');first=handles.first.get_attribute('data-key');handles.first.drag_to(page.locator('.order-row').last);assert page.locator('.order-row').first.get_attribute('data-key')!=first
   else:
    page.locator('#order-list').scroll_into_view_if_needed();first=page.locator('.drag-handle').first.get_attribute('data-key');start=page.locator('.drag-handle').first.bounding_box();end=page.locator('.order-row').last.bounding_box();cdp=context.new_cdp_session(page);x=start['x']+start['width']/2;y=start['y']+start['height']/2;target=end['y']+end['height']/2
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for i in range(1,8):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y+(target-y)*i/7}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});assert page.locator('.order-row').first.get_attribute('data-key')!=first
   # Keyboard alternative works alongside drag rearrangement.
   original=page.locator('.order-row').first.get_attribute('data-key');page.locator('[data-move="0"][data-direction="1"]').click();assert page.locator('.order-row').nth(1).get_attribute('data-key')==original
   with page.expect_download() as d:page.locator('[data-action=export]').click()
   backup=json.loads(Path(d.value.path()).read_text());assert backup['config']['routines'];assert len(backup['data']['logs'])==3
   page.locator('#settings-dialog [data-close]').click();expect(page.locator('#save-status')).to_have_text('この端末に保存済み')
   page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('!!navigator.serviceWorker.controller');context.set_offline(True);page.reload(wait_until='domcontentloaded');expect(page.locator('.brand')).to_have_text('Focus');page.locator('#content').fill('オフライン記録');page.locator('#capture-form button[type=submit]').click();expect(page.locator('#save-status')).to_have_text('この端末に保存済み')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   context.set_offline(False)
   # Restore the selected template for comparison images.
   page.locator('#settings').click();page.locator(f'[data-template={template}]').click();page.locator('#settings-dialog [data-close]').click();page.screenshot(path=str(out/f'{template}-{"mobile" if mobile else "desktop"}.png'),full_page=True)
   assert all(m=='GET' and urlparse(u).netloc=='127.0.0.1:4545' for m,u in requests),requests
   assert not errors,errors
   results.append({'template':template,'mobile':mobile,'routine_record':'pass','backdate_edit':'pass','schedule':'pass','wheel':'pass','stopwatch_reload':'pass','timer':'pass','layout':'pass','export':'pass','offline':'pass','external_requests':0});context.close()
 browser.close()
Path('qa/focus/results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print('Focus browser checks passed: 4 templates × desktop/mobile; routine, backdate, correction, scheduling, wheels, stopwatch, timer, layout, export and offline persistence.')
