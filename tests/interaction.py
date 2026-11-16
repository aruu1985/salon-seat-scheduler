from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:8765/'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,service_workers='block');context.add_init_script(path=str(ROOT/'tests/firebase-mock.js'));context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
 page=context.new_page();page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
 page.evaluate('''()=>{const date=document.querySelector('#dateInput').value;const year=date.slice(0,4);testDocs['salons/default/storeCalendar/'+year]={overrides:{[date]:{status:'extended',startTime:'06:00',endTime:'21:00'},'2027-01-01':{status:'closed'}}};testDocs['salons/default/storeCalendar/2027']={overrides:{'2027-01-01':{status:'extended',startTime:'08:00',endTime:'22:00'}}};testEmit('salons/default/storeCalendar/'+year)}''')
 page.wait_for_function("[...document.querySelectorAll('.time')].some(e=>e.textContent==='06:00')&&[...document.querySelectorAll('.time')].some(e=>e.textContent==='21:00')")
 page.locator('#addBtn').click();page.locator('#duration + button').click();wheel=page.locator('.durationWheel');box=wheel.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.wheel(0,132);page.wait_for_timeout(500);assert float(wheel.evaluate('e=>e.scrollTop'))>44
 wheel.press('Home');page.wait_for_timeout(200)
 cdp=context.new_cdp_session(page);x=box['x']+box['width']/2;y=box['y']+170
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 for offset in range(10,131,10):
  cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-offset}]});page.wait_for_timeout(25)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(700)
 assert float(wheel.evaluate('e=>e.scrollTop'))>0;assert abs(wheel.evaluate('e=>e.scrollTop')/44-round(wheel.evaluate('e=>e.scrollTop')/44))<0.03
 page.locator('[data-cancel]').click();page.locator('#hasSecondary').check();page.locator('#secondaryDate').fill('2027-01-01');page.locator('#secondaryDate').dispatch_event('change');page.wait_for_function("[...document.querySelector('#secondaryTime').options].some(o=>o.value==='22:00')")
 page.locator('#secondaryDuration + button').click();assert page.locator('.durationWheel [role=option]').count()==28;wheel.press('End');page.locator('[data-confirm]').click();assert page.locator('#secondaryDuration').input_value()=='28'
 page.locator('#secondaryDate').fill('2027-01-02');page.locator('#secondaryDate').dispatch_event('change');page.locator('#secondaryDuration + button').click();assert page.locator('.durationWheel [role=option]').count()==19;assert '14 小時' in page.locator('.wheelStatus').inner_text();page.locator('[data-cancel]').click();assert page.locator('#secondaryDuration').input_value()=='28'
 # Services still synchronize the displayed/backing duration; assignments and notes survive background snapshots.
 page.locator('#assign').fill('7');page.locator('#note').fill('保留備註');page.locator('#serviceChecks input').first.check();assert page.locator('#duration + button').inner_text()!=''
 page.evaluate("testEmit('salons/default/storeCalendar/'+document.querySelector('#dateInput').value.slice(0,4))");page.wait_for_timeout(100);assert page.locator('#assign').input_value()=='7';assert page.locator('#note').input_value()=='保留備註';assert page.locator('#serviceChecks input').first.is_checked()
 page.locator('#duration + button').click();page.screenshot(path=str(ROOT/'test-results/mobile-wheel.png'));page.locator('[data-cancel]').click()
 print('PASS mouse wheel, synthesized touch scroll and snapping, 06:00–21:00 axis, cross-year secondary hours/time choices, date switch without shortening, form preservation')
 context.close();browser.close()
