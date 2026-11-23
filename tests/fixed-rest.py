"""Fixed-rest regression with synthetic monthly/daily snapshots only; all external requests blocked."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json,csv,io
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:19816/');engine=os.environ.get('HEADER_ENGINE','chromium')
DESIGNERS=[('2','婉婷',1,[7,14,21,28]),('3','品婷',3,[2,9,16,23,30]),('5','左左',4,[3,10,17,24,31]),('6','Sam',2,[1,8,15,22,29]),('7','文文',1,[7,14,21,28])]
fixture={f'salons/default/staff/d{code}':{'code':code,'name':name,'role':'designer','active':True,'fixedOffDay':fixed} for code,name,fixed,days in DESIGNERS}
fixture.update({f'salons/default/staff/t{code}':{'code':str(code),'name':'合成技術師'+str(code),'role':'technician','active':True} for code in [21,22,23]})
MONTH='salons/default/schedules/2026-12'
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if engine=='webkit' else p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block',timezone_id='Asia/Taipei');ctx.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+'\nwindow.testDocs='+json.dumps(fixture)+';');ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  page.locator('#dateInput').fill('2026-12-01');page.locator('#dateInput').dispatch_event('change');page.locator('#settingsBtn').click();page.locator('#monthlyScheduleBtn').click();page.wait_for_function("document.querySelector('#monthSaveState').textContent==='已同步'")
  def names(day):return page.locator(f'#monthCalendar [data-date="2026-12-{day:02}"] .monthLeaveName').all_inner_texts()
  def click(selector):
   if width<1000:page.locator(selector).tap()
   else:page.locator(selector).click()
  if width<561:
   # The existing mobile layout hides the roster; verify its calendar/duty paths without inventing a touch entry.
   for code,name,fixed,days in DESIGNERS:assert [d for d in range(1,32) if name in names(d)]==days
   page.locator('#applyFixedOff').click();page.wait_for_timeout(500);assert page.evaluate('testWrites.length')==0;page.locator('#scheduleClose').click();assert page.locator('#todayDesigners').inner_text()=='2、3、5、7';assert page.evaluate("SalonStaff.capacityData('2026-12-01').people.find(p=>p.code==='6').entry.status")=='off'
   assert not errors,errors;print(f'PASS {engine} {width}: mobile December fixed-rest calendar/duty, automatic fallback, zero writes; personal roster uses existing tablet/desktop layout',flush=True);ctx.close();continue
  for code,name,fixed,days in DESIGNERS:
   actual=[d for d in range(1,32) if name in names(d)];assert actual==days,(name,actual)
   click(f'[data-person-id="d{code}"]');assert page.locator('#personLeaveCount').inner_text().startswith(f'已選 {len(days)} 天');assert page.locator('.personLeavePicked').count()==len(days);assert '固定休日' in page.locator(f'[data-date="2026-12-{days[0]:02}"] .personLeaveMarker').inner_text();page.locator('#personLeaveSave').click()
  assert page.evaluate('testWrites.length')==0
  with page.expect_download() as download:page.locator('#exportMonth').click()
  exported=list(csv.reader(io.StringIO(Path(download.value.path()).read_text(encoding='utf-8-sig'))));assert len(exported)==24
  # Reproduce the screenshot: 6 existing extras + 4 implicit Mondays = ten days in BOTH modes.
  existing={'metadata':'保留原本月資料','exceptions':{f'2026-12-{d:02}':{'d2':{'status':'off','note':'既有額外休'}} for d in [1,5,8,15,22,29]}}
  existing['exceptions']['2026-12-14']={'d5':{'status':'leave','note':'保留其他人員'}};existing['exceptions']['2026-12-04']={'t21':{'status':'off','note':'技術師排休'}}
  page.evaluate("([path,data])=>{testDocs[path]=data;testEmit(path)}",[MONTH,existing]);page.wait_for_timeout(60);assert [d for d in range(1,32) if '婉婷' in names(d)]==[1,5,7,8,14,15,21,22,28,29];assert '合成技術師21' in names(4)
  click('[data-person-id="d2"]');assert page.locator('#personLeaveCount').inner_text().startswith('已選 10 天');assert '額外休假' in page.locator('[data-date="2026-12-01"] .personLeaveMarker').inner_text();assert '固定休日' in page.locator('[data-date="2026-12-07"] .personLeaveMarker').inner_text()
  # Add one extra and save; no derived fixed day is written over the existing data.
  click('#monthCalendar [data-date="2026-12-12"]');page.locator('#personLeaveSave').click();page.wait_for_function('testWrites.length===1');raw=page.evaluate('p=>testDocs[p]',MONTH);assert raw['metadata']==existing['metadata']
  for d,entries in existing['exceptions'].items():assert raw['exceptions'][d]==entries
  assert raw['exceptions']['2026-12-12']['d2']['status']=='off';assert 'd2' not in raw['exceptions'].get('2026-12-07',{});assert '婉婷' in names(7)
  # A fixed day explicitly changed to work is preserved as a real exception.
  click('[data-person-id="d2"]');click('#monthCalendar [data-date="2026-12-07"]');page.locator('#personLeaveSave').click();page.wait_for_function('testWrites.length===2');assert '婉婷' not in names(7);assert page.evaluate('p=>testDocs[p].exceptions["2026-12-07"].d2.status',MONTH)=='normal'
  # Copy only missing explicit extras; existing December work/leave wins and fixed rules recur.
  source={'exceptions':{'2026-11-02':{'d2':{'status':'off','note':'固定休'}},'2026-11-07':{'d2':{'status':'off','note':'上月額外'}},'2026-11-05':{'d2':{'status':'normal'},'d3':{'status':'off','note':'複製額外'}},'2026-11-01':{'d6':{'status':'normal'}},'2026-11-03':{'d6':{'status':'off','note':'固定休'}}}}
  before=page.evaluate('p=>testDocs[p]',MONTH);page.evaluate("data=>{testDocs['salons/default/schedules/2026-11']=data}",source);page.locator('#copyPreviousMonth').click();page.wait_for_function('testWrites.length===3');after=page.evaluate('p=>testDocs[p]',MONTH)
  for d,entries in before['exceptions'].items():
   for id,entry in entries.items():assert after['exceptions'][d][id]==entry
  assert after['exceptions']['2026-12-05']['d3']['status']=='off';assert 'd2' not in after['exceptions'].get('2026-12-02',{});assert 'd6' not in after['exceptions'].get('2026-12-03',{});assert 'Sam' in names(1);assert '婉婷' not in names(7)
  writes=page.evaluate('testWrites.length');page.locator('#applyFixedOff').click();page.wait_for_timeout(500);assert page.evaluate('testWrites.length')==writes
  page.locator('#monthNext').click();page.wait_for_function("document.querySelector('#scheduleMonth').value==='2027-01'");assert page.locator('[data-date="2027-01-04"] .monthLeaveName').filter(has_text='婉婷').count()==1;assert page.evaluate('testWrites.length')==writes;page.locator('#scheduleClose').click()
  # Main duty and A-plan capacity share the exact same fixed-rest fallback; daily normal still overrides it.
  page.evaluate("()=>{for(const code of [21,22,23])testDocs['salons/default/staff/t'+code].active=false;testEmit('salons/default/staff')}")
  page.locator('#dateInput').fill('2026-12-21');page.locator('#dateInput').dispatch_event('change');page.wait_for_timeout(90);assert page.locator('#todayDesigners').inner_text()=='3、5、6';assert page.evaluate("SalonStaff.capacityData('2026-12-21').people.find(p=>p.code==='2').entry.status")=='off'
  page.evaluate("()=>{const date='2026-12-21',path='salons/default/dates/'+date+'/appointments';for(let i=0;i<3;i++)testDocs[path+'/a'+i]={name:'合成預約',duration:2,startTime:'10:00',start:4,col:i+1,designer:'x',services:[]};testEmit(path)}")
  page.locator('#addBtn').click();page.wait_for_timeout(60);page.locator('#name').fill('合成第四位');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();assert '目前確認在班：3 位' in page.locator('.capacityBody').inner_text();assert '一般安排基準：3 位' in page.locator('.capacityBody').inner_text();assert '人力待確認' not in page.locator('.capacityBody').inner_text();page.locator('#capacityBack').click();page.locator('#cancelBtn').click()
  page.evaluate("()=>{testDocs['salons/default/dates/2026-12-21']={staffing:{entries:{d2:{status:'normal',working:true,note:'臨時支援'}}}};testEmit('salons/default/dates/2026-12-21')}");assert page.locator('#todayDesigners').inner_text()=='2、3、5、6';assert page.evaluate("SalonStaff.capacityData('2026-12-21').people.find(p=>p.code==='2').entry.status")=='normal'
  assert not errors,errors;print(f'PASS {engine} {width}: five fixed-rest calendars/counts, photo ten-day case, extras/technician/no duplicates, save preserves existing data, fixed work exception, non-destructive copy, no auto writes, next month, shared duty/capacity/daily override',flush=True);ctx.close()
 browser.close()
