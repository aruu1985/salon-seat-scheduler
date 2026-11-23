"""Synthetic SDK/browser tests; no production Firebase access."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:19776/';DATE='2028-02-29';PREFIX=f'salons/default/dates/{DATE}/appointments/'
fixture={f'salons/default/staff/p{i}':{'code':str(i+2),'name':'合成人員','role':'designer' if i<3 else 'technician','active':True} for i in range(5)}
fixture.update({PREFIX+f'a{i}':{'name':'合成客人','startTime':'10:00','start':4,'duration':2,'col':i+1,'designer':'x','services':['K剪']} for i in range(5)})
with sync_playwright() as p:
 engine=os.environ.get('HEADER_ENGINE','chromium');browser=p.webkit.launch(headless=True) if engine=='webkit' else p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block');ctx.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+'\nwindow.testDocs='+json.dumps(fixture)+';');ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  page.locator('#dateInput').fill(DATE);page.locator('#dateInput').press('Tab');page.wait_for_timeout(120)
  page.evaluate("testDocs['salons/default/staff/p4'].fixedOffDay=2;testEmit('salons/default/staff')")
  assert page.evaluate("SalonStaff.capacityData('2028-02-29').people.find(p=>p.id==='p4').entry.status")=='fixed-off-unconfirmed'
  # Effective schedule is shared: daily override > monthly exception > normal default.
  page.evaluate("testDocs['salons/default/schedules/2028-02']={exceptions:{'2028-02-29':{p4:{status:'early',time:'10:30'}}}};testEmit('salons/default/schedules/2028-02')")
  assert page.evaluate("SalonStaff.capacityData('2028-02-29').people.find(p=>p.id==='p4').entry.time")=='10:30'
  page.evaluate("testDocs['salons/default/dates/2028-02-29']={staffing:{entries:{p4:{working:true,status:'normal'}}}};testEmit('salons/default/dates/2028-02-29')")
  assert page.evaluate("SalonStaff.capacityData('2028-02-29').people.find(p=>p.id==='p4').entry.status")=='normal'
  page.evaluate("delete testDocs['salons/default/schedules/2028-02'];testEmit('salons/default/schedules/2028-02')")
  page.evaluate("testListeners['salons/default/staff'].forEach(({cb})=>cb({docs:Object.entries(testDocs).filter(([p])=>p.startsWith('salons/default/staff/')).map(([p,d])=>({id:p.split('/').pop(),data:()=>d})),metadata:{fromCache:true}}))")
  assert not page.evaluate("SalonStaff.capacityData('2028-02-29').complete")
  page.evaluate("delete testDocs['salons/default/staff/p4'].fixedOffDay;testEmit('salons/default/staff')")
  page.locator('#addBtn').click();page.wait_for_timeout(80);page.locator('#name').fill('合成第六位');page.locator('#note').fill('保留未儲存內容');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();text=page.locator('.capacityBody').inner_text();assert '6 位' in text and '5 位' in text and '10:00～11:00' in text,text
  assert page.evaluate('testWrites.length')==0;assert page.locator('.capacityBody section').count()==1
  page.screenshot(path='/tmp/capacity-warning-'+str(width)+'.png');bounds=page.locator('.capacityPanel').bounding_box();assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1
  page.locator('#capacityBack').click();assert page.locator('#name').input_value()=='合成第六位';assert page.locator('#note').input_value()=='保留未儲存內容';assert page.evaluate('testWrites.length')==0
  page.locator('#saveBtn').click();page.locator('#capacityProceed').click();page.wait_for_function("!document.querySelector('#modal').classList.contains('open')");assert page.locator('.appt').count()==6;assert page.evaluate('testWrites.length')==1
  new=page.locator('.appt').filter(has_text='第六位');new.click();page.locator('#actionEdit').click();page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();assert '6 位' in page.locator('.capacityBody').inner_text();assert '7 位' not in page.locator('.capacityBody').inner_text();page.locator('#capacityBack').click();page.locator('#cancelBtn').click()
  # Another device editing this same booking during the warning cannot be overwritten.
  identifier=new.get_attribute('data-id');new.click();page.locator('#actionEdit').click();page.locator('#note').fill('本機未儲存');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();writes=page.evaluate('testWrites.length')
  page.evaluate("path=>{testDocs[path].note='另一裝置新版';testRevision++;testEmit(path)}",PREFIX+identifier);page.locator('#capacityProceed').click();page.wait_for_timeout(150);assert page.evaluate('testWrites.length')==writes;assert page.locator('#note').input_value()=='本機未儲存';assert page.evaluate('path=>testDocs[path].note',PREFIX+identifier)=='另一裝置新版';page.locator('#cancelBtn').click()
  # Missing actual half-day time is unknown, and changed live data requires a fresh acknowledgement.
  page.evaluate("testDocs['salons/default/dates/2028-02-29']={staffing:{entries:{p4:{status:'afternoon',working:true}}}};testEmit('salons/default/dates/2028-02-29')")
  page.locator('#addBtn').click();page.wait_for_timeout(80);page.locator('#name').fill('合成未知人力');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();assert '人力資料不完整' in page.locator('.capacityBody').inner_text();assert '無法確認' in page.locator('.capacityBody').inner_text()
  writes=page.evaluate('testWrites.length');page.evaluate("testDocs['salons/default/dates/2028-02-29']={staffing:{entries:{p4:{status:'normal',working:true}}}};testEmit('salons/default/dates/2028-02-29')");page.locator('#capacityProceed').click();page.wait_for_timeout(100);assert page.locator('#capacityModal.open').count()==1;assert '無法確認' not in page.locator('.capacityBody').inner_text();assert page.evaluate('testWrites.length')==writes;page.locator('#capacityBack').click();page.locator('#cancelBtn').click()
  # Master data changes use the same existing listener, no extra watchers.
  count=page.evaluate('Object.values(testListeners).reduce((sum,list)=>sum+list.length,0)');page.evaluate("testDocs['salons/default/staff/p4'].status='irrelevant';testDocs['salons/default/staff/p4'].active=false;testEmit('salons/default/staff')")
  page.locator('#addBtn').click();page.wait_for_timeout(80);page.locator('#name').fill('保留測試');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();assert '4 位' in page.locator('.capacityBody').inner_text()
  # Another device takes the chosen seat while other seats remain free: never silently relocate.
  page.evaluate('''prefix=>{for(let i=6;i<7;i++)testDocs[prefix+'a'+i]={name:'合成座位',startTime:'10:00',start:4,duration:2,col:i+1,designer:'x',services:[]};testEmit(prefix.slice(0,-1))}''',PREFIX)
  writes=page.evaluate('testWrites.length');page.locator('#capacityProceed').click();page.wait_for_timeout(150);assert page.locator('#modal.open').count()==1;assert page.locator('#capacityModal.open').count()==0;assert page.evaluate('testWrites.length')==writes;assert page.locator('#name').input_value()=='保留測試';assert page.evaluate('Object.values(testListeners).reduce((sum,list)=>sum+list.length,0)')==count
  # Long detail remains scrollable with both touch-sized buttons inside the viewport.
  page.evaluate("()=>{SalonCapacityPrompt.ask({ranges:Array.from({length:20},(_,i)=>({start:600+i*30,end:630+i*30,type:'overload',guestsMin:6,guestsMax:6,staffMin:5,staffMax:5,reasons:[]}))})}")
  assert page.locator('.capacityBody').evaluate('e=>e.scrollHeight>e.clientHeight')
  for selector in ['#capacityBack','#capacityProceed']:
   box=page.locator(selector).bounding_box();assert box['height']>=44 and box['y']>=0 and box['y']+box['height']<=height
  page.keyboard.press('Tab');assert page.locator('#capacityProceed').evaluate('e=>e===document.activeElement');page.keyboard.press('Escape');assert page.locator('#capacityModal.open').count()==0;assert page.evaluate('testWrites.length')==writes
  assert not errors,errors;print(f'PASS {engine} {width}: warning/return/proceed, preserved draft, edited customer once, current staff, post-warning seat check, unchanged listener count',flush=True);ctx.close()
 browser.close()
