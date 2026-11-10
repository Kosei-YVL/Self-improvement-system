import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4545'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':1366,'height':900},timezone_id='Asia/Tokyo',accept_downloads=True)
    page=context.new_page();requests=[];errors=[]
    page.on('request',lambda r:requests.append((r.method,r.url)));page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE,wait_until='networkidle')
    expect(page.locator('body')).to_have_attribute('data-storage-mode','device');expect(page.locator('#device-save-status')).to_have_text('この端末に保存済み')
    assert page.request.get(BASE+'/api/data').status==404
    assert page.request.post(BASE+'/api/data',data='test').status==405
    assert page.request.get(BASE+'/style.css').text().startswith(':root')
    page.locator('.heading-actions [data-action="new-task"]').click();page.locator('#field-title').fill('端末内だけに保存するテスト');page.locator('button[type=submit]').click()
    expect(page.locator('#device-save-status')).to_have_text('この端末に保存済み')
    task=page.locator('.task-row').filter(has_text='端末内だけに保存するテスト');task.locator('[data-action="toggle-task"]').click();expect(page.locator('#device-save-status')).to_have_text('この端末に保存済み')
    # Domain data is in IndexedDB rather than browser localStorage or a server DB.
    stored=page.evaluate("""()=>new Promise((resolve,reject)=>{const r=indexedDB.open('tsumikasane-device-v1');r.onsuccess=()=>{const q=r.result.transaction('entries').objectStore('entries').get('tsumikasane-data-v1-personal');q.onsuccess=()=>resolve(JSON.parse(q.result.value));q.onerror=()=>reject(q.error);};})""")
    assert stored['tasks'][0]['title']=='端末内だけに保存するテスト';assert any(e['action']=='completed' for e in stored['history'])
    assert page.evaluate("localStorage.getItem('tsumikasane-data-v1-personal')") is None
    page.reload(wait_until='networkidle');expect(page.locator('.task-row').filter(has_text='端末内だけに保存するテスト')).to_have_count(1)
    page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('!!navigator.serviceWorker.controller')
    context.set_offline(True);page.reload(wait_until='domcontentloaded');expect(page.locator('h1')).to_be_visible()
    page.locator('.heading-actions [data-action="new-task"]').click();page.locator('#field-title').fill('通信なしで残した記録');page.locator('button[type=submit]').click();expect(page.locator('#device-save-status')).to_have_text('この端末に保存済み')
    page.locator('.nav-item[href="#assets"]').click()
    with page.expect_download() as download:page.locator('.asset-toolbar [data-action="export"]').click()
    backup=json.loads(Path(download.value.path()).read_text());assert len(backup['tasks'])==2;assert backup['history']
    context.set_offline(False);page.reload(wait_until='networkidle');expect(page.locator('#device-save-status')).to_have_text('この端末に保存済み')
    # A second tab must not silently replace newer local records.
    result=page.evaluate("""async()=>{const {openDeviceStore}=await import('/device-store.mjs');const a=await openDeviceStore(),b=await openDeviceStore(),key='tsumikasane-data-test-concurrency';a.write(key,'first');await a.flush();b.write(key,'second');const saved=await b.flush();const fresh=await openDeviceStore();return {saved,current:fresh.read(key),unsaved:b.read(key),status:b.status};}""")
    assert result['saved'] is False and result['current']=='first' and result['unsaved']=='second';assert '別の画面' in result['status']
    # Saving a full browser storage must preserve the previous record and report failure.
    result=page.evaluate("""async()=>{const {openDeviceStore}=await import('/device-store.mjs');const store=await openDeviceStore(),key='tsumikasane-data-test-quota';store.write(key,'prior');await store.flush();const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(record,...args){if(record.key===key)throw new DOMException('full','QuotaExceededError');return original.call(this,record,...args);};let ok;try{store.write(key,'unsaved');ok=await store.flush();}finally{IDBObjectStore.prototype.put=original;}const fresh=await openDeviceStore();return {ok,pending:store.pending,status:store.status,current:fresh.read(key),unsaved:store.read(key)};}""")
    assert result['ok'] is False and result['pending'] and result['current']=='prior' and result['unsaved']=='unsaved';assert '保存できません' in result['status']
    length=page.evaluate("""async()=>{const {openDeviceStore}=await import('/device-store.mjs');const store=await openDeviceStore();store.write('large-device-test','あ'.repeat(3*1024*1024));if(!await store.flush())throw Error(store.status);const fresh=await openDeviceStore();return fresh.read('large-device-test').length;}""")
    assert length==3*1024*1024
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    phone=mobile.new_page();phone.on('pageerror',lambda e:errors.append(str(e)));phone.on('request',lambda r:requests.append((r.method,r.url)));phone.goto(BASE,wait_until='networkidle')
    expect(phone.locator('#device-save-status')).to_have_text('この端末に保存済み');assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
    phone.goto(BASE+'/#tasks',wait_until='networkidle');expect(phone.locator('.task-row')).to_have_count(0)
    # Explicit backup restore is the only data transfer used in this test.
    phone.locator('#header-settings').click();phone.locator('#import-file').set_input_files({'name':'device-backup.json','mimeType':'application/json','buffer':json.dumps(backup,ensure_ascii=False).encode()})
    with phone.expect_download():phone.locator('#confirm-import').click()
    expect(phone.locator('#device-save-status')).to_have_text('この端末に保存済み');expect(phone.locator('.task-row')).to_have_count(2)
    assert all(method=='GET' and urlparse(url).netloc=='127.0.0.1:4545' and not urlparse(url).path.startswith('/api/') for method,url in requests),requests
    assert not errors,errors
    print('Device browser checks passed: IndexedDB persistence, completion history, offline reload/edit, JSON export/restore, separate-device data, concurrent-edit protection and zero external/API requests.')
    browser.close()
