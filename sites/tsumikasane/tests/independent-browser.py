from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4174'
PASSWORD='browser-test-password-123' # Isolated test server only, never production.
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    errors=[];requests=[]
    def open_app(width,height,mobile=False):
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile,timezone_id='Asia/Tokyo')
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.route('**/fonts.googleapis.com/**',lambda route:route.abort())
        page.goto(BASE,wait_until='networkidle');expect(page.locator('#password')).to_be_visible();page.locator('#password').fill(PASSWORD);page.locator('button').click();page.wait_for_url(BASE+'/')
        page.locator('#mode-switch').click();expect(page.locator('body')).to_have_attribute('data-cloud-ready','true')
        return context,page
    desktop,pc=open_app(1440,960)
    pc.goto(BASE+'/#tasks',wait_until='networkidle');pc.locator('.heading-actions [data-action="new-task"]').click();pc.locator('#field-title').fill('独立した保存先で共有するテスト');pc.locator('button[type=submit]').click();expect(pc.locator('#save-status')).to_have_text('クラウドに保存済み')
    mobile,phone=open_app(390,844,True)
    phone.goto(BASE+'/#tasks',wait_until='networkidle');expect(phone.locator('.task-row').filter(has_text='独立した保存先で共有するテスト')).to_have_count(1)
    assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
    phone.evaluate('navigator.serviceWorker.ready.then(()=>true)');phone.wait_for_function('!!navigator.serviceWorker.controller')
    mobile.set_offline(True);phone.reload(wait_until='domcontentloaded');expect(phone.locator('.task-row').filter(has_text='独立した保存先で共有するテスト')).to_have_count(1)
    phone.locator('.heading-actions [data-action="new-task"]').click();phone.locator('#field-title').fill('スマホでオフライン入力');phone.locator('button[type=submit]').click();expect(phone.locator('#save-status')).to_have_text('端末に保存・クラウド未接続')
    mobile.set_offline(False);expect(phone.locator('#save-status')).to_have_text('クラウドに保存済み',timeout=15000)
    pc.reload(wait_until='networkidle');expect(pc.locator('.task-row').filter(has_text='スマホでオフライン入力')).to_have_count(1)
    assert not any(urlparse(url).hostname.endswith(('.chatgpt.site','.openai.com')) or urlparse(url).hostname in ['chatgpt.com','openai.com'] for url in requests)
    assert not errors,errors
    print('Independent browser checks passed: own password, desktop/mobile shared data, offline startup/edit/reconnect, and zero ChatGPT or OpenAI network requests.')
    browser.close()
