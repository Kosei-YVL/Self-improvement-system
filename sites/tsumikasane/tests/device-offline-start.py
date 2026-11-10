import subprocess,tempfile,time,urllib.request
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4545'
server=subprocess.Popen(['node','device-test/server.mjs'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    for _ in range(30):
        try:
            urllib.request.urlopen(BASE,timeout=.5).close();break
        except OSError:time.sleep(.1)
    else:raise RuntimeError('Local test server did not start')
    with tempfile.TemporaryDirectory(prefix='tsumikasane-offline-') as profile,sync_playwright() as p:
        def launch():return p.chromium.launch_persistent_context(profile,executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],viewport={'width':1200,'height':900})
        context=launch();page=context.pages[0];page.goto(BASE,wait_until='networkidle');page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('!!navigator.serviceWorker.controller')
        page.locator('.heading-actions [data-action="new-task"]').click();page.locator('#field-title').fill('ブラウザを閉じても残る記録');page.locator('button[type=submit]').click();expect(page.locator('#device-save-status')).to_have_text('この端末に保存済み');context.close()
        server.terminate();server.wait(timeout=10)
        context=launch();page=context.pages[0];page.goto(BASE,wait_until='domcontentloaded');expect(page.locator('.task-row').filter(has_text='ブラウザを閉じても残る記録')).to_have_count(1)
        page.locator('.heading-actions [data-action="new-task"]').click();page.locator('#field-title').fill('起動サーバーなしで入力');page.locator('button[type=submit]').click();expect(page.locator('#device-save-status')).to_have_text('この端末に保存済み');context.close()
        context=launch();page=context.pages[0];page.goto(BASE,wait_until='domcontentloaded');expect(page.locator('.task-row').filter(has_text='起動サーバーなしで入力')).to_have_count(1);context.close()
        print('Offline startup passed: browser process restarted twice, local server stopped, cached app and IndexedDB records remain usable and editable.')
finally:
    if server.poll() is None:server.terminate();server.wait(timeout=10)
