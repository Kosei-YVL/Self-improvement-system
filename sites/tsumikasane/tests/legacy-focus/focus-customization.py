import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
n=int(sys.argv[1]);out=Path(f'qa/focus-iterations/round{n}');results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390,320]:
  c=b.new_context(viewport={'width':width,'height':844},accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.goto('http://127.0.0.1:4545/focus.html');q.locator('#settings').click()
  q.locator('[data-panel-visible=plan]').uncheck();q.locator('[data-panel-visible=logs]').uncheck();expect(q.locator('.plan')).to_have_count(0);expect(q.locator('.logs')).to_have_count(0)
  assert q.locator('[data-panel-visible=capture]').is_disabled()
  q.locator('[data-panel-wide=capture]').check();q.locator('#theme-mode').select_option('light');q.locator('#density-mode').select_option('compact');q.locator('#heat-days').select_option('56');q.locator('#log-limit').select_option('5')
  q.locator('#settings-dialog [data-close]').click();expect(q.locator('.capture')).to_have_class('panel capture wide-panel');expect(q.locator('.block')).to_have_count(56)
  expect(q.locator('#save-status')).to_have_text('この端末に保存済み');q.reload(wait_until='networkidle');assert q.locator('html').get_attribute('data-theme')=='light';assert q.locator('html').get_attribute('data-density')=='compact';expect(q.locator('.plan')).to_have_count(0)
  # Seed records through user-facing controls. No app internals are modified.
  q.locator('#content').fill('視認性');q.locator('#record-duration').evaluate("e=>{e.value='120';e.dispatchEvent(new Event('change',{bubbles:true}));}");q.locator('#capture-form button[type=submit]').click()
  q.locator('#settings').click();q.locator('#progress-mode').select_option('calendar');q.locator('#settings-dialog [data-close]').click()
  selected=q.locator('.calendar button[aria-pressed=true]');expect(selected).to_have_class('heat-high');colors=selected.evaluate('e=>({foreground:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})');assert colors['foreground']=='rgb(255, 255, 255)',colors
  def ratio(fg,bg):
   import re
   def lum(s):
    rgb=[float(v)/255 for v in re.findall(r'[\d.]+',s)[:3]];lin=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb];return sum(a*b for a,b in zip(lin,[.2126,.7152,.0722]))
   a,b=sorted([lum(fg),lum(bg)]);return (b+.05)/(a+.05)
  # Ask the browser to convert color(srgb ...) to RGB using canvas.
  colors=selected.evaluate("e=>{let c=document.createElement('canvas').getContext('2d');c.fillStyle=getComputedStyle(e).backgroundColor;c.fillRect(0,0,1,1);return {foreground:getComputedStyle(e).color,background:'rgb('+[...c.getImageData(0,0,1,1).data].slice(0,3).join(',')+')'}}")
  contrast=ratio(**{'fg':colors['foreground'],'bg':colors['background']});assert contrast>=4.5,(colors,contrast)
  assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path=str(out/f'custom-{width}.png'),full_page=True)
  q.locator('#settings').click();q.locator('#theme-mode').select_option('dark');q.locator('#progress-mode').select_option('blocks');q.locator('[data-panel-visible=plan]').check();q.locator('[data-panel-visible=logs]').check();q.locator('#settings-dialog [data-close]').click()
  # A long daily list is paged; nothing is removed.
  for i in range(7):
   q.locator('#content').fill('記録'+str(i));q.locator('#capture-form button[type=submit]').click()
  expect(q.locator('.logs .row')).to_have_count(5);q.locator('[data-action=more-logs]').click();expect(q.locator('.logs .row')).to_have_count(8)
  q.locator('#settings').click()
  with q.expect_download() as d:q.locator('[data-action=export]').click()
  backup=json.loads(Path(d.value.path()).read_text());assert backup['config']['wide']==['capture'];assert backup['config']['logLimit']==5;assert len(backup['data']['logs'])==8
  results.append({'width':width,'hide_restore':'pass','capture_cannot_hide':True,'width_density_persist':'pass','theme_persist':'pass','light_heat_contrast':round(contrast,2),'pagination':'pass','export_config':'pass'})
  c.close()
 b.close()
(out/'customization.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
