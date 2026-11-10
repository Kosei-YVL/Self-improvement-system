"""Real Document Picture-in-Picture API; window contents and durable records.
Headless execution does not verify physical OS always-on-top appearance.
"""
import datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-direct';OUT.mkdir(exist_ok=True,parents=True);BASE='http://127.0.0.1:4582';today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat();checks=[];errors=[]
r={'id':'r','title':'学習','minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a','title':'演習','minutes':25}]}
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[{'id':'p','title':'学習 · 演習','taskTitle':'学習','activityTitle':'演習','taskId':None,'category':'learning','date':today,'start':'09:00','end':'09:25','routineId':'r','activityId':'a','manual':True}],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]},'config':{'routines':[r],'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-timer-window-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4582','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);c=b.new_context(viewport={'width':1440,'height':1000},accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE+'/focus.html');assert q.evaluate('!!window.documentPictureInPicture?.requestWindow')
   def settings(tab='data'):
    q.locator('#settings').click();q.locator('[data-settings-tab='+tab+']').click()
   def export():
    settings()
    with q.expect_download() as dl:q.locator('[data-action=export]').click()
    v=json.loads(Path(dl.value.path()).read_text());q.locator('#settings-dialog [data-close]').click();return v
   def pip(script):return q.evaluate('()=>{const w=documentPictureInPicture.window;'+script+'}')
   settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click()
   q.locator('[data-action=begin]').click();q.locator('[data-action=timer-popout]').click();q.wait_for_function('()=>!!documentPictureInPicture.window?.document.querySelector("#pip-time")');assert pip('return w.document.title')=='Focus';assert pip('return w.document.querySelector("#pip-task").textContent')=='学習 · 演習';q.wait_for_timeout(1200);assert pip('return w.document.querySelector("#pip-time").textContent')!='00:00:00'
   pip('w.document.querySelector("#pip-pause").click()');expect(q.locator('#session-state')).to_have_text('一時停止');before=pip('return w.document.querySelector("#pip-time").textContent');q.wait_for_timeout(1100);assert pip('return w.document.querySelector("#pip-time").textContent')==before
   pip('w.document.querySelector("#pip-pause").click()');expect(q.locator('#session-state')).to_have_text('計測中');q.locator('a[href="#review"]').click();q.wait_for_timeout(1100);assert pip('return w.document.querySelector("#pip-time").textContent')!=before;checks.append('real_native_pip_elapsed_pause_resume_and_other_main_route')
   # Theme changes update the separate window even outside the dashboard.
   settings('display');q.locator('#theme-mode').select_option('light');q.locator('#settings-dialog [data-close]').click();q.wait_for_timeout(300);assert pip('return w.document.documentElement.style.getPropertyValue("--paper")').strip()=='#fafbf8';checks.append('theme_updates_outside_dashboard_without_timer_panel')
   pip('w.close()');q.wait_for_function('()=>!documentPictureInPicture.window');assert export()['timer']['running'] is True;checks.append('closing_pip_keeps_session_running')
   q.locator('a[href="#dashboard"]').click();q.locator('[data-action=timer-popout]').click();q.wait_for_function('()=>!!documentPictureInPicture.window?.document.querySelector("#pip-finish")');pip('const e=w.document.querySelector("#pip-finish");e.click();e.click();e.click()');q.wait_for_function('()=>!documentPictureInPicture.window');asset=export();assert asset['timer'] is None and len(asset['data']['logs'])==1 and asset['data']['logs'][0]['eventId']=='p';checks.append('pip_finish_persists_one_record_triple_click_and_closes_after_save')
   q.locator('[data-action=begin]').click();q.locator('[data-action=timer-popout]').click();q.wait_for_function('()=>!!documentPictureInPicture.window?.document.querySelector("#pip-time")');q.locator('[data-action=discard]').click();q.wait_for_function('()=>!documentPictureInPicture.window');assert len(export()['data']['logs'])==1;checks.append('main_cancel_closes_pip_without_extra_record')
   q.locator('[data-action=begin]').click();q.locator('[data-action=timer-popout]').click();q.wait_for_function('()=>!!documentPictureInPicture.window?.document.querySelector("#pip-finish")');expect(q.locator('[data-action=finish]')).to_be_enabled();expect(q.locator('#save-status')).to_have_text('この端末に保存済み')
   q.evaluate("()=>{const original=IDBDatabase.prototype.transaction;window.abortFocusWrites=true;IDBDatabase.prototype.transaction=function(...a){const tx=original.apply(this,a);if(a[1]==='readwrite'&&window.abortFocusWrites)queueMicrotask(()=>{try{tx.abort()}catch{}});return tx}}");pip('w.document.querySelector("#pip-finish").click()');q.wait_for_function('()=>documentPictureInPicture.window?.document.querySelector("#pip-state").textContent==="保存を確認"');assert pip('return w.document.querySelector("#pip-error").textContent') and len(export()['data']['logs'])==2
   q.evaluate('window.abortFocusWrites=false');pip('w.document.querySelector("#pip-finish").click()');q.wait_for_function('()=>!documentPictureInPicture.window');q.reload(wait_until='domcontentloaded');assert len(export()['data']['logs'])==2;checks.append('aborted_IDB_keeps_pip_error_and_exportable_record_retry_saves_once')
   c.close();c=b.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('dialog',lambda d:d.accept());q.on('pageerror',lambda e:errors.append(str(e)));q.add_init_script("Object.defineProperty(window,'documentPictureInPicture',{value:undefined})");q.goto(BASE+'/focus.html');settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});q.locator('#settings-dialog [data-close]').click();q.locator('[data-action=begin]').click();expect(q.locator('.active-session')).to_be_visible();expect(q.locator('[data-action=timer-popout]')).to_have_count(0);expect(q.locator('[data-action=finish]')).to_be_enabled();q.locator('[data-action=finish]').click();expect(q.locator('.active-session')).to_have_count(0);assert len(export()['data']['logs'])==1;checks.append('missing_document_pip_API_hides_button_main_timer_still_records')
   assert not errors,errors;c.close();b.close()
 finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','realDocumentPictureInPictureAPI':True,'physicalAlwaysOnTopAppearanceTested':False,'physicalSafariTested':False,'checks':checks,'pageErrors':errors};(OUT/'timer-window.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
