import os
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:8765/')
CUSTOM={'salons/default/services/fringe':{'name':'K瀏','active':True},'salons/default/services/perm-fringe':{'name':'燙瀏海','active':True},'salons/default/services/gel':{'name':'凝膠指甲','active':True}}
CUSTOM.update({f'salons/default/staff/d{code}':{'role':'designer','code':str(code),'active':True} for code in [2,3,5,6,7]})
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if os.environ.get('HEADER_ENGINE')=='webkit' else p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block');ctx.add_init_script(script=(ROOT/'tests/firebase-mock.js').read_text()+'\nwindow.testDocs='+json.dumps(CUSTOM,ensure_ascii=False)+';');ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  day=page.locator('#dateInput').input_value();path=f'salons/default/dates/{day}/appointments'
  records=[{'id':'short','name':'林素芬小姐','services':['護'],'phone':'0912345678','note':'短預約保留完整資料','showNoteOnCard':True,'duration':1,'start':4,'startTime':'10:00','col':1,'designer':'5','assign':'21'}, {'id':'next','name':'戴先生','services':['染','燙'],'duration':2,'start':5,'startTime':'10:30','col':1,'designer':'6'}, {'id':'long','name':'陳小明國中生','services':['洗剪'],'duration':14,'start':4,'startTime':'10:00','col':2,'designer':'2'}, {'id':'unknown','name':'林小美高中生','services':['K瀏','燙瀏海','凝膠指甲','未定義舊項目'],'duration':2,'start':4,'startTime':'10:00','col':3,'designer':'3'}]
  page.evaluate('''([path,items])=>{for(const item of items)testDocs[path+'/'+item.id]=item;testEmit(path)}''',[path,records]);page.wait_for_selector('[data-id=short]');before=page.evaluate('JSON.stringify(testDocs)')
  card=page.locator('[data-id=short]');assert card.locator('.name').inner_text()=='林素芬Ms.';assert card.locator('.serviceLine').inner_text()=='護';assert card.locator('.tri').inner_text()=='△5 △21';assert card.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(255, 117, 173)'
  assert page.locator('[data-id=next] .name').inner_text()=='戴Mr.';assert page.locator('[data-id=next] .serviceLine').inner_text()=='染＋燙'
  assert page.locator('[data-id=long] .name').inner_text()=='陳小明國';assert page.locator('[data-id=unknown] .serviceLine').inner_text()=='K瀏＋燙瀏海＋凝膠指甲＋未定義舊項目'
  def check_geometry():
   for id,duration in [('short',1),('long',14)]:
    block=page.locator('[data-id='+id+']');rect=block.bounding_box();row=page.locator('.cell').first.bounding_box()['height'];scale=page.locator('#paper').evaluate("e=>Number(e.style.getPropertyValue('--schedule-scale')||1)");assert abs(rect['height']-(duration*row-6*scale))<1
    for selector in ['.tri','.name','.serviceLine']:
     item=block.locator(selector);bounds=item.bounding_box();assert bounds['y']>=rect['y']-1;assert (selector=='.serviceLine' and rect['height']<22) or bounds['y']+bounds['height']<=rect['y']+rect['height']+1,(id,selector,bounds,rect)
     assert selector=='.serviceLine' or item.evaluate("e=>getComputedStyle(e).whiteSpace")=='nowrap'
     assert item.evaluate("e=>e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)+1")
   short=page.locator('[data-id=short]').bounding_box();following=page.locator('[data-id=next]').bounding_box();assert short['y']+short['height']<=following['y']
  check_geometry();page.locator('#zoomFit').click();check_geometry();page.locator('#zoomReset').click()
  page.locator('#refreshBtn').click();page.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='success'");assert card.locator('.name').inner_text()=='林素芬Ms.';assert page.evaluate('JSON.stringify(testDocs)')==before;assert page.evaluate('testWrites.length')==0
  card.click();page.locator('#actionEdit').click();assert page.locator('#name').input_value()=='林素芬小姐';assert page.locator('#serviceChecks input[value="護"]').is_checked();assert page.locator('#serviceChecks label').filter(has_text='K剪（剪）').count()==1
  for ending,label in [('先生','先生（Mr.）'),('小姐','小姐（Ms.）'),('女士','女士（Ms.）'),('太太','太太（Mrs.）'),('幼稚園','幼稚園（幼）'),('國小生','國小生（小）'),('國中生','國中生（國）'),('高中生','高中生（高）'),('小孩','小孩（Kid）'),('大學生','大學生（大）')]:
   button=page.locator('[data-suffix="'+ending+'"]');assert button.inner_text()==label;assert button.evaluate('e=>e.scrollWidth<=e.clientWidth+1');page.locator('#name').fill('陳先生');button.click();button.click();assert page.locator('#name').input_value()=='陳'+ending
  assert page.locator('#identityShortcuts').evaluate('e=>e.scrollWidth<=e.clientWidth+1');
  rects=page.locator('#identityShortcuts button').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})');assert all(a['right']<=b['x']+1 or b['right']<=a['x']+1 or a['bottom']<=b['y']+1 or b['bottom']<=a['y']+1 for i,a in enumerate(rects) for b in rects[i+1:]);page.screenshot(path=str(ROOT/f'test-results/identity-form-{width}.png'))
  page.locator('#cancelBtn').click();page.locator('[data-id=unknown]').click();page.locator('#actionEdit').click();assert page.locator('#serviceChecks input[value="未定義舊項目"]').is_checked();assert page.locator('#serviceChecks input[value="凝膠指甲"]').is_checked();page.locator('#cancelBtn').click()
  # Saving a new record keeps full raw name/services, with no UI labels in storage.
  page.locator('#addBtn').click();page.locator('#name').fill('王小弟');page.locator('[data-suffix="大學生"]').click();page.locator('#serviceChecks input[value="K剪"]').check();page.locator('#serviceChecks input[value="美甲"]').check();page.locator('#saveBtn').click();page.wait_for_function("!document.querySelector('#modal').classList.contains('open')")
  saved=page.evaluate('testWrites[0].data');assert saved['name']=='王小弟大學生';assert saved['services']==['K剪','美甲'];assert saved['duration']==4;assert page.locator('.appt .name').filter(has_text='王小弟大').count()==1;assert '（' not in json.dumps(saved,ensure_ascii=False)
  page.locator('.appt').filter(has_text='王小弟大').click();assert '王小弟大學生' in page.locator('#appointmentDetails').inner_text();page.locator('#actionEdit').click();assert page.locator('#name').input_value()=='王小弟大學生';page.locator('#cancelBtn').click()
  # Existing records stay byte-for-byte unchanged; exactly the requested new record was written.
  for raw in records:assert page.evaluate('key=>testDocs[key]',path+'/'+raw['id'])==raw
  # Edit the new college record, read back via refresh and reload an independent SDK snapshot.
  college=page.locator('.appt').filter(has_text='王小弟大');collegeId=college.get_attribute('data-id');college.click();page.locator('#actionEdit').click();page.locator('#phone').fill('0900000000');page.locator('#saveBtn').click();page.wait_for_function("!document.querySelector('#modal').classList.contains('open')")
  assert page.evaluate('key=>testDocs[key].name',path+'/'+collegeId)=='王小弟大學生';assert page.evaluate('key=>testDocs[key].phone',path+'/'+collegeId)=='0900000000'
  page.locator('#refreshBtn').click();page.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='success'")
  snapshot=page.evaluate('testDocs');reloadctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block');reloadctx.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+';window.testDocs='+json.dumps(snapshot,ensure_ascii=False)+';');reloadctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''));reloaded=reloadctx.new_page();reloaded.goto(BASE);reloaded.locator('[data-id="'+collegeId+'"]').click();assert '王小弟大學生' in reloaded.locator('#appointmentDetails').inner_text();assert reloaded.evaluate("window.find('王小弟大學生')");reloaded.locator('#actionEdit').click();assert reloaded.locator('#name').input_value()=='王小弟大學生';assert reloaded.locator('#phone').input_value()=='0900000000';assert reloaded.evaluate('testWrites.length')==0;reloadctx.close()
  # True conflicts remain marked, within their real durations, including a 30-minute conflict.
  page.evaluate('''path=>{testDocs[path+'/overlap']={id:'overlap',name:'陳先生',services:['剪髮'],duration:1,start:4,startTime:'10:00',col:1,designer:'7'};testEmit(path)}''',path)
  assert page.locator('[data-id=short].timeConflict').count()==1;assert page.locator('[data-id=overlap].timeConflict').count()==1;assert page.locator('.conflictLabel').count()==2
  short=card.bounding_box();other=page.locator('[data-id=overlap]').bounding_box();assert short['x']+short['width']<=other['x'] or other['x']+other['width']<=short['x'];check_geometry()
  page.screenshot(path=str(ROOT/f'test-results/formatting-{width}.png'));assert not errors,errors
  print(f'PASS {width}x{height}: abbreviated cards, full option labels/raw values, suffix compatibility, old edits, read-only refresh, raw save, 1/14-slot heights, adjacent/conflict layout, fit zoom')
  ctx.close()
 browser.close()
