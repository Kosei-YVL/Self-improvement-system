import json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent
packet_path=os.environ.get('MIGRATION_PACKET')
if not packet_path:raise SystemExit('Set MIGRATION_PACKET to a prepared migration packet. This test never edits the input.')
packet=json.loads(Path(packet_path).read_text());expected=packet['summary']['logs']
with tempfile.TemporaryDirectory(prefix='focus-migration-ui-') as temporary:
    directory=Path(temporary)
    server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4558','FOCUS_ENV':'personal','FOCUS_DATA_DIR':temporary},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:urllib.request.urlopen('http://127.0.0.1:4558/focus.html',timeout=.2).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);context=browser.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');page=context.new_page();errors=[];page.on('dialog',lambda d:d.accept());page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto('http://127.0.0.1:4558/focus.html',wait_until='domcontentloaded')
            page.locator('.session-panel [data-action=backdate]').click();page.locator('#log-form [name=title]').fill('移行前からの記録');page.locator('#log-form .primary-button').click();expect(page.locator('#save-status')).to_contain_text('保存済み')
            def export():
                page.locator('#settings').click()
                if page.locator('[data-settings-tab=data]').count():page.locator('[data-settings-tab=data]').click()
                with page.expect_download() as download:page.locator('[data-action=export]').click()
                value=json.loads(Path(download.value.path()).read_text());page.locator('#settings-dialog [data-close]').click();return value
            before=export();(directory/'pending-migration.json').write_text(json.dumps(packet))
            page.reload(wait_until='domcontentloaded');after=export();assert len(after['data']['logs'])==expected+1
            assert next(l for l in after['data']['logs'] if l['id']==before['data']['logs'][0]['id'])==before['data']['logs'][0]
            assert len(after['data']['migrations'])==1 and after['data']['migrations'][0]['id']==packet['id']
            assert after['config']['routines']==packet['backup']['config']['routines']
            page.reload(wait_until='domcontentloaded');again=export();assert again['data']==after['data'];assert len(again['data']['sourceTables'])==packet['summary']['sourceTables']
            assert not errors,errors
            print(json.dumps({'result':'pass','importedLogs':expected,'keptExistingLogs':1,'duplicateReload':'no_duplicates','sourceTables':len(after['data']['sourceTables']),'pageErrors':errors,'realUserPacketUsed':True}))
            context.close();browser.close()
    finally:server.terminate();server.wait(timeout=5)
