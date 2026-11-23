"""Synthetic Firestore only. Filters must preserve DOM drafts and never write."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:19819/');ENGINE=os.environ.get('HEADER_ENGINE','chromium')
people=[('d2','2','測試設計甲','designer',2),('d3','3','測試設計乙','designer',3),('t21','21','測試技術甲','technician',None),('t22','22','測試技術乙','technician',None)]
fixture={'salons/default/staff/'+id:{'code':code,'name':name,'role':role,'active':True,'fixedOffDay':day} for id,code,name,role,day in people}
fixture['salons/default/schedules/2026-12']={'exceptions':{'2026-12-05':{'d2':{'status':'off','note':'額外休假'},'t21':{'status':'off','note':'技術休假'}},'2026-12-01':{'t22':{'status':'afternoon','time':'14:30'}}}}
fixture['salons/default/dates/2026-12-01']={'staffing':{'entries':{'d2':{'status':'normal','working':True,'note':'臨時支援'}}}}
with sync_playwright() as pw:
 browser=pw.webkit.launch(headless=True) if ENGINE=='webkit' else pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1180,820),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1200,service_workers='block');ctx.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+';window.testDocs='+json.dumps(fixture,ensure_ascii=False)+';');ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''));page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");page.locator('#dateInput').fill('2026-12-01');page.locator('#dateInput').dispatch_event('change');page.locator('#settingsBtn').click();page.locator('#monthlyScheduleBtn').click();page.wait_for_function("document.querySelector('#monthSaveState').textContent==='已同步'");page.locator('[data-date="2026-12-05"]').click()
  baseline=page.evaluate('JSON.stringify(testDocs)');capacity=page.evaluate("JSON.stringify(SalonStaff.capacityData('2026-12-01'))")
  def choose(mode):
   button=page.locator('[data-schedule-filter="'+mode+'"]')
   if width<1200:button.tap()
   else:button.click()
  def check(mode):
   roles=['designer','technician'] if mode=='all' else [mode];ids=[id for id,code,name,role,day in people if role in roles]
   assert page.locator('#dayScheduleRows .dayRole:not([hidden]) .dayScheduleRow').evaluate_all('els=>els.map(e=>e.dataset.staffId)')==ids,(mode,page.locator('#dayScheduleRows .dayRole:not([hidden]) .dayScheduleRow').evaluate_all('els=>els.map(e=>e.dataset.staffId)'),page.locator('#toast').inner_text())
   assert page.locator('.scheduleRoster section:not([hidden]) .rosterButton').evaluate_all('els=>els.map(e=>e.dataset.personId)')==ids
   expected=[name for id,code,name,role,day in people if id in ['d2','t21'] and role in roles];assert page.locator('[data-date="2026-12-05"] .monthLeaveName').all_text_contents()==expected
   assert page.locator('#selectedScheduleDate').inner_text()=='2026-12-05';assert page.locator('[data-schedule-filter="'+mode+'"]').get_attribute('aria-pressed')=='true'
   assert page.evaluate('JSON.stringify(testDocs)')==baseline;assert page.evaluate("JSON.stringify(SalonStaff.capacityData('2026-12-01'))")==capacity
  page.locator('#monthStoreTitle').fill('尚未儲存店況');page.evaluate('window.originalStore=document.querySelector("#monthStoreTitle")')
  page.locator('[data-staff-id="d2"] .schedulePick').check();page.locator('[data-staff-id="d2"] .scheduleNote').fill('尚未完成的設計師草稿');page.evaluate("window.originalNote=document.querySelector('[data-staff-id=d2] .scheduleNote')")
  # Keeping the edited role visible preserves its live DOM draft without saving.
  for mode in ['designer','all','designer','all']:
   choose(mode);check(mode);assert page.locator('[data-staff-id="d2"] .scheduleNote').input_value()=='尚未完成的設計師草稿';assert page.evaluate("originalNote===document.querySelector('[data-staff-id=d2] .scheduleNote')");assert page.locator('[data-staff-id="d2"] .schedulePick').is_checked();assert page.locator('#monthStoreTitle').input_value()=='尚未儲存店況';assert page.evaluate('originalStore===document.querySelector("#monthStoreTitle")')
  # Hiding a dirty field would trigger a browser change/blur save. Explicitly stop, preserving it.
  choose('technician');check('all');assert '欄位尚未完成編輯' in page.locator('#toast').inner_text();assert page.locator('[data-staff-id="d2"] .scheduleNote').input_value()=='尚未完成的設計師草稿'
  page.wait_for_timeout(550);assert page.evaluate('testWrites.length')==0
  # Restore the field (cancel its edit); no change event or write is needed.
  page.locator('[data-staff-id="d2"] .scheduleNote').fill('額外休假')
  page.locator('[data-staff-id="d2"] .scheduleNote').fill('額外休假 ');choose('technician');check('all');assert page.locator('[data-staff-id="d2"] .scheduleNote').input_value()=='額外休假 ';page.locator('[data-staff-id="d2"] .scheduleNote').fill('額外休假')
  for mode in ['technician','designer','all','technician','all','designer','all']:choose(mode);check(mode)
  page.wait_for_timeout(650);assert page.evaluate('testWrites.length')==0
  # Technician draft is protected in exactly the same way.
  choose('technician');page.locator('[data-staff-id="t21"] .scheduleNote').fill('尚未完成的技術師草稿');choose('designer');check('technician');assert '欄位尚未完成編輯' in page.locator('#toast').inner_text();assert page.locator('[data-staff-id="t21"] .scheduleNote').input_value()=='尚未完成的技術師草稿';page.locator('[data-staff-id="t21"] .scheduleNote').fill('技術休假');choose('all');check('all');page.wait_for_timeout(550);assert page.evaluate('testWrites.length')==0
  page.locator('#monthStoreTitle').fill('')
  # Date editor rebuilding must retain the filter too.
  choose('technician');page.locator('[data-date="2026-12-06"]').click();assert page.locator('#dayScheduleRows .dayRole:not([hidden]) .dayScheduleRow').count()==2;assert page.locator('#selectedScheduleDate').inner_text()=='2026-12-06';page.locator('[data-date="2026-12-05"]').click();check('technician')
  if width>=561:
   choose('designer');page.locator('[data-person-id="d2"]').click();page.locator('[data-date="2026-12-12"]').click();prior=page.locator('#personLeaveCount').inner_text();choose('technician');assert page.locator('[data-schedule-filter="designer"]').get_attribute('aria-pressed')=='true';assert '草稿尚未儲存' in page.locator('#toast').inner_text();assert page.locator('#personLeaveCount').inner_text()==prior;choose('all');assert page.locator('#personLeaveCount').inner_text()==prior;page.locator('#personLeaveCancel').click();choose('technician');check('technician')
   choose('designer');page.locator('[data-person-id="d2"]').click();choose('technician');check('technician');assert not page.locator('#personLeaveBar').is_visible();choose('all');assert page.locator('.rosterButton.active').count()==0;choose('technician')
  page.wait_for_timeout(550);assert page.evaluate('testWrites.length')==0
  # Completing a field still uses existing change/autosave; later filter adds no write.
  choose('all');page.locator('[data-staff-id="d2"] .scheduleNote').fill('手動完成欄位');page.locator('#selectedScheduleDate').click();page.wait_for_function('testWrites.length===1');choose('technician');page.wait_for_timeout(550);assert page.evaluate('testWrites.length')==1;assert page.evaluate("testDocs['salons/default/schedules/2026-12'].exceptions['2026-12-05'].d2.note")=='手動完成欄位'
  # Explicit quick settings affect only visible picks, never hidden selected people.
  choose('all');page.locator('[data-staff-id="d2"] .schedulePick').check();choose('technician');page.locator('[data-staff-id="t21"] .schedulePick').check();page.locator('[data-quick-status="normal"]').click();page.wait_for_function('testWrites.length===2');assert page.evaluate("testDocs['salons/default/schedules/2026-12'].exceptions['2026-12-05'].d2.status")=='off';assert page.evaluate("testDocs['salons/default/schedules/2026-12'].exceptions['2026-12-05'].t21.status")=='normal';assert page.locator('#dayScheduleRows .dayRole:not([hidden]) .dayScheduleRow').count()==2;assert page.evaluate("JSON.stringify(SalonStaff.capacityData('2026-12-01'))")==capacity
  page.screenshot(path=f'/tmp/schedule-filter-{ENGINE}-{width}.png')
  print(f'PASS {ENGINE} {width}x{height}: synchronized three-area filters, repeated switching, date/duty preserved, raw and personal draft guards, clean node retained, zero filter writes, visible-only explicit quick edit',flush=True)
  assert not errors,errors;ctx.close()
 browser.close()
