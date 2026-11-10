import argparse,datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--round',type=int,default=2);args=parser.parse_args()
OUT=ROOT/'qa/focus-refinement'/('round'+str(args.round));OUT.mkdir(parents=True,exist_ok=True)
date='2026-10-29'
routines=[{'id':'r'+str(i),'title':name,'minutes':25,'category':'learning','preferredStart':'05:30','preferredEnd':'23:00','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a'+str(i)+'-'+str(j),'title':('演習' if i==0 else '作業')+str(j+1),'minutes':25} for j in range(12)]} for i,name in enumerate(['学習','制作','英語','読書','運動','生活'])]
data={'version':2,'tasks':[],'events':[{'id':'yesterday-plan','title':'英語 · 昨日の学習','category':'learning','date':'2026-10-28','start':'18:30','end':'19:00','taskId':None,'routineId':'r2','activityId':'a2-0','taskTitle':'英語','activityTitle':'昨日の学習','manual':True}],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'logs':[],'events':[]},'sourceTables':[],'focusPlans':[]}
fixture={'format':'focus-device','version':1,'data':data,'config':{'template':'focus','order':['capture','plan','progress','logs'],'routines':routines,'progress':'calendar','theme':'dark'},'timer':None}
checks=[];errors=[]
with tempfile.TemporaryDirectory(prefix='focus-journeys-') as temporary:
    server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4559','FOCUS_ENV':'personal','FOCUS_DATA_DIR':temporary},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:urllib.request.urlopen('http://127.0.0.1:4559/focus.html',timeout=.2).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
            for mobile in [False,True]:
                context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,accept_downloads=True,timezone_id='Asia/Tokyo');page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)));backup_requests=[];page.on('request',lambda request:backup_requests.append(request.url) if '/api/focus-device-backup' in request.url else None);page.on('dialog',lambda dialog:dialog.accept())
                page.clock.install(time=datetime.datetime(2026,10,29,0,0,tzinfo=datetime.timezone.utc));page.clock.pause_at(datetime.datetime(2026,10,29,0,0,5,tzinfo=datetime.timezone.utc))
                page.goto('http://127.0.0.1:4559/focus.html',wait_until='domcontentloaded')
                def close():
                    if page.locator('#settings-dialog').evaluate('e=>e.open'):page.locator('#settings-dialog [data-close]').click()
                def settings(tab=None):
                    if not page.locator('#settings-dialog').evaluate('e=>e.open'):page.locator('#settings').click()
                    if tab and page.locator('[data-settings-tab="'+tab+'"]').count():page.locator('[data-settings-tab="'+tab+'"]').click()
                def export():
                    settings('data')
                    with page.expect_download() as download:page.locator('[data-action=export]').click()
                    value=json.loads(Path(download.value.path()).read_text());close();return value
                def advance(milliseconds):page.clock.fast_forward(milliseconds)
                def finish():
                    button=page.locator('.session-panel [data-action=finish]');is_rest=button.inner_text()=='休憩終了';button.click()
                    if not is_rest:expect(page.locator('.session-panel .is-complete')).to_be_visible()
                    advance(800);expect(page.locator('.active-session')).to_have_count(0)
                settings('data');page.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});close();advance(3000)
                taps=0
                def tap(selector):
                    nonlocal_counter[0]+=1;page.locator(selector).click()
                nonlocal_counter=[0]
                tap('.session-panel [data-action=pick]');tap('[data-action=pick-work][data-id="a0-0"]');tap('[data-action=pick-routine][data-id="r1"]');tap('[data-action=pick-work][data-id="a1-0"]');tap('[data-action=pick-work][data-id="a1-1"]');tap('#edit-dialog [data-close]')
                assert nonlocal_counter[0]==6
                expect(page.locator('.today-panel .task-row')).to_have_count(3);expect(page.locator('[data-action=begin]')).to_have_count(1)
                planned=export();assert len(planned['data']['focusPlans'])==3
                checks.append({'mobile':mobile,'morningPlanThreeTasks':{'taps':6,'typedCharacters':0},'startButtons':1})
                page.locator('.session-panel [data-action=begin]').click();expect(page.locator('.active-session')).to_have_count(1);assert len(export()['data']['logs'])==0
                advance(91000);page.locator('[data-action=pause]').click();advance(120000);page.locator('[data-action=pause]').click();advance(30000);finish()
                measured=export()['data']['logs'];assert len(measured)==1 and measured[0]['elapsedSeconds']==121
                checks[-1]['stopwatchPauseResume']='121_seconds_one_record'
                page.locator('[data-mode=pomodoro]').click();page.locator('[data-action=begin]').click();advance(35*60000);expect(page.locator('#timer-output')).to_have_text('00:35:00');expect(page.locator('#timer-extra')).to_have_text('+00:10:00');finish()
                records=export()['data']['logs'];assert len(records)==2 and records[-1]['elapsedSeconds']==2100 and records[-1]['program']=='pomodoro'
                page.locator('[data-action=break-start]').click();advance(5*60000);finish();assert len(export()['data']['logs'])==2
                checks[-1]['pomodoro']='35_minutes_including_continued_work_rest_not_counted_as_work'
                page.locator('[data-mode=timer]').click();page.locator('[data-action=timer-preset][data-minutes="45"]').click();page.locator('[data-action=begin]').click();advance(60000);expect(page.locator('#save-status')).to_contain_text('保存済み');page.reload(wait_until='domcontentloaded');expect(page.locator('#timer-output')).to_have_text('00:44:00');finish()
                records=export()['data']['logs'];assert len(records)==3 and records[-1]['elapsedSeconds']==60 and records[-1]['plannedMinutes']==25 and records[-1]['timerGoalMinutes']==45
                checks[-1]['timerReload']='goal_45_planned_25_actual_1_minute'
                nonlocal_counter[0]=0;tap('[data-action=unrecorded]');tap('[data-action=record-event][data-id="yesterday-plan"]');expect(page.locator('#log-form [name=date]')).to_have_value('2026-10-28');expect(page.locator('#log-form [name=start]')).to_have_value('18:30');tap('#log-form .primary-button');advance(1000)
                records=export()['data']['logs'];assert len(records)==4;retro=next(l for l in records if l.get('eventId')=='yesterday-plan');assert retro['date']=='2026-10-28' and retro['minutes']==30
                checks[-1]['yesterdayFromPlan']={'taps':nonlocal_counter[0],'typedCharacters':0,'presetDateStartDuration':True}
                page.locator('.session-panel [data-action=backdate]').click();field=page.locator('#log-form [name=duration]');field.evaluate('(e)=>{e.value="0";e.dispatchEvent(new Event("change",{bubbles:true}));}');page.locator('#log-form .primary-button').click();expect(page.locator('#edit-dialog')).to_be_visible();page.locator('#edit-dialog [data-close]').click();assert len(export()['data']['logs'])==4
                checks[-1]['invalidDuration']='no_record_created'
                for route in ['dashboard','tasks','review']:
                    page.locator('a[href="#'+route+'"]').click();page.locator('.layout-toggle').click()
                    blocks=page.locator('[data-layout-id]');original=blocks.first.get_attribute('data-layout-id');target=blocks.nth(1)
                    handle=blocks.first.locator('[data-layout-handle]')
                    if mobile:
                        handle.focus();page.keyboard.press('ArrowDown')
                    else:
                        box=target.bounding_box();handle.drag_to(target,target_position={'x':20,'y':box['height']-8})
                    assert blocks.nth(1).get_attribute('data-layout-id')==original,(route,original,blocks.all_text_contents())
                    page.locator('.layout-toggle').click();state=export();assert state['config']['pageOrder'][route][1]==original
                    page.reload(wait_until='domcontentloaded');assert page.locator('[data-layout-id]').nth(1).get_attribute('data-layout-id')==original
                checks[-1]['pageBlockReordering']='dashboard_tasks_records_persist_after_reload'
                page.locator('a[href="#dashboard"]').click()
                for width,height in [(320,667),(375,812),(390,844),(430,932),(768,1024),(1440,900)]:
                    page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,height)
                checks[-1]['viewportOverflow']='none_at_320_375_390_430_768_1440'
                advance(10000);time.sleep(1);prior_requests=len(backup_requests);advance(10000);time.sleep(1);assert len(backup_requests)==prior_requests,'Checkpoint requests repeat without changes'
                checks[-1]['idleFileBackupRequests']=0
                context.close()
            browser.close()
    finally:server.terminate();server.wait(timeout=5)
assert not errors,errors
result={'result':'pass','round':args.round,'journeys':checks,'pageErrors':errors,'physicalIPhoneTested':False}
(OUT/'journeys.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
