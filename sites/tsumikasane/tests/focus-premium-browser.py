"""Synthetic data only. All skin/theme/device combinations and error recovery."""
import datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-premium';OUT.mkdir(parents=True,exist_ok=True);BASE='http://127.0.0.1:4573'
catalog=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {SKINS} from './web/focus-skins.mjs';console.log(JSON.stringify(SKINS));"],cwd=ROOT));today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
routines=[{'id':'r'+str(i),'title':n,'minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a'+str(i),'title':'演習','minutes':25}]} for i,n in enumerate(['学習','制作','読書'])]
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]},'config':{'routines':routines,'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
errors=[];checks=[];states=[];requests=[]
with tempfile.TemporaryDirectory(prefix='focus-premium-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=Path(os.environ.get('FOCUS_TEST_APP_DIR',ROOT/'focus-sync')),env={**os.environ,'PORT':'4573','FOCUS_DATA_DIR':temp,'FOCUS_ENV':'personal'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
   for name,w,h in [('desktop',1440,900),('phone',390,844),('tablet',834,1194)]:
    ctx=browser.new_context(viewport={'width':w,'height':h},has_touch=w<1000,is_mobile=w<1000,timezone_id='Asia/Tokyo',accept_downloads=True);q=ctx.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('request',lambda r:requests.append(r.url));q.on('dialog',lambda d:d.accept());q.goto(BASE+'/focus.html',wait_until='domcontentloaded')
    def settings(tab='display'):
     if not q.locator('#settings-dialog').evaluate('e=>e.open'):q.locator('#settings').click()
     q.locator('[data-settings-tab='+tab+']').click()
    def close():q.locator('#settings-dialog [data-close]').click()
    def export():
     settings('data')
     with q.expect_download() as d:q.locator('[data-action=export]').click()
     v=json.loads(Path(d.value.path()).read_text());close();return v
    settings('data');q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});close()
    q.locator('.session-panel [data-action=pick]').click()
    for i in range(3):q.locator('#edit-dialog [data-action=pick-routine][data-id=r'+str(i)+']').click();q.locator('[data-action=pick-work][data-id=a'+str(i)+']').click()
    q.locator('[data-action=picker-done]').click();expect(q.locator('.today-panel .task-row')).to_have_count(3);domain=export()['data']
    manifest=q.request.get(BASE+'/manifest.webmanifest').json();assert manifest['name']=='Focus' and manifest['display']=='standalone' and len(manifest['shortcuts'])==3
    assert q.locator('meta[name=apple-mobile-web-app-capable]').get_attribute('content')=='yes'
    settings();q.locator('[data-action=skin-gallery]').click();expect(q.locator('.skin-choice')).to_have_count(20);q.locator('#detail-dialog').screenshot(path=str(OUT/('gallery-'+name+'.png')));q.locator('#detail-dialog [data-close]').click();close()
    for s in catalog:
     for theme in ['dark','light']:
      settings();q.locator('#skin-mode').select_option(s['id']);q.locator('#theme-mode').select_option(theme);close();expect(q.locator('html')).to_have_attribute('data-skin',s['id']);expect(q.locator('.today-panel .task-row')).to_have_count(3)
      assert q.evaluate('document.documentElement.scrollWidth<=innerWidth'),(name,s['id'],theme)
      assert q.locator('html').get_attribute('data-glass')==('on' if s['glass'] else 'off')
      assert q.locator('meta[name=theme-color]').get_attribute('content')==s[theme][0]
      q.screenshot(path=str(OUT/(s['id']+'-'+theme+'-'+name+'.png')))
      states.append({'device':name,'skin':s['id'],'theme':theme})
    assert export()['data']==domain,'Skin selection must not change any record or plan'
    settings();q.locator('[data-action=skin-gallery]').click();q.locator('.skin-choice[data-id=opium]').click();expect(q.locator('.skin-choice[data-id=opium]')).to_have_attribute('aria-pressed','true');q.locator('#detail-dialog [data-close]').click();close();q.reload(wait_until='domcontentloaded');expect(q.locator('html')).to_have_attribute('data-skin','opium')
    q.locator('[data-action=begin]').click();expect(q.locator('.active-session')).to_be_visible();time.sleep(.15);q.locator('[data-action=discard]').click();q.locator('.notice-action').click();expect(q.locator('.active-session')).to_be_visible();expect(q.locator('[data-action=pause]')).to_have_text('再開');assert export()['data']['logs']==[]
    q.locator('[data-action=pause]').click();expect(q.locator('[data-action=finish]')).to_be_enabled();q.locator('[data-action=finish]').evaluate('(b)=>{b.click();b.click();b.click()}');expect(q.locator('.active-session')).to_have_count(0);assert len(export()['data']['logs'])==1
    q.evaluate('navigator.serviceWorker.ready.then(()=>true)');q.wait_for_function('()=>!!navigator.serviceWorker.controller');ctx.set_offline(True);q.reload(wait_until='domcontentloaded');expect(q.locator('html')).to_have_attribute('data-skin','opium');assert len(export()['data']['logs'])==1
    ctx.set_offline(False);checks.append(name+'_cancel_undo_pause_resume_finish_once_reload_offline');ctx.close()
   # A real IndexedDB transaction abort must never display the success checkmark.
   ctx=browser.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');q=ctx.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE+'/focus.html',wait_until='domcontentloaded');settings('data');q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});close();q.locator('.session-panel [data-action=pick]').click();q.locator('[data-action=pick-work]').first.click();q.locator('[data-action=picker-done]').click();q.locator('[data-action=begin]').click();expect(q.locator('#save-status')).to_have_text('この端末に保存済み')
   q.evaluate('''()=>{const original=IDBDatabase.prototype.transaction;window.abortFocusWrites=true;IDBDatabase.prototype.transaction=function(...a){const tx=original.apply(this,a);if(a[1]==='readwrite'&&window.abortFocusWrites)queueMicrotask(()=>{try{tx.abort()}catch{}});return tx;};}''')
   q.locator('[data-action=finish]').click();expect(q.locator('#save-status')).to_contain_text('保存できません');expect(q.locator('.is-complete,.completion-burst')).to_have_count(0);assert len(export()['data']['logs'])==1
   q.evaluate('window.abortFocusWrites=false');q.locator('.today-panel [data-action=pick]').click();q.locator('[data-action=pick-work]').first.click();q.locator('[data-action=picker-done]').click();expect(q.locator('#save-status')).to_have_text('この端末に保存済み');q.reload(wait_until='domcontentloaded');assert len(export()['data']['logs'])==1;checks.append('aborted_indexeddb_no_false_success_export_preserved_retry_one_record')
   assert not errors,errors;assert all(u.startswith((BASE+'/', 'blob:')) for u in requests);browser.close()
 finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','skins':20,'themes':['dark','light'],'viewports':[1440,390,834],'skinDeviceStates':len(states),'checks':checks,'recordDataUnchangedBySkin':True,'pageErrors':errors,'externalRequests':0,'physicalDevicesTested':False};(OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
