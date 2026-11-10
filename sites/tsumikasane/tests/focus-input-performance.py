"""Real mouse/touch input and CPU-throttled rendering. Synthetic data only."""
import datetime,json,os,subprocess,tempfile,time,urllib.request,argparse
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-performance';OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--baseline',action='store_true');args=parser.parse_args();BASE='http://127.0.0.1:4576';today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
routine={'id':'r','title':'学習','minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a','title':'演習','minutes':25}]}
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[{'id':'p','title':'学習 · 演習','taskId':None,'taskTitle':'学習','activityTitle':'演習','routineId':'r','activityId':'a','date':today,'start':'09:00','end':'09:25','category':'learning','manual':True}],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[],'focusPlans':[{'id':'p','date':today,'routineId':'r','activityId':'a'}]},'config':{'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','routines':[routine],'theme':'dark','skin':'chrome','glassEffects':True},'timer':None}
app=Path(os.environ.get('FOCUS_PERF_APP_DIR',ROOT/'focus-sync'));errors=[];checks=[]
with tempfile.TemporaryDirectory(prefix='focus-input-perf-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=app,env={**os.environ,'PORT':'4576','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.3).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
   for mobile in [False,True]:
    c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},has_touch=mobile,is_mobile=mobile,accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE+'/focus.html',wait_until='domcontentloaded');q.locator('#settings').click();q.locator('[data-settings-tab=data]').click();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});q.locator('#settings-dialog [data-close]').click()
    cdp=c.new_cdp_session(q);cdp.send('Performance.enable');cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
    q.locator('.session-panel [data-action=backdate]').click();q.locator('#log-form [name=start] + .wheel-trigger').click();expect(q.locator('#wheel-picker')).to_be_visible()
    q.evaluate('''()=>{window.inputQA={toggles:0,rootStyles:0,frames:[],longTasks:[]};const classes=new Set([...document.querySelectorAll('.wheel-option')].map(e=>e.classList));for(const method of ['toggle','add','remove']){const original=DOMTokenList.prototype[method];DOMTokenList.prototype[method]=function(...a){if(classes.has(this))inputQA.toggles++;return original.apply(this,a)}}new MutationObserver(rs=>inputQA.rootStyles+=rs.length).observe(document.documentElement,{attributes:true,attributeFilter:['style']});try{new PerformanceObserver(list=>inputQA.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false})}catch{};window.recordFrames=true;let last=performance.now();function frame(t){if(!recordFrames)return;inputQA.frames.push(t-last);last=t;requestAnimationFrame(frame)}requestAnimationFrame(frame)}''')
    before={m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']};wheel=q.locator('#wheel-picker [data-kind=minute]');wheel.evaluate("e=>{e.style.scrollSnapType='none';e.scrollTop=30*38}");q.wait_for_timeout(200);start=wheel.evaluate('e=>e.scrollTop');r=wheel.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2
    if mobile:
     cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
     for i in range(1,13):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-91*i/12}]});time.sleep(.016)
     cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    else:
     q.mouse.move(x,y);q.mouse.down()
     for i in range(1,13):q.mouse.move(x,y-91*i/12);time.sleep(.016)
     q.mouse.up()
    q.wait_for_timeout(400);after={m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']};measured=q.evaluate('''()=>{recordFrames=false;return inputQA}''');position=wheel.evaluate('e=>e.scrollTop');report={'mobile':mobile,'cpuSlowdown':4,'wheelClassToggles':measured['toggles'],'globalStyleWritesWhileWheelMoves':measured['rootStyles'],'wheelRowsChanged':abs(round(position/38)-round(start/38)),'taskMs':round((after['TaskDuration']-before['TaskDuration'])*1000,1),'styleMs':round((after['RecalcStyleDuration']-before['RecalcStyleDuration'])*1000,1),'longTasks':len(measured['longTasks'])}
    q.locator('#wheel-picker .wheel-done').click();expect(q.locator('#wheel-picker')).not_to_be_visible();q.locator('#edit-dialog [data-close]').click()
    # Body and inner-calendar scroll must not trigger expensive JS styling of the root.
    q.evaluate('''()=>{window.rootScrollStyles=0;new MutationObserver(rs=>rootScrollStyles+=rs.length).observe(document.documentElement,{attributes:true,attributeFilter:['style']})}''');q.locator('.day-panel').scroll_into_view_if_needed()
    for i in range(8):q.evaluate('i=>{scrollTo(0,i*35);document.querySelector(".timeline-scroll").scrollTop=i*15}',i);q.wait_for_timeout(20)
    report['globalStyleWritesWhileScrolling']=q.evaluate('rootScrollStyles');report['panelBackdropFilter']=q.locator('.panel').first.evaluate('e=>getComputedStyle(e).backdropFilter')
    q.locator('.day-panel').scroll_into_view_if_needed();q.locator('[data-plan-id=p]').scroll_into_view_if_needed();q.evaluate('''()=>{window.calendarReads=0;const original=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){if(this.matches('.timeline-lane,.timeline-scroll'))calendarReads++;return original.call(this)}}''')
    block=q.locator('[data-plan-id=p]');handle=block.locator('[data-calendar-grip]') if mobile else block;box=handle.bounding_box();origin=block.bounding_box()['y'];x=box['x']+box['width']/2;y=box['y']+box['height']/2;errors_px=[]
    if mobile:cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    else:q.mouse.move(x,y);q.mouse.down()
    for i in range(1,9):
     delta=37*i/8
     if mobile:cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y+delta}]})
     else:q.mouse.move(x,y+delta)
     q.evaluate('new Promise(requestAnimationFrame)')
     if q.locator('.calendar-ghost').count():errors_px.append(abs(q.locator('.calendar-ghost').bounding_box()['y']-(origin+delta)))
    q.evaluate('document.querySelector(".timeline-scroll").scrollTop+=13');q.evaluate('new Promise(requestAnimationFrame)');q.evaluate('new Promise(requestAnimationFrame)');report['calendarPointerErrorAfterScrollPx']=round(abs(q.locator('.calendar-ghost').bounding_box()['y']-(origin+37)),2)
    if mobile:cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    else:q.mouse.up()
    report['calendarGeometryReads']=q.evaluate('calendarReads');report['calendarPointerErrorPx']=round(max(errors_px,default=999),2)
    if not args.baseline:
     assert report['wheelClassToggles']<40,report
     assert report['globalStyleWritesWhileWheelMoves']==0 and report['globalStyleWritesWhileScrolling']==0,report
     assert report['panelBackdropFilter']=='none',report
     assert report['wheelRowsChanged']>=2,report
     assert report['calendarGeometryReads']<=3 and report['calendarPointerErrorPx']<=1,report
     assert report['calendarPointerErrorAfterScrollPx']<=1,report
    checks.append(report);c.close()
   assert not errors,errors;b.close()
 finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','baseline':args.baseline,'checks':checks,'pageErrors':errors,'physicalDeviceTested':False};(OUT/('before.json' if args.baseline else 'after.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
