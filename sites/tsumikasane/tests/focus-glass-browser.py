"""Lightweight reflection: no backdrop capture, no per-scroll JS styling."""
import datetime,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'qa/focus-glass';OUT.mkdir(parents=True,exist_ok=True);BASE='http://127.0.0.1:4565';errors=[];checks=[]
with tempfile.TemporaryDirectory(prefix='focus-light-glass-') as temp:
 s=subprocess.Popen(['node','server.mjs'],cwd=ROOT/'focus-sync',env={**os.environ,'PORT':'4565','FOCUS_DATA_DIR':temp},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(BASE+'/focus.html').close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
   for mobile in [False,True]:
    c=b.new_context(viewport={'width':390 if mobile else 1440,'height':844},has_touch=mobile,is_mobile=mobile);q=c.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE+'/focus.html');q.locator('#settings').click()
    for skin in ['glass','chrome','garnet','aero','opium']:
     q.locator('#skin-mode').select_option(skin);expect(q.locator('html')).to_have_attribute('data-glass','on');assert q.locator('#focus-glass-lens').count()==0
     assert q.locator('.panel,#sidebar,#primary-nav').evaluate_all('(els)=>els.every(e=>getComputedStyle(e).backdropFilter==="none")')
     q.locator('#glass-effects').uncheck();assert q.locator('.panel,#sidebar,#primary-nav').evaluate_all('(els)=>els.every(e=>getComputedStyle(e).backdropFilter==="none")');q.locator('#glass-effects').check()
    q.locator('#settings-dialog [data-close]').click();q.evaluate('document.body.style.minHeight="2400px"');q.evaluate('scrollTo(0,0)');q.wait_for_timeout(100)
    q.evaluate('''()=>{window.rootWrites=0;new MutationObserver(rs=>rootWrites+=rs.length).observe(document.documentElement,{attributes:true,attributeFilter:['style']})}''')
    first=q.locator('.panel').first.evaluate('e=>getComputedStyle(e,"::before").opacity');q.evaluate('scrollTo(0,600)');q.wait_for_timeout(150);second=q.locator('.panel').first.evaluate('e=>getComputedStyle(e,"::before").opacity');assert q.evaluate('rootWrites')==0
    if q.evaluate('CSS.supports("animation-timeline","scroll()")'):assert first!=second,(first,second)
    q.emulate_media(reduced_motion='reduce');expect(q.locator('html')).to_have_attribute('data-glass-motion','static');assert q.locator('.panel').first.evaluate('e=>getComputedStyle(e,"::before").animationName')=='none';checks.append({'mobile':mobile,'noBackdropCapture':True,'noSVGDisplacement':True,'noGlobalStyleWritesOnScroll':True,'nativeScrollReflection':True,'reducedMotion':True});c.close()
   assert not errors; b.close()
 finally:s.terminate();s.wait(timeout=5)
r={'result':'pass','checks':checks,'pageErrors':errors,'physicalSafariTested':False,'nativeAppleLiquidGlassUsed':False};(OUT/'results.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
