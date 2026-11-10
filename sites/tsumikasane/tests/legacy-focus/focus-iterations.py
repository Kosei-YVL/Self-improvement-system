"""Behavioral checks and reproducible UI observations; only synthetic personal data."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
round_no=int(sys.argv[1]);out=Path(f'qa/focus-iterations/round{round_no}');out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in [(1440,1050),(390,844),(375,667),(320,640)]:
  c=b.new_context(viewport={'width':width,'height':height},is_mobile=width<760,has_touch=width<760,accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto('http://127.0.0.1:4545/focus.html',wait_until='networkidle')
  q.locator('#settings').click()
  for title in ['読書','運動','英語']:
   q.locator('#routine-form [name=title]').fill(title);q.locator('#routine-form button').click()
  q.locator('#settings-dialog [data-close]').click()
  # Selection itself is a single pointer click (no native menu).
  q.locator('[data-action=select-routine]').first.click();assert q.locator('#content').input_value()=='読書'
  q.locator('#capture-form button[type=submit]').click();expect(q.locator('.logs .row')).to_have_count(1)
  q.locator('[data-action=log-edit]').click();q.locator('#content').fill('変更しない');q.locator('[data-action=cancel-edit]').click();assert q.locator('#content').input_value()=='読書';expect(q.locator('.logs .row strong')).to_have_text('読書')
  q.locator('[data-action=date-yesterday]').click();chosen=q.locator('#record-date').input_value();expect(q.locator('#save-status')).to_have_text('この端末に保存済み');q.reload(wait_until='networkidle');assert q.locator('#record-date').input_value()==chosen
  assert q.locator('.plan h2 small').inner_text()==q.locator('.logs h2 small').inner_text().split(' · ')[0]
  # The date column in the start wheel also synchronizes schedule and log date.
  q.locator('#record-start + .wheel-trigger').click();q.locator('[data-kind=date]').focus();q.locator('[data-kind=date]').press('ArrowUp');q.locator('.wheel-done').click();assert q.locator('#record-date').input_value()!=chosen;assert q.locator('.plan h2 small').inner_text()==q.locator('.logs h2 small').inner_text().split(' · ')[0]
  q.locator('[data-action=stopwatch]').click();q.evaluate('scrollTo(0,0)');box=q.locator('[data-action=finish]').bounding_box();bottom=round(box['y']+box['height'],1);assert bottom<=height,(width,bottom)
  q.locator('[data-action=finish]').click();expect(q.locator('.timer')).to_have_count(0)
  q.evaluate('scrollTo(0,0)');q.screenshot(path=str(out/f'{width}.png'),full_page=True)
  assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
  results.append({'viewport':[width,height],'routine_selection_clicks':1,'edit_cancel':'pass','backdate_reload':'pass','wheel_date_sync':'pass','timer_finish_bottom_y':bottom,'timer_finish_in_viewport':True,'horizontal_overflow':False,'page_errors':errors})
  c.close()
 b.close()
(out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
