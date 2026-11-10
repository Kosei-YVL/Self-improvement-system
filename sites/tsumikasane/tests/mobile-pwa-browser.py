import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4173'
INDEPENDENT='http://127.0.0.1:4174'
OUT=Path('qa');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    errors=[]
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo')
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/fonts.googleapis.com/**',lambda r:r.abort())
    page.goto(BASE,wait_until='networkidle')
    page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('!!navigator.serviceWorker.controller')
    manifest=page.request.get(BASE+'/manifest.webmanifest').json();assert manifest['display']=='standalone';assert len(manifest['icons'])==3
    cached=page.evaluate('caches.keys().then(async keys=>(await (await caches.open(keys[0])).keys()).map(r=>new URL(r.url).pathname))')
    assert '/index.html' in cached and '/app.js' in cached
    assert not any('/api/' in path or 'login' in path or 'callback' in path for path in cached)
    for width,height in [(320,700),(375,812),(390,844),(430,932),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        for route in ['today','tasks','schedule','records','assets']:
            page.goto(BASE+'/#'+route,wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,route)
        page.locator('#header-settings').click();expect(page.locator('[data-pwa="install"]')).to_be_visible()
        page.locator('[data-pwa="install"]').click();expect(page.locator('[data-install-help]')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.locator('.modal-head [data-action="close-modal"]').click()
    page.set_viewport_size({'width':390,'height':844});page.goto(BASE+'/#tasks',wait_until='networkidle')
    page.locator('.heading-actions [data-action="new-task"]').click()
    assert page.locator('#field-title').evaluate('(el)=>getComputedStyle(el).fontSize')=='16px'
    page.locator('#field-estimate + .wheel-trigger').click();page.screenshot(path=str(OUT/'mobile-pwa-wheel.png'))
    page.keyboard.press('Escape');page.keyboard.press('Escape')
    context.set_offline(True);page.reload(wait_until='domcontentloaded')
    expect(page.locator('h1')).to_be_visible();assert page.url.endswith('#tasks')
    page.locator('.heading-actions [data-action="new-task"]').click();page.locator('#field-title').fill('オフライン起動後の入力');page.locator('button[type=submit]').click()
    expect(page.locator('.task-row').filter(has_text='オフライン起動後の入力')).to_have_count(1)
    context.set_offline(False);page.reload(wait_until='networkidle')
    expect(page.locator('.task-row').filter(has_text='オフライン起動後の入力')).to_have_count(1)
    page.locator('.nav-item[href="#today"]').click();page.screenshot(path=str(OUT/'mobile-pwa-today.png'),full_page=True)
    # The portable app uses a genuine password session; no ChatGPT identity or account.
    independent=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo')
    own=independent.new_page();own.on('pageerror',lambda e:errors.append(str(e)));own.route('**/fonts.googleapis.com/**',lambda r:r.abort())
    own.goto(INDEPENDENT);assert own.url.endswith('/login');own.locator('#password').fill('browser-test-password-123');own.locator('button').click()
    expect(own.locator('h1')).to_be_visible();own.wait_for_url(INDEPENDENT+'/')
    own.evaluate('navigator.serviceWorker.ready.then(()=>true)');own.wait_for_function('!!navigator.serviceWorker.controller')
    own.locator('#mode-switch').click();expect(own.locator('body')).to_have_attribute('data-cloud-ready','true')
    own.goto(INDEPENDENT+'/#tasks');own.locator('.heading-actions [data-action="new-task"]').click();own.locator('#field-title').fill('独立版でスマホから保存');own.locator('button[type=submit]').click()
    own.locator('.nav-item[href="#assets"]').click();expect(own.locator('[data-cloud-status]')).to_have_text('クラウドに保存済み')
    with own.expect_download() as downloaded:own.locator('.asset-toolbar [data-action="export"]').click()
    saved=json.loads(Path(downloaded.value.path()).read_text());assert any(t['title']=='独立版でスマホから保存' for t in saved['tasks']);assert saved['history']
    independent.set_offline(True);own.reload(wait_until='domcontentloaded');expect(own.locator('h1')).to_be_visible()
    independent.set_offline(False);own.reload(wait_until='networkidle');own.locator('#header-settings').click();own.locator('[data-session="logout"]').click()
    own.wait_for_url(INDEPENDENT+'/login');assert own.evaluate('Object.keys(localStorage).filter(k=>k.startsWith("tsumikasane-")).length')==0
    assert own.request.get(INDEPENDENT+'/api/data').status==401
    assert not errors,errors
    print('Mobile/PWA checks passed: 320–844px layouts, touch input, install help, shell-only cache, offline reload/edit, portable password login/save/export and logout cleanup.')
    browser.close()
