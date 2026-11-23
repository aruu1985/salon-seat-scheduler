from playwright.sync_api import sync_playwright
from pathlib import Path
import json,os
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:8765/')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  context=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block')
  context.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+";for(let i=0;i<5;i++)testDocs['salons/default/staff/synthetic'+i]={role:'designer',code:String(100+i),active:true};")
  context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE) else route.fulfill(status=200,body=''))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  date=page.locator('#dateInput').input_value();year=date[:4]
  def hours(start='11:00',end='20:00',status='specialHours'):
   page.evaluate('''([date,year,start,end,status])=>{testDocs['salons/default/storeCalendar/'+year]={overrides:{[date]:{status,startTime:start,endTime:end}}};testEmit('salons/default/storeCalendar/'+year)}''',[date,year,start,end,status])
   page.wait_for_timeout(80)
  page.locator('#addBtn').click();page.locator('#name').fill('測試預約')
  for start,end,n in [('11:00','20:00',18),('08:00','20:00',24),('11:00','16:00',10),('11:00','21:00',20)]:
   hours(start,end);page.locator('#duration + button').click();page.wait_for_selector('dialog[open]');assert page.locator('.durationWheel [role=option]').count()==n
   page.locator('.durationWheel').press('End');page.wait_for_timeout(200);assert page.locator('.wheelStatus').inner_text()==f'{n/2:g} 小時'
   assert page.locator('dialog').bounding_box()['width']<=width
   page.locator('[data-cancel]').click();assert page.locator('#duration').input_value()=='2'
  hours();page.locator('#duration + button').click();page.locator('.durationWheel').press('End');page.locator('[data-confirm]').click();assert page.locator('#duration').input_value()=='18'
  page.locator('#start').select_option('15:00');page.locator('#saveBtn').click();page.wait_for_timeout(200);assert page.locator('#modal').evaluate("e=>e.classList.contains('open')");assert not page.evaluate('testWrites.length');assert '營業' in page.locator('#toast').inner_text()
  page.locator('#start').select_option('11:00');page.locator('#saveBtn').click();page.wait_for_timeout(250);assert page.evaluate('testWrites.length')==1
  block=page.locator('.appt').first;row=page.locator('.cell').first.bounding_box()['height'];assert abs(block.bounding_box()['height']-(18*row-6))<1
  block.click();page.locator('#actionEdit').click();assert page.locator('#duration').input_value()=='18';assert page.locator('#duration + button').inner_text()=='9 小時'
  # Historical duration remains on reopen even after business hours shrink.
  hours('11:00','16:00');page.locator('#cancelBtn').click();block.click();page.locator('#actionEdit').click();assert page.locator('#duration').input_value()=='18'
  page.locator('#duration + button').click();page.locator('[data-cancel]').click();assert page.locator('#duration').input_value()=='18'
  page.locator('#cancelBtn').click()
  # Closed dates reject new bookings and preserve the form.
  hours(status='closed');page.locator('#addBtn').click();page.locator('#saveBtn').click();page.wait_for_timeout(150);assert page.evaluate('testWrites.length')==1
  hours();page.locator('#duration + button').click();page.locator('.durationWheel').press('Home');page.locator('[data-confirm]').click()
  page.locator('#hasSecondary').check();page.locator('#secondaryDuration + button').click();assert page.locator('.durationWheel [role=option]').count()==18;page.locator('.durationWheel').press('Home');page.locator('[data-confirm]').click()
  page.locator('#start').select_option('11:00');page.locator('#secondaryTime').select_option('20:00');page.locator('#saveBtn').click();page.wait_for_timeout(150);assert page.evaluate('testWrites.length')==1
  page.locator('#secondaryTime').select_option('12:00');page.locator('#saveBtn').click();page.wait_for_timeout(250);assert page.evaluate('testWrites.length')==2
  small=page.locator('.appt').filter(has_text='未命名');assert abs(small.bounding_box()['height']-(row-6))<1
  # Firestore snapshot data reconstructed on reload (simulated).
  docs=page.evaluate('testDocs');page.reload();page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  page.evaluate('''docs=>{testDocs=docs;Object.keys(testListeners).forEach(testEmit)}''',docs);page.wait_for_timeout(200);assert page.locator('.appt').count()==2
  assert not errors,errors
  print(f'PASS viewport {width}x{height}: limits, snap/keyboard, confirm/cancel, saves, historical values, secondary, grid heights, mock reload')
  context.close()
 browser.close()
