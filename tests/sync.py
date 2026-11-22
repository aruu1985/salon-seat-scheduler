import os
"""Isolated SDK snapshot/transaction simulation. Never connects to production Firestore."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from datetime import date,timedelta
import json
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:8765/')
anchor=date.fromisoformat(os.environ.get('SALON_TEST_DATE',date.today().isoformat()));TODAY=anchor.isoformat();YESTERDAY=(anchor-timedelta(days=1)).isoformat();FUTURE=(anchor+timedelta(days=40)).isoformat()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1440,1000)]:
  contexts=[];pages=[];errors=[];shared={};outbox=[]
  def receive(source,path,data):
   if data is None:shared.pop(path,None)
   else:shared[path]=data
   outbox.append((source['page'],path,data))
  def deliver():
   while outbox:
    source,path,data=outbox.pop(0)
    for peer in pages:
     if peer!=source:
      peer.evaluate("([path,data])=>{if(data===null)delete testDocs[path];else testDocs[path]=data;testRevision++;testEmit(path)}",[path,data])
  for n in range(2):
   ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,service_workers='block');contexts.append(ctx);ctx.add_init_script(path=str(ROOT/'tests/firebase-mock.js'));ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''));ctx.expose_binding('sharedWrite',receive)
   page=ctx.new_page();pages.append(page);page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')")
  a,b=pages
  def choose(page,value):
   page.locator('#dateInput').fill(value);page.locator('#dateInput').dispatch_event('change');page.wait_for_timeout(80)
  def inject(page,path,data,emit=True):
   page.evaluate('''([path,data,emit])=>{testDocs[path]=data;if(emit)testEmit(path)}''',[path,data,emit])
  # The refresh button is hit-testable and performs server reads for each selected date.
  for day in [YESTERDAY,TODAY,FUTURE]:
   choose(a,day);path=f'salons/default/dates/{day}/appointments/server-only'
   inject(a,path,{'name':'伺服器最新','col':1,'startTime':'10:00','start':4,'duration':18},False)
   inject(a,'salons/default/staff/mock-tech',{'role':'technician','code':'21','name':'模擬技術師','active':True},False)
   inject(a,f'salons/default/schedules/{day[:7]}',{'exceptions':{day:{'mock-tech':{'status':'late','time':'12:00'}}}},False)
   inject(a,f'salons/default/storeCalendar/{day[:4]}',{'overrides':{day:{'status':'extended','startTime':'10:00','endTime':'21:00'}}},False)
   a.locator('#refreshBtn').click();a.wait_for_function("document.getElementById('dataSyncResult').dataset.state==='success'")
   assert a.locator('#dateInput').input_value()==day;assert a.locator('.appt').count()==1;assert '伺服器最新' in a.locator('.appt').inner_text();assert '12:00' in a.locator('#technicianNotes').inner_text();assert '21:00' in a.locator('#todayEvents').inner_text()
   assert a.evaluate("testReads.slice(-6).every(x=>x.options?.source==='server')")
   assert a.evaluate('testWrites.length')==0
  # Refresh is read-only even if obsolete v06 local storage exists and an empty snapshot arrives.
  choose(a,'2026-01-01');a.evaluate("localStorage.setItem('salon-v06-2026-01-01',JSON.stringify([{id:'obsolete',name:'舊資料',start:4,duration:2,col:1}]))");a.evaluate("testEmit('salons/default/dates/2026-01-01/appointments')");assert a.locator('.appt').count()==0;assert a.evaluate('testWrites.length')==0
  choose(a,TODAY);choose(b,TODAY)
  # Clear only test fixture records, never a production backend.
  for page in pages:page.evaluate("()=>{testDocs={};Object.keys(testListeners).forEach(testEmit)}")
  a.locator('#addBtn').click();a.locator('#name').fill('跨裝置新預約');a.locator('#saveBtn').click();a.wait_for_function("!document.getElementById('modal').classList.contains('open')");deliver();b.wait_for_selector('.appt');assert b.locator('.appt').inner_text().find('跨裝置新預約')>=0
  identifier=a.locator('.appt').get_attribute('data-id');path=f'salons/default/dates/{TODAY}/appointments/{identifier}'
  a.locator('.appt').click();a.locator('#actionEdit').click();a.locator('#name').fill('跨裝置修改');a.locator('#saveBtn').click();a.wait_for_function("!document.getElementById('modal').classList.contains('open')");deliver();b.wait_for_function("document.querySelector('.appt').textContent.includes('跨裝置修改')")
  # Moving time and seat uses the same optimistic write path and peer snapshot.
  a.locator('.appt').dispatch_event('dragstart',{'dataTransfer':{}}) if False else None
  a.evaluate('''id=>{const data=new DataTransfer();data.setData('text/plain',id);document.querySelector('.cell[data-row="8"][data-col="2"]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}))}''',identifier)
  a.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");deliver()
  b.wait_for_function("document.querySelector('.appt').parentElement.dataset.row==='8'&&document.querySelector('.appt').parentElement.dataset.col==='2'")
  # A edits an old version while B saves the same document. A's draft stays intact and cannot overwrite B.
  a.locator('.appt').click();a.locator('#actionEdit').click();a.locator('#name').fill('A 未儲存草稿')
  b.locator('.appt').click();b.locator('#actionEdit').click();b.locator('#name').fill('B 最新資料');b.locator('#saveBtn').click();b.wait_for_function("!document.getElementById('modal').classList.contains('open')");deliver();a.wait_for_function("!document.querySelector('#editConflict').hidden")
  assert a.locator('#name').input_value()=='A 未儲存草稿';writes=a.evaluate('testWrites.length');a.locator('#saveBtn').click();a.wait_for_timeout(150);assert a.evaluate('testWrites.length')==writes;assert shared[path]['name']=='B 最新資料';assert a.locator('#name').input_value()=='A 未儲存草稿'
  # An explicit refresh during editing is allowed programmatically and preserves every draft field.
  a.evaluate("document.querySelector('#refreshBtn').click()");a.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='success'");assert a.locator('#name').input_value()=='A 未儲存草稿'
  a.locator('#cancelBtn').click()
  # Simulate a remote SDK delete; no production deletion or dangerous admin flow is exercised.
  b.evaluate('path=>firebase.firestore().collection("salons").doc("default").collection("dates").doc(path.split("/")[3]).collection("appointments").doc(path.split("/").pop()).delete()',path)
  deliver();a.wait_for_function("document.querySelectorAll('.appt').length===0");assert identifier not in a.evaluate("JSON.stringify(testDocs)")
  # All old-date listeners are removed, not accumulated. Capture a stale callback then switch away/back.
  a.evaluate("()=>{window.savedOldListener=testListeners['salons/default/dates/'+document.getElementById('dateInput').value+'/appointments'][0].cb}")
  choose(a,FUTURE);choose(a,TODAY);a.evaluate("()=>savedOldListener({docs:[{id:'stale',data:()=>({name:'不應出現',start:4,duration:2,col:1})}],metadata:{fromCache:false}})");assert a.locator('.appt').count()==0
  counts=a.evaluate("Object.entries(testListeners).filter(([path])=>path.endsWith('/appointments')).map(([path,ls])=>ls.length)");assert sum(counts)==1,counts
  # Any required read failure keeps the previous cards and reports an error; a cached event cannot turn it into success.
  a.evaluate("testReadFailures=['salons/default/schedules/'+document.getElementById('dateInput').value.slice(0,7)]");a.locator('#refreshBtn').click();a.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='error'");assert '更新失敗' in a.locator('#syncStatus').inner_text()
  a.evaluate("testEmit('salons/default/dates/'+document.getElementById('dateInput').value+'/appointments')");assert '更新失敗' in a.locator('#dataSyncResult').inner_text();a.evaluate('testReadFailures=[]')
  # Offline is a visible failure; restoring network invokes the common server refresh.
  contexts[0].set_offline(True);a.locator('#refreshBtn').click();a.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='error'");contexts[0].set_offline(False);a.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='success'")
  # A slow earlier date refresh cannot overwrite the current date or its result.
  a.evaluate("()=>{window.testReadOverride=(path,isDoc)=>path.endsWith('/appointments')?new Promise(resolve=>window.releaseOldRead=()=>resolve({docs:[],metadata:{fromCache:false}})):null}")
  a.locator('#refreshBtn').click();a.wait_for_function("typeof window.releaseOldRead==='function'");choose(a,FUTURE);a.evaluate('releaseOldRead()');a.wait_for_timeout(100);assert a.locator('#dateInput').input_value()==FUTURE;assert a.locator('#dataSyncResult').inner_text()==''
  # On the same date, a newer live event wins over an earlier manual read.
  a.evaluate("()=>{window.testReadOverride=(path,isDoc)=>path.endsWith('/appointments')?new Promise(resolve=>window.releaseSameRead=()=>resolve({docs:[{id:'old-read',data:()=>({name:'舊回覆',col:1,start:4,duration:2})}],metadata:{fromCache:false}})):null}")
  a.locator('#refreshBtn').click();a.wait_for_function("typeof releaseSameRead==='function'")
  inject(a,f'salons/default/dates/{FUTURE}/appointments/new-live',{'name':'新即時事件','col':1,'start':4,'duration':2})
  a.evaluate('releaseSameRead()');a.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='success'");assert a.locator('.appt').count()==1;assert '新即時事件' in a.locator('.appt').inner_text()
  a.evaluate("()=>{window.testReadOverride=null}")
  # A terminated stream is replaced once after a successful server refresh.
  a.evaluate("()=>{const path='salons/default/dates/'+document.getElementById('dateInput').value+'/appointments';testListeners[path][0].error(new Error('模擬監聽終止'))}")
  a.locator('#refreshBtn').click();a.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='success'")
  assert a.evaluate("Object.entries(testListeners).filter(([p])=>p.endsWith('/appointments')).reduce((sum,[p,list])=>sum+list.length,0)")==1
  inject(a,f'salons/default/dates/{FUTURE}/appointments/recovered',{'name':'監聽恢復','col':2,'start':4,'duration':2});assert a.locator('.appt').count()==2
  assert not errors,errors
  print(f'PASS {width}x{height}: past/present/future refresh, schedule/store server reads, read-only legacy, peer create/edit/move/delete, draft/conflict protection, listener disposal, offline/recovery, stale date callback')
  for ctx in contexts:ctx.close()
 # Authentication failing during an offline cold start can be retried without reloading.
 ctx=browser.new_context(service_workers='block');ctx.add_init_script(script=(ROOT/'tests/firebase-mock.js').read_text()+"\nlet attempts=0;firebase.auth=()=>({signInAnonymously:async()=>{if(++attempts===1)throw Error('模擬首次離線')}});")
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
 page=ctx.new_page();page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('Firebase 錯誤')")
 page.evaluate("window.dispatchEvent(new Event('online'))");page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");assert page.evaluate('testWrites.length')==0
 print('PASS failed cold-start authentication retries on reconnect without page reload')
 ctx.close();browser.close()
