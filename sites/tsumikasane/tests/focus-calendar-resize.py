"""Top/bottom resize through real pointer and CDP touch input; synthetic records only."""
import datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-flex';OUT.mkdir(exist_ok=True,parents=True);BASE='http://127.0.0.1:4579';today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat();checks=[];errors=[]
routines=[{'id':'r'+str(i),'title':name,'minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a'+str(i),'title':'演習','minutes':25}]} for i,name in enumerate(['学習','制作'])]
events=[{'id':'p'+str(i),'taskId':None,'title':r['title'],'taskTitle':r['title'],'routineId':r['id'],'activityId':'a'+str(i),'category':'learning','date':today,'start':start,'end':end,'manual':True} for i,(r,start,end) in enumerate(zip(routines,['09:00','10:00'],['09:25','10:30']))]
logs=[{'id':'asset','title':'過去の記録','eventId':'p0','date':(datetime.date.fromisoformat(today)-datetime.timedelta(days=1)).isoformat(),'start':'08:00','minutes':10,'category':'learning','note':'保持','custom':{'keep':True}}]
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':events,'logs':logs,'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[],'focusPlans':[{'id':e['id'],'date':today,'routineId':e['routineId'],'activityId':e['activityId']} for e in events]},'config':{'routines':routines,'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark','skin':'graphite'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-calendar-resize-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4579','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
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
     if route.request.url.endswith('/status'):value={'configured':True,'connected':True,'calendars':calendars}
     elif route.request.url.endswith('/refresh'):value={'calendars':calendars,'events':[{'id':'g','calendarId':'primary','summary':'Googleの予定','start':{'dateTime':today+'T09:40:00+09:00'},'end':{'dateTime':today+'T09:50:00+09:00'},'status':'confirmed'}]}
     else:raise AssertionError(route.request.url)
     route.fulfill(status=200,content_type='application/json',body=json.dumps(value))
    c.route('**/api/google/**',google);q.goto(BASE+'/focus.html#sync='+secret,wait_until='domcontentloaded');expect(q.locator('#save-status')).to_have_text('同期済み',timeout=15000)
    def settings():
     q.locator('#settings').click();q.locator('[data-settings-tab=data]').click()
    def export():
     settings()
     with q.expect_download() as dl:q.locator('[data-action=export]').click()
     v=json.loads(Path(dl.value.path()).read_text());q.locator('#settings-dialog [data-close]').click();return v
    settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click();expect(q.locator('.google-block')).to_have_count(1);expect(q.locator('.google-block [data-calendar-resize]')).to_have_count(0)
    def ranges(selector):return q.locator(selector+' .calendar-overlap').evaluate_all('es=>es.map(e=>[+e.dataset.overlapStart,+e.dataset.overlapEnd])')
    def resize(edge,minutes,cancel=False,ghost_ranges=None):
     q.locator('.day-panel').evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");q.evaluate("pad=>{const s=document.querySelector('.timeline-scroll'),e=document.querySelector('[data-plan-id=p0]');s.scrollTop=Math.max(0,(+e.dataset.startMinute-+s.dataset.start)*2-pad)}",100 if edge=='start' else 20)
     handle=q.locator('[data-plan-id=p0] [data-calendar-resize='+edge+']');handle.scroll_into_view_if_needed();r=handle.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2;dy=minutes*2
     assert q.evaluate("p=>document.elementFromPoint(p.x,p.y)?.closest('[data-calendar-resize]')?.dataset.calendarResize",{'x':x,'y':y})==edge,(mobile,edge,minutes,r)
     if mobile:
      cd=c.new_cdp_session(q);cd.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
      for i in range(1,7):cd.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y+dy*i/6}]})
     else:q.mouse.move(x,y);q.mouse.down();q.mouse.move(x,y+dy,steps=6)
     expect(q.locator('.calendar-ghost')).to_be_visible()
     if ghost_ranges is not None:
      q.wait_for_function('(want)=>JSON.stringify([...document.querySelectorAll(".calendar-ghost .calendar-overlap")].map(e=>[+e.dataset.overlapStart,+e.dataset.overlapEnd]))===JSON.stringify(want)',arg=ghost_ranges)
     if cancel:
      q.set_viewport_size({'width':391 if mobile else 1441,'height':844 if mobile else 1000});expect(q.locator('.calendar-ghost')).to_have_count(0)
     if mobile:cd.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cd.detach()
     else:q.mouse.up()
     expect(q.locator('.calendar-ghost')).to_have_count(0);assert not q.locator('#edit-dialog').evaluate('e=>e.open')
    resize('end',20,ghost_ranges=[[580,585]]);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','45');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','540');assert ranges('[data-plan-id=p0]')==[[580,585]];assert ranges('.google-block')==[[580,585]]
    resize('end',30,ghost_ranges=[[580,590],[600,615]]);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','75');assert ranges('[data-plan-id=p0]')==[[580,590],[600,615]];assert ranges('[data-plan-id=p1]')==[[600,615]]
    q.locator('.day-panel').screenshot(path=str(OUT/('resize-mobile.png' if mobile else 'resize-desktop.png')))
    resize('end',-30);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','45')
    resize('start',-20,ghost_ranges=[[580,585]]);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','520');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','65');assert next(e for e in export()['data']['events'] if e['id']=='p0')['end']=='09:45'
    resize('start',15);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','535');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','50')
    resize('end',-60);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','1');assert ranges('[data-plan-id=p0]')==[];assert ranges('.google-block')==[]
    resize('end',24);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','25');resize('end',20,cancel=True);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','25')
    resize('start',30);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','559');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','1');resize('start',-24);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','535')
    def set_start(value):
     q.locator('[data-plan-id=p0]').click();q.locator('#plan-form [name=start]').evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));}",value);q.locator('#plan-form .primary-button').click();expect(q.locator('#edit-dialog')).not_to_be_visible()
    set_start('23:30');resize('end',10);expect(q.locator('#calendar-message')).to_contain_text('23:59');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','1410');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','25');set_start('08:55')
    asset=export();assert asset['data']['logs']==logs;assert len(asset['data']['events'])==2 and next(e for e in asset['data']['events'] if e['id']=='p0')['end']=='09:20';q.reload(wait_until='domcontentloaded');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-duration','25');assert export()['data']['logs']==logs
    q.locator('[data-action=begin]').click();expect(q.locator('.active-session')).to_be_visible();assert q.locator('[data-plan-id=p0]').count()==0;expect(q.locator('[data-action=finish]')).to_be_enabled();q.locator('[data-action=finish]').click();expect(q.locator('.active-session')).to_have_count(0);expect(q.locator('[data-plan-id=p0] [data-calendar-resize]')).to_have_count(2)
    checks.append({'mobile':mobile,'topBottomGrowAndShrink':True,'oppositeEndpointFixed':True,'partialGoogleAndFocusIntersectionsDuringPreviewAndAfterCommit':True,'disjointOverlapSegments':True,'minimumOneMinuteBothEdges':True,'outOfDayResizeRejectedWithoutMutation':True,'cancelRetainsValues':True,'recordedResizeKeepsActualLogsAndIdentity':True,'reloadRetainsDuration':True,'activeAndGoogleResizeExcluded':True});c.close()
   assert not errors,errors;b.close()
 finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','checks':checks,'googleMocked':True,'physicalSafariTested':False,'pageErrors':errors};(OUT/'resize.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
