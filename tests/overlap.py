from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:8765/'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  context=browser.new_context(viewport={'width':width,'height':height},service_workers='block');context.add_init_script(path=str(ROOT/'tests/firebase-mock.js'));context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  def seed(appointments):
   page.evaluate('''items=>{const date=document.querySelector('#dateInput').value,path='salons/default/dates/'+date+'/appointments';Object.keys(testDocs).filter(p=>p.startsWith(path+'/')).forEach(p=>delete testDocs[p]);for(const a of items)testDocs[path+'/'+a.id]={...a,name:a.id,designer:'2',services:['洗剪'],startTime:String(8+Math.floor(a.start/2)).padStart(2,'0')+':'+(a.start%2?'30':'00')};testEmit(path)}''',appointments);page.wait_for_timeout(100)
  a={'id':'test-a','col':1,'start':4,'duration':2};b={'id':'test-b','col':1,'start':6,'duration':3}
  seed([a,b]);first=page.locator('[data-id=test-a]');second=page.locator('[data-id=test-b]');assert not page.locator('.timeConflict').count();assert first.bounding_box()['y']+first.bounding_box()['height']<=second.bounding_box()['y'];assert first.bounding_box()['width']==second.bounding_box()['width']
  original_width=first.bounding_box()['width'];b['start']=5;seed([a,b]);assert page.locator('.timeConflict').count()==2;assert page.locator('.conflictLabel').count()==2
  ra=first.bounding_box();rb=second.bounding_box();assert ra['x']+ra['width']<=rb['x'] or rb['x']+rb['width']<=ra['x'];assert ra['width']<original_width;assert '10:00～11:00' in first.get_attribute('title')
  # All cards remain present even with three overlapping records.
  seed([a,b,{'id':'test-c','col':1,'start':4,'duration':5}]);assert page.locator('.timeConflict').count()==3;assert page.locator('[data-lanes="3"]').count()==3
  assert page.evaluate('testWrites.length')==0
  # Scale only changes pixels, never duration, and conflict lanes still separate.
  page.locator('#zoomOut').click();page.locator('#zoomOut').click();r=page.locator('[data-id=test-c]').bounding_box();row=page.locator('.cell').first.bounding_box()['height'];assert abs(r['height']-(5*row-6*.8))<1
  page.screenshot(path=str(ROOT/f'test-results/conflict-{width}.png'));assert not errors,errors
  print(f'PASS {width}x{height}: touching appointments, real conflict lanes/badges, three cards visible, zoom height, no database writes')
  context.close()
 browser.close()
