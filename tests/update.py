from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re,hashlib
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:8765/'
html=(ROOT/'index.html').read_text();build=json.loads((ROOT/'version.json').read_text())['build']
assert f'app-build" content="{build}' in html
for file in re.findall(r'(?:src|href)="([^"?]+\.(?:js|css))"',html):
 if file.startswith('http'):continue
 assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()[:16] in file,file
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context();context.add_init_script(path=str(ROOT/'tests/firebase-mock.js'))
 context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("navigator.serviceWorker.controller!==null")
 page.evaluate("caches.open('salon-seat-legacy').then(c=>c.put('./old.js',new Response('old')))")
 # Reinstall worker with a different URL: activation must retire only app shell caches.
 page.evaluate("navigator.serviceWorker.register('./sw.js?test=2',{updateViaCache:'none'})")
 page.wait_for_function("caches.keys().then(keys=>!keys.includes('salon-seat-legacy'))")
 page.locator('#addBtn').click();page.locator('#name').fill('尚未儲存姓名');writes=page.evaluate('testWrites.length')
 context.route('**/version.json*',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps({'build':'test-new-release'})))
 page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow'))")
 page.wait_for_selector('.updateBanner');assert page.locator('.updateBanner button').is_disabled();assert page.locator('#name').input_value()=='尚未儲存姓名';assert page.evaluate('testWrites.length')==writes
 page.locator('#cancelBtn').click();assert page.locator('.updateBanner button').is_enabled()
 # Unsaved scheduling/store editor fields must also survive a version check.
 page.locator('#settingsBtn').click();page.locator('#monthlyScheduleBtn').click();page.locator('#monthStoreNote').fill('未儲存店況')
 page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow'))");page.wait_for_timeout(150);assert page.locator('.updateBanner button').is_disabled();assert page.locator('#monthStoreNote').input_value()=='未儲存店況'
 page.locator('#scheduleClose').click();page.locator('#settingsBtn').click();page.locator('#businessSettingsBtn').click();page.locator('#annualStoreNote').fill('未儲存年度店況')
 page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow'))");page.wait_for_timeout(150);assert page.locator('.updateBanner button').is_disabled();assert page.locator('#annualStoreNote').input_value()=='未儲存年度店況'
 page.locator('#annualClose').click();page.evaluate("document.getElementById('monthSaveState').textContent='等待同步…'");page.wait_for_timeout(50);assert page.locator('.updateBanner button').is_disabled()
 page.evaluate("document.getElementById('monthSaveState').textContent='已同步'");page.wait_for_timeout(50);assert page.locator('.updateBanner button').is_enabled()
 # The newly deployed entry and build marker arrive as one response; immutable assets already checked.
 context.route(BASE+'?build=test-new-release',lambda r:r.fulfill(status=200,content_type='text/html',body=html.replace(build,'test-new-release')))
 page.locator('.updateBanner button').click();page.wait_for_url('**/?build=test-new-release');page.wait_for_function("document.querySelector('meta[name=app-build]').content==='test-new-release'")
 assert not errors,errors
 print('PASS release asset hashes, worker cache retirement, unsaved form preserved, update gated by editor, new entry/build after explicit update')
 context.close();browser.close()
