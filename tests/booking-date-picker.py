"""Two-stage date interaction using synthetic Firebase only; external requests blocked."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:19786/');engine=os.environ.get('HEADER_ENGINE','chromium')
fixtures={f'salons/default/staff/p{i}':{'code':str(i+2),'role':'designer','active':True} for i in range(5)}
for d in ['2027-01-31','2028-02-29','2029-02-28','2028-12-31','2029-01-31']:
 fixtures[f'salons/default/dates/{d}/appointments/example']={'name':'合成測試預約','start':4,'startTime':'10:00','duration':2,'col':1,'designer':'2','services':['洗剪']}
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if engine=='webkit' else p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block',timezone_id='Asia/Taipei');ctx.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+'\nwindow.testDocs='+json.dumps(fixtures)+';');ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  page.locator('#dateInput').fill('2026-12-31');page.locator('#dateInput').dispatch_event('change');page.wait_for_timeout(120)
  page.evaluate("window.dateChangeCount=0;document.querySelector('#dateInput').addEventListener('change',()=>dateChangeCount++)")
  def open_picker():
   page.locator('#datePickerOpen').click();page.locator('#bookingDatePicker[open]').wait_for()
  def choose_year_month(year,month):
   page.locator('[data-year-month]').click();yw=page.locator('[data-year-wheel]');mw=page.locator('[data-month-wheel]')
   # Real click on year option, keyboard month selection.
   yw.locator(f'[data-value="{year}"]').click();mw.focus();mw.press('Home')
   for _ in range(month-1):mw.press('ArrowDown')
  def check_calendar(year,month,days):
   assert page.locator('[data-year-month]').inner_text()==f'{year}年{month}月 ▾';assert page.locator('.bookingDays button').count()==days
  # January: first check returns to calendar without changing data or closing the dialog.
  open_picker();before=page.evaluate('JSON.stringify(testDocs)');reads=page.evaluate('testReads.length');choose_year_month(2027,1);page.locator('#bookingDatePicker [data-confirm]').click();check_calendar(2027,1,31);assert page.locator('#bookingDatePicker[open]').count()==1;assert page.locator('#dateInput').input_value()=='2026-12-31';assert page.evaluate('dateChangeCount')==0;assert page.evaluate('testReads.length')==reads;page.locator('#bookingDatePicker [data-cancel]').click()
  # Leap/non-leap February, plus 31-day preference preserved on returning to March.
  for year,days in [(2028,29),(2029,28)]:
   open_picker();original=page.locator('#dateInput').input_value();count=page.evaluate('dateChangeCount');choose_year_month(year,2);page.locator('#bookingDatePicker [data-confirm]').click();check_calendar(year,2,days);assert page.locator('#dateInput').input_value()==original;assert page.evaluate('dateChangeCount')==count;assert page.locator('.bookingDays [aria-pressed=true]').inner_text()==str(days)
   page.locator('[data-month-next]').click();check_calendar(year,3,31);assert page.locator('.bookingDays [aria-pressed=true]').inner_text()==str(int(original.split('-')[-1]));page.locator('[data-month-prev]').click()
   page.locator(f'.bookingDays [data-day="{days}"]').click();assert page.locator('#dateInput').input_value()==original;page.locator('#bookingDatePicker [data-confirm]').click();assert page.locator('#bookingDatePicker[open]').count()==0;assert page.locator('#dateInput').input_value()==f'{year}-02-{days}';assert page.evaluate('dateChangeCount')==count+1;assert page.locator('.appt').count()==1
  # Cross-year month arrows, reset in both screens, and cancel never applies a draft.
  page.locator('#dateInput').fill('2028-12-31');page.locator('#dateInput').dispatch_event('change');open_picker();page.locator('[data-month-next]').click();check_calendar(2029,1,31);page.locator('[data-month-prev]').click();check_calendar(2028,12,31)
  page.locator('.bookingDays [data-day="2"]').click();page.locator('[data-reset]').click();assert page.locator('.bookingDays [aria-pressed=true]').inner_text()=='31';choose_year_month(2029,2);page.locator('[data-reset]').click();assert page.locator('[data-year-wheel] [aria-selected=true]').inner_text()=='2028年';assert page.locator('[data-month-wheel] [aria-selected=true]').inner_text()=='12月';page.locator('#bookingDatePicker [data-confirm]').click();check_calendar(2028,12,31);page.keyboard.press('Escape');assert page.locator('#dateInput').input_value()=='2028-12-31'
  # True scroll interaction, including year range recentering beyond the initial wheel window.
  open_picker();page.locator('[data-year-month]').click();yw=page.locator('[data-year-wheel]');box=yw.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.wheel(0,88);page.wait_for_timeout(350);assert yw.locator('[aria-selected=true]').inner_text()!='2028年';yw.focus();yw.press('End');assert yw.locator('[aria-selected=true]').inner_text()=='9999年';yw.press('Home');assert yw.locator('[aria-selected=true]').inner_text()=='1年';page.locator('#bookingDatePicker [data-cancel]').click();assert page.locator('#dateInput').input_value()=='2028-12-31'
  assert page.evaluate('testWrites.length')==0;assert page.evaluate('JSON.stringify(testDocs)')==before;assert not errors,errors
  open_picker();bounds=page.locator('#bookingDatePicker').bounding_box();assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1 and bounds['y']>=0 and bounds['y']+bounds['height']<=height+1;page.screenshot(path=f'/tmp/booking-date-picker-{engine}-{width}.png');page.locator('#bookingDatePicker [data-cancel]').click()
  print(f'PASS {engine} {width}: two-stage confirmation, January, leap/non-leap February, preferred day, year rollover, reset/cancel, true wheel scroll, 1–9999 years, one change event, existing records read without writes',flush=True);ctx.close()
 browser.close()
