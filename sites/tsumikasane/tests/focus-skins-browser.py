"""Synthetic PC, phone and tablet storage; actual sync server and app assets."""
import datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-connect';OUT.mkdir(parents=True,exist_ok=True);BASE='http://127.0.0.1:4563'
today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
routines=[{'id':'r'+str(i),'title':name,'minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a'+str(i),'title':'演習' if i==0 else '作業','minutes':25}]} for i,name in enumerate(['学習','制作','英語','読書','運動'])]
data={'version':2,'tasks':[],'events':[{'id':'p'+str(i),'title':r['title'],'taskId':None,'taskTitle':r['title'],'activityTitle':r['activities'][0]['title'],'routineId':r['id'],'activityId':r['activities'][0]['id'],'date':today,'start':str(9+i).zfill(2)+':00','end':str(9+i).zfill(2)+':25','category':'learning','manual':True} for i,r in enumerate(routines)],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[],'focusPlans':[{'id':'p'+str(i),'date':today,'routineId':r['id'],'activityId':r['activities'][0]['id']} for i,r in enumerate(routines)]}
fixture={'format':'focus-device','version':1,'data':data,'config':{'routines':routines,'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
errors=[];checks=[];requests=[]
def canonical(value):
    if isinstance(value,dict):return {k:canonical(v) for k,v in value.items()}
    if isinstance(value,list):
        result=[canonical(v) for v in value];return sorted(result,key=lambda v:v['id']) if result and all(isinstance(v,dict) and 'id' in v for v in result) else result
    return value
with tempfile.TemporaryDirectory(prefix='focus-three-devices-') as temporary:
    env={**os.environ,'PORT':'4563','FOCUS_DATA_DIR':temporary,'FOCUS_ENV':'personal'};env.pop('SYNC_AUTH_HASH',None)
    server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
            except OSError:time.sleep(.1)
        key=(Path(temporary)/'sync-key.txt').read_text().strip()
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);pages=[];contexts=[]
            def settings(q,tab='display'):
                if not q.locator('#settings-dialog').evaluate('e=>e.open'):q.locator('#settings').click()
                q.locator('[data-settings-tab='+tab+']').click()
            def close(q):q.locator('#settings-dialog [data-close]').click()
            def sync(q):settings(q,'connections');q.locator('[data-action=sync-now]').click();expect(q.locator('#sync-detail')).to_have_text('同期済み',timeout=20000);close(q)
            def export(q):
                settings(q,'data')
                with q.expect_download() as d:q.locator('[data-action=export]').click()
                value=json.loads(Path(d.value.path()).read_text());close(q);return value
            for name,width,height in [('desktop',1440,900),('phone',390,844),('tablet',834,1194)]:
                context=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,is_mobile=width<1000,accept_downloads=True,timezone_id='Asia/Tokyo');q=context.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.on('request',lambda r:requests.append(r.url));q.goto(BASE+'/focus.html#sync='+key,wait_until='domcontentloaded');expect(q.locator('#save-status')).to_have_text('同期済み',timeout=20000)
                if name=='desktop':
                    settings(q,'data');q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(q.locator('#notice')).to_have_text('復元しました');close(q);sync(q)
                expect(q.locator('.today-panel .task-row')).to_have_count(5);assert '#sync=' not in q.url;assert q.locator('.brand img').count()>0 and all(img.get_attribute('src')=='/icons/focus.svg' for img in q.locator('.brand img').all())
                baseline=q.locator('.today-panel').bounding_box()
                for skin in ['chrome','garnet']:
                    for theme in ['dark','light']:
                        settings(q);q.locator('#skin-mode').select_option(skin);q.locator('#theme-mode').select_option(theme);close(q);assert q.locator('html').get_attribute('data-skin')==skin
                        expect(q.locator('.today-panel .task-row')).to_have_count(5);assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
                        current=q.locator('.today-panel').bounding_box();assert abs(current['y']-baseline['y'])<1 and abs(current['height']-baseline['height'])<1
                        # Plain text contrast, with solid panel color used as a conservative base.
                        contrast=q.evaluate('''()=>{const s=getComputedStyle(document.documentElement),rgb=v=>{v=v.trim().replace('#','');return [0,2,4].map(i=>parseInt(v.slice(i,i+2),16)/255)},lum=v=>rgb(v).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>{const x=lum(s.getPropertyValue(a)),y=lum(s.getPropertyValue(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};return {text:ratio('--ink','--paper'),secondary:ratio('--muted','--paper'),button:ratio('--primary-ink','--green')};}''')
                        assert min(contrast.values())>=4.5,(skin,theme,contrast)
                        q.wait_for_function("()=>!document.querySelector('#notice').classList.contains('visible')");expect(q.locator('#save-status')).to_have_text('同期済み');q.evaluate("async skin=>{const image=new Image();image.src='/skins/'+skin+'.webp';await image.decode();}",skin);q.screenshot(path=str(OUT/(skin+'-'+theme+'-'+name+'.png')),full_page=False)
                preferred={'desktop':'garnet','phone':'chrome','tablet':'graphite'}[name];settings(q);q.locator('#skin-mode').select_option(preferred);q.locator('#theme-mode').select_option('dark');close(q);sync(q);snapshot=export(q);q.reload(wait_until='domcontentloaded');expect(q.locator('html')).to_have_attribute('data-skin',preferred);assert export(q)['data']==snapshot['data'];pages.append(q);contexts.append(context)
            pc,phone,tablet=pages
            # A single shared session follows the user; skin preferences stay device-local.
            pc.locator('[data-action=begin]').click();sync(pc);sync(phone);sync(tablet)
            expect(phone.locator('.active-session')).to_have_count(1);expect(tablet.locator('.active-session')).to_have_count(1);sessions=[export(q)['timer'] for q in pages];assert len({s['id'] for s in sessions})==1
            phone.locator('[data-action=pause]').click();sync(phone);sync(pc);sync(tablet);expect(tablet.locator('[data-action=pause]')).to_have_text('再開');tablet.locator('[data-action=pause]').click();time.sleep(1);tablet.locator('[data-action=finish]').click();expect(tablet.locator('.active-session')).to_have_count(0);sync(tablet);sync(pc);sync(phone)
            snapshots=[export(q) for q in pages];assert all(len(v['data']['logs'])==1 for v in snapshots);assert len({v['data']['logs'][0]['id'] for v in snapshots})==1;assert [v['config']['skin'] for v in snapshots]==['garnet','chrome','graphite']
            checks.append('pc_start_phone_pause_tablet_resume_finish_one_record_device_skins_independent')
            # Two disconnected devices append independently, then merge into all three.
            for context,q in [(contexts[1],phone),(contexts[2],tablet)]:
                q.evaluate('navigator.serviceWorker.ready.then(()=>true)');q.wait_for_function('()=>!!navigator.serviceWorker.controller');context.set_offline(True);q.reload(wait_until='domcontentloaded');expect(q.locator('.today-panel')).to_be_visible();q.locator('.session-panel [data-action=backdate]').click();q.locator('#log-form .primary-button').click();expect(q.locator('#edit-dialog')).not_to_be_visible()
            contexts[1].set_offline(False);sync(phone);contexts[2].set_offline(False);sync(tablet);sync(pc);sync(phone)
            snapshots=[export(q) for q in pages];assert all(len(v['data']['logs'])==3 for v in snapshots);assert all(canonical(v['data'])==canonical(snapshots[0]['data']) for v in snapshots)
            checks.append('phone_tablet_offline_append_merge_all_three_no_lost_records')
            assert not errors,errors;assert all(u.startswith((BASE+'/', 'blob:')) for u in requests);assert key not in '\n'.join(requests)
            browser.close()
    finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','optionalSkins':['chrome','garnet'],'viewports':[1440,390,834],'themes':['dark','light'],'layoutUnchanged':True,'textContrastAtLeast':4.5,'defaultConcentricLogo':True,'checks':checks,'pageErrors':errors,'externalRequests':0,'physicalWindowsIPhoneIPadTested':False,'realTailscaleConnected':False}
(OUT/'skins-three-devices.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
