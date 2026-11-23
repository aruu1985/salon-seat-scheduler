from playwright.sync_api import sync_playwright
from pathlib import Path
from datetime import datetime,timezone
import os,json,subprocess
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:18776').rstrip('/')
fixtures={}
for role,codes in [('designer',['2','3','5','6','7']),('technician',['21','22','23','36'])]:
 for code in codes:fixtures['salons/default/staff/'+role+code]={'role':role,'code':code,'name':'測試'+code,'active':True,'fixedOffDay':None,'color':{'2':'#f6a24c','3':'#fff176','5':'#ff75ad','6':'#8ee072','7':'#7dc8ff'}.get(code)}
for day in ['2026-11-22','2026-11-23','2026-11-24','2026-11-30','2026-12-01','2026-12-31','2027-01-01']:
 fixtures[f'salons/default/dates/{day}/appointments/header-test']={'name':'完整姓名小姐','phone':'0912-test','services':['洗剪'],'duration':2,'designer':'6','assign':'21','startTime':'10:00','start':4,'col':1,'note':'保留備註','showNoteOnCard':True,'secondaryService':None}
fixtures['salons/default/dates/2026-11-23']={'staffing':{'entries':{'designer2':{'working':False,'status':'off','time':'','note':''}}}}
fixtures['salons/default/schedules/2026-11']={'exceptions':{'2026-11-24':{'technician23':{'status':'leave','note':'測試'}}}}
fixtures['salons/default/dates/2026-12-01']={'staffing':{'entries':{'designer7':{'working':True,'status':'late','time':'12:00','note':'課程結束後到店'},'technician22':{'working':False,'status':'off'}}}}
def setup(context):
 context.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+'\nwindow.testDocs='+json.dumps(fixtures,ensure_ascii=False)+';const authMock=firebase.auth();firebase.auth=()=>authMock;authMock.onAuthStateChanged=cb=>{queueMicrotask(()=>cb(null));return ()=>{}};')
 def route(r):
  u=r.request.url
  if u==BASE+'/baseline':r.fulfill(body=subprocess.check_output(['git','show','bbcfab4:index.html']).decode(),content_type='text/html')
  elif u==BASE+'/firebase-config.js':r.fulfill(body='window.FIREBASE_CONFIG='+json.dumps({'apiKey':'demo','projectId':'demo-salon-companions','appId':'demo-app'})+';',content_type='application/javascript')
  elif u.startswith(BASE+'/'):r.continue_()
  else:r.fulfill(status=200,body='')
 context.route('**/*',route)
def select(page,date):
 page.locator('#dateInput').fill(date);page.locator('#dateInput').dispatch_event('change');page.wait_for_timeout(80)
def metrics(page):
 return page.evaluate("()=>({top:document.querySelector('.top').getBoundingClientRect().height,stage:document.querySelector('#stage').getBoundingClientRect().height,cell:getComputedStyle(document.querySelector('.cell')).height,col:getComputedStyle(document.documentElement).getPropertyValue('--col'),card:document.querySelector('.appt')?{height:document.querySelector('.appt').getBoundingClientRect().height,width:document.querySelector('.appt').getBoundingClientRect().width,font:getComputedStyle(document.querySelector('.appt .name')).fontSize,color:getComputedStyle(document.querySelector('.appt')).backgroundColor}:null})")
