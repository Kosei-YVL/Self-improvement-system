import os,json,tempfile,subprocess,time,urllib.request,hashlib,secrets,zipfile,datetime
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parent.parent;out=root/'qa/focus-three-screen';out.mkdir(parents=True,exist_ok=True)
secret=secrets.token_urlsafe(32);sha=lambda s:hashlib.sha256(s.encode()).hexdigest();auth_hash=sha(sha('focus-auth-v1:'+secret));checks=[]
with tempfile.TemporaryDirectory(prefix='focus-three-screen-') as temp:
 servers=[]
 def server(folder,environment,port):
  env={**os.environ,'FOCUS_ENV':environment,'PORT':str(port),'FOCUS_DATA_DIR':str(Path(temp)/environment),'SYNC_AUTH_HASH':auth_hash};s=subprocess.Popen(['node','server.mjs'],cwd=root/folder,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);servers.append(s)
  for _ in range(100):
   if s.poll() is not None:raise RuntimeError(s.stderr.read().decode())
   try:urllib.request.urlopen(f'http://127.0.0.1:{port}/focus.html',timeout=.2).close();return s
   except OSError:time.sleep(.05)
  raise RuntimeError('server did not start')
 try:
  personal=server('focus-sync','personal',4545);server('focus-development','development',4546)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);contexts=[];pages=[];errors=[];requests=[]
   for mobile in [False,True]:
    c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},is_mobile=mobile,has_touch=mobile,accept_downloads=True,timezone_id='Asia/Tokyo');contexts.append(c);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.on('request',lambda r:requests.append(r.url));page.clock.install(time=datetime.datetime(2026,10,26,0,0,tzinfo=datetime.timezone.utc));page.clock.pause_at(datetime.datetime(2026,10,26,0,0,10,tzinfo=datetime.timezone.utc));page.goto('http://127.0.0.1:4545/focus.html',wait_until='domcontentloaded');pages.append(page)
   q,r=pages;a,c=contexts
   def settings(page,tab='connections'):
    if not page.locator('#settings-dialog').evaluate('e=>e.open'):page.locator('#settings').click()
    page.locator('[data-settings-tab='+tab+']').click()
   def close(page):page.locator('#settings-dialog [data-close]').click()
   def sync(page):settings(page);page.locator('[data-action=sync-now]').click();expect(page.locator('#sync-detail')).to_have_text('同期済み',timeout=15000);close(page)
   def connect(page):settings(page);page.locator('#sync-form input').fill(secret);page.locator('#sync-form button').click();expect(page.locator('#sync-detail')).to_have_text('同期済み',timeout=15000);close(page)
   def field(page,selector,value):page.locator(selector).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("change",{bubbles:true}));}',str(value))
   assert q.locator('#primary-nav a').count()==3
   q.locator('a[href="#tasks"]').click();q.locator('[data-action=task-new]').first.click();q.locator('#task-form [name=title]').fill('学習');q.locator('#task-form [name=prepareBefore]').fill('10');q.locator('#task-form [name=prepareAfter]').fill('10');field(q,'#task-form [name=preferredEnd]','12:00');q.locator('#task-form .primary-button').click()
   for name,minutes in [('読書',25),('演習',20)]:
    q.locator('#edit-dialog [data-action=activity-add]').click();q.locator('#activity-form [name=title]').fill(name);field(q,'#activity-form [name=minutes]',minutes);q.locator('#activity-form .primary-button').click()
   q.locator('#edit-dialog [data-close]').click();connect(q);connect(r);checks.append('three_navigation_pages_and_registered_task_activity_selection')
   q.locator('a[href="#dashboard"]').click();q.locator('.session-panel [data-action=pick]').click();q.locator('[data-action=pick-work]').filter(has_text='読書').click();q.locator('#edit-dialog [data-close]').click();expect(q.locator('.today-panel')).to_contain_text('09:10–09:35');expect(q.locator('.today-panel')).to_contain_text('準備 10/10分');sync(q);sync(r);expect(r.locator('.today-panel .row')).to_have_count(1);checks.append('selection_places_work_without_prompt_respects_time_window_and_buffers')
   q.locator('.session-panel [data-action=begin]').click();expect(q.locator('#timer-output')).to_have_text('00:00:00');expect(q.locator('[data-card=logs] .row')).to_have_count(0);sync(q);sync(r);expect(r.locator('.active-session')).to_have_count(1);checks.append('start_creates_session_not_log_and_handoffs_to_other_device')
   for page in pages:page.clock.fast_forward(61000)
   r.reload(wait_until='domcontentloaded');expect(r.locator('#timer-output')).to_have_text('00:01:01');r.screenshot(path=str(out/'timer-mobile.png'),full_page=True);r.locator('[data-action=pause]').click();sync(r);sync(q);expect(q.locator('[data-action=pause]')).to_have_text('再開')
   for page in pages:page.clock.fast_forward(120000)
   expect(q.locator('#timer-output')).to_have_text('00:01:01');q.locator('[data-action=pause]').click();sync(q);sync(r)
   for page in pages:page.clock.fast_forward(30000)
   r.locator('[data-action=finish]').click();r.clock.fast_forward(800);sync(r);sync(q);expect(q.locator('.active-session')).to_have_count(0);expect(q.locator('[data-card=logs] .row')).to_have_count(1);checks.append('reload_sleep_time_pause_resume_cross_device_finish_one_record')
   q.locator('.session-panel [data-action=pick]').click();q.locator('[data-action=pick-work]').filter(has_text='読書').click();q.locator('#edit-dialog [data-close]').click();sync(q);sync(r);expect(q.locator('.today-panel .task-row, .today-panel .completed-row')).to_have_count(2);checks.append('completed_activity_can_be_selected_again_as_new_plan')
   q.locator('.session-panel [data-action=backdate]').click();q.locator('[data-action=log-yesterday]').click();field(q,'#log-form [name=start]','08:30');field(q,'#log-form [name=duration]',10);q.locator('#log-form .primary-button').click();sync(q);sync(r)
   q.locator('a[href="#review"]').click();expect(q.locator('.thirty-days .block')).to_have_count(30);expect(q.locator('.review-records .row')).to_have_count(2);q.locator('#review-mode').select_option('year');expect(q.locator('.year-grid button')).to_have_count(12);q.locator('#review-mode').select_option('week');expect(q.locator('.review-records .row')).to_have_count(1);q.locator('#review-mode').select_option('month');checks.append('backdate_without_new_page_week_month_year_and_thirty_day_heatmap')
   for context,page,title in [(a,q,'PCの追記'),(c,r,'スマホの追記')]:
    page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('() => !!navigator.serviceWorker.controller');context.set_offline(True);page.locator('a[href="#dashboard"]').click();page.locator('.session-panel [data-action=backdate]').click();page.locator('#log-form [name=title]').fill(title);page.locator('#log-form .primary-button').click()
   a.set_offline(False);sync(q);c.set_offline(False);sync(r);sync(q);q.locator('a[href="#review"]').click();expect(q.locator('.review-records .row')).to_have_count(4);checks.append('independent_offline_records_merge_without_loss')
   settings(q,'data')
   with q.expect_download() as dl:q.locator('[data-action=portable]').click()
   files=zipfile.ZipFile(dl.value.path());backup=json.loads(files.read('focus.json'));assert len(backup['data']['logs'])==4;assert len(backup['config']['routines'][0]['activities'])==2;assert secret not in files.read('focus.json').decode();measured=next(l for l in backup['data']['logs'] if l.get('timerId'));assert measured['elapsedSeconds']==91 and measured['minutes']==2;assert measured['plannedPreparationBefore']==10 and measured['plannedMinutes']==25
   # Direct block customization and the appearance setting survive reload.
   close(q);q.locator('a[href="#dashboard"]').click();q.locator('.layout-toggle').click();blocks=q.locator('[data-layout-id]');original=blocks.first.get_attribute('data-layout-id');blocks.first.locator('[data-layout-handle]').focus();q.keyboard.press('ArrowDown');q.locator('.layout-toggle').click();settings(q,'display');q.locator('#theme-mode').select_option('light');close(q);q.reload(wait_until='domcontentloaded');expect(q.locator('[data-layout-id]').nth(1)).to_have_attribute('data-layout-id',original);assert q.locator('html').get_attribute('data-theme')=='light';checks.append('portable_asset_contains_context_actual_seconds_and_stable_ids_no_key')
   for page in pages:
    for tab in ['dashboard','tasks','review']:
     page.locator('a[href="#'+tab+'"]').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/(tab+('-mobile' if page==r else '-desktop')+'.png')),full_page=True)
   for width in [320,375,768]:
    r.set_viewport_size({'width':width,'height':844})
    for tab in ['dashboard','tasks','review']:r.locator('a[href="#'+tab+'"]').click();assert r.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,tab)
   checks.append('desktop_mobile_320_375_390_768_layout_no_overflow')
   dev=a.new_page();dev.goto('http://127.0.0.1:4546/focus.html',wait_until='domcontentloaded');expect(dev.locator('.environment-label')).to_have_text('開発');expect(dev.locator('.today-panel .row')).to_have_count(0);assert 'focus-development-v1' in dev.evaluate('indexedDB.databases().then(d=>d.map(x=>x.name))');checks.append('development_data_isolated')
   # Two disconnected starts are resolved explicitly; neither silently replaces the other.
   for context,page in [(a,q),(c,r)]:
    context.set_offline(True);page.locator('a[href="#dashboard"]').click();page.locator('.session-panel [data-action=begin]').click()
   a.set_offline(False);sync(q);c.set_offline(False);settings(r);r.locator('[data-action=sync-now]').click();expect(r.locator('#sync-detail')).to_have_text('同期の競合・設定で確認',timeout=15000)
   with r.expect_download():r.locator('[data-action=sync-local]').click()
   expect(r.locator('#sync-detail')).to_have_text('同期済み',timeout=15000);close(r);r.locator('[data-action=finish]').click();r.clock.fast_forward(800);sync(r);sync(q);checks.append('competing_offline_sessions_require_resolution_no_duplicate_finish')
   personal.terminate();personal.wait(timeout=5);subprocess.run(['node','scripts/build-focus-sync.mjs'],cwd=root,check=True,stdout=subprocess.DEVNULL);personal=server('focus-sync','personal',4545);q.reload(wait_until='domcontentloaded');sync(q);q.locator('a[href="#review"]').click();expect(q.locator('.review-records .row')).to_have_count(5);checks.append('rebuild_and_server_restart_keep_data')
   assert all(url.startswith(('http://127.0.0.1:4545/','http://127.0.0.1:4546/','blob:')) for url in requests),requests;assert not errors,errors;b.close()
 finally:
  for s in servers:
   if s.poll() is None:s.terminate();s.wait(timeout=5)
(out/'results.json').write_text(json.dumps({'result':'pass','checks':checks,'page_errors':errors,'external_requests':0,'real_iphone_tested':False,'cloud_deployed':False},ensure_ascii=False,indent=2));print(json.dumps(checks,ensure_ascii=False))
