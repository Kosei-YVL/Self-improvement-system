"""Real-clock UI checks with synthetic data. No account or physical device is used."""
import datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'qa/focus-refinement/round3'
BASE='http://127.0.0.1:4561'
today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]},'config':{'routines':[{'id':'r'+str(i),'title':title,'minutes':25,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a'+str(i),'title':'演習','minutes':25}]} for i,title in enumerate(['学習','制作','読書'])],'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
checks=[];errors=[];requests=[]
with tempfile.TemporaryDirectory(prefix='focus-polish-') as temporary:
    server=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4561','FOCUS_DATA_DIR':temporary,'FOCUS_ENV':'personal'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            context=browser.new_context(viewport={'width':1440,'height':900},has_touch=True,accept_downloads=True,timezone_id='Asia/Tokyo')
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.on('request',lambda r:requests.append(r.url));page.goto(BASE+'/focus.html',wait_until='domcontentloaded')
            def settings(tab='display'):
                if not page.locator('#settings-dialog').evaluate('e=>e.open'):page.locator('#settings').click()
                page.locator('[data-settings-tab='+tab+']').click()
            def close():page.locator('#settings-dialog [data-close]').click()
            def export():
                settings('data')
                with page.expect_download() as d:page.locator('[data-action=export]').click()
                value=json.loads(Path(d.value.path()).read_text());close();return value
            settings('data');page.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});close()
            for skin in ['graphite','glass','chrome','garnet']:
                for theme in ['light','dark','system']:
                    settings();page.locator('#skin-mode').select_option(skin);page.locator('#theme-mode').select_option(theme);close();assert page.locator('html').get_attribute('data-skin')==skin
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            settings();page.locator('#theme-mode').select_option('dark');page.locator('#skin-mode').select_option('glass')
            for logo in ['A','B','C','D','original']:
                page.locator('[data-action=logo-choice][data-id='+logo+']').click();expect(page.locator('[data-action=logo-choice][data-id='+logo+']')).to_have_attribute('aria-pressed','true')
            page.locator('#settings-dialog').screenshot(path=str(OUT/'appearance-desktop.png'));close();checks.append('skins_themes_and_four_logo_choices')
            for variant in ['pop','ripple','rise','none']:
                settings();page.locator('#completion-motion').select_option(variant);close()
                page.locator('.today-panel [data-action=pick]').click();page.locator('[data-action=pick-work][data-id=a0]').click();page.locator('#edit-dialog [data-close]').click();page.locator('[data-action=begin]').click();expect(page.locator('.active-session')).to_be_visible()
                expect(page.locator('[data-action=finish]')).to_be_enabled();page.locator('[data-action=finish]').evaluate('(e)=>{e.click();e.click();e.click();}')
                expect(page.locator('.session-panel .is-complete')).to_be_visible();expect(page.locator('.session-panel .is-complete svg')).to_have_count(1)
                expect(page.locator('.active-session')).to_have_count(0,timeout=4000)
                assert len(export()['data']['logs'])==['pop','ripple','rise','none'].index(variant)+1
                expect(page.locator('.completion-burst')).to_have_count(0)
            checks.append('three_completion_animations_and_none_triple_click_one_record_no_message')
            page.emulate_media(reduced_motion='reduce');settings();page.locator('#completion-motion').select_option('pop');page.locator('[data-action=motion-preview]').click();expect(page.locator('.completion-burst')).to_have_count(0);close();page.emulate_media(reduced_motion='no-preference');checks.append('reduced_motion_no_burst')
            # Physical mouse movement changes the wheel; no injected form values.
            page.locator('.today-panel [data-action=pick]').click();page.locator('[data-action=pick-work][data-id=a0]').click();page.locator('#edit-dialog [data-close]').click();page.locator('[data-mode=timer]').click();page.locator('.timer-custom .wheel-trigger').click();wheel=page.locator('#wheel-picker [data-kind=minute]');box=wheel.bounding_box();before=int(wheel.get_attribute('aria-valuenow'));x=box['x']+box['width']/2;y=box['y']+box['height']/2
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y-76,steps=8);page.mouse.up();expect(wheel).to_have_attribute('aria-valuenow',str(before+2));page.locator('.wheel-done').click();expect(page.locator('[name=timer-duration]')).to_have_value(str(before+2))
            checks.append('mouse_drag_duration_wheel_two_minutes')
            page.set_viewport_size({'width':390,'height':844});cdp=context.new_cdp_session(page)
            for route in ['dashboard','tasks','review']:
                page.locator('a[href="#'+route+'"]').click();page.locator('.layout-toggle').click();blocks=page.locator('[data-layout-id]');original=blocks.first.get_attribute('data-layout-id');source=blocks.first.locator('[data-layout-handle]').bounding_box();target=blocks.nth(1).bounding_box();sx=source['x']+source['width']/2;sy=source['y']+source['height']/2;tx=target['x']+target['width']/2;ty=target['y']+target['height']-10
                cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]})
                for step in range(1,9):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':sx+(tx-sx)*step/8,'y':sy+(ty-sy)*step/8}]})
                cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});expect(blocks.nth(1)).to_have_attribute('data-layout-id',original);page.locator('.layout-toggle').click()
                page.reload(wait_until='domcontentloaded');expect(page.locator('[data-layout-id]').nth(1)).to_have_attribute('data-layout-id',original)
            checks.append('cdp_touch_drag_all_three_pages_persisted')
            # Two sub-minute sessions must be summed before rounding in every view.
            fixture['data']['logs']=[{'id':'exact-'+str(i),'title':'短い記録','category':'learning','date':today,'start':'00:0'+str(i),'minutes':1,'elapsedSeconds':31,'note':''} for i in range(2)]
            settings('data');page.locator('#restore').set_input_files({'name':'exact.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});close();page.locator('a[href="#review"]').click();expect(page.locator('.review-calendar [data-date="'+today+'"]')).to_have_attribute('aria-label',today+' 1分')
            page.locator('#review-mode').select_option('week');expect(page.locator('.week-strip [data-date="'+today+'"] strong')).to_have_text('1分');page.locator('#review-mode').select_option('year');expect(page.locator('.year-grid [data-date="'+today[:7]+'-01"] strong')).to_have_text('1分')
            checks.append('review_sums_actual_seconds_before_rounding_all_periods')
            # Actual local file backup, not a mocked request or fake clock.
            settings('data');page.locator('[data-action=backup-now]').click();expect(page.locator('#device-backup-state')).to_contain_text('保存済み',timeout=15000);close();current=export()
            files=list((Path(temporary)/'device-backups').glob('*/latest.json'));assert len(files)==1
            saved=json.loads(files[0].read_text());assert saved['data']==current['data'] and saved['config']==current['config']
            time.sleep(2);prior=len([u for u in requests if '/api/focus-device-backup' in u]);time.sleep(3);assert len([u for u in requests if '/api/focus-device-backup' in u])==prior
            assert all(u.startswith((BASE+'/', 'blob:')) for u in requests);checks.append('real_clock_json_file_checkpoint_matches_data_idle_no_requests_no_external_calls')
            assert not errors,errors;browser.close()
    finally:server.terminate();server.wait(timeout=5)
result={'result':'pass','checks':checks,'pageErrors':errors,'physicalIPhoneTested':False,'windowsNativeTested':False}
(OUT/'polish.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
