"""Real double click / double tap on Start, using the same coordinates."""
import argparse,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-premium';parser=argparse.ArgumentParser();parser.add_argument('--baseline',action='store_true');args=parser.parse_args();BASE='http://127.0.0.1:4574'
fixture={'format':'focus-device','version':1,'data':{'version':2,'tasks':[],'events':[],'logs':[],'reflections':{},'history':[],'archive':{'tasks':[],'events':[],'logs':[]},'sourceTables':[]},'config':{'template':'focus','order':['capture','plan','progress','logs'],'progress':'calendar','routines':[{'id':'r','title':'学習','minutes':25,'activities':[{'id':'a','title':'演習','minutes':25}]}]},'timer':None};checks=[]
with tempfile.TemporaryDirectory() as d:
 s=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4574','FOCUS_DATA_DIR':d},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  for _ in range(80):
   try:urllib.request.urlopen(BASE+'/focus.html').close();break
   except OSError:time.sleep(.05)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   for mobile in [False,True]:
    c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844},has_touch=mobile,is_mobile=mobile,timezone_id='Asia/Tokyo',accept_downloads=True);q=c.new_page();q.goto(BASE+'/focus.html');q.locator('#settings').click();q.locator('[data-settings-tab=data]').click();q.locator('#restore').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});q.locator('#settings-dialog [data-close]').click();q.locator('.session-panel [data-action=pick]').click();q.locator('[data-action=pick-work]').click();q.locator('[data-action=picker-done]').click()
    if mobile:
     r=q.locator('[data-action=begin]').bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2;q.touchscreen.tap(x,y);time.sleep(.07);q.touchscreen.tap(x,y)
    else:q.locator('[data-action=begin]').dblclick(delay=70)
    time.sleep(1);active=q.locator('.active-session').count();q.locator('#settings').click();q.locator('[data-settings-tab=data]').click()
    with q.expect_download() as v:q.locator('[data-action=export]').click()
    logs=json.loads(Path(v.value.path()).read_text())['data']['logs'];q.locator('#settings-dialog [data-close]').click();checks.append({'mobile':mobile,'activeAfterDoubleStart':active,'accidentalLogs':len(logs)})
    if args.baseline:assert active==0 and len(logs)==1,checks[-1]
    else:
     assert active==1 and not logs,checks[-1];expect(q.locator('[data-action=finish]')).to_be_enabled();q.locator('[data-action=finish]').evaluate('(b)=>{b.click();b.click();b.click()}');expect(q.locator('.active-session')).to_have_count(0);q.locator('#settings').click();q.locator('[data-settings-tab=data]').click()
     with q.expect_download() as v:q.locator('[data-action=export]').click()
     assert len(json.loads(Path(v.value.path()).read_text())['data']['logs'])==1
    c.close()
   b.close()
 finally:s.terminate();s.wait()
result={'result':'pass','beforeFix':args.baseline,'checks':checks};(OUT/('start-double-click-before.json' if args.baseline else 'start-double-click-after.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result))