with sync_playwright() as p:
 engine=os.environ.get('HEADER_ENGINE','chromium');browser=p.webkit.launch(headless=True) if engine=='webkit' else p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(320,740),(390,844),(588,1280),(820,1180),(1440,1000)]:
  context=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,timezone_id='Asia/Taipei',service_workers='block');setup(context)
  baseline=context.new_page();baseline.route('**/version.json*',lambda r:r.fulfill(body=json.dumps({'version':'0.12.6','build':'0fa8a590b2a6ceff'}),content_type='application/json'));baseline.clock.install(time=datetime(2026,11,22,4,tzinfo=timezone.utc));baseline.goto(BASE+'/baseline');baseline.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");select(baseline,'2026-11-22');baseline.wait_for_timeout(100);old=metrics(baseline);baseline.close()
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.clock.install(time=datetime(2026,11,22,4,tzinfo=timezone.utc));page.goto(BASE+'/');page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");select(page,'2026-11-22');page.wait_for_timeout(100)
  before=page.evaluate('JSON.stringify(testDocs)');new=metrics(page);assert new['top']<=old['top'],(engine,width,old,new);assert new['stage']>=old['stage'];assert new['cell']==old['cell'];assert new['col']==old['col'];assert new['card']==old['card'],(old,new)
  page.evaluate("()=>{window.headerPickerCalls=0;document.querySelector('#dateInput').showPicker=()=>{window.headerPickerCalls++}}");(page.locator('.dateControl').tap() if width<1000 else page.locator('.dateControl').click());page.keyboard.press('Escape');assert page.evaluate('headerPickerCalls')==1
  assert page.locator('#dateDisplay').inner_text()=='2026年11月22日（日）';assert page.locator('#dateInput').input_value()=='2026-11-22'
  assert page.locator('#todayDesigners').inner_text()=='2、3、5、6、7';assert page.locator('#todayTechnicians').inner_text()=='21、22、23、36';assert '上班' not in page.locator('#todayBoard').inner_text()
  box=page.locator('#todayBoard').bounding_box();designer=page.locator('#designerBoard').bounding_box();technician=page.locator('#technicianBoard').bounding_box();assert abs(designer['y']-technician['y'])<1;assert box['height']<=44;assert page.locator('#todayBoard').evaluate('e=>getComputedStyle(e).flexWrap')=='nowrap';assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert page.locator('#dateDisplay').evaluate('e=>e.scrollWidth<=e.clientWidth+1');assert page.locator('#designerBoard').evaluate('e=>getComputedStyle(e).borderTopWidth')=='0px'
  for date,label in [('2026-11-30','2026年11月30日（一）'),('2026-12-31','2026年12月31日（四）')]:
   select(page,date);assert page.locator('#dateDisplay').inner_text()==label;page.locator('#nextDay').click();expected='2026年12月1日（二）' if date.endswith('11-30') else '2027年1月1日（五）';assert page.locator('#dateDisplay').inner_text()==expected;page.locator('#prevDay').click();assert page.locator('#dateDisplay').inner_text()==label
  page.locator('#todayBtn').click();assert page.locator('#dateDisplay').inner_text()=='2026年11月22日（日）';page.locator('#nextDay').click();assert page.locator('#dateDisplay').inner_text()=='2026年11月23日（一）';page.wait_for_timeout(60);assert page.locator('#todayDesigners').inner_text()=='3、5、6、7';page.locator('#nextDay').click();page.wait_for_timeout(60);assert page.locator('#todayTechnicians').inner_text()=='21、22、36'
  select(page,'2026-12-01');assert '晚到' in page.locator('#designerNotes').inner_text();assert '12:00' in page.locator('#designerNotes').inner_text();assert '22' not in page.locator('#todayTechnicians').inner_text().split('、');assert abs(page.locator('#designerBoard').bounding_box()['y']-page.locator('#technicianBoard').bounding_box()['y'])<1
  assert page.evaluate('JSON.stringify(testDocs)')==before;assert page.evaluate('testWrites.length')==0
  select(page,'2026-11-22')
  page.locator('#refreshBtn').click();page.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='success'");assert page.locator('#dataSyncResult').inner_text().startswith('已同步 ');assert not page.locator('#holeNotice').is_visible();assert page.evaluate('testWrites.length')==0
  page.evaluate("testReadFailures=['salons/default/staff']");page.locator('#refreshBtn').click();page.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='error'");assert page.locator('#dataSyncResult').inner_text()=='更新失敗，請重試';assert page.evaluate('testWrites.length')==0;page.evaluate('testReadFailures=[]')
  # Each pencil opens the original correct role; only mock writes when testing its original autosave.
  for role,code in [('designer','2'),('technician','21')]:
   button=page.locator('#'+role+'Board');button.scroll_into_view_if_needed();(button.locator('.teamEdit').tap() if width<1000 else button.locator('.teamEdit').click());page.wait_for_selector('#dailyStaffModal.open');assert ('設計師' if role=='designer' else '技術師') in page.locator('#dailyStaffTitle').inner_text();ids=page.locator('.dailyStaffRow').evaluate_all('rows=>rows.map(r=>r.dataset.dailyId)');assert all(id.startswith(role) for id in ids);page.locator(f'[data-daily-id="{role}{code}"] .dailyStatus').select_option('off');page.wait_for_timeout(500);page.locator('#dailyStaffClose').click();assert code not in page.locator('#todayDesigners' if role=='designer' else '#todayTechnicians').inner_text().split('、')
  assert page.evaluate('testWrites.length')==2
  assert page.evaluate("testDocs['salons/default/dates/2026-11-22'].staffing.entries.designer2.status")=='off';assert page.evaluate("testDocs['salons/default/dates/2026-11-22'].staffing.entries.technician21.status")=='off'
  page.evaluate("()=>{testDocs['salons/default/dates/2026-11-22']={};testEmit('salons/default/dates/2026-11-22')}");page.wait_for_timeout(80);page.locator('#todayBoard').evaluate('e=>e.scrollLeft=0');page.screenshot(path=str(ROOT/'test-results'/f'header-{engine}-{width}.png'),full_page=True)
  assert not errors,errors;print(f'PASS {engine} {width}x{height}: selected weekday, month/year, same row, actual schedule/notes, two role pencils and mock autosave, zero unintended writes, board unchanged; top {old["top"]:.0f}->{new["top"]:.0f}px',flush=True);context.close()
 browser.close()
