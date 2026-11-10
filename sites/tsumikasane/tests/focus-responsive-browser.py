"""Check the exact shipped app at responsive boundaries, dialogs and landscape sizes."""
import datetime,json,os,re,shutil,subprocess,tempfile,time,urllib.request,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-responsive';OUT.mkdir(parents=True,exist_ok=True);BASE='http://127.0.0.1:4564'
widths=[280,300,319,320,321,360,375,390,414,430,539,540,541,600,639,640,641,759,760,761,767,768,820,834,900,999,1000,1001,1024,1180,1194,1249,1250,1251,1280,1366,1440,1600,1920,2560,3440,3840]
today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
routines=[{'id':'r'+str(i),'title':('大学の実験とレポート準備' if i%2==0 else 'UnbrokenLongTaskName')*7,'minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':10,'prepareAfter':5,'activities':[{'id':'a'+str(i)+'-'+str(j),'title':('登録済みの長いやること' if j==0 else 'VeryLongActivityTitle')*7,'minutes':25} for j in range(3)]} for i in range(5)]
events=[{'id':'p'+str(i),'title':r['title'],'taskId':None,'taskTitle':r['title'],'activityTitle':r['activities'][0]['title'],'routineId':r['id'],'activityId':r['activities'][0]['id'],'date':today,'start':str(9+i).zfill(2)+':00','end':str(9+i).zfill(2)+':25','category':'learning','manual':True} for i,r in enumerate(routines)]
data={'version':2,'tasks':[],'events':events,'logs':[{'id':'log1','title':'LongUnbrokenRecordedTaskName'*15,'date':today,'start':'00:00','minutes':25,'category':'learning','note':'記録のメモ'*100}],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[],'focusPlans':[{'id':e['id'],'date':today,'routineId':e['routineId'],'activityId':e['activityId']} for e in events]}
fixture={'format':'focus-device','version':1,'data':data,'config':{'routines':routines,'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
checks=[];failures=[];errors=[]
with tempfile.TemporaryDirectory(prefix='focus-widths-') as temporary:
    directory=Path(temporary);app=directory/'app';app.mkdir()
    if os.environ.get('FOCUS_TEST_APP_DIR'):shutil.copytree(os.environ['FOCUS_TEST_APP_DIR'],app,dirs_exist_ok=True)
    else:
     with zipfile.ZipFile(os.environ.get('FOCUS_TEST_ZIP','/workspace/artifacts/Focus-connect-skins-20261029.zip')) as archive:
        for entry in archive.infolist():
            if entry.filename.startswith('Focus-update/payload/') and not entry.is_dir():
                target=app/entry.filename.removeprefix('Focus-update/payload/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(entry))
    server=subprocess.Popen(['node','server.mjs'],cwd=app,env={**os.environ,'PORT':'4564','FOCUS_DATA_DIR':str(directory/'data'),'FOCUS_ENV':'personal'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as p:
            b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);c=b.new_context(viewport={'width':1440,'height':900},has_touch=True,accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE+'/focus.html',wait_until='domcontentloaded')
            q.locator('#settings').click();q.locator('[data-settings-tab=data]').click();q.locator('#restore').set_input_files({'name':'long-text.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click();expect(q.locator('.today-panel .task-row')).to_have_count(5)
            def inspect(name):
                state=q.evaluate('''()=>{const dialog=[...document.querySelectorAll('dialog[open]')].at(-1),root=dialog||document.documentElement;const r=dialog?.getBoundingClientRect();const bad=[...root.querySelectorAll('button,input:not([type=hidden]),select')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.left<-.5||b.right>innerWidth+.5)}).map(e=>({tag:e.tagName,id:e.id,action:e.dataset.action,width:Math.round(e.getBoundingClientRect().width)}));return {width:innerWidth,height:innerHeight,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,dialogOverflow:!!dialog&&dialog.scrollWidth>dialog.clientWidth+1,dialogOutside:!!r&&(r.left<-.5||r.right>innerWidth+.5),badControls:bad};}''')
                item={'view':name,**state};checks.append(item);(OUT/'progress.json').write_text(json.dumps({'checkedStates':len(checks),'failures':failures},ensure_ascii=False))
                if state['pageOverflow'] or state['dialogOverflow'] or state['dialogOutside'] or state['badControls']:
                    failures.append(item);(OUT/'failures-live.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2))
                    if len(failures)<=8:q.screenshot(path=str(OUT/('failure-'+str(len(failures))+'.png')),full_page=True)
            for route in ['dashboard','tasks','review']:
                q.locator('a[href="#'+route+'"]').click()
                for width in widths:q.set_viewport_size({'width':width,'height':844 if width<=760 else 900});inspect(route)
            q.locator('a[href="#dashboard"]').click();q.locator('.session-panel [data-action=begin]').click()
            for width in widths:q.set_viewport_size({'width':width,'height':844});inspect('active-timer')
            q.locator('[data-action=finish]').click();expect(q.locator('.active-session')).to_have_count(0)
            for width in [280,320,375,540,760,761,834,1024,1440,2560]:
                q.set_viewport_size({'width':width,'height':844});q.locator('#settings').click()
                for tab in ['display','data','connections','help']:q.locator('[data-settings-tab='+tab+']').click();inspect('settings-'+tab)
                q.locator('#settings-dialog [data-close]').click();q.locator('a[href="#dashboard"]').click();q.locator('.session-panel [data-action=backdate]').click();inspect('record')
                q.locator('#log-form [name=start] + .wheel-trigger').click();inspect('start-wheel');q.locator('#wheel-picker .wheel-close').click();q.locator('#edit-dialog [data-close]').click()
                q.locator('.today-panel [data-action=pick]').click();inspect('task-picker');q.locator('#edit-dialog [data-close]').click()
                q.locator('a[href="#tasks"]').click();q.locator('[data-action=task-edit]').first.click();inspect('task-editor');q.locator('#edit-dialog [data-close]').click()
            for width,height in [(568,320),(667,375),(844,390),(1024,768),(1194,834),(1366,768),(1920,1080)]:
                q.set_viewport_size({'width':width,'height':height})
                for route in ['dashboard','tasks','review']:q.locator('a[href="#'+route+'"]').click();inspect('landscape-'+route)
                q.locator('.session-panel [data-action=backdate]').click() if q.locator('.session-panel').count() else q.locator('a[href="#dashboard"]').click()
                if not q.locator('#edit-dialog').evaluate('e=>e.open'):q.locator('.session-panel [data-action=backdate]').click()
                inspect('landscape-record');q.locator('#edit-dialog [data-close]').click()
            b.close()
    finally:server.terminate();server.wait(timeout=5)
result={'result':'pass' if not failures and not errors else 'fail','testedShippedZip':not bool(os.environ.get('FOCUS_TEST_APP_DIR')),'widths':widths,'checkedStates':len(checks),'failures':failures,'pageErrors':errors,'physicalSafariTested':False};(OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({**result,'failures':result['failures'][:4]},ensure_ascii=False,indent=2));assert not failures and not errors
