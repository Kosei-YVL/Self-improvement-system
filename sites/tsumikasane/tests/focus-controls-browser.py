"""Synthetic UI audit: visible controls must stay in their card and be clickable.
--baseline records findings without asserting, for comparison with the immutable release.
"""
import argparse,datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-controls';OUT.mkdir(parents=True,exist_ok=True);BASE='http://127.0.0.1:4583';parser=argparse.ArgumentParser();parser.add_argument('--baseline',action='store_true');args=parser.parse_args();app=Path(os.environ.get('FOCUS_CONTROLS_APP_DIR',ROOT/'focus-sync'));today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat();checks=[];errors=[];failures=[]
routines=[{'id':'r'+str(i),'title':name,'minutes':mins,'category':'learning','preferredStart':'00:00','preferredEnd':'23:59','prepareBefore':0,'prepareAfter':0,'activities':[{'id':'a'+str(i)+'-'+str(j),'title':title,'minutes':mins} for j,title in enumerate(['制作','練習','ミキシング','確認'])]} for i,(name,mins) in enumerate([('音楽制作',180),('大学の課題と授業準備',25)])]
events=[{'id':'p'+str(i),'title':routines[i%2]['title']+' · 制作','taskTitle':routines[i%2]['title'],'activityTitle':'制作','taskId':None,'date':today,'start':str(10+i*3).zfill(2)+':00','end':str(10+i*3).zfill(2)+':25','category':'learning','routineId':'r'+str(i%2),'activityId':'a'+str(i%2)+'-0','manual':True} for i in range(3)]
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':events,'logs':[{'id':'l','title':'読書','date':today,'start':'00:00','minutes':25,'category':'learning','note':''}],'focusPlans':[{'id':'unplaced','date':today,'routineId':'r0','activityId':'a0-1'}]+[{'id':e['id'],'date':today,'routineId':e['routineId'],'activityId':e['activityId']} for e in events],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]},'config':{'routines':routines,'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','theme':'dark'},'timer':None}
with tempfile.TemporaryDirectory(prefix='focus-controls-') as temp:
 server=subprocess.Popen(['node','server.mjs'],cwd=app,env={**os.environ,'PORT':'4583','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html',timeout=.2).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);c=b.new_context(viewport={'width':1440,'height':900},has_touch=True,accept_downloads=True,timezone_id='Asia/Tokyo');q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE+'/focus.html',wait_until='domcontentloaded')
   def settings(tab='data'):
    if not q.locator('#settings-dialog').evaluate('e=>e.open'):q.locator('#settings').click()
    q.locator('[data-settings-tab='+tab+']').click()
   def restore(active=False):
    value=json.loads(json.dumps(fixture))
    if active:value['timer']={'id':'qa-timer','title':'音楽制作 · ミキシング','taskTitle':'音楽制作','activityTitle':'ミキシング','mode':'stopwatch','date':today,'start':'00:00','goal':1500000,'elapsed':65000,'started':q.evaluate('Date.now()'),'running':False,'eventId':'p0'}
    settings();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(value).encode()});expect(q.locator('#notice')).to_have_text('復元しました');q.locator('#settings-dialog [data-close]').click()
   def audit(name):
    state=q.evaluate('''()=>{const modal=[...document.querySelectorAll('dialog[open]')].at(-1),scope=modal||document;const visible=e=>{const r=e.getBoundingClientRect(),css=getComputedStyle(e);return r.width>0&&r.height>0&&css.visibility!=='hidden'&&css.display!=='none'&&r.bottom>0&&r.top<innerHeight};const describe=e=>e.dataset.action||e.id||e.getAttribute('aria-label')||e.textContent.trim().slice(0,20);const bad=[];for(const e of scope.querySelectorAll('button:not(:disabled),select,input:not([type=hidden]),a')){if(!visible(e))continue;const r=e.getBoundingClientRect(),owner=e.closest('.panel,dialog');if(owner){const p=owner.getBoundingClientRect();if(r.left<p.left-1||r.right>p.right+1)bad.push({control:describe(e),issue:'outside-own-card',left:r.left,right:r.right,ownerLeft:p.left,ownerRight:p.right});}if(r.left>=0&&r.right<=innerWidth&&r.top>=(modal?0:60)&&r.bottom<=(modal?innerHeight:innerHeight-90)){let hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(hit&&!e.contains(hit)&&modal){e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const v=e.getBoundingClientRect();hit=document.elementFromPoint(v.left+v.width/2,v.top+v.height/2);}if(hit&&!e.contains(hit))bad.push({control:describe(e),issue:'center-obstructed-after-scroll',hit:describe(hit),hitClass:hit.className});}}const close=modal?.querySelector('.dialog-head [data-close]');if(close){const a=close.getBoundingClientRect(),b=modal.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)bad.push({control:'dialog-close',issue:'close-scrolls-out-of-dialog'});}const clock=document.querySelector('.clock-row'),review=document.querySelector('.review-navigation'),metrics={};if(clock){const time=clock.querySelector('.timer-output')?.getBoundingClientRect(),button=clock.querySelector('button')?.getBoundingClientRect();if(time?.width&&button?.width&&time.right>button.left-8)bad.push({control:'timer-output',issue:'clock-collides-with-primary-button',clockRight:time.right,buttonLeft:button.left});}if(review){const prev=review.querySelector('button'),date=review.querySelector('.wheel-trigger');if(prev&&date){const a=prev.getBoundingClientRect(),b=date.getBoundingClientRect();metrics.reviewControlCenterDifference=Math.abs(a.top+a.height/2-b.top-b.height/2);}}const footer=modal?.querySelector('form>.actions'),primary=footer?.querySelector('.primary-button');if(primary){const p=primary.getBoundingClientRect();for(const other of footer.querySelectorAll('button')){if(other===primary)continue;const o=other.getBoundingClientRect();if(o.top>p.top+2)bad.push({control:'primary-action',issue:'secondary-below-save'});}if(footer.lastElementChild!==primary)bad.push({control:'primary-action',issue:'keyboard-order-differs-from-action-order'});}return {bad,metrics};}''')
    item={'name':name,'width':q.viewport_size['width'],'height':q.viewport_size['height'],**state};checks.append(item)
    if state['bad']:failures.append(item)
   restore()
   for width,height in [(1440,900),(834,1112),(390,844),(320,740),(280,740),(844,390)]:
    q.set_viewport_size({'width':width,'height':height})
    for route in ['dashboard','tasks','review']:
     q.locator('a[href="#'+route+'"]').click();q.evaluate('scrollTo(0,0)');audit(route)
     if width in [1440,390]:q.screenshot(path=str(OUT/(('before-' if args.baseline else '')+route+'-'+str(width)+'.png')),full_page=True)
     q.locator('.layout-toggle').click();audit(route+'-layout');q.locator('.layout-toggle').click()
    q.locator('a[href="#dashboard"]').click();restore(True);audit('active')
    if width in [1440,390]:q.screenshot(path=str(OUT/(('before-' if args.baseline else '')+'active-'+str(width)+'.png')),full_page=True)
    restore();q.locator('a[href="#review"]').click();audit('review-after-restore');settings('display');audit('settings-display');q.locator('#settings-dialog').evaluate('e=>e.scrollTop=e.scrollHeight');audit('settings-scrolled');q.locator('#settings-dialog').evaluate('e=>e.scrollTop=0');q.locator('#settings-dialog [data-close]').click();q.locator('a[href="#dashboard"]').click();q.locator('.session-panel [data-action=backdate]').click();audit('record-form')
    if width in [1440,390]:q.locator('#edit-dialog').screenshot(path=str(OUT/(('before-' if args.baseline else '')+'record-'+str(width)+'.png')))
    q.locator('#edit-dialog [data-close]').click();q.locator('.today-panel [data-action=plan-edit][data-id=p0]').click();audit('plan-form')
    if width in [1440,390]:q.locator('#edit-dialog').screenshot(path=str(OUT/(('before-' if args.baseline else '')+'plan-'+str(width)+'.png')))
    q.locator('#edit-dialog [data-close]').click()
   assert not errors,errors;b.close()
 finally:server.terminate();server.wait(timeout=5)
result={'result':'baseline' if args.baseline else 'pass' if not failures else 'fail','checks':checks,'failures':failures,'pageErrors':errors,'physicalDeviceTested':False};(OUT/('before.json' if args.baseline else 'results.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'result':result['result'],'failures':failures,'reviewAlignment':[{'width':v['width'],**v['metrics']} for v in checks if v['name']=='review']},ensure_ascii=False,indent=2));assert args.baseline or not failures
if not args.baseline:assert all(v.get('metrics',{}).get('reviewControlCenterDifference',0)<=2 for v in checks)
