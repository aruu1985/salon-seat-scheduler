"""Rendered-size card layout and read-only detail flow; all Firebase is isolated mock."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:8765/'
engine=os.environ.get('SALON_TEST_ENGINE','chromium')
STAFF={f'salons/default/staff/d{code}':{'code':code,'name':name,'role':'designer','active':True,'color':color} for code,name,color in [('2','婉婷','#f6a24c'),('3','品婷','#fff176'),('5','左左','#ff75ad'),('6','Sam','#8ee072'),('7','文文','#7dc8ff')]}
STAFF['salons/default/staff/t21']={'code':'21','name':'測試技術師','role':'technician','active':True}
with sync_playwright() as p:
 browser=getattr(p,engine).launch(**({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {}),headless=True)
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block')
  ctx.add_init_script(script=(ROOT/'tests/firebase-mock.js').read_text()+'\n'+(ROOT/'tests/mock-admin.js').read_text()+'\nwindow.testDocs='+json.dumps(STAFF,ensure_ascii=False)+';')
  ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  day=page.locator('#dateInput').input_value();path=f'salons/default/dates/{day}/appointments'
  names=['王明','黃夢玲小姐','蘇立文先生','陳王小美','歐陽陳王小美小姐']
  def seed(duration):
   records=[{'id':'name-'+str(i),'name':name,'start':4,'startTime':'10:00','duration':duration,'col':i+1,'designer':['2','3','5','6','7'][i],'services':['洗剪','染','護髮'],'note':'請保留自然捲，勿剪太短。'+('這是很長的完整備註，必須能在細項中完整閱讀。'*16 if i==4 else ''),'showNoteOnCard':i%2==0} for i,name in enumerate(names)]
   page.evaluate('''([path,items])=>{for(const key of Object.keys(testDocs))if(key.startsWith(path+'/'))delete testDocs[key];for(const item of items)testDocs[path+'/'+item.id]=item;testEmit(path)}''',[path,records]);page.wait_for_timeout(60);return records
  for duration in [1,2,4,8]:
   records=seed(duration);before=page.evaluate('JSON.stringify(testDocs)')
   for scale in [1,.59]:
    page.evaluate("scale=>document.querySelector('#paper').style.setProperty('--schedule-scale',String(scale))",scale);page.wait_for_timeout(70)
    row=page.locator('.cell').first.bounding_box()['height']
    for i in range(5):
     card=page.locator('[data-id=name-'+str(i)+']');bounds=card.bounding_box();assert abs(bounds['height']-(duration*row-6*scale))<1
     node=card.locator('.name');assert node.evaluate("e=>getComputedStyle(e).whiteSpace")=='nowrap';assert node.evaluate("e=>parseFloat(getComputedStyle(e).fontSize)")>=10
     assert card.locator('.cardNote').count()==(1 if i%2==0 else 0)
     content=card.locator('.cardContent').bounding_box();assert content['x']>=bounds['x'] and content['x']+content['width']<=bounds['x']+bounds['width']+.5
     if duration>=2 and i<4:assert card.get_attribute('data-name-complete')=='true',(engine,width,duration,scale,names[i],card.locator('.name').evaluate('e=>({w:e.getBoundingClientRect().width,font:getComputedStyle(e).fontSize})'))
     assert node.evaluate("e=>parseFloat(getComputedStyle(e).fontSize)")<=18.1
    assert page.evaluate('JSON.stringify(testDocs)')==before;assert page.evaluate('testWrites.length')==0
  seed(2);page.evaluate("document.querySelector('#paper').style.setProperty('--schedule-scale','.59')");page.wait_for_timeout(80);page.screenshot(path=str(ROOT/f'test-results/layout-{engine}-{width}.png'));page.evaluate("document.querySelector('#paper').style.setProperty('--schedule-scale','1')");page.wait_for_timeout(60)
  # Full details include optional fields and a different-date secondary service; no abbreviations.
  raw={'id':'detail','name':'蘇立文先生','phone':'0912345678','services':['洗剪','護髮','特殊完整消費項目'],'start':4,'startTime':'10:00','duration':2,'col':6,'designer':'6','assign':'21','note':'完整備註首行\n'+('不能省略的詳細備註，包含注意事項。'*45),'showNoteOnCard':False,'secondaryService':{'enabled':True,'secondaryServiceType':'美甲','secondaryItem':'凝膠指甲完整項目','secondaryStaff':'21','secondaryDate':'2026-12-02','secondaryTime':'14:30','secondaryDuration':3,'secondaryNote':'第二服務完整備註','secondaryLinkedToPrimary':False}}
  page.evaluate('''([path,item])=>{testDocs[path+'/detail']=item;testEmit(path)}''',[path,raw]);page.wait_for_timeout(70)
  before=page.evaluate('JSON.stringify(testDocs)');card=page.locator('[data-id=detail]');card.click();details=page.locator('#appointmentDetails')
  text=details.inner_text();assert text.startswith('蘇立文先生')
  for expected in ['0912345678',day,'10:00 ～ 11:00','座位 6','6 Sam','洗剪＋護髮＋特殊完整消費項目','21 測試技術師',raw['note'],'凝膠指甲完整項目','2026-12-02','14:30 ～ 16:00','第二服務完整備註']:assert expected in text,(expected,text)
  assert details.locator('input,textarea,select,[contenteditable=true]').count()==0
  assert page.locator('#actionEdit').bounding_box()['y']>details.bounding_box()['y'];assert page.locator('#actionClose').bounding_box()['y']+page.locator('#actionClose').bounding_box()['height']<=height
  details.evaluate('e=>e.scrollTop=e.scrollHeight');assert details.evaluate('e=>e.scrollTop')>0
  assert page.locator('#actionEdit').is_visible();assert page.locator('#actionClose').is_visible()
  assert page.evaluate('JSON.stringify(testDocs)')==before;assert page.evaluate('testWrites.length')==0
  page.screenshot(path=str(ROOT/f'test-results/details-{engine}-{width}.png'))
  page.locator('#actionEdit').click();assert page.locator('#name').input_value()==raw['name'];assert page.locator('#note').input_value()==raw['note'];assert page.locator('#secondaryItem').input_value()=='凝膠指甲完整項目';page.locator('#note').fill('使用者編輯後的完整備註');page.locator('#saveBtn').click();page.wait_for_function("!document.querySelector('#modal').classList.contains('open')")
  card.click();assert '使用者編輯後的完整備註' in details.inner_text();page.locator('#actionClose').click();assert not page.locator('#actionModal').evaluate("e=>e.classList.contains('open')")
  page.locator('[data-id=name-1]').click();assert '電話' not in details.locator('dt').all_inner_texts();assert '額外指定人員' not in details.locator('dt').all_inner_texts();assert '備註' in details.locator('dt').all_inner_texts() # details show notes even when card flag is off
  page.locator('#actionClose').click();page.evaluate("()=>{const p='salons/default/dates/'+document.querySelector('#dateInput').value+'/appointments/name-1';testDocs[p].note='';testEmit(p)}");page.locator('[data-id=name-1]').click();assert '備註' not in details.locator('dt').all_inner_texts();page.locator('#actionClose').click()
  # Blank-cell creation still enters the existing form.
  page.locator('.cell[data-row="12"][data-col="6"]').dblclick();assert page.locator('#modalTitle').inner_text()=='新增預約';page.locator('#cancelBtn').click()
  # Keep the original four-step delete confirmation; cancel writes nothing, then execute in mock only.
  card.click();count=page.evaluate('testWrites.length');page.locator('#actionDelete').click();assert page.locator('#securityModal').evaluate("e=>e.classList.contains('open')");page.locator('#securityCancel').click();assert page.evaluate('testWrites.length')==count
  page.locator('#actionDelete').click();page.locator('#securityNext').click();page.locator('#adminPassword').fill('2255');page.locator('#securityNext').click();page.locator('#securityNext').click();page.locator('#securityNext').click();page.wait_for_function("!document.querySelector('#securityModal').classList.contains('open')")
  assert page.locator('[data-id=detail]').count()==0,(page.locator('#toast').inner_text(),page.evaluate('testWrites.slice(-4)'));assert not page.locator('#actionModal').evaluate("e=>e.classList.contains('open')")
  assert page.evaluate("Object.keys(testDocs).some(p=>p.includes('/trash/'))")
  assert not errors,errors
  print(f'PASS {engine} {width}x{height}: 2/3/4/long names, notes, 30/60/120/240-minute layout at 100%/59%, full read-only scrollable details, staff/secondary, edit/save, optional fields, blank-cell new, confirmed delete/trash')
  ctx.close()
 browser.close()
