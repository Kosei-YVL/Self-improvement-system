"""Actual pointer/touch movements with a mocked read-only Google busy event."""
import datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-calendar';OUT.mkdir(parents=True,exist_ok=True);BASE='http://127.0.0.1:4566';today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat();errors=[];checks=[]
routines=[{'id':'r'+str(i),'title':name,'minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':10,'prepareAfter':5,'activities':[{'id':'a'+str(i),'title':'演習','minutes':25}]} for i,name in enumerate(['学習','制作'])]
events=[{'id':'p'+str(i),'title':r['title']+' · 演習','taskTitle':r['title'],'activityTitle':'演習','taskId':None,'category':'learning','date':today,'start':start,'end':end,'routineId':r['id'],'activityId':'a'+str(i),'prepareBefore':10,'prepareAfter':5,'manual':True} for i,(r,start,end) in enumerate(zip(routines,['09:00','12:00'],['09:25','12:25']))]
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':events,'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[],'focusPlans':[{'id':e['id'],'date':today,'routineId':e['routineId'],'activityId':e['activityId']} for e in events]},'config':{'routines':routines,'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark','skin':'chrome'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-calendar-ui-') as temporary:
    env={**os.environ,'PORT':'4566','FOCUS_DATA_DIR':temporary,'FOCUS_ENV':'personal'};env.pop('SYNC_AUTH_HASH',None);server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
            except OSError:time.sleep(.1)
        secret=(Path(temporary)/'sync-key.txt').read_text().strip()
        with sync_playwright() as p:
            b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            for mobile in [False,True]:
                c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},is_mobile=mobile,has_touch=mobile,accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());calendars=[{'id':'primary','summary':'予定','primary':True,'accessRole':'owner','timeZone':'Asia/Tokyo'}]
                def google(route):
                    if route.request.url.endswith('/status'):body={'configured':True,'connected':True,'calendars':calendars}
                    elif route.request.url.endswith('/refresh'):body={'calendars':calendars,'events':[{'id':'busy','calendarId':'primary','summary':'Googleの予定','start':{'dateTime':today+'T10:00:00+09:00'},'end':{'dateTime':today+'T10:30:00+09:00'},'status':'confirmed'}]}
                    else:raise AssertionError(route.request.url)
                    route.fulfill(status=200,content_type='application/json',body=json.dumps(body))
                c.route('**/api/google/**',google);q.goto(BASE+'/focus.html#sync='+secret,wait_until='domcontentloaded');expect(q.locator('#save-status')).to_have_text('同期済み',timeout=15000)
                def settings(tab='data'):
                    if not q.locator('#settings-dialog').evaluate('e=>e.open'):q.locator('#settings').click()
                    q.locator('[data-settings-tab='+tab+']').click()
                def export():
                    settings()
                    with q.expect_download() as dl:q.locator('[data-action=export]').click()
                    value=json.loads(Path(dl.value.path()).read_text());q.locator('#settings-dialog [data-close]').click();return value
                settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click();expect(q.locator('.google-block')).to_have_count(1);assert q.locator('.google-block [data-calendar-grip]').count()==0
                def scroll_to_plan():
                    q.locator('.day-panel').scroll_into_view_if_needed();q.evaluate("()=>{const s=document.querySelector('.timeline-scroll');s.scrollTop=Number(document.querySelector('[data-plan-id=p0]').dataset.startMinute)*2-60;}");q.locator('[data-plan-id=p0]').scroll_into_view_if_needed()
                def drag_by(minutes):
                    scroll_to_plan();block=q.locator('[data-plan-id=p0]');handle=block.locator('[data-calendar-grip]') if mobile else block;rect=handle.bounding_box();x=rect['x']+rect['width']/2;y=rect['y']+rect['height']/2;dy=minutes*2
                    if mobile:
                        session=c.new_cdp_session(q);session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
                        for i in range(1,10):session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y+dy*i/9}]})
                        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});session.detach()
                    else:q.mouse.move(x,y);q.mouse.down();q.mouse.move(x,y+dy,steps=9);q.mouse.up()
                drag_by(30);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','570');assert not q.locator('#edit-dialog').evaluate('e=>e.open');after=export();assert len(after['data']['events'])==2 and next(e for e in after['data']['events'] if e['id']=='p0')['start']=='09:30'
                # Manual overlap is allowed; only 10:00–10:10 is highlighted in BOTH blocks.
                drag_by(15);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','585');expect(q.locator('#calendar-message')).to_be_empty()
                for selector in ['[data-plan-id=p0]','.google-block']:
                    shade=q.locator(selector+' .calendar-overlap');expect(shade).to_have_attribute('data-overlap-start','600');expect(shade).to_have_attribute('data-overlap-end','610');assert shade.evaluate('e=>parseFloat(e.style.height)')==20
                checks.append({'mobile':mobile,'googlePartialIntersectionBothBlocks':[600,610]})
                q.locator('[data-plan-id=p0]').focus();q.keyboard.press('Alt+ArrowUp');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','580')
                q.locator('[data-plan-id=p0]').click();expect(q.locator('#plan-form')).to_be_visible();q.locator('#plan-form [name=start] + .wheel-trigger').click();expect(q.locator('#wheel-picker')).to_be_visible();q.locator('#wheel-picker .wheel-close').click();q.locator('#plan-form [name=start]').evaluate("e=>{e.value='12:10';e.dispatchEvent(new Event('change',{bubbles:true}));}");q.locator('#plan-form .primary-button').click();expect(q.locator('#edit-dialog')).not_to_be_visible();expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','730')
                before_scroll=q.locator('.timeline-scroll').evaluate('e=>e.scrollTop');q.reload(wait_until='domcontentloaded');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','730');snapshot=export();assert len(snapshot['data']['events'])==2 and not snapshot['data']['logs']
                for selector in ['[data-plan-id=p0]','[data-plan-id=p1]']:
                    shade=q.locator(selector+' .calendar-overlap');expect(shade).to_have_attribute('data-overlap-start','730');expect(shade).to_have_attribute('data-overlap-end','745');assert shade.evaluate('e=>parseFloat(e.style.height)')==30
                for count in [1,2]:
                    q.locator('[data-action=begin]').click();assert q.locator('[data-plan-id=p0]').count()==0;expect(q.locator('[data-action=finish]')).to_be_enabled();q.locator('[data-action=finish]').click();expect(q.locator('.active-session')).to_have_count(0)
                    expect(q.locator('[data-plan-id=p0]')).to_have_count(1);end=export();assert len(end['data']['logs'])==count and all(l['eventId']=='p0' for l in end['data']['logs'])
                assert len({l['timerId'] for l in end['data']['logs']})==2
                original_logs=end['data']['logs']
                drag_by(10);expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','740');assert export()['data']['logs']==original_logs
                q.locator('.session-panel [data-action=backdate]').click();expect(q.locator('#log-form')).to_have_attribute('data-event','p0');q.locator('[data-action=log-yesterday]').click();q.locator('#log-form [name=start]').evaluate("e=>{e.value='09:00';e.dispatchEvent(new Event('change',{bubbles:true}));}");q.locator('#log-form .primary-button').click();expect(q.locator('#edit-dialog')).not_to_be_visible();asset=export();assert len(asset['data']['logs'])==3 and asset['data']['logs'][:2]==original_logs
                # An explicit second manual addition can share minute-rounded inputs.
                q.locator('.session-panel [data-action=backdate]').click();q.locator('[data-action=log-yesterday]').click();q.locator('#log-form [name=start]').evaluate("e=>{e.value='09:00';e.dispatchEvent(new Event('change',{bubbles:true}));}");q.locator('#log-form .primary-button').evaluate('e=>{e.click();e.click();e.click();}');expect(q.locator('#edit-dialog')).not_to_be_visible();asset=export();assert len(asset['data']['logs'])==4 and len({l['id'] for l in asset['data']['logs']})==4
                q.reload(wait_until='domcontentloaded');expect(q.locator('[data-plan-id=p0]')).to_have_attribute('data-start-minute','740');assert len(export()['data']['logs'])==4
                # Starting a new record must not silently resume an old record's edit draft.
                before_draft=export()['data']['logs'];edit=q.locator('[data-card=logs] [data-action=log-edit]').first;editing_id=edit.get_attribute('data-id');edit.click();q.locator('#log-form [name=title]').fill('編集下書き');q.locator('#edit-dialog [data-close]').click()
                q.locator('.session-panel [data-action=backdate]').click();expect(q.locator('#log-form')).to_have_attribute('data-id','');expect(q.locator('#log-form [name=title]')).not_to_have_value('編集下書き');q.locator('#edit-dialog [data-close]').click();assert export()['data']['logs']==before_draft
                q.locator('[data-card=logs] [data-action=log-edit][data-id="'+editing_id+'"]').click();expect(q.locator('#log-form [name=title]')).to_have_value('編集下書き');q.locator('#edit-dialog [data-close]').click()
                q.locator('.day-panel').screenshot(path=str(OUT/('calendar-mobile.png' if mobile else 'calendar-desktop.png')))
                if mobile:
                    unplaced=json.loads(json.dumps(fixture));unplaced['data']['events']=[];unplaced['data']['focusPlans']=[{'id':'unplaced','date':today,'routineId':'r0','activityId':'a0'},{'id':'yesterday','date':(datetime.date.fromisoformat(today)-datetime.timedelta(days=1)).isoformat(),'routineId':'r1','activityId':'a1'}];unplaced['config']['planning']={'dayStart':'00:00','dayEnd':'00:10','gapMinutes':0,'dailyLimit':25}
                    settings();q.locator('#restore').set_input_files({'name':'unplaced.json','mimeType':'application/json','buffer':json.dumps(unplaced).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click();expect(q.locator('.today-panel .unplaced')).to_have_count(1);q.locator('.unplaced [data-action=choose-event]').click();q.locator('[data-action=begin]').click();q.locator('[data-action=finish]').click();expect(q.locator('.active-session')).to_have_count(0);expect(q.locator('.today-panel h2 small')).to_have_text('1/1');expect(q.locator('.completed-tasks summary')).to_contain_text('完了 1');asset=export();assert not asset['data']['events'];assert len(asset['data']['logs'])==1 and asset['data']['logs'][0]['eventId']=='unplaced';assert sum(p['date']==today for p in asset['data']['focusPlans'])==1
                checks.append({'mobile':mobile,'dragThirtyMinutes':'pass','googleOverlapAllowedPartialShade':'pass','altArrowFiveMinutes':'pass','timeInputAndReload':'pass','onePlanIdentityOneCompletion':'pass','repeatedSessionsManualAdditionRecordedPlanMovableHistoryIntact':'pass'});c.close()
            assert not errors,errors;b.close()
    finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','checks':checks,'googleMocked':True,'physicalSafariTested':False,'pageErrors':errors};(OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
