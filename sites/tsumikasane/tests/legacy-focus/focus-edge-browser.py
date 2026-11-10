import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);c=b.new_context(accept_downloads=True);page=c.new_page();page.goto('http://127.0.0.1:4545',wait_until='networkidle');page.clock.install()
 page.locator('#content').fill('タイマー検証');page.locator('#record-duration').evaluate("e=>{e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));}");page.locator('[data-action=timer]').click();page.clock.fast_forward(61000)
 expect(page.locator('#timer-output')).to_have_text('00:00:00');expect(page.locator('[data-action=pause]')).to_have_text('再開');expect(page.locator('.logs .row')).to_have_count(0)
 page.locator('[data-action=finish]').click();expect(page.locator('.logs .row')).to_have_count(1);expect(page.locator('.timer')).to_have_count(0)
 page.locator('#capture-form button[type=submit]').click();expect(page.locator('.logs .row')).to_have_count(1);expect(page.locator('#capture-error')).to_contain_text('同じ記録')
 page.locator('#record-date').evaluate("e=>{e.value='2099-01-01';e.dispatchEvent(new Event('change',{bubbles:true}));}");page.locator('#capture-form button[type=submit]').click();expect(page.locator('#capture-error')).to_contain_text('今日以前')
 page.locator('[data-action=date-today]').click();page.locator('#settings').click()
 with page.expect_download() as d:page.locator('[data-action=export]').click()
 backup=json.loads(Path(d.value.path()).read_text());assert backup['data']['logs'][0]['elapsedSeconds']==60
 page.locator('#restore').set_input_files({'name':'focus.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
 expect(page.locator('#notice')).to_have_text('復元しました');page.locator('#settings-dialog [data-close]').click();expect(page.locator('.logs .row')).to_have_count(1)
 expect(page.locator('#save-status')).to_have_text('この端末に保存済み');b.close()
 print('Focus edge checks passed: timer expiry without automatic credit, one-action finish, duplicate prevention, future-date rejection, backup restore and actual measured seconds.')
