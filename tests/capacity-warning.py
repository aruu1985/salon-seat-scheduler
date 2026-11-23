"""A-plan intake warning. Synthetic SDK data only; no production requests or customer data."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:19796/');DATE='2028-02-29';PREFIX=f'salons/default/dates/{DATE}/appointments/'
def staff(n):return {f'salons/default/staff/p{i}':{'code':str(i+2),'role':'designer' if i<3 else 'technician','active':True} for i in range(n)}
def rows(n):return {PREFIX+f'a{i}':{'name':f'合成客人{i}','startTime':'10:00','start':4,'duration':2,'col':i+1,'designer':'x','services':['K剪']} for i in range(n)}
with sync_playwright() as p:
 engine=os.environ.get('HEADER_ENGINE','chromium');browser=p.webkit.launch(headless=True) if engine=='webkit' else p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block');ctx.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+'\nwindow.testDocs='+json.dumps(staff(5)|rows(5))+';');ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");page.locator('#dateInput').fill(DATE);page.locator('#dateInput').dispatch_event('change');page.wait_for_timeout(100)
  def reset(data):
   page.evaluate("data=>{testDocs=data;Object.keys(testListeners).forEach(testEmit)}",data);page.wait_for_timeout(70)
  def new(name='合成第六位'):
   page.locator('#addBtn').click();page.wait_for_timeout(60);page.locator('#name').fill(name);page.locator('#note').fill('保留未儲存內容')
  def saved():page.wait_for_function("!document.querySelector('#modal').classList.contains('open')");assert page.locator('#capacityModal.open').count()==0
  def edit(identifier):page.locator(f'.appt[data-id="{identifier}"]').click();page.locator('#actionEdit').click()
  count=page.evaluate('Object.values(testListeners).reduce((n,v)=>n+v.length,0)');reads=page.evaluate('testReads.length')
  new();page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();text=page.locator('.capacityBody').inner_text();assert '6 位' in text and '目前確認在班：5 位' in text and '一般安排基準：5 位' in text;assert page.locator('#capacityTitle').inner_text()=='⚠️ 現場承接提醒';assert page.evaluate('testWrites.length')==0
  for selector in ['#capacityBack','#capacityProceed']:
   assert page.locator(selector).evaluate('e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}')
  page.screenshot(path=f'/tmp/intake-warning-{engine}-{width}.png');page.locator('#capacityBack').click();assert page.locator('#name').input_value()=='合成第六位';assert page.locator('#note').input_value()=='保留未儲存內容';assert page.evaluate('testWrites.length')==0
  page.locator('#saveBtn').click();page.locator('#capacityProceed').click();saved();assert page.evaluate('testWrites.length')==1;identifier=page.locator('.appt').filter(has_text='第六位').get_attribute('data-id')
  # Metadata edits and shortened service do not add load or repeat a warning.
  edit(identifier);page.locator('#phone').fill('synthetic');page.locator('#note').fill('合成修改');page.locator('#saveBtn').click();saved();assert page.evaluate('testWrites.length')==2
  edit(identifier);page.locator('#duration').select_option('1',force=True);page.locator('#saveBtn').click();saved();assert page.evaluate('testWrites.length')==3
  # A time move adds load only to 10:30–11:00, with the original excluded.
  edit(identifier);page.locator('#start').select_option('10:30');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();text=page.locator('.capacityBody').inner_text();assert '10:30～11:00' in text and '同時段預約：6 位' in text and '7 位' not in text
  writes=page.evaluate('testWrites.length');page.evaluate("path=>{testDocs[path].note='另一裝置新版';testRevision++;testEmit(path)}",PREFIX+identifier);page.locator('#capacityProceed').click();page.wait_for_timeout(100);assert page.locator('#modal.open').count()==1;assert page.evaluate('testWrites.length')==writes;assert page.evaluate('path=>testDocs[path].note',PREFIX+identifier)=='另一裝置新版';page.locator('#cancelBtn').click()
  # Eight confirmed + an uncertain fixed-off employee must not interrupt an ordinary booking.
  data=staff(8);data['salons/default/staff/unknown']={'code':'99','role':'designer','active':True,'fixedOffDay':2};reset(data);new('合成一般預約');page.locator('#saveBtn').click();saved();assert '人力待確認' in page.locator('#capacityDataNotice').inner_text()
  # Eight staff still use six main seats as the general arrangement baseline.
  reset(staff(8)|rows(6));new('合成第七位');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();text=page.locator('.capacityBody').inner_text();assert '一般安排基準：6 位' in text and '目前確認在班：8 位' in text;page.locator('#capacityBack').click();page.locator('#cancelBtn').click()
  # Known three plus unknown: possible extra intake, never a claim of definite shortage.
  data=staff(3)|rows(3);data['salons/default/staff/unknown']={'code':'99','role':'technician','active':True};data[f'salons/default/dates/{DATE}']={'staffing':{'entries':{'unknown':{'working':True,'status':'afternoon'}}}};reset(data);new('合成待確認');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();text=page.locator('.capacityBody').inner_text();assert '可能需要額外承接／人力待確認' in text;assert '目前確認在班：3 位' in text;assert '人力不足' not in text;page.locator('#capacityProceed').click();saved()
  # No reliable roster: non-blocking board notice, not an exact zero-person comparison.
  reset({});new('合成未完整班表');page.locator('#saveBtn').click();saved();assert '暫無法完成精確' in page.locator('#capacityDataNotice').inner_text()
  # Chosen seat is filled remotely while warning is open; no silent move or write.
  reset(staff(5)|rows(5));new('合成座位保護');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();writes=page.evaluate('testWrites.length');page.evaluate("prefix=>{testDocs[prefix+'remote']={name:'合成遠端',startTime:'10:00',start:4,duration:2,col:6,designer:'x',services:[]};testEmit(prefix.slice(0,-1))}",PREFIX);page.locator('#capacityProceed').click();page.wait_for_timeout(100);assert page.locator('#capacityModal.open').count()==0;assert page.locator('#modal.open').count()==1;assert page.locator('#name').input_value()=='合成座位保護';assert page.evaluate('testWrites.length')==writes;page.locator('#cancelBtn').click()
  # One reminder per save attempt, even if load changes; all original validations still run.
  reset(staff(5)|rows(5));new('合成只提醒一次');page.locator('#saveBtn').click();page.locator('#capacityModal.open').wait_for();page.evaluate("prefix=>{testDocs[prefix+'remote']={name:'合成遠端',startTime:'10:00',start:4,duration:2,col:7,designer:'x',services:[]};testEmit(prefix.slice(0,-1))}",PREFIX);page.locator('#capacityProceed').click();saved();assert page.locator('.appt').count()==7
  assert page.evaluate('Object.values(testListeners).reduce((n,v)=>n+v.length,0)')==count;assert page.evaluate('testReads.length')==reads
  # Long merged-detail layouts keep both buttons within the screen and support keyboard cancel.
  writes=page.evaluate('testWrites.length');page.evaluate("()=>{SalonCapacityPrompt.ask({ranges:Array.from({length:20},(_,i)=>({start:600+i*30,end:630+i*30,type:'overload',guestsMin:7,guestsMax:7,staffMin:8,staffMax:8,thresholdMin:6,thresholdMax:6,reasons:[]}))})}");assert page.locator('.capacityBody').evaluate('e=>e.scrollHeight>e.clientHeight')
  for selector in ['#capacityBack','#capacityProceed']:
   box=page.locator(selector).bounding_box();assert box['height']>=44 and box['y']>=0 and box['y']+box['height']<=height
  page.keyboard.press('Tab');assert page.locator('#capacityProceed').evaluate('e=>e===document.activeElement');page.keyboard.press('Escape');assert page.evaluate('testWrites.length')==writes;assert not errors,errors
  print(f'PASS {engine} {width}: A threshold, 8+unknown/no interruption, partial/absent staff notices, no reminder for metadata/shortening, moved interval only, return/proceed, peer version/seat checks, one reminder, no extra reads/listeners, responsive keyboard controls',flush=True);ctx.close()
 browser.close()
