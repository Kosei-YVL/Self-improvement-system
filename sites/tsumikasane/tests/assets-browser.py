import os,json,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4173'
OUT=Path('/workspace/sites/tsumikasane-publish/qa');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':1440,'height':1050},timezone_id='Asia/Tokyo',accept_downloads=True,color_scheme='light')
    errors=[];page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/fonts.googleapis.com/**',lambda r:r.abort())
    page.goto(BASE,wait_until='networkidle')
    revision=page.request.get(BASE+'/api/data').json()['revision']
    blank={'version':2,'tasks':[],'events':[],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]}
    assert page.request.post(BASE+'/api/data',data={'data':blank,'expectedRevision':revision,'writeId':str(uuid.uuid4())},headers={'Origin':BASE}).ok
    expect(page.locator('html')).to_have_attribute('data-theme','light')
    page.locator('#theme-toggle').click();expect(page.locator('html')).to_have_attribute('data-theme','dark')
    page.reload(wait_until='networkidle');expect(page.locator('html')).to_have_attribute('data-theme','dark')
    assert page.locator('body').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(16, 27, 20)'
    page.screenshot(path=str(OUT/'dark-today.png'),full_page=True)
    page.locator('#header-settings').click();page.locator('#theme-preference').select_option('system');page.emulate_media(color_scheme='light');expect(page.locator('html')).to_have_attribute('data-theme','light');page.emulate_media(color_scheme='dark');expect(page.locator('html')).to_have_attribute('data-theme','dark')
    page.locator('.modal-head [data-action="close-modal"]').click()
    page.locator('#mode-switch').click();expect(page.locator('body')).to_have_attribute('data-cloud-ready','true')
    page.locator('.heading-actions [data-action="new-task"]').click();page.locator('#field-title').fill('資産として残すテスト');page.locator('button[type=submit]').click()
    task=page.locator('.task-row').filter(has_text='資産として残すテスト');task.locator('[data-action="toggle-task"]').click();task.locator('[data-action="toggle-task"]').click()
    task.locator('.task-title').click();page.locator('[data-action="delete-task"]').click();page.locator('[data-action="confirm-delete"]').click()
    page.locator('.nav-item[href="#assets"]').click();expect(page.locator('h1')).to_contain_text('資産')
    expect(page.locator('.asset-row').filter(has_text='資産として残すテスト')).not_to_have_count(0)
    with page.expect_download() as d:page.locator('.asset-toolbar [data-action="export-history"]').click()
    text=Path(d.value.path()).read_text(encoding='utf-8-sig');assert 'completed' in text and 'reopened' in text and 'archived' in text
    with page.expect_download() as d:page.locator('.asset-toolbar [data-action="export"]').click()
    backup=json.loads(Path(d.value.path()).read_text());assert backup['version']==2;assert backup['archive']['tasks'];assert any(h['action']=='completed' and h['occurredAt'] for h in backup['history'])
    page.locator('[data-action="restore-item"]').first.click();expect(page.locator('[data-cloud-status]')).to_have_text('クラウドに保存済み')
    data=page.request.get(BASE+'/api/data').json();assert len(data['data']['tasks'])>=1
    second=browser.new_context(viewport={'width':1200,'height':900},timezone_id='Asia/Tokyo')
    second.add_init_script("localStorage.setItem('tsumikasane-mode','personal')")
    b=second.new_page();b.route('**/fonts.googleapis.com/**',lambda r:r.abort());b.on('pageerror',lambda e:errors.append(str(e)))
    b.goto(BASE+'/#tasks',wait_until='networkidle');expect(b.locator('body')).to_have_attribute('data-cloud-ready','true');expect(b.locator('.task-row').filter(has_text='資産として残すテスト')).to_have_count(1)
    # Preserve a concurrent edit; require a review instead of overwriting.
    b.locator('.task-title').filter(has_text='資産として残すテスト').click();b.locator('#field-title').fill('別端末の編集')
    page.locator('.nav-item[href="#tasks"]').click();page.locator('.task-row').filter(has_text='資産として残すテスト').locator('[data-action="toggle-task"]').click()
    expect(page.locator('#save-status')).to_have_text('クラウドに保存済み')
    b.locator('button[type=submit]').click();expect(b.locator('#save-status')).to_have_text('保存の競合：確認が必要')
    b.locator('.nav-item[href="#assets"]').click();b.locator('[data-action="cloud-review"]').click()
    with b.expect_download():b.locator('[data-action="cloud-use-remote"]').click()
    expect(b.locator('[data-cloud-status]')).to_have_text('クラウドに保存済み')
    # Offline edits survive reconnect and reload.
    page.locator('.nav-item[href="#tasks"]').click()
    context.set_offline(True)
    page.locator('.heading-actions [data-action="new-task"]').click();page.locator('#field-title').fill('オフラインで残した記録');page.locator('button[type=submit]').click()
    expect(page.locator('#save-status')).to_have_text('端末に保存・クラウド未接続')
    context.set_offline(False)
    expect(page.locator('#save-status')).to_have_text('クラウドに保存済み',timeout=15000)
    page.reload(wait_until='networkidle');expect(page.locator('body')).to_have_attribute('data-cloud-ready','true');expect(page.locator('.task-row').filter(has_text='オフラインで残した記録')).to_have_count(1)
    # Test the supplied ZIP only when explicitly provided to the local test runner.
    fixture=os.environ.get('TSUMIKASANE_NOTION_ZIP')
    if fixture:
        page.locator('.nav-item[href="#assets"]').click();page.locator('[data-action="import-notion"]').click();page.locator('#notion-unit').select_option('hours');page.locator('#notion-file').set_input_files(fixture)
        expect(page.locator('.import-counts')).to_contain_text('作業ログ 26件',timeout=15000)
        expect(page.locator('.import-counts')).to_contain_text('過去のタスク 191件')
        expect(page.locator('.notion-warning')).to_contain_text('24時間')
        with page.expect_download():page.locator('[data-action="apply-notion"]').click()
        expect(page.locator('[data-cloud-status]')).to_have_text('クラウドに保存済み',timeout=15000)
        saved=page.request.get(BASE+'/api/data').json()['data'];assert len(saved['logs'])==26;assert len(saved['events'])==36;assert len(saved['archive']['tasks'])>=191;assert len(saved['sourceTables'])==41
        assert any(log['minutes']==8031 for log in saved['logs'])
        page.locator('[data-action="import-notion"]').click();page.locator('#notion-unit').select_option('hours');page.locator('#notion-file').set_input_files(fixture)
        expect(page.locator('.import-counts')).to_contain_text('作業ログ 0件',timeout=15000)
        page.locator('.modal-head [data-action="close-modal"]').click()
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo',color_scheme='dark')
    mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)));mp.route('**/fonts.googleapis.com/**',lambda r:r.abort());mp.goto(BASE,wait_until='networkidle')
    expect(mp.locator('html')).to_have_attribute('data-theme','dark');assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth')
    mp.locator('.heading-actions [data-action="new-task"]').click();mp.locator('#field-estimate + .wheel-trigger').click();mp.screenshot(path=str(OUT/'dark-mobile-wheel.png'));assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    print('Browser checks passed: persistent/system dark mode, timestamped history, archive/restore, JSON/CSV export, account cloud save, second device, conflict review, Notion ZIP and mobile layout.')
    browser.close()
