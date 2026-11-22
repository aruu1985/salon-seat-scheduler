"""Full single-person UI actions against in-memory SDK model, never production."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:18776/'
extras='''
const oldRef=ref;ref=(p='',d=false)=>{const r=oldRef(p,d);Object.defineProperty(r,'parent',{get:()=>ref(p.split('/').slice(0,-1).join('/'),!d)});r.add=async data=>{const target=ref(p+'/'+crypto.randomUUID(),true);await target.set(data);return target};return r};
const oldSnap=snapshot;snapshot=(p,d)=>{const s=oldSnap(p,d);if(d)s.ref=ref(p,true);else s.docs.forEach(doc=>doc.ref=ref(p+'/'+doc.id,true));return s};
window.sharedWrite=async()=>{};firebase.firestore.Timestamp={fromMillis:x=>x};
firebase.firestore().collectionGroup=name=>({get:async()=>({docs:Object.keys(testDocs).filter(p=>p.split('/').at(-2)===name).map(p=>snapshot(p,true))})});
firebase.firestore().batch=()=>{const ops=[];return {set:(r,d)=>ops.push(()=>r.set(d)),delete:r=>ops.push(()=>r.delete()),commit:async()=>{for(const op of ops)await op()}}};
'''
fixture={'salons/default/staff/d6':{'role':'designer','code':'6','name':'合成設計師','active':True},'salons/default/storeCalendar/2029':{'overrides':{'2029-01-02':{'status':'extended','startTime':'10:00','endTime':'21:00'}}},'salons/default/trash/expired-synthetic':{'originalDate':'2020-01-01','originalId':'old','data':{'name':'合成歷史垃圾桶'},'expiresAtMs':1}}
engine=os.environ.get('HEADER_ENGINE','chromium')
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if engine=='webkit' else p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block');ctx.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+extras+'\nwindow.testDocs='+json.dumps(fixture,ensure_ascii=False)+';');ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));dialogs=[];page.on('dialog',lambda d:(dialogs.append(d.message),d.dismiss()));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  page.locator('#dateInput').fill('2028-02-29');page.locator('#dateInput').press('Tab');page.wait_for_timeout(80)
  page.locator('#addBtn').click();page.locator('#name').fill('合成第一位先生');page.locator('#serviceChecks input[value="K剪"]').check();page.locator('#hasSecondary').check();page.locator('#secondaryDate').fill('2029-01-02');page.locator('#secondaryDate').press('Tab');page.wait_for_timeout(80);page.locator('#secondaryTime').select_option('11:00');page.locator('#secondaryTechnician').fill('21');page.locator('#secondaryItem').fill('合成美甲');page.locator('#saveBtn').click();page.wait_for_function("!document.querySelector('#modal').classList.contains('open')");assert page.locator('.appt').count()==1
  first=page.locator('.appt').get_attribute('data-id');path=f'salons/default/dates/2028-02-29/appointments/{first}';raw=page.evaluate('p=>testDocs[p]',path);assert raw['secondaryService']['secondaryDate']=='2029-01-02';assert raw['secondaryService']['secondaryStaff']=='21'
  page.locator('.appt').click();page.locator('#actionEdit').click();assert page.locator('#name').input_value()=='合成第一位先生';assert page.locator('#secondaryItem').input_value()=='合成美甲';page.locator('#note').fill('合成修改備註');page.locator('#saveBtn').click();page.wait_for_function("!document.querySelector('#modal').classList.contains('open')");assert page.evaluate('p=>testDocs[p].note',path)=='合成修改備註'
  page.locator('#addBtn').click();page.locator('#name').fill('合成第二位小姐');page.locator('#saveBtn').click();page.wait_for_function("!document.querySelector('#modal').classList.contains('open')");assert page.locator('.appt').count()==2;second=page.locator('.appt').filter(has_text='第二位').get_attribute('data-id');before=page.evaluate('p=>JSON.stringify(testDocs[p])',f'salons/default/dates/2028-02-29/appointments/{second}')
  page.evaluate('''id=>{const data=new DataTransfer();data.setData('text/plain',id);document.querySelector('.cell[data-row="4"][data-col="1"]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}))}''',second);page.wait_for_timeout(120);assert dialogs and '重疊' in dialogs[-1];assert page.evaluate('p=>JSON.stringify(testDocs[p])',f'salons/default/dates/2028-02-29/appointments/{second}')==before
  page.locator(f'.appt[data-id="{first}"]').click();page.locator('#actionDelete').click();page.locator('#securityNext').click();page.locator('#adminPassword').fill('2255');page.locator('#securityNext').click();page.locator('#securityNext').click();page.locator('#securityNext').click();page.wait_for_function("!document.querySelector('#securityModal').classList.contains('open')");assert page.locator('.appt').count()==1;assert page.evaluate('p=>testDocs[p]===undefined',path);assert page.evaluate("testDocs['salons/default/trash/expired-synthetic']!==undefined");assert page.evaluate('testWrites.filter(w=>w.deleted).length')==1
  assert not errors,errors;print(f'PASS {engine} {width}: leap-day single create/edit/delete confirmation, cross-year secondary retained, seat collision rejected, other appointment and expired trash preserved',flush=True);ctx.close()
 browser.close()
