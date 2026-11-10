"""Real wheel input at 4x CPU; inspect same-event application and routing.
No physical mouse/OS latency or FPS is asserted.
"""
import argparse,datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-direct';OUT.mkdir(exist_ok=True,parents=True);BASE='http://127.0.0.1:4581';parser=argparse.ArgumentParser();parser.add_argument('--baseline',action='store_true');args=parser.parse_args();app=Path(os.environ.get('FOCUS_SCROLL_APP_DIR',ROOT/'focus-sync'));today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat();checks=[];errors=[]
routine={'id':'r','title':'学習','minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a','title':'演習','minutes':25}]}
events=[{'id':'p'+str(i),'title':'学習','taskTitle':'学習','taskId':None,'date':today,'start':str(7+i).zfill(2)+':00','end':str(7+i).zfill(2)+':25','category':'learning','routineId':'r','activityId':'a','manual':True} for i in range(12)]
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':events,'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]},'config':{'routines':[routine],'template':'focus','order':['capture','plan','progress','logs'],'dashboardOrder':['capture','progress','plan','logs'],'progress':'calendar','theme':'dark','skin':'chrome'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-wheel-routing-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=app,env={**os.environ,'PORT':'4581','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
   for mobile in [False,True]:
    c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},has_touch=mobile,is_mobile=mobile,accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE+'/focus.html');q.locator('#settings').click();q.locator('[data-settings-tab=data]').click();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click()
    q.locator('.day-panel').evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");q.locator('.timeline-scroll').evaluate('e=>e.scrollTop=180');cd=c.new_cdp_session(q);cd.send('Emulation.setCPUThrottlingRate',{'rate':4})
    q.evaluate('''()=>{window.wheelQA={events:[],rootStyles:0};document.addEventListener('wheel',e=>{wheelQA.before={calendar:document.querySelector('.timeline-scroll').scrollTop,page:scrollY}},true);document.addEventListener('wheel',e=>wheelQA.events.push({before:wheelQA.before,after:{calendar:document.querySelector('.timeline-scroll').scrollTop,page:scrollY},prevented:e.defaultPrevented,dy:e.deltaY,mode:e.deltaMode}));new MutationObserver(rs=>wheelQA.rootStyles+=rs.length).observe(document.documentElement,{attributes:true,attributeFilter:['style']})}''')
    rect=q.locator('.timeline-scroll').bounding_box();q.mouse.move(rect['x']+rect['width']/2,rect['y']+100);q.mouse.wheel(0,53);q.wait_for_function('()=>wheelQA.events.length>0');event=q.evaluate('wheelQA.events.at(-1)');q.wait_for_timeout(250);settled=q.locator('.timeline-scroll').evaluate('e=>e.scrollTop');same_event=event['after']['calendar']-event['before']['calendar'];assert event['after']['page']==event['before']['page']
    if not args.baseline:assert same_event==53 and event['prevented'];assert settled==event['after']['calendar']
    # At both edges the wheel stays in the calendar, including repeated wheel input.
    for edge,dy in [('bottom',120),('top',-120)]:
     q.locator('.timeline-scroll').evaluate('(e,edge)=>e.scrollTop=edge==="top"?0:e.scrollHeight',edge);q.evaluate('wheelQA.events=[]');before=q.evaluate('scrollY');q.mouse.wheel(0,dy);q.wait_for_function('()=>wheelQA.events.length>0');q.wait_for_timeout(120);assert q.evaluate('scrollY')==before
    if not args.baseline:
     # Heading and padding belong to the same calendar block, not the page.
     q.locator('.day-panel').evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");q.locator('.timeline-scroll').evaluate('e=>e.scrollTop=100');r=q.locator('.day-panel .date-heading').bounding_box();q.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);q.evaluate('wheelQA.events=[]');q.mouse.wheel(0,29);q.wait_for_function('()=>wheelQA.events.length>0');h=q.evaluate('wheelQA.events.at(-1)');assert h['after']['calendar']-h['before']['calendar']==29 and h['after']['page']==h['before']['page']
    # Cursor outside the calendar scrolls the page even if calendar holds keyboard focus.
    q.locator('.timeline-scroll').focus();q.locator('.day-panel').evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");rect=q.locator('.timeline-scroll').bounding_box();q.mouse.move(4 if mobile else 210,rect['y']+100);q.evaluate('wheelQA.events=[]');inner_before=q.locator('.timeline-scroll').evaluate('e=>e.scrollTop');q.mouse.wheel(0,47);q.wait_for_function('()=>wheelQA.events.length>0');outside=q.evaluate('wheelQA.events.at(-1)');q.wait_for_timeout(250);assert q.locator('.timeline-scroll').evaluate('e=>e.scrollTop')==inner_before
    if not args.baseline:assert outside['after']['page']-outside['before']['page']==47 and outside['prevented'];assert q.evaluate('scrollY')==outside['after']['page']
    if not args.baseline:
     # Fractional trackpad deltas accumulate instead of disappearing through rounding.
     q.locator('.timeline-scroll').evaluate('e=>e.scrollTop=100');q.evaluate('wheelQA.events=[]');rect=q.locator('.timeline-scroll').bounding_box();q.mouse.move(rect['x']+rect['width']/2,rect['y']+100)
     for _ in range(10):q.mouse.wheel(0,.3)
     q.wait_for_function('()=>wheelQA.events.length===10');assert abs(q.locator('.timeline-scroll').evaluate('e=>e.scrollTop')-103)<=1
     # Normalized line/page modes and zoom exclusions are deterministic DOM input checks.
     sizes=q.locator('.timeline-scroll').evaluate('e=>{e.scrollTop=100;const line=new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:1,deltaMode:1});e.dispatchEvent(line);const a=e.scrollTop;const page=new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:1,deltaMode:2});e.dispatchEvent(page);return {a,b:e.scrollTop,h:e.clientHeight}}');assert sizes['a']==124 and sizes['b']==124+sizes['h']
     before=q.locator('.timeline-scroll').evaluate('e=>e.scrollTop');zoom=q.locator('.timeline-scroll').evaluate('e=>{const w=new WheelEvent("wheel",{bubbles:true,cancelable:true,ctrlKey:true,deltaY:120});e.dispatchEvent(w);return w.defaultPrevented}');assert not zoom and q.locator('.timeline-scroll').evaluate('e=>e.scrollTop')==before
     # Picker keeps its own direct input handling and a modal never scrolls the page behind it.
     q.locator('.session-panel [data-action=backdate]').click();q.locator('#log-form [name=start] + .wheel-trigger').click();wheel=q.locator('#wheel-picker [data-kind=minute]');r=wheel.bounding_box();q.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page_before=q.evaluate('scrollY');start=wheel.evaluate('e=>e.scrollTop');q.mouse.wheel(0,38);q.wait_for_timeout(150);assert wheel.evaluate('e=>e.scrollTop')==start+38;assert q.evaluate('scrollY')==page_before;q.locator('#wheel-picker .wheel-close').click();q.locator('#edit-dialog [data-close]').click()
    assert q.evaluate('wheelQA.rootStyles')==0
    checks.append({'mobile':mobile,'cpuSlowdown':4,'calendarDeltaInSameWheelEvent':same_event,'requestedDelta':53,'calendarBlockHeadingAlsoRoutesInside':not args.baseline,'calendarEndDoesNotScrollPage':True,'cursorOutsideScrollsPageWithCalendarFocused':True,'noPostInputDrift':not args.baseline,'fractionalTrackpadAndPickerPreserved':not args.baseline,'globalStyleWrites':0});c.close()
   assert not errors,errors;b.close()
 finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','baseline':args.baseline,'checks':checks,'physicalInputLatencyMeasured':False,'physicalSafariTested':False,'pageErrors':errors};(OUT/('scroll-before.json' if args.baseline else 'scroll.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
