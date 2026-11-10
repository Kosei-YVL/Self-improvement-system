"""Upgrade an immutable old release with an old SW and populated storage.
Set MIGRATION_PACKET to exercise the private packet; never writes its contents to QA.
"""
import datetime,hashlib,json,os,shutil,subprocess,tempfile,time,urllib.request,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent
OLD=Path(os.environ.get('FOCUS_OLD_RELEASE','/workspace/artifacts/Focus-windows-20261028/personal'))
OUT=ROOT/'qa/focus-refinement/round3'
packet_path=Path(os.environ['MIGRATION_PACKET']);packet=json.loads(packet_path.read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
def canonical(value):
    if isinstance(value,dict):return {k:canonical(v) for k,v in value.items()}
    if isinstance(value,list):
        result=[canonical(v) for v in value]
        return sorted(result,key=lambda v:v['id']) if result and all(isinstance(v,dict) and 'id' in v for v in result) else result
    return value
with tempfile.TemporaryDirectory(prefix='focus-real-upgrade-') as temporary:
    base=Path(temporary);target=base/'既存の Focus';shutil.copytree(OLD,target/'personal');shutil.copy2(ROOT/'scripts/focus-windows-launcher.mjs',target/'focus-launcher.mjs');shutil.copy2(ROOT/'scripts/focus-paths.mjs',target/'focus-paths.mjs')
    env={**os.environ,'PORT':'4562'};env.pop('FOCUS_DATA_DIR',None);env.pop('SYNC_AUTH_HASH',None)
    def node(code):
        result=subprocess.run(['node','--input-type=module','-'],input=code,text=True,cwd=ROOT,env=env,capture_output=True,check=True);return json.loads(result.stdout.strip().splitlines()[-1])
    def control(action):return node("import {readConfig,ensureServer,stopServer} from './scripts/focus-windows-launcher.mjs';const c=await readConfig("+json.dumps(str(target))+",process.env);await "+action+"(c,{env:process.env});console.log(JSON.stringify({url:c.url,dataDir:c.dataDir}));")
    config=control('ensureServer');url=config['url'];runtime=Path(config['dataDir']);key=(runtime/'sync-key.txt').read_text().strip();errors=[];requests=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            context=browser.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');page=context.new_page();page.on('dialog',lambda d:d.accept());page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url,wait_until='domcontentloaded')
            now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)));date=now.date().isoformat();start=(now-datetime.timedelta(seconds=65))
            record={'id':'before-update-record','title':'更新前の記録','category':'learning','date':date,'start':'00:00','minutes':15,'note':'保持する','customField':{'keep':True}}
            timer={'id':'before-update-timer','mode':'stopwatch','title':'更新前の計測','category':'learning','date':start.date().isoformat(),'start':start.strftime('%H:%M'),'elapsed':0,'started':int(start.timestamp()*1000),'goal':1500000,'running':True,'routineId':'prior-routine','activityId':'prior-activity','taskTitle':'既存タスク','activityTitle':'既存作業'}
            fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[],'logs':[record],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[],'customData':{'keep':True}},'config':{'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'light','routines':[{'id':'prior-routine','title':'既存タスク','category':'learning','minutes':25,'preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'prior-activity','title':'既存作業','minutes':25}]}]},'timer':timer}
            page.locator('#settings').click();
            if page.locator('[data-settings-tab=data]').count():page.locator('[data-settings-tab=data]').click()
            page.locator('#restore').set_input_files({'name':'before.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});expect(page.locator('#notice')).to_have_text('復元しました');
            if page.locator('[data-settings-tab=connections]').count():page.locator('[data-settings-tab=connections]').click()
            page.locator('#sync-form input').fill(key);page.locator('#sync-form button').click();expect(page.locator('#sync-detail')).to_have_text('同期済み',timeout=15000);page.locator('#settings-dialog [data-close]').click()
            manual={'date':date,'start':'00:10','duration':'5','title':'入力途中','note':'残す','id':'','event':'','routine':'prior-routine','activity':'prior-activity'}
            page.evaluate("""async draft=>{const {openDeviceStore}=await import('/device-store.mjs');const s=await openDeviceStore();s.write('focus-manual-draft',JSON.stringify(draft));await s.flush();s.db.close();}""",manual)
            page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('() => !!navigator.serviceWorker.controller');old_sw=page.evaluate('navigator.serviceWorker.controller.scriptURL');page.close()
            patch=base/'patch';shutil.copytree(ROOT/'focus-sync',patch/'payload');shutil.copy2(packet_path,patch/'migration.json');files=[]
            for path in sorted((patch/'payload').rglob('*')):
                if path.is_file():name=path.relative_to(patch/'payload').as_posix();files.append({'scope':'app','path':name,'source':name,'sha256':sha(path.read_bytes())})
            for name in ['Focus.vbs','INSTALL-FOCUS.vbs','focus-paths.mjs','focus-launcher.mjs','focus.ico','FOCUS-WINDOWS.md']:files.append({'scope':'root','path':name,'source':name,'sha256':sha((patch/'payload'/name).read_bytes())})
            (patch/'update-manifest.json').write_text(json.dumps({'format':'focus-update','version':1,'id':'e2e-upgrade','environment':'personal','baseAssets':[sha((target/'personal/app-assets.json').read_bytes())],'files':files,'migration':'migration.json'}))
            module='./scripts/update-focus.mjs'
            if os.environ.get('FOCUS_UPDATE_ZIP'):
                with zipfile.ZipFile(os.environ['FOCUS_UPDATE_ZIP']) as archive:archive.extractall(base/'packaged')
                patch=base/'packaged/Focus-update';module=(patch/'updater.mjs').as_uri()
            result=node("import {applyUpdate} from "+json.dumps(module)+";console.log(JSON.stringify(await applyUpdate({target:"+json.dumps(str(target))+",packageRoot:"+json.dumps(str(patch))+",env:process.env,open:false}))); ")
            assert result['applied'] and (runtime/'sync-key.txt').read_text().strip()==key
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.on('request',lambda r:requests.append(r.url));page.goto(url.replace('/focus.html','/focus-update.html')+'#sync='+key,wait_until='domcontentloaded');expect(page.locator('#primary-nav')).to_be_visible(timeout=30000);expect(page.locator('.active-session')).to_be_visible();assert '#sync=' not in page.url and key not in page.url
            def export():
                page.locator('#settings').click();page.locator('[data-settings-tab=data]').click()
                with page.expect_download() as d:page.locator('[data-action=export]').click()
                value=json.loads(Path(d.value.path()).read_text());page.locator('#settings-dialog [data-close]').click();return value
            after=export();assert len(after['data']['logs'])==1+packet['summary']['logs'];assert next(r for r in after['data']['logs'] if r['id']==record['id'])==record
            assert after['data']['customData']=={'keep':True};assert after['config']['theme']=='light';assert after['timer']==timer;assert after['manualDraft']==manual
            assert len(after['config']['routines'])==1+packet['summary']['routines']+packet['summary']['archivedRoutines'];assert len(after['data']['sourceTables'])==packet['summary']['sourceTables']
            expect(page.locator('#sync-detail')).to_have_text('同期済み',timeout=15000)
            page.reload(wait_until='domcontentloaded');expect(page.locator('.active-session')).to_be_visible();again=export();assert again['data']==after['data'];assert again['manualDraft']==manual
            # New independent device gets the shared records and ongoing session.
            other=browser.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');second=other.new_page();second.on('pageerror',lambda e:errors.append(str(e)));second.goto(url+'#sync='+key,wait_until='domcontentloaded');expect(second.locator('.active-session')).to_be_visible(timeout=30000);expect(second.locator('#sync-detail')).to_have_count(0)
            second.locator('#settings').click();second.locator('[data-settings-tab=data]').click()
            with second.expect_download() as d:second.locator('[data-action=export]').click()
            remote=json.loads(Path(d.value.path()).read_text());assert canonical(remote['data'])==canonical(after['data']) and remote['timer']==timer;assert remote['config']['planning']==packet['backup']['config']['planning'];assert len(remote['data']['migrations'])==1
            # The server stores compressed ciphertext, never page contents as plaintext.
            auth=sha(('focus-auth-v1:'+key).encode());request=urllib.request.Request(url.replace('/focus.html','/api/focus-sync'),headers={'Authorization':'Bearer '+auth,'X-Focus-Environment':'personal'})
            envelope=json.load(urllib.request.urlopen(request))['payload'];assert envelope['version']==2 and 'ciphertext' in envelope
            page.locator('#settings').click();page.locator('[data-settings-tab=data]').click();page.locator('[data-action=backup-now]').click();expect(page.locator('#device-backup-state')).to_contain_text('保存済み',timeout=15000)
            backups=[json.loads(f.read_text()) for f in (runtime/'device-backups').glob('*/latest.json')];assert any(canonical(v['data'])==canonical(after['data']) and v.get('manualDraft')==manual for v in backups)
            assert key not in '\n'.join(requests);assert not errors,errors;browser.close()
            result={'result':'pass','oldRelease':str(OLD),'testedPackagedZip':bool(os.environ.get('FOCUS_UPDATE_ZIP')),'oldServiceWorkerPresent':bool(old_sw),'migrationLogs':packet['summary']['logs'],'existingRecordPreserved':True,'activeTimerAndDraftPreserved':True,'duplicateReload':False,'independentDeviceSync':True,'compressedEncryptedPayload':True,'fullLocalJSONCheckpoint':True,'sourceTables':packet['summary']['sourceTables'],'pageErrors':errors,'windowsNativeTested':False,'physicalIPhoneTested':False}
            (OUT/'upgrade.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
    finally:control('stopServer')
