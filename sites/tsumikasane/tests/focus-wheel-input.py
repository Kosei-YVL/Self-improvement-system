"""Verify direct wheel input, immediate mouse release and unchanged cancelled forms."""
import json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-performance';BASE='http://127.0.0.1:4577';errors=[];checks=[]
with tempfile.TemporaryDirectory() as temp:
 s=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4577','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html').close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   q=b.new_page(viewport={'width':390,'height':844},has_touch=True,timezone_id='Asia/Tokyo');q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE+'/focus.html');q.locator('.session-panel [data-action=backdate]').click();original=q.locator('#log-form [name=duration]').input_value();q.locator('#log-form [name=duration] + .wheel-trigger').click();wheel=q.locator('#wheel-picker [data-kind=minute]');prior=int(wheel.get_attribute('aria-valuenow'));box=wheel.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2;top=wheel.evaluate('e=>e.scrollTop')
   q.mouse.move(x,y);q.mouse.down();q.mouse.move(x,y-53,steps=6);q.evaluate('new Promise(requestAnimationFrame)');assert abs(wheel.evaluate('e=>e.scrollTop')-top-53)<=1
   q.mouse.up();released=wheel.evaluate('e=>e.scrollTop');assert abs(released/38-round(released/38))<.01;expect(wheel).to_have_attribute('aria-valuenow',str(prior+1));q.wait_for_timeout(350);assert wheel.evaluate('e=>e.scrollTop')==released;checks.append('mouse_follows_53px_release_snaps_immediately_no_late_animation')
   q.locator('#wheel-picker .wheel-cancel').click();assert q.locator('#log-form [name=duration]').input_value()==original;checks.append('cancel_preserves_original_duration')
   q.locator('#log-form [name=duration] + .wheel-trigger').click();wheel=q.locator('#wheel-picker [data-kind=minute]');wheel.focus();q.keyboard.press('Home');box=wheel.bounding_box();q.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);q.mouse.wheel(0,12);q.wait_for_timeout(20);assert 10<=wheel.evaluate('e=>e.scrollTop')<=14;q.mouse.wheel(0,70);q.wait_for_timeout(180);expect(wheel).to_have_attribute('aria-valuenow','2');checks.append('small_trackpad_delta_immediate_then_integer_snap')
   q.keyboard.press('End');expect(wheel).to_have_attribute('aria-valuenow','59');q.mouse.wheel(0,1000);q.wait_for_timeout(150);expect(wheel).to_have_attribute('aria-valuenow','59');q.keyboard.press('Home');q.locator('#wheel-picker [data-kind=hour]').focus();q.keyboard.press('Home');q.locator('.wheel-done').click();expect(q.locator('.wheel-error')).to_contain_text('1〜1440');expect(q.locator('#wheel-picker')).to_be_visible();wheel.focus();q.keyboard.press('ArrowDown');q.locator('.wheel-done').click();expect(q.locator('#log-form [name=duration]')).to_have_value('1');checks.append('keyboard_bounds_zero_duration_rejected_one_minute_saved')
   q.locator('#log-form [name=start] + .wheel-trigger').click();q.locator('#wheel-picker [data-kind=hour]').focus();q.keyboard.press('End');q.locator('#wheel-picker [data-kind=minute]').focus();q.keyboard.press('End');q.locator('.wheel-done').click();expect(q.locator('#log-form [name=start]')).to_have_value('23:59');checks.append('time_2359_selected_without_rollover')
   assert not errors; b.close()
 finally:s.terminate();s.wait(timeout=5)
r={'result':'pass','checks':checks,'pageErrors':errors};(OUT/'wheel-input.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
