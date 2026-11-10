"""Google responses are mocked; real Focus app, IndexedDB, sync server and planner are exercised."""
import copy,datetime,hashlib,json,os,secrets,subprocess,tempfile,time,urllib.request,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-google';OUT.mkdir(parents=True,exist_ok=True);BASE='http://127.0.0.1:4547'
secret=secrets.token_urlsafe(32);sha=lambda s:hashlib.sha256(s.encode()).hexdigest();auth=sha('focus-auth-v1:'+secret);checks=[];page_errors=[]
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[],'logs':[{'id':'existing-log','title':'既存の記録','category':'learning','date':'2026-10-26','start':'08:00','minutes':15,'note':'保持する記録'}],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]},'config':{'routines':[{'id':'study','title':'学習','category':'learning','minutes':25,'preferredStart':'09:00','preferredEnd':'15:00','prepareBefore':10,'prepareAfter':5,'activities':[{'id':'reading','title':'読書','minutes':25}]}],'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-google-browser-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4547','FOCUS_ENV':'personal','FOCUS_DATA_DIR':temp,'SYNC_AUTH_HASH':sha(auth)},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   if server.poll() is not None:raise RuntimeError(server.stderr.read().decode())
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.05)
  else:raise RuntimeError('Focus test server did not start')
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
   for mobile in [False,True]:
    context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1050},is_mobile=mobile,has_touch=mobile,accept_downloads=True,timezone_id='Asia/Tokyo');page=context.new_page();page.on('pageerror',lambda e:page_errors.append(str(e)));requests=[];page.on('request',lambda r:requests.append(r.url))
    page.clock.install(time=datetime.datetime(2026,10,26,0,0,tzinfo=datetime.timezone.utc));page.clock.pause_at(datetime.datetime(2026,10,26,0,0,10,tzinfo=datetime.timezone.utc))
    state={'remote':{},'publish_calls':[],'writes':0,'offline':False,'conflicts':0,'refreshes':0}
    calendars=[{'id':'primary','summary':'自分のカレンダー','primary':True,'accessRole':'owner','timeZone':'Asia/Tokyo'},{'id':'shared','summary':'共有・参照のみ','primary':False,'accessRole':'reader','timeZone':'Asia/Tokyo'}]
    foreign=[{'id':'meeting','calendarId':'primary','summary':'別の予定','status':'confirmed','start':{'dateTime':'2026-10-26T09:00:00+09:00'},'end':{'dateTime':'2026-10-26T10:00:00+09:00'},'etag':'meeting-etag','htmlLink':'https://calendar.google.com/calendar/event?eid=meeting'}, {'id':'note','calendarId':'shared','summary':'終日メモ','status':'confirmed','transparency':'transparent','start':{'date':'2026-10-26'},'end':{'date':'2026-10-27'},'etag':'note-etag','htmlLink':'https://calendar.google.com/calendar/event?eid=note'}]
    def mock(route):
     req=route.request
     if state['offline']:route.abort('internetdisconnected');return
     assert req.headers.get('authorization')=='Bearer '+auth
     assert req.headers.get('x-focus-environment')=='personal'
     path=req.url.split('/api/google/',1)[1];body=req.post_data_json if req.method=='POST' else None
     if path=='status':result={'configured':True,'connected':True,'calendars':calendars}
     elif path=='connect':result={'url':'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic'}
     elif path=='disconnect':result={'ok':True}
     elif path=='refresh':
      state['refreshes']+=1;selected=set(body['calendarIds']);result={'calendars':calendars,'events':[copy.deepcopy(e) for e in [*foreign,*state['remote'].values()] if e['calendarId'] in selected]}
     elif path=='publish':
      state['publish_calls'].append(copy.deepcopy(body));results=[];conflicts=[]
      assert body['calendarId']=='primary','Only writable target may be selected'
      for event in body['events']:
       previous=state['remote'].get(event['id']);start=event['date']+'T'+event['start']+':00+09:00';end=event['date']+'T'+event['end']+':00+09:00'
       if previous and previous.get('edited') and (event['title']!=previous['summary'] or start!=previous['start']['dateTime'] or end!=previous['end']['dateTime']):
        state['conflicts']+=1;conflicts.append({'focusId':event['id'],'googleId':previous['id'],'reason':'google_changed','htmlLink':previous['htmlLink']});continue
       state['writes']+=1;remote={'id':'g-'+event['id'],'calendarId':'primary','summary':event['title'],'status':'confirmed','start':{'dateTime':start,'timeZone':'Asia/Tokyo'},'end':{'dateTime':end,'timeZone':'Asia/Tokyo'},'etag':'etag-'+str(state['writes']),'extendedProperties':{'private':{'focusId':event['id'],'focusEnv':'personal'}},'htmlLink':'https://calendar.google.com/calendar/event?eid='+event['id']}
       state['remote'][event['id']]=remote;results.append({'focusId':event['id'],'googleId':remote['id'],'etag':remote['etag'],'htmlLink':remote['htmlLink']})
      for focus_id in body.get('removedIds',[]):
       assert focus_id not in ['meeting','note'],'Read-only external events must never be deleted'
       state['remote'].pop(focus_id,None);results.append({'focusId':focus_id,'deleted':True})
      result={'results':results,'conflicts':conflicts}
     else:raise AssertionError(path)
     route.fulfill(status=200,content_type='application/json',body=json.dumps(result,ensure_ascii=False))
    context.route('**/api/google/**',mock);page.goto(BASE+'/focus.html',wait_until='domcontentloaded')
    def settings(tab='connections'):
     if not page.locator('#settings-dialog').evaluate('e=>e.open'):page.locator('#settings').click()
     page.locator('[data-settings-tab='+tab+']').click()
    def close():page.locator('#settings-dialog [data-close]').click()
    def refresh():
     settings();page.locator('[data-action=google-refresh]').click();expect(page.locator('#google-detail')).to_have_text('Googleの予定を更新済み',timeout=10000)
    def pump(ms=1000):page.clock.fast_forward(ms);page.wait_for_timeout(150)
    def export():
     settings('data')
     with page.expect_download() as dl:page.locator('[data-action=export]').click()
     return json.loads(Path(dl.value.path()).read_text())
    # A stable synthetic backup exercises the actual import UI without touching any user data.
    settings('data');page.locator('#restore').set_input_files({'name':'synthetic-focus.json','mimeType':'application/json','buffer':json.dumps(fixture,ensure_ascii=False).encode()});expect(page.locator('#notice')).to_have_text('復元しました');settings()
    page.locator('#sync-form input').fill(secret);page.locator('#sync-form button').click();expect(page.locator('[data-action=sync-now]')).to_be_visible(timeout=15000);pump();expect(page.locator('#google-target')).to_be_visible(timeout=15000)
    expect(page.locator('[data-google-calendar]')).to_have_count(2);assert page.locator('#google-target option[value=shared]').count()==0
    expect(page.locator('#google-auto')).not_to_be_checked();assert state['publish_calls']==[]
    page.locator('#google-target').select_option('primary');page.locator('#google-auto').check();close();pump()
    expect(page.locator('.google-block')).to_have_count(1);expect(page.locator('.all-day-events')).to_contain_text('終日メモ');assert page.locator('.google-block[data-action=plan-edit]').count()==0
    page.locator('.today-panel [data-action=pick]').click();page.locator('[data-action=pick-work]').click();page.locator('#edit-dialog [data-close]').click();expect(page.locator('.today-panel')).to_contain_text('10:10–10:35');expect(page.locator('.today-panel')).to_contain_text('準備 10/5分');pump()
    page.wait_for_function('() => document.querySelector("#save-status").textContent!=="この端末に保存中"');assert state['publish_calls'],page.locator('body').inner_text()
    sent=state['publish_calls'][-1]['events'][0];focus_id=sent['id'];assert sent['start']=='10:10' and sent['end']=='10:35';assert sent['prepareBefore']==10 and sent['prepareAfter']==5
    refresh();close();expect(page.locator('.google-block')).to_have_count(1);assert len(state['remote'])==1
    writes=state['writes'];pump(2000);assert state['writes']==writes
    snapshot=export();assert snapshot['data']['logs']==fixture['data']['logs'];assert all('Google' not in str(e.get('source','')) for e in snapshot['data']['events']);assert '別の予定' not in json.dumps(snapshot,ensure_ascii=False);assert secret not in json.dumps(snapshot)
    with page.expect_download() as dl:page.locator('[data-action=portable]').click()
    with zipfile.ZipFile(dl.value.path()) as z:
     portable=json.loads(z.read('focus.json'));assert '別の予定' not in json.dumps(portable,ensure_ascii=False);assert secret not in z.read('focus.json').decode()
    page.locator('#settings-dialog').screenshot(path=str(OUT/('settings-mobile.png' if mobile else 'settings-desktop.png')));close();page.screenshot(path=str(OUT/('dashboard-mobile.png' if mobile else 'dashboard-desktop.png')),full_page=True)
    checks.append({'mobile':mobile,'read_only_busy_and_all_day':'pass','free_slot_with_preparation':'pass','auto_publish_actual_task_time':'pass','no_duplicate_unchanged':'pass','mirror_hidden':'pass','portable_excludes_calendar_cache_and_keys':'pass'})
    # Another editor moved a Focus-created Google event. Never overwrite it automatically.
    remote=state['remote'][focus_id];remote.update(summary='Googleで調整した読書',etag='google-user-edit',edited=True);remote['start']['dateTime']='2026-10-26T11:30:00+09:00';remote['end']['dateTime']='2026-10-26T11:55:00+09:00'
    refresh();pump();expect(page.locator('#google-detail')).to_have_text('Googleの変更を確認してください。',timeout=10000);expect(page.locator('[data-action=google-adopt]')).to_be_visible();assert state['conflicts']>=1
    page.locator('[data-action=google-adopt]').click();expect(page.locator('#google-detail')).to_have_text('Googleの予定を更新済み',timeout=10000);adopted=export();local=next(e for e in adopted['data']['events'] if e['id']==focus_id);assert local['start']=='11:30' and local['end']=='11:55' and local['title']=='Googleで調整した読書' and local['manual'];assert adopted['data']['logs']==fixture['data']['logs'];close();checks[-1]['external_edit_conflict_and_adoption']='pass'
    # Removal only follows an explicit Focus action and only includes the managed Focus ID.
    page.locator('.today-panel [data-action=plan-edit]').click();page.locator('#plan-form [data-action=plan-remove]').click();pump();assert any(focus_id in call.get('removedIds',[]) for call in state['publish_calls']);assert focus_id not in state['remote'];refresh();close();expect(page.locator('.google-block')).to_have_count(1);checks[-1]['explicit_owned_removal_only']='pass'
    pump(1500);page.wait_for_timeout(300);expect(page.locator('#save-status')).to_have_text('同期済み',timeout=15000)
    # The generic service worker and separately stored read-only cache support an offline reload.
    page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('() => !!navigator.serviceWorker.controller');state['offline']=True;context.set_offline(True);page.reload(wait_until='domcontentloaded');expect(page.locator('.google-block')).to_have_count(1);expect(page.locator('.all-day-events')).to_contain_text('終日メモ');expect(page.locator('.calendar-legend')).to_contain_text('保存済み');checks[-1]['offline_cached_external_calendar']='pass'
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not page_errors,page_errors;assert all(url.startswith((BASE+'/', 'blob:')) for url in requests),requests
    context.close()
   browser.close()
 finally:server.terminate();server.wait(timeout=5)
(OUT/'results.json').write_text(json.dumps({'result':'pass','checks':checks,'page_errors':page_errors,'google_api_mocked':True,'real_google_account_used':False,'real_iphone_tested':False},ensure_ascii=False,indent=2));print('Google browser integration checks passed: desktop/mobile, read-only overlay, automatic placement/publish, conflict adoption, owned removal, offline cache, portable privacy.')
