"""Synthetic clocks exercise real UI, storage, downloads and native Document PiP."""
import datetime,json,os,re,subprocess,tempfile,time,urllib.request,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-overtime';OUT.mkdir(parents=True,exist_ok=True);BASE='http://127.0.0.1:4584';errors=[];checks=[]
routine={'id':'r','title':'音楽制作','minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a','title':'練習','minutes':25}]}
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[{'id':'p','taskId':None,'title':'音楽制作 · 練習','taskTitle':'音楽制作','activityTitle':'練習','category':'learning','date':'2026-11-01','start':'11:36','end':'12:01','routineId':'r','activityId':'a','manual':True}],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[],'focusPlans':[{'id':'p','date':'2026-11-01','routineId':'r','activityId':'a'}]},'config':{'routines':[routine],'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark','completionMotion':'none'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-overtime-') as temporary:
 server=subprocess.Popen(['node','server.mjs'],cwd=Path(os.environ.get('FOCUS_OVERTIME_APP_DIR',ROOT/'focus-sync')),env={**os.environ,'PORT':'4584','FOCUS_DATA_DIR':temporary},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
   for mobile in [False,True]:
    for program in ['timer','pomodoro']:
     c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.clock.install(time=datetime.datetime(2026,11,1,3,0,tzinfo=datetime.timezone.utc));q.clock.pause_at(datetime.datetime(2026,11,1,3,0,5,tzinfo=datetime.timezone.utc));q.goto(BASE+'/focus.html',wait_until='domcontentloaded')
     def settings():
      if not q.locator('#settings-dialog').evaluate('e=>e.open'):q.locator('#settings').click()
      q.locator('[data-settings-tab=data]').click()
     def close():q.locator('#settings-dialog [data-close]').click()
     def export():
      settings()
      with q.expect_download() as dl:q.locator('[data-action=export]').click()
      value=json.loads(Path(dl.value.path()).read_text());close();return value
     value=json.loads(json.dumps(fixture));now=q.evaluate('Date.now()');start=now-24*60000;value['timer']={'id':program+'-'+str(mobile),'title':'音楽制作 · 練習','taskTitle':'音楽制作','activityTitle':'練習','mode':'timer','date':'2026-11-01','start':'11:36','goal':25*60000,'elapsed':0,'started':start,'startedAt':datetime.datetime.fromtimestamp(start/1000,datetime.timezone.utc).isoformat().replace('+00:00','Z'),'running':True,'eventId':'p','routineId':'r','activityId':'a',**({'program':'pomodoro'} if program=='pomodoro' else {})}
     settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(value).encode()});expect(q.locator('#notice')).to_have_text('復元しました');close();expect(q.locator('#timer-output')).to_have_text('00:01:00');expect(q.locator('#timer-extra')).to_be_hidden()
     if not mobile:
      q.locator('[data-action=timer-popout]').click();q.wait_for_function('()=>!!documentPictureInPicture.window?.document.querySelector("#pip-extra")')
     q.clock.fast_forward(60000);expect(q.locator('#timer-alert')).to_be_visible();expect(q.locator('#timer-output')).to_have_text('00:25:00');expect(q.locator('#timer-extra')).to_have_text('+00:00:00');q.locator('[data-action=timer-alert-close]').click();assert export()['data']['logs']==[]
     q.clock.fast_forward(3*60000+12000);expect(q.locator('#timer-output')).to_have_text('00:28:12');expect(q.locator('#timer-extra')).to_have_text('+00:03:12')
     if not mobile:
      assert q.evaluate('documentPictureInPicture.window.document.querySelector("#pip-time").textContent')=='00:28:12'
      assert q.evaluate('documentPictureInPicture.window.document.querySelector("#pip-extra").textContent')=='+00:03:12'
      q.evaluate('documentPictureInPicture.window.document.querySelector("#pip-pause").click()')
     else:q.locator('[data-action=pause]').click()
     expect(q.locator('#session-state')).to_have_text('一時停止');q.clock.fast_forward(120000);expect(q.locator('#timer-output')).to_have_text('00:28:12');asset=export();assert asset['timer']['elapsed']==1692000 and not asset['timer']['running'];assert asset['data']['logs']==[]
     q.reload(wait_until='domcontentloaded');expect(q.locator('#timer-output')).to_have_text('00:28:12');expect(q.locator('#timer-extra')).to_have_text('+00:03:12');expect(q.locator('[data-action=pause]')).to_be_enabled()
     for width in [280,320,390,834,1440]:
      q.set_viewport_size({'width':width,'height':844});bad=q.evaluate('''()=>{const t=document.querySelector('#timer-output').getBoundingClientRect(),s=document.querySelector('#timer-extra').getBoundingClientRect(),b=document.querySelector('.clock-row>.primary-button').getBoundingClientRect(),p=document.querySelector('.session-panel').getBoundingClientRect();return {overlap:Math.max(t.right,s.right)>b.left-3,outside:Math.min(t.left,s.left)<p.left||Math.max(t.right,s.right,b.right)>p.right,font:getComputedStyle(document.querySelector('#timer-extra')).fontSize,mainFont:getComputedStyle(document.querySelector('#timer-output')).fontSize};}''');assert not bad['overlap'] and not bad['outside'],(width,bad);assert float(bad['font'][:-2])<float(bad['mainFont'][:-2])
     q.set_viewport_size({'width':390 if mobile else 1440,'height':844 if mobile else 900});q.locator('.session-panel').screenshot(path=str(OUT/(program+('-mobile' if mobile else '-desktop')+'.png')))
     q.locator('[data-action=pause]').click();q.clock.fast_forward(48000);expect(q.locator('#timer-output')).to_have_text('00:29:00');expect(q.locator('#timer-extra')).to_have_text('+00:04:00');q.reload(wait_until='domcontentloaded');expect(q.locator('#timer-output')).to_have_text('00:29:00')
     if not mobile:
      q.locator('[data-action=timer-popout]').click();q.wait_for_function('()=>!!documentPictureInPicture.window?.document.querySelector("#pip-finish")');q.evaluate('()=>{const b=documentPictureInPicture.window.document.querySelector("#pip-finish");b.click();b.click();b.click()}');q.wait_for_function('()=>!documentPictureInPicture.window')
     else:
      q.evaluate('()=>{const b=document.querySelector("[data-action=finish]");b.click();b.click();b.click()}');expect(q.locator('.session-panel .is-complete')).to_be_visible()
     q.clock.fast_forward(1000);expect(q.locator('.active-session')).to_have_count(0);asset=export();assert asset['timer'] is None and len(asset['data']['logs'])==1;log=asset['data']['logs'][0];assert log['elapsedSeconds']==1740 and log['minutes']==29 and log['timerGoalMinutes']==25;assert log['endedAt']==datetime.datetime.fromtimestamp((now+7*60000)/1000,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z');assert log['note']=='' and log['title']=='音楽制作 · 練習';assert not any(re.search('over(time|run)',k,re.I) for k in log)
     expect(q.locator('[data-card=logs] .row small')).to_contain_text('29分');assert '超過' not in q.locator('[data-card=logs]').inner_text();q.reload(wait_until='domcontentloaded');assert len(export()['data']['logs'])==1
     if program=='pomodoro':q.locator('[data-action=break-start]').click();q.clock.fast_forward(6*60000);q.locator('[data-action=finish]').click();q.clock.fast_forward(1000);assert len(export()['data']['logs'])==1
     checks.append({'mobile':mobile,'program':program,'deadlineAlertDoesNotLog':True,'totalMainAndQuietSideClock':True,'pausePastGoalAndReload':True,'runningReload':True,'narrowWidthsNoCollision':True,'actualNativePiP':not mobile,'one29MinuteRecordExcludes2MinutePause':True,'pomodoroRestExcluded':program=='pomodoro'});c.close()
   b.close()
 finally:server.terminate();server.wait(timeout=5)
assert not errors,errors
result={'result':'pass','checks':checks,'clock':'Playwright virtual wall clock','pageErrors':errors,'physicalDevicesTested':False};(OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
