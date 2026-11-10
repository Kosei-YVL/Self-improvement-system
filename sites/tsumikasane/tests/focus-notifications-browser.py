"""Real browser permissions, service-worker notifications, and real-time deadlines.
No OS/device notification appearance or terminated-app wakeup is asserted.
"""
import datetime,json,os,re,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-flex';OUT.mkdir(exist_ok=True,parents=True);BASE='http://127.0.0.1:4578';today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat();errors=[];checks=[]
routine={'id':'r','title':'学習','minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a','title':'演習','minutes':25}]}
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[{'id':'p','taskId':None,'title':'学習 · 演習','taskTitle':'学習','activityTitle':'演習','category':'learning','date':today,'start':'09:00','end':'09:25','routineId':'r','activityId':'a','manual':True}],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[],'focusPlans':[{'id':'p','date':today,'routineId':'r','activityId':'a'}]},'config':{'routines':[routine],'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-notification-') as temporary:
 server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4578','FOCUS_DATA_DIR':temporary},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
   for mobile in [False,True]:
    c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},is_mobile=mobile,has_touch=mobile,permissions=['notifications'],accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE+'/focus.html',wait_until='domcontentloaded');q.evaluate('navigator.serviceWorker.ready.then(()=>true)')
    def settings(tab='data'):
     if not q.locator('#settings-dialog').evaluate('e=>e.open'):q.locator('#settings').click()
     q.locator('[data-settings-tab='+tab+']').click()
    def close():q.locator('#settings-dialog [data-close]').click()
    def restore(timer=None):
     value=json.loads(json.dumps(fixture));value['timer']=timer;settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(value).encode()});expect(q.locator('#notice')).to_have_text('復元しました');close()
    def timer(id,extra=None):
     now=q.evaluate('Date.now()');return {'id':id,'title':'学習 · 演習','mode':'timer','date':today,'start':'09:00','goal':60000,'elapsed':56500,'started':now,'running':True,'eventId':'p','routineId':'r','activityId':'a',**(extra or {})}
    def notifications():return q.evaluate("navigator.serviceWorker.ready.then(r=>r.getNotifications()).then(ns=>ns.map(n=>({title:n.title,tag:n.tag,silent:n.silent})))")
    def clear_notifications():q.evaluate("navigator.serviceWorker.ready.then(r=>r.getNotifications()).then(ns=>ns.forEach(n=>n.close()))")
    restore(timer('end-'+str(mobile)));q.locator('a[href="#tasks"]').click();expect(q.locator('#timer-alert')).to_be_visible(timeout=8000);expect(q.locator('#timer-alert strong')).to_have_text('タイマー終了');q.wait_for_function("navigator.serviceWorker.ready.then(r=>r.getNotifications()).then(ns=>ns.length===1)")
    ns=notifications();assert ns[0]['silent'] is True and ns[0]['tag']=='focus-timer-end-'+str(mobile)
    q.locator('#timer-alert [data-action=timer-alert-open]').click();expect(q.locator('#timer-output')).to_have_text(re.compile(r'00:01:\d{2}'));expect(q.locator('#timer-extra')).to_have_text(re.compile(r'\+00:00:\d{2}'));expect(q.locator('#session-state')).to_have_text('計測中')
    # Expiry keeps measuring, and Space can pause/resume without losing the total.
    q.evaluate('document.activeElement?.blur()');q.keyboard.press('Space');expect(q.locator('#session-state')).to_have_text('一時停止');q.keyboard.press('Space');expect(q.locator('#session-state')).to_have_text('計測中')
    settings()
    with q.expect_download() as dl:q.locator('[data-action=export]').click()
    value=json.loads(Path(dl.value.path()).read_text());assert value['timer']['id']=='end-'+str(mobile) and value['data']['logs']==[] and value['timer']['running'] is True;close()
    q.reload(wait_until='domcontentloaded');expect(q.locator('#timer-output')).to_have_text(re.compile(r'00:01:\d{2}'));q.wait_for_timeout(700);assert len(notifications())==1;expect(q.locator('#timer-alert')).not_to_be_visible()
    q.locator('[data-action=finish]').click();expect(q.locator('.active-session')).to_have_count(0);clear_notifications();checks.append({'mobile':mobile,'quietSWNotificationOnAnotherPage':True,'deadlineNoAutoLog':True,'reloadNoDuplicate':True})
    # Paused sessions have no deadline; resume schedules the remaining time.
    restore(timer('paused-'+str(mobile),{'running':False}));q.wait_for_timeout(4000);expect(q.locator('#timer-alert')).not_to_be_visible();assert notifications()==[]
    q.locator('[data-action=pause]').click();expect(q.locator('#timer-alert')).to_be_visible(timeout=7000);q.wait_for_function("navigator.serviceWorker.ready.then(r=>r.getNotifications()).then(ns=>ns.length===1)");clear_notifications();q.locator('[data-action=finish]').click();expect(q.locator('.active-session')).to_have_count(0);checks.append({'mobile':mobile,'pauseResumeDeadline':True})
    settings('help');q.locator('[data-action=notifications-disable]').click();expect(q.locator('#timer-notification-state')).to_have_text('端末通知オフ');close();restore();q.locator('[data-mode=timer]').click();q.locator('[data-action=begin]').click();settings('help');expect(q.locator('#timer-notification-state')).to_have_text('端末通知オフ');close();q.locator('[data-action=discard]').click()
    restore(timer('muted-'+str(mobile)));expect(q.locator('#timer-alert')).to_be_visible(timeout=7000);assert notifications()==[];checks.append({'mobile':mobile,'offStaysOffNextStartInAppStillWorks':True})
    c.close()
   # Denied permission needs no modal/error and still provides an in-app alert.
   c=b.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('dialog',lambda d:d.accept());q.goto(BASE+'/focus.html');restore(timer('denied'));expect(q.locator('#timer-alert')).to_be_visible(timeout=7000);assert notifications()==[];c.close();checks.append('permission_not_granted_in_app_fallback')
   assert not errors,errors;b.close()
 finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','checks':checks,'browser':'headless Chromium','notificationsAPIReal':True,'physicalOSDeliveryTested':False,'physicalSafariTested':False,'terminatedAppWakeupSupported':False,'pageErrors':errors};(OUT/'notifications.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
