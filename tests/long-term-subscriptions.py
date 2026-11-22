"""Application subscribe/request counters, not measured Firestore billing."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,json
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:18776/'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 results={}
 for baseline in [True,False]:
  context=browser.new_context(service_workers='block');context.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+'''\nwindow.starts={};const originalCollection=firebase.firestore().collection;firebase.firestore().collection=n=>{const wrap=r=>{const c=r.collection,d=r.doc,l=r.onSnapshot;r.collection=(...x)=>wrap(c(...x));r.doc=(...x)=>wrap(d(...x));r.onSnapshot=(...x)=>{starts[r.path]=(starts[r.path]||0)+1;return l(...x)};return r};return wrap(originalCollection(n))};''')
  requests=[0];measuring=[False]
  def route(r):
   u=r.request.url
   if u=='https://data.gov.tw/dataset/14718':
    if measuring[0]:requests[0]+=1
    r.fulfill(status=200,body='')
   elif baseline and u==BASE:r.fulfill(body=subprocess.check_output(['git','show','bbcfab4:index.html']).decode(),content_type='text/html')
   elif baseline and '/version.json' in u:r.fulfill(body=json.dumps({'version':'0.12.6','build':'0fa8a590b2a6ceff'}),content_type='application/json')
   elif u.startswith(BASE):r.continue_()
   else:r.fulfill(status=200,body='')
  context.route('**/*',route);page=context.new_page();page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");page.wait_for_timeout(150);measuring[0]=True
  for day in range(1,21):page.locator('#dateInput').fill(f'2028-01-{day:02}');page.locator('#dateInput').press('Tab');page.wait_for_timeout(30)
  data=page.evaluate("()=>({month:starts['salons/default/schedules/2028-01'],store:starts['salons/default/storeCalendar/2028'],annual:starts['salons/default/annualCalendars/2028'],writes:testWrites.length})");data['governmentRequests']=requests[0];assert data['writes']==0;results['baseline' if baseline else 'new']=data;context.close()
 assert results['baseline']['month']==20 and results['new']['month']==1,results
 assert results['baseline']['store']==21 and results['new']['store']==2,results
 assert results['baseline']['governmentRequests']>=20 and results['new']['governmentRequests']==1,results
 print('PASS application registrations/HTTP requests across 20 same-month dates (NOT real Firestore billing): '+json.dumps(results),flush=True);browser.close()
