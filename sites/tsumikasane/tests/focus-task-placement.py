"""Actual mouse/CDP-touch task-list drops, full-day range and live now indicator.
Synthetic 180-minute music task deliberately cannot be auto-placed.
"""
import datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-direct';OUT.mkdir(exist_ok=True,parents=True);BASE='http://127.0.0.1:4580';today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat();checks=[];errors=[]
routines=[{'id':'r'+str(i),'title':title,'minutes':mins,'category':'learning','preferredStart':'09:00','preferredEnd':'10:00','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a'+str(i),'title':'制作' if i==0 else '演習','minutes':mins}]} for i,(title,mins) in enumerate([('音楽制作',180),('学習',30)])]
events=[{'id':'p'+str(i),'title':'学習','taskTitle':'学習','activityTitle':'演習','taskId':None,'category':'learning','date':today,'start':start,'end':end,'routineId':'r1','activityId':'a1','manual':True,'custom':{'keep':True}} for i,(start,end) in enumerate([('21:30','22:00'),('08:00','08:30'),('09:00','09:30'),('10:00','10:30'),('11:00','11:30'),('12:00','12:30'),('13:00','13:30')])]
logs=[{'id':'asset','title':'過去の実績','eventId':'p0','date':(datetime.date.fromisoformat(today)-datetime.timedelta(days=1)).isoformat(),'start':'14:00','minutes':20,'category':'learning','note':'保持','custom':{'asset':True}}]
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':events,'logs':logs,'focusPlans':[{'id':'music','date':today,'routineId':'r0','activityId':'a0'}]+[{'id':e['id'],'date':today,'routineId':'r1','activityId':'a1'} for e in events],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]},'config':{'routines':routines,'planning':{'dayStart':'09:00','dayEnd':'10:00','gapMinutes':0,'dailyLimit':25},'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-task-placement-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4580','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.1)
  secret=(Path(temp)/'sync-key.txt').read_text().strip()
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
   for mobile in [False,True]:
    c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},is_mobile=mobile,has_touch=mobile,accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept())
    calendars=[{'id':'primary','summary':'予定','primary':True,'accessRole':'owner','timeZone':'Asia/Tokyo'}]
    def google(route):
     if route.request.url.endswith('/status'):v={'configured':True,'connected':True,'calendars':calendars}
     elif route.request.url.endswith('/refresh'):v={'calendars':calendars,'events':[{'id':'g','calendarId':'primary','summary':'別の予定','start':{'dateTime':today+'T21:00:00+09:00'},'end':{'dateTime':today+'T21:15:00+09:00'},'status':'confirmed'}]}
     else:raise AssertionError(route.request.url)
     route.fulfill(status=200,content_type='application/json',body=json.dumps(v))
    c.route('**/api/google/**',google);q.goto(BASE+'/focus.html#sync='+secret,wait_until='domcontentloaded');expect(q.locator('#save-status')).to_have_text('同期済み',timeout=15000);q.evaluate('navigator.serviceWorker.ready.then(()=>true)')
    def settings():
     q.locator('#settings').click();q.locator('[data-settings-tab=data]').click()
    def export():
     settings()
     with q.expect_download() as dl:q.locator('[data-action=export]').click()
     v=json.loads(Path(dl.value.path()).read_text());q.locator('#settings-dialog [data-close]').click();return v
    settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click();expect(q.locator('.unplaced')).to_have_count(1)
    expect(q.locator('.timeline-scroll')).to_have_attribute('data-start','0');expect(q.locator('.hour-labels span')).to_have_count(25);expect(q.locator('.hour-labels span').last).to_have_text('24:00');expect(q.locator('.unplaced small')).to_contain_text('3時間');expect(q.locator('.unplaced [data-action=plan-remove]')).to_have_count(0)
    q.locator('[data-task-plan-id=music] [data-task-calendar-grip]').click();expect(q.locator('#plan-form')).to_be_visible();expect(q.locator('#plan-form [name=duration]')).to_have_value('180')
    q.locator('#plan-form [name=start]').evaluate("e=>{e.value='20:00';e.dispatchEvent(new Event('change',{bubbles:true}));}");q.locator('#plan-form [name=duration]').evaluate("e=>{e.value='60';e.dispatchEvent(new Event('change',{bubbles:true}));}");q.locator('#plan-form .primary-button').click();expect(q.locator('[data-plan-id=music]')).to_have_attribute('data-duration','60');assert export()['config']['routines']==routines
    settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click();expect(q.locator('.unplaced')).to_have_count(1);assert len(export()['data']['events'])==7
    if mobile:
     body=q.locator('[data-task-plan-id=music] .task-select');body.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");r=body.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2;before=q.evaluate('scrollY');touch=c.new_cdp_session(q);touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
     for step in range(1,9):touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-90*step/8}]})
     touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});touch.detach();q.wait_for_function('v=>scrollY>v+20',arg=before);q.wait_for_timeout(300);expect(q.locator('.task-drag-label')).to_have_count(0);expect(q.locator('.unplaced')).to_have_count(1)
    def drag(id,minute=None,cancel=False):
     # Pre-scroll is normal calendar navigation; the drop itself supplies no form values.
     if minute is not None:q.locator('.timeline-scroll').evaluate('(s,m)=>s.scrollTop=m*2-80',minute)
     source=q.locator('[data-task-plan-id='+id+']');handle=source.locator('[data-task-calendar-grip]') if mobile else source.locator('.task-select');handle.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");r=handle.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2
     if mobile:cd=c.new_cdp_session(q);cd.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
     else:q.mouse.move(x,y);q.mouse.down()
     def move(x,y):
      if mobile:cd.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]})
      else:q.mouse.move(x,y)
     move(x,y+15);expect(q.locator('.task-drag-label')).to_be_visible();assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
     if minute is not None:
      # Hold at the viewport edge to reach a calendar below the task list.
      def ready():return q.evaluate("()=>{const h=document.querySelector('.timeline-scroll').getBoundingClientRect(),nav=document.querySelector('#primary-nav'),limit=getComputedStyle(nav).position==='fixed'?nav.getBoundingClientRect().top:innerHeight;return h.top>=40&&h.bottom<limit-12}")
      if not ready():
       edge=q.evaluate("()=>{const n=document.querySelector('#primary-nav');return (getComputedStyle(n).position==='fixed'?n.getBoundingClientRect().top:innerHeight)-5}");move(q.evaluate('innerWidth-10'),edge);q.wait_for_function("()=>{const h=document.querySelector('.timeline-scroll').getBoundingClientRect(),n=document.querySelector('#primary-nav'),limit=getComputedStyle(n).position==='fixed'?n.getBoundingClientRect().top:innerHeight;return h.top>=40&&h.bottom<limit-12}",timeout=12000)
      move(10,q.evaluate('innerHeight/2'));q.evaluate('()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');geometry=q.evaluate("m=>{const s=document.querySelector('.timeline-scroll'),lane=s.querySelector('[data-lane=plan]').getBoundingClientRect();return {x:lane.left+lane.width/2,y:lane.top+m*2}}",minute);move(geometry['x'],geometry['y']);expect(q.locator('.calendar-ghost')).to_be_visible();q.evaluate("window.dispatchEvent(new Event('focus'))");q.wait_for_timeout(120);expect(q.locator('.calendar-ghost')).to_be_visible();expect(q.locator('.calendar-ghost-time')).to_contain_text(str(minute//60).zfill(2)+':'+str(minute%60).zfill(2),timeout=4000)
     else:move(10,100)
     if cancel:q.keyboard.press('Escape');expect(q.locator('.calendar-ghost')).to_have_count(0)
     if mobile:cd.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cd.detach()
     else:q.mouse.up()
     expect(q.locator('.calendar-ghost')).to_have_count(0);expect(q.locator('.task-drag-label')).to_have_count(0);expect(q.locator('.calendar-drop-target')).to_have_count(0);assert not q.locator('#edit-dialog').evaluate('e=>e.open')
    drag('music');expect(q.locator('.unplaced')).to_have_count(1);assert len(export()['data']['events'])==7
    drag('music',20*60);expect(q.locator('[data-plan-id=music]')).to_have_attribute('data-start-minute','1200');expect(q.locator('[data-plan-id=music]')).to_have_attribute('data-duration','180');expect(q.locator('.unplaced')).to_have_count(0)
    shades=q.locator('[data-plan-id=music] .calendar-overlap').evaluate_all('es=>es.map(e=>[+e.dataset.overlapStart,+e.dataset.overlapEnd])');assert shades==[[1260,1275],[1290,1320]],shades
    asset=export();assert len(asset['data']['events'])==8 and asset['data']['logs']==logs and asset['config']['routines']==routines
    drag('music',18*60);expect(q.locator('[data-plan-id=music]')).to_have_attribute('data-start-minute','1080');expect(q.locator('[data-plan-id=music] .calendar-overlap')).to_have_count(0);assert len(export()['data']['events'])==8
    drag('music',19*60,cancel=True);expect(q.locator('[data-plan-id=music]')).to_have_attribute('data-start-minute','1080')
    drag('p0',22*60);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','1320');asset=export();assert asset['data']['logs']==logs;assert next(e for e in asset['data']['events'] if e['id']=='p0')['custom']=={'keep':True}
    c.set_offline(True);drag('music',19*60);expect(q.locator('[data-plan-id=music]')).to_have_attribute('data-start-minute','1140');q.wait_for_timeout(600);q.reload(wait_until='domcontentloaded');expect(q.locator('[data-plan-id=music]')).to_have_attribute('data-start-minute','1140');assert export()['data']['logs']==logs;c.set_offline(False);expect(q.locator('#save-status')).to_have_text('同期済み',timeout=15000)
    q.locator('.day-panel').evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");q.locator('.timeline-scroll').evaluate('s=>s.scrollTop=20*120');q.locator('[data-action=begin]').click();expect(q.locator('.active-session')).to_be_visible();expect(q.locator('[data-task-plan-id=music]')).to_have_count(0);q.locator('[data-action=discard]').click();expect(q.locator('[data-task-plan-id=music]')).to_have_count(1)
    # Clock-only updates must not reconstruct the workspace or write root styles.
    stamp=datetime.datetime.fromisoformat(today+'T21:07:00+09:00');q.clock.install(time=stamp);q.clock.pause_at(stamp+datetime.timedelta(seconds=1));expect(q.locator('#calendar-now small')).to_have_text('21:07');expect(q.locator('#calendar-now')).to_have_attribute('data-minute','1267')
    q.evaluate("()=>{window.nowQA={rootWrites:0,rerenders:0};new MutationObserver(rs=>nowQA.rootWrites+=rs.length).observe(document.documentElement,{attributes:true,attributeFilter:['style']});new MutationObserver(rs=>nowQA.rerenders+=rs.length).observe(document.querySelector('#workspace'),{childList:true})}")
    old_top=q.locator('#calendar-now').evaluate('e=>parseFloat(e.style.top)');q.clock.fast_forward(60000);expect(q.locator('#calendar-now small')).to_have_text('21:08');assert q.locator('#calendar-now').evaluate('e=>parseFloat(e.style.top)')==old_top+2;assert q.evaluate('nowQA')=={'rootWrites':0,'rerenders':0}
    q.locator('.day-panel').screenshot(path=str(OUT/('direct-mobile.png' if mobile else 'direct-desktop.png')))
    q.clock.fast_forward(3*3600000);expect(q.locator('.timeline-scroll')).to_have_attribute('data-date',(datetime.date.fromisoformat(today)+datetime.timedelta(days=1)).isoformat());expect(q.locator('#calendar-now small')).to_have_text('00:08')
    checks.append({'mobile':mobile,'fullDay00Through24':True,'unplaced180MinutesDirectDropPast20OutsideAutoRules':True,'mouseBodyOrTouchGripWithPageAutoScroll':True,'overlapPartialSegments':True,'placedAndRecordedRowMovesSameIdentityHistoryKept':True,'cancelAndOutsideDropNoMutation':True,'routine180MinutesUnchanged':True,'activeTaskDragExcluded':True,'unchangedGoogleRefreshDoesNotInterruptDrag':True,'touchBodyKeepsNativeScroll':True,'unplacedEditorShortensOnlyTodaysOccurrence':True,'offlineDropAndReload':True,'nowLineMinuteOnlyNoRerenderNoGlobalStyles':True,'midnightCurrentDayRefresh':True});c.close()
   assert not errors,errors;b.close()
 finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','checks':checks,'googleMocked':True,'physicalSafariTested':False,'pageErrors':errors};(OUT/'placement.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
