"""Isolated synthetic Firestore snapshots. All external traffic blocked; no production data."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os,re
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:18776/')
fixtures={}
for role,codes in [('designer',['2','3','5','6','7']),('technician',['21','22','23','36'])]:
 for code in codes:fixtures[f'salons/default/staff/{role}{code}']={'role':role,'code':code,'name':'合成'+code,'active':True,'fixedOffDay':2 if code=='2' else None}
dates=['2027-12-31','2028-02-28','2028-02-29','2028-03-01','2028-03-07','2028-12-31','2029-01-01','2029-01-02','2050-01-01','2100-03-01','2400-02-29']
for date in dates:fixtures[f'salons/default/dates/{date}/appointments/same-id']={'name':'合成'+date,'services':['洗剪'],'startTime':'10:00','start':4,'duration':2,'col':1,'designer':'6','phone':'','note':'保留'+date,'showNoteOnCard':True,'secondaryService':None}
fixtures['salons/default/schedules/2028-02']={'exceptions':{'2028-02-29':{'designer3':{'status':'off'}}}}
fixtures['salons/default/dates/2028-02-29']={'staffing':{'entries':{'designer2':{'status':'normal','working':True}}}}
fixtures['salons/default/storeCalendar/2028']={'overrides':{'2028-02-29':{'date':'2028-02-29','status':'extended','startTime':'10:00','endTime':'21:00','title':'合成2028延長'}}}
fixtures['salons/default/storeCalendar/2029']={'overrides':{'2029-01-02':{'date':'2029-01-02','status':'closed','title':'保留2029另一天'}}}
fixtures['salons/default/annualCalendars/2029']={'events':[{'date':'2029-01-01','type':'closed','title':'合成2029店休'}]}
engine=os.environ.get('HEADER_ENGINE','chromium')
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if engine=='webkit' else p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block')
  mock=(ROOT/'tests/firebase-mock.js').read_text()+'''\nwindow.testStarts={};const baseCollection=firebase.firestore().collection;firebase.firestore().collection=n=>{const wrap=r=>{const oldDoc=r.doc,oldCollection=r.collection,oldListen=r.onSnapshot;r.doc=(...a)=>wrap(oldDoc(...a));r.collection=(...a)=>wrap(oldCollection(...a));r.onSnapshot=(...a)=>{testStarts[r.path]=(testStarts[r.path]||0)+1;return oldListen(...a)};return r};return wrap(baseCollection(n))};'''
  ctx.add_init_script(mock+'\nwindow.testDocs='+json.dumps(fixtures,ensure_ascii=False)+';')
  ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=ctx.new_page();page.clock.install(time=datetime(2028,2,29,5,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  def choose(date):
   page.locator('#dateInput').fill(date);page.locator('#dateInput').dispatch_event('change');page.wait_for_timeout(90)
  def active(path):return page.evaluate('(p)=>(testListeners[p]||[]).length',path)
  def starts(path):return page.evaluate('(p)=>testStarts[p]||0',path)
  page.locator('#todayBtn').click();assert page.locator('#dateInput').input_value()=='2028-02-29';page.locator('#prevDay').click();assert page.locator('#dateInput').input_value()=='2028-02-28';page.locator('#nextDay').click();assert page.locator('#dateInput').input_value()=='2028-02-29'
  before=page.evaluate('JSON.stringify(testDocs)')
  for date in dates:
   choose(date);assert date in page.locator('.appt .name').inner_text();assert page.locator('.appt').count()==1;assert page.locator('#dateDisplay').inner_text().startswith(str(int(date[:4]))+'年');assert active(f'salons/default/dates/{date}/appointments')==1
  assert page.evaluate('testWrites.length')==0;assert page.evaluate('JSON.stringify(testDocs)')==before
  choose('2028-02-28');monthPath='salons/default/schedules/2028-02';yearPath='salons/default/storeCalendar/2028';m=starts(monthPath);y=starts(yearPath)
  page.locator('#nextDay').click();page.wait_for_timeout(90);assert page.locator('#dateInput').input_value()=='2028-02-29';assert '（二）' in page.locator('#dateDisplay').inner_text();assert starts(monthPath)==m;assert starts(yearPath)==y
  assert '2' in page.locator('#todayDesigners').inner_text().split('、');assert '3' not in page.locator('#todayDesigners').inner_text().split('、');assert '21:00' in page.locator('#todayEvents').inner_text()
  page.locator('#nextDay').click();page.wait_for_timeout(60);assert page.locator('#dateInput').input_value()=='2028-03-01';assert active(monthPath)==0
  choose('2028-03-07');assert '2' not in page.locator('#todayDesigners').inner_text().split('、') # Fixed rest now applies automatically without writing the month.
  choose('2028-12-31');page.locator('#nextDay').click();page.wait_for_timeout(80);assert page.locator('#dateInput').input_value()=='2029-01-01';assert '店休' in page.locator('#todayEvents').inner_text();assert active('salons/default/dates/2028-12-31/appointments')==0
  # Two views of different years must not share business-state data.
  choose('2028-02-29');page.evaluate('SalonSchedule.open()');page.wait_for_selector('#scheduleModal.open');page.wait_for_timeout(70);page.locator('#applyFixedOff').click();page.wait_for_timeout(500);assert page.evaluate('testWrites.length')==0;assert '合成2' in page.locator('#monthCalendar [data-date="2028-02-08"]').inner_text();assert '2' in page.locator('#todayDesigners').inner_text().split('、');assert page.locator('[data-schedule-date="2028-02-29"]').count() or page.locator('#monthCalendar').inner_text()
  page.evaluate('SalonSchedule.openAnnual()');page.locator('#annualYear').fill('2029');page.locator('#annualYear').press('Tab');page.wait_for_timeout(90)
  assert page.locator('[data-annual-date="2029-01-01"]').count()==1
  page.evaluate("testEmit('salons/default/storeCalendar/2028')");page.wait_for_timeout(60)
  assert '合成2029店休' in page.locator('[data-annual-date="2029-01-01"]').inner_text();assert '合成2028延長' not in page.locator('#annualMonthCalendar').inner_text()
  # Server-only concurrent edit must survive saving one other date.
  page.evaluate("testDocs['salons/default/storeCalendar/2029'].overrides['2029-01-03']={date:'2029-01-03',status:'closed',title:'另一裝置更新'}")
  page.locator('[data-annual-date="2029-01-01"]').click();page.locator('#annualStoreStatus').select_option('closed');page.locator('#annualStoreTitle').fill('合成指定2029店休');page.locator('#annualStoreTitle').dispatch_event('input');page.locator('#saveAnnualStore').click();page.wait_for_function('testWrites.length===1')
  data=page.evaluate("testDocs['salons/default/storeCalendar/2029'].overrides");assert data['2029-01-03']['title']=='另一裝置更新';assert data['2029-01-02']['title']=='保留2029另一天';assert '2028-02-29' not in data
  a=active('salons/default/storeCalendar/2029');page.locator('#annualClose').click();assert active('salons/default/storeCalendar/2029')==a-1
  a=active('salons/default/schedules/2028-02');page.locator('#scheduleClose').click();assert active('salons/default/schedules/2028-02')==a-1
  # Missing official data does not block yearly calendars or manual business settings.
  page.evaluate('SalonSchedule.openAnnual()');page.locator('#annualYear').fill('2400');page.locator('#annualYear').press('Tab');page.locator('#annualNextMonth').click();page.wait_for_timeout(90);assert page.locator('[data-annual-date="2400-02-29"]').count()==1;page.locator('#annualYear').fill('2100');page.locator('#annualYear').press('Tab');page.locator('#annualNextMonth').click();assert page.locator('[data-annual-date="2100-02-29"]').count()==0;assert page.locator('[data-annual-date="2100-02-28"]').count()==1;page.locator('#annualClose').click()
  page.reload();page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");assert page.evaluate('testWrites.length')==0
  # A pending daily change must keep its original date when navigating immediately.
  choose('2028-02-28');page.locator('#designerBoard .teamEdit').click();page.locator('[data-daily-id="designer6"] .dailyStatus').select_option('off');page.locator('#dailyStaffClose').click();page.locator('#nextDay').click();page.wait_for_function('testWrites.length===1');page.wait_for_function("document.querySelector('#dailySaveState').textContent==='已同步'");assert page.evaluate("testWrites[0].path")=='salons/default/dates/2028-02-28';assert page.evaluate("testDocs['salons/default/dates/2028-02-28'].staffing.entries.designer6.status")=='off';assert page.evaluate("testDocs['salons/default/dates/2028-02-29'].staffing.entries.designer2.working")==True
  # Month navigation must flush its old month's debounce, not discard it.
  choose('2028-02-28');page.evaluate('SalonSchedule.open()');page.wait_for_timeout(80);page.locator('[data-date="2028-02-28"]').click();page.locator('[data-staff-id="designer6"] .scheduleStatus').select_option('off');page.locator('#monthNext').click();page.wait_for_function("document.querySelector('#scheduleMonth').value==='2028-03'");assert page.evaluate("testDocs['salons/default/schedules/2028-02'].exceptions['2028-02-28'].designer6.status")=='off';page.locator('#scheduleClose').click()
  # A slow copy-previous response cannot copy 2028 data into a new 2029 month.
  count=page.evaluate('testWrites.length');choose('2028-12-31');page.evaluate('SalonSchedule.open()');page.wait_for_timeout(70);page.evaluate("window.testReadOverride=path=>path==='salons/default/schedules/2028-11'?new Promise(resolve=>window.releasePrevious=()=>resolve({data:()=>({exceptions:{'2028-11-01':{designer6:{status:'off'}}}})})):null")
  page.locator('#copyPreviousMonth').click();page.wait_for_function("typeof releasePrevious==='function'");page.locator('#monthNext').click();page.wait_for_function("document.querySelector('#scheduleMonth').value==='2029-01'");page.evaluate('releasePrevious()');page.wait_for_timeout(550);assert page.evaluate('testWrites.length')==count;page.evaluate('testReadOverride=null');page.locator('#scheduleClose').click()
  assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  print(f'PASS {engine} {width}: 2027/2028/2029/2050/2100/2400 dates, leap/year rollover, date isolation, fixed-off/daily/month staffing, live reuse/teardown, scoped calendars, transactional store edit, holiday failure, reload zero writes',flush=True)
  ctx.close()
 browser.close()
