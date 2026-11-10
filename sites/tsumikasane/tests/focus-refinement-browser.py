import argparse,datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--round',type=int,required=True);args=parser.parse_args()
OUT=ROOT/'qa/focus-refinement'/('round'+str(args.round));OUT.mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
data={'version':2,'tasks':[],'events':[],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'logs':[],'events':[]},'sourceTables':[],'focusPlans':[]}
names=['学習','制作','英語','読書','運動','生活']
routines=[{'id':'r'+str(i),'title':name,'minutes':25,'category':'learning','preferredStart':'05:30','preferredEnd':'22:00','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a'+str(i)+'-'+str(j),'title':('演習' if i==0 else '作業')+str(j+1),'minutes':25} for j in range(12)]} for i,name in enumerate(names)]
for i in range(5):
    data['focusPlans'].append({'id':'p'+str(i),'date':'2026-10-29','routineId':routines[i]['id'],'activityId':routines[i]['activities'][0]['id']})
    data['events'].append({'id':'p'+str(i),'title':names[i]+' · '+routines[i]['activities'][0]['title'],'category':'learning','date':'2026-10-29','start':str(9+i).zfill(2)+':00','end':str(9+i).zfill(2)+':25','taskId':None,'note':'','routineId':routines[i]['id'],'activityId':routines[i]['activities'][0]['id'],'taskTitle':names[i],'activityTitle':routines[i]['activities'][0]['title'],'manual':True})
data['events'].append({'id':'yesterday-plan','title':'英語 · 昨日の学習','category':'learning','date':'2026-10-28','start':'18:30','end':'19:00','taskId':None,'routineId':'r2','activityId':'a2-0','taskTitle':'英語','activityTitle':'昨日の学習','manual':True})
fixture={'format':'focus-device','version':1,'data':data,'config':{'template':'focus','order':['capture','plan','progress','logs'],'routines':routines,'progress':'calendar','theme':'dark'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-refinement-browser-') as temp:
    server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4557','FOCUS_ENV':'personal','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:urllib.request.urlopen('http://127.0.0.1:4557/focus.html',timeout=.2).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
            for width in [1440,390]:
                context=browser.new_context(viewport={'width':width,'height':900 if width==1440 else 844},is_mobile=width<500,has_touch=width<500,accept_downloads=True,timezone_id='Asia/Tokyo')
                page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)));page.clock.install(time=datetime.datetime(2026,10,29,0,0,tzinfo=datetime.timezone.utc));page.clock.pause_at(datetime.datetime(2026,10,29,0,0,5,tzinfo=datetime.timezone.utc))
                page.goto('http://127.0.0.1:4557/focus.html',wait_until='domcontentloaded');page.locator('#settings').click();page.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});page.locator('#settings-dialog [data-close]').click()
                expect(page.locator('.today-panel .row')).to_have_count(5);page.clock.fast_forward(3000);expect(page.locator('#save-status')).to_contain_text('保存済み')
                metric=page.evaluate('''()=>{const timer=document.querySelector('.session-panel').getBoundingClientRect(),tasks=document.querySelector('.today-panel').getBoundingClientRect();return {viewportWidth:innerWidth,viewportHeight:innerHeight,timerHeight:timer.height,tasksBottom:tasks.bottom,timerAndTasksFit:Math.max(timer.bottom,tasks.bottom)<innerHeight-70,startButtons:document.querySelectorAll('[data-action=begin]').length,documentHeight:document.documentElement.scrollHeight,horizontalOverflow:document.documentElement.scrollWidth>innerWidth};}''')
                metric['unrecordedPlanShortcut']=page.locator('[data-action=unrecorded]').count()>0
                assert not metric['horizontalOverflow']
                page.screenshot(path=str(OUT/('dashboard-'+('mobile' if width<500 else 'desktop')+'.png')),full_page=False)
                page.locator('.session-panel [data-action=backdate]').click();metric['recordButtonNeedsScroll']=page.locator('#log-form .primary-button').evaluate('(e)=>e.getBoundingClientRect().bottom>innerHeight-20');page.locator('[data-action=log-yesterday]').click();page.locator('#log-form .primary-button').click();expect(page.locator('#edit-dialog')).not_to_be_visible()
                metric['retrospectivePresetTaps']=3;metric['recordTypedCharacters']=0
                page.locator('a[href="#review"]').click();expect(page.locator('.review-records .row')).to_have_count(1);page.screenshot(path=str(OUT/('records-'+('mobile' if width<500 else 'desktop')+'.png')),full_page=True)
                page.locator('a[href="#tasks"]').click();page.screenshot(path=str(OUT/('tasks-'+('mobile' if width<500 else 'desktop')+'.png')),full_page=True)
                checks.append(metric);context.close()
            browser.close()
    finally:server.terminate();server.wait(timeout=5)
result={'round':args.round,'checks':checks,'pageErrors':errors,'physicalIPhoneTested':False}
(OUT/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));assert not errors
