import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:4173/'
OUT=Path('/workspace/Self-improvement-system/sites/tsumikasane/qa')
OUT.mkdir(exist_ok=True)
def setfield(page, selector, value):
    page.locator(selector).evaluate('(el,value)=>{el.value=value;el.dispatchEvent(new Event("change",{bubbles:true}));}', value)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':1440,'height':1100},timezone_id='Asia/Tokyo',accept_downloads=True)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/fonts.googleapis.com/**',lambda route:route.abort())
    page.goto(BASE,wait_until='networkidle')
    assert page.locator('h1').inner_text().startswith('今日も')
    assert page.locator('.task-row').count()==5
    page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
    page.locator('#mode-switch').click()
    assert page.locator('.task-row').count()==0
    page.locator('.heading-actions [data-action="new-task"]').click()
    page.locator('#field-title').fill('ブラウザ動作確認 <img src=x>')
    setfield(page, '#field-estimate', '45')
    page.locator('#field-category').select_option('work')
    page.locator('#field-priority').select_option('high')
    page.locator('button[type=submit]').click()
    assert page.locator('.task-row').count()==1
    assert page.locator('.task-title').inner_text()=='ブラウザ動作確認 <img src=x>'
    assert page.locator('.task-title img').count()==0
    page.reload(wait_until='networkidle')
    assert page.locator('.task-row').count()==1
    page.locator('[data-action="schedule-task"]').click()
    assert page.locator('#field-end').input_value()=='09:45'
    page.locator('button[type=submit]').click()
    assert page.locator('.event-block').count()==1
    page.locator('[data-action="new-event"]').click()
    page.locator('#field-title').fill('重複した予定')
    page.locator('button[type=submit]').click()
    assert '別の予定' in page.locator('#form-error').inner_text()
    setfield(page, '#field-start', '10:00')
    setfield(page, '#field-end', '10:30')
    page.locator('button[type=submit]').click()
    assert page.locator('.event-block').count()==2
    page.locator('[data-action="toggle-task"]').click()
    assert page.locator('.check-button.checked').count()==1
    assert '0' in page.locator('.stat-value').nth(0).inner_text()
    page.locator('.nav-item[href="#records"]').click()
    page.locator('.heading-actions [data-action="new-log"]').click()
    page.locator('#field-title').fill('英語の学習')
    setfield(page, '#field-minutes', '35')
    page.locator('#field-note').fill('今日の発見を記録')
    page.locator('button[type=submit]').click()
    assert page.locator('.log-row').count()==1
    assert '35' in page.locator('.stat-value').nth(0).inner_text()
    page.locator('#reflection-note').fill('最初の一歩を進めた。')
    page.locator('[data-action="save-reflection"]').click()
    page.reload(wait_until='networkidle')
    assert page.locator('#reflection-note').input_value()=='最初の一歩を進めた。'
    page.locator('[data-action="edit-log"]').click()
    setfield(page, '#field-minutes', '40')
    page.locator('button[type=submit]').click()
    assert '40' in page.locator('.stat-value').nth(0).inner_text()
    page.locator('#header-settings').click()
    with page.expect_download() as download:
        page.locator('[data-action="export"]').click()
    backup=json.loads(Path(download.value.path()).read_text())
    assert backup['logs'][0]['minutes']==40
    page.locator('#import-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"version":1}'})
    expect(page.locator('#settings-error')).to_contain_text('有効なJSON')
    page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(backup,ensure_ascii=False).encode()})
    with page.expect_download():
        page.locator('#confirm-import').click()
    assert page.locator('.log-row').count()==1
    page.locator('.nav-item[href="#tasks"]').click()
    page.locator('#task-search').fill('存在しないタスク')
    assert page.locator('.task-row').count()==0
    page.locator('#task-search').fill('ブラウザ')
    assert page.locator('.task-row').count()==1
    page.locator('.task-title').click()
    page.locator('[data-action="delete-task"]').click()
    page.locator('[data-action="confirm-delete"]').click()
    assert page.locator('.task-row').count()==0
    stored=json.loads(page.evaluate("localStorage.getItem('tsumikasane-data-v1-personal')"))
    assert len(stored['events'])==2 and stored['events'][0]['taskId'] is None
    page.locator('.nav-item[href="#schedule"]').click()
    expect(page.locator('.calendar-event')).to_have_count(2)
    expect(page.locator('.calendar-slot')).to_have_count(168)
    page.locator('.nav-item[href="#today"]').click()
    page.locator('[data-action="timer-toggle"]').click()
    page.reload(wait_until='networkidle')
    assert page.locator('[data-action="timer-toggle"]').inner_text()=='一時停止'
    page.locator('[data-action="timer-toggle"]').click()
    page.locator('[data-action="timer-reset"]').click()
    page.locator('#mode-switch').click()
    assert page.locator('.task-row').count()==5
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1,timezone_id='Asia/Tokyo')
    mp=mobile.new_page();mp.route('**/fonts.googleapis.com/**',lambda route:route.abort())
    mp.goto(BASE,wait_until='networkidle')
    mp.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    mp.locator('.nav-item[href="#records"]').click()
    mp.screenshot(path=str(OUT/'mobile-records.png'),full_page=True)
    assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert errors==[],errors
    print('Browser checks passed: create, persistence, escaped text, scheduling, overlap, completion, records, reflections, backup import/export, search, delete, timer, mobile layout.')
    browser.close()
