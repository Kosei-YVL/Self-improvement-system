import threading,urllib.request
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
# A loopback fixture serves two release IDs without editing the application.
release=[1]
class Proxy(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        release[0]=2;self.send_response(204);self.end_headers()
    def do_GET(self):
        try:
            with urllib.request.urlopen('http://127.0.0.1:4173'+self.path,timeout=5) as response:
                body=response.read();headers=dict(response.headers)
            if self.path.split('?')[0]=='/sw.js':body=body.replace(b'tsumikasane-shell-',('tsumikasane-shell-qa'+str(release[0])+'-').encode(),1)
            self.send_response(200)
            for key,value in headers.items():
                if key.lower() not in ['content-length','transfer-encoding','connection']:self.send_header(key,value)
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        except Exception:self.send_response(404);self.end_headers()
server=ThreadingHTTPServer(('127.0.0.1',4175),Proxy);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page();page.route('**/fonts.googleapis.com/**',lambda route:route.abort())
        page.goto('http://127.0.0.1:4175',wait_until='networkidle');page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.wait_for_function('!!navigator.serviceWorker.controller')
        page.evaluate("localStorage.setItem('tsumikasane-update-test','preserve')")
        page.request.post('http://127.0.0.1:4175/__qa/release');page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())');page.wait_for_function('navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)')
        page.locator('#header-settings').click();expect(page.locator('[data-pwa="update"]')).to_be_visible()
        with page.expect_navigation(wait_until='networkidle'):page.locator('[data-pwa="update"]').click()
        page.wait_for_function('caches.keys().then(keys=>keys.length===1&&keys[0].includes("qa2-"))')
        assert page.evaluate("localStorage.getItem('tsumikasane-update-test')")=='preserve'
        print('PWA update passed: waiting release, explicit update, old cache removed, saved state retained.');browser.close()
finally:server.shutdown();server.server_close()
