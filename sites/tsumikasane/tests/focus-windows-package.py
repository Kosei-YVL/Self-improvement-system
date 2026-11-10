import hashlib,json,os,shutil,socket,subprocess,tempfile,time,urllib.request,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parent.parent
ART=Path('/workspace/artifacts')
OUT=ROOT/'qa/focus-windows'
def port():
    with socket.socket() as connection:
        connection.bind(('127.0.0.1',0));return connection.getsockname()[1]
def wait(url):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        try:
            with urllib.request.urlopen(url,timeout=.3) as response:
                if response.status==200:return
        except OSError:pass
        time.sleep(.1)
    raise AssertionError('Server not ready')
def run(app,env,*arguments):
    return subprocess.run(['node','focus-launcher.mjs',*arguments],cwd=app,env=env,check=True,capture_output=True,text=True,timeout=20)

checks=[];errors=[];legacy=None;active=[]
with tempfile.TemporaryDirectory(prefix='focus-packaged-') as temporary:
    directory=Path(temporary)
    try:
        legacy_zip=ART/'Focus-google-20261026.zip'
        assert hashlib.sha256(legacy_zip.read_bytes()).hexdigest()=='894b58c37088974a25b368b3490030c60a8e944238ddb11fbe9107ad75a1d202'
        with zipfile.ZipFile(legacy_zip) as z:z.extractall(directory/'legacy')
        app=directory/'legacy/Focus';server_port=port();base=f'http://127.0.0.1:{server_port}'
        env={**os.environ,'PORT':str(server_port),'FOCUS_ENV':'personal','FOCUS_DATA_DIR':str(app/'focus-data/personal')}
        env.pop('SYNC_AUTH_HASH',None)
        original={name:hashlib.sha256((app/'personal'/name).read_bytes()).hexdigest() for name in ['server.mjs','app-assets.json']}
        legacy=subprocess.Popen(['node','server.mjs'],cwd=app/'personal',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        wait(base+'/focus.html')
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
            context=browser.new_context(accept_downloads=True,timezone_id='Asia/Tokyo');page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(base+'/focus.html',wait_until='networkidle')
            page.locator('.session-panel [data-action=backdate]').click()
            page.locator('#log-form [name=title]').fill('起動前から保持する記録')
            page.locator('#log-form .primary-button').click()
            expect(page.locator('[data-card=logs] .row')).to_have_count(1)
            expect(page.locator('#save-status')).to_contain_text('保存済み')
            page.locator('#settings').click()
            with page.expect_download() as download:page.locator('[data-action=export]').click()
            before=json.loads(Path(download.value.path()).read_text())
            page.locator('#settings-dialog [data-close]').click()
            legacy.terminate();legacy.wait(timeout=5);legacy=None

            with zipfile.ZipFile(ART/'Focus-startup-20261028.zip') as z:z.extractall(directory/'addon')
            source=directory/'addon/Focus-startup'
            for name in ['Focus.vbs','INSTALL-FOCUS.vbs','focus-launcher.mjs','focus.ico','FOCUS-WINDOWS.md']:shutil.copy2(source/name,app/name)
            for name,digest in original.items():assert hashlib.sha256((app/'personal'/name).read_bytes()).hexdigest()==digest
            active.append((app,env));run(app,env,'--no-open');wait(base+'/focus.html')
            page.reload(wait_until='networkidle');expect(page.locator('[data-card=logs] .row')).to_have_count(1)
            page.locator('#settings').click()
            with page.expect_download() as download:page.locator('[data-action=export]').click()
            after=json.loads(Path(download.value.path()).read_text())
            assert after['data']==before['data'] and after['config']==before['config']
            page.locator('#settings-dialog [data-close]').click()
            marker=app/'focus-data/personal/desktop-session.json';first_pid=json.loads(marker.read_text())['pid']
            run(app,env,'--no-open');assert json.loads(marker.read_text())['pid']==first_pid
            checks.append('addon_installed_into_previous_google_release_without_changing_app_files_or_browser_data')
            page.screenshot(path=str(OUT/'existing-data.png'),full_page=True)
            context.close();browser.close()
        run(app,env,'--stop');active.remove((app,env))
        checks.append('extracted_addon_cli_launch_reuse_and_graceful_stop')

        with zipfile.ZipFile(ART/'Focus-windows-20261028.zip') as z:
            assert z.testzip() is None
            for name in z.namelist():assert Path(name).name not in ['desktop-session.json','sync-key.txt','server-config.json','google-config.json','google-token-key.txt']
            z.extractall(directory/'full')
        app=directory/'full/Focus';env={**os.environ,'PORT':str(port()),'FOCUS_ENV':'personal','FOCUS_DATA_DIR':str(app/'focus-data/personal')};env.pop('SYNC_AUTH_HASH',None)
        active.append((app,env));run(app,env,'--no-open');wait(f'http://127.0.0.1:{env["PORT"]}/focus.html')
        run(app,env,'--stop');active.remove((app,env))
        checks.append('extracted_full_release_launches_and_stops_without_npm_install')
        assert not errors,errors
        result={'result':'pass','checks':checks,'browser_page_errors':errors,'windows_native_tested':False}
        (OUT/'package-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
    finally:
        if legacy:
            legacy.terminate();legacy.wait(timeout=5)
        for app,env in active:
            try:run(app,env,'--stop')
            except Exception:pass
