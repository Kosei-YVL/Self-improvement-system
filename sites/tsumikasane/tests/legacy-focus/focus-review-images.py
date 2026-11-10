from pathlib import Path
from playwright.sync_api import sync_playwright,expect
out=Path('qa/focus-iterations/round3')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo');q=c.new_page();q.goto('http://127.0.0.1:4545/focus.html',wait_until='networkidle');q.locator('#settings').click()
 for title in ['読書','運動','英語']:
  q.locator('#routine-form [name=title]').fill(title);q.locator('#routine-form button').click()
 q.locator('#settings-dialog [data-close]').click();q.locator('[data-action=select-routine]').first.click();q.locator('[data-action=stopwatch]').click();q.screenshot(path=str(out/'timer-mobile.png'),full_page=True)
 q.locator('#settings').click();q.locator('#order-list').scroll_into_view_if_needed();q.locator('#settings-dialog').screenshot(path=str(out/'settings-mobile.png'));expect(q.locator('[data-panel-visible=capture]')).to_be_disabled();b.close()
print('Comparison images created with synthetic routines.')
