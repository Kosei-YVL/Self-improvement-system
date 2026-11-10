import os,json,tempfile,subprocess,time,urllib.request,hashlib,secrets,zipfile,io
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parent.parent;out=root/'qa/focus-sync';out.mkdir(parents=True,exist_ok=True)
secret=secrets.token_urlsafe(32);sha=lambda s:hashlib.sha256(s.encode()).hexdigest();auth=sha('focus-auth-v1:'+secret);auth_hash=sha(auth)
checks=[]
with tempfile.TemporaryDirectory(prefix='focus-device-sync-') as temp:
 servers=[]
 def start(folder,envname,port):
  env={**os.environ,'FOCUS_ENV':envname,'PORT':str(port),'FOCUS_DATA_DIR':str(Path(temp)/envname),'SYNC_AUTH_HASH':auth_hash};s=subprocess.Popen(['node','server.mjs'],cwd=root/folder,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);servers.append(s)
  for _ in range(100):
   if s.poll() is not None:raise RuntimeError(s.stderr.read().decode())
   try:urllib.request.urlopen(f'http://127.0.0.1:{port}/focus.html',timeout=.2).close();return s
   except OSError:time.sleep(.05)
  raise RuntimeError('server did not start')
 try:
  personal=start('focus-sync','personal',4545);dev=start('focus-development','development',4546)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);a=b.new_context(viewport={'width':1440,'height':1000},accept_downloads=True,timezone_id='Asia/Tokyo');c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True,timezone_id='Asia/Tokyo');q=a.new_page();r=c.new_page();errors=[]
   for page in [q,r]:page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:4545/focus.html',wait_until='networkidle')
   def settings(page):
    if not page.locator('#settings-dialog').evaluate('e=>e.open'):page.locator('#settings').click()
   def close(page):page.locator('#settings-dialog [data-close]').click()
   def connect(page):
    settings(page);page.locator('#sync-form input').fill(secret);page.locator('#sync-form button').click();expect(page.locator('#sync-detail')).to_have_text('同期済み',timeout=15000);close(page)
   def sync(page):
    settings(page);page.locator('[data-action=sync-now]').click();expect(page.locator('#sync-detail')).to_have_text('同期済み',timeout=15000);close(page)
   settings(q);q.locator('#routine-form [name=title]').fill('読書');q.locator('#routine-form button').click();connect(q);connect(r);expect(r.locator('[data-action=select-routine]')).to_have_count(1)
   q.locator('[data-action=select-routine]').click();q.locator('#content').fill('共通');q.locator('#capture-form button[type=submit]').click();sync(q);sync(r);expect(r.locator('.logs .row')).to_have_count(1);checks.append('routine_and_record_pc_to_mobile')
   for context,page,title in [(a,q,'PCオフライン'),(c,r,'スマホオフライン')]:
    page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('!!navigator.serviceWorker.controller');context.set_offline(True);page.reload(wait_until='domcontentloaded');page.locator('#content').fill(title);page.locator('#capture-form button[type=submit]').click();expect(page.locator('.logs .row')).to_have_count(2)
   a.set_offline(False);sync(q);c.set_offline(False);sync(r);sync(q);expect(q.locator('.logs .row')).to_have_count(3);expect(r.locator('.logs .row')).to_have_count(3);checks.append('offline_reload_independent_additions_merge_without_loss')
   for context,page,title in [(a,q,'PCによる編集'),(c,r,'スマホによる編集')]:
    context.set_offline(True);page.locator('.logs .row').filter(has_text='共通').locator('[data-action=log-edit]').click();page.locator('#content').fill(title);page.locator('#capture-form button[type=submit]').click()
   a.set_offline(False);sync(q);c.set_offline(False);expect(r.locator('#save-status')).to_have_text('同期の競合・設定で確認',timeout=15000);settings(r)
   # The decision only affects conflicting fields; independently added records survive.
   with r.expect_download():r.locator('[data-action=sync-remote]').click()
   expect(r.locator('#sync-detail')).to_have_text('同期済み',timeout=15000);close(r);expect(r.locator('.logs .row').filter(has_text='PCによる編集')).to_have_count(1);expect(r.locator('.logs .row')).to_have_count(3);checks.append('same_field_conflict_requires_choice_preserves_other_records')
   settings(r)
   with r.expect_download() as dl:r.locator('[data-action=portable-export]').click()
   archive=zipfile.ZipFile(dl.value.path());backup=json.loads(archive.read('focus.json'));assert len(backup['data']['logs'])==3;assert secret not in archive.read('focus.json').decode();assert 'records.csv' in archive.namelist();close(r);checks.append('portable_zip_full_data_without_sync_key')
   page=a.new_page();page.goto('http://127.0.0.1:4546/focus.html',wait_until='networkidle');expect(page.locator('.environment-label')).to_have_text('開発');expect(page.locator('.logs .row')).to_have_count(0)
   names=page.evaluate('indexedDB.databases().then(d=>d.map(x=>x.name))');assert 'focus-development-v1' in names and 'tsumikasane-device-v1' not in names
   settings(page);page.locator('#routine-form [name=title]').fill('開発専用');page.locator('#routine-form button').click();close(page);expect(q.locator('[data-action=select-routine]')).to_have_count(1);checks.append('development_origin_indexeddb_and_server_database_separate')
   settings(q);q.screenshot(path=str(out/'desktop-settings.png'));close(q);r.screenshot(path=str(out/'mobile.png'),full_page=True);assert r.evaluate('document.documentElement.scrollWidth<=innerWidth')
   personal.terminate();personal.wait(timeout=5);subprocess.run(['node','scripts/build-focus-sync.mjs'],cwd=root,check=True,stdout=subprocess.DEVNULL);personal=start('focus-sync','personal',4545);q.reload(wait_until='networkidle');sync(q);expect(q.locator('.logs .row')).to_have_count(3);checks.append('server_restart_and_rebuild_preserve_existing_data')
   assert not errors,errors;b.close()
 finally:
  for s in servers:
   if s.poll() is None:s.terminate();s.wait(timeout=5)
(out/'results.json').write_text(json.dumps({'result':'pass','checks':checks,'page_errors':errors,'real_iphone_tested':False,'cloud_deployed':False},ensure_ascii=False,indent=2));print(json.dumps(checks,ensure_ascii=False))
