"""Isolated UI tests; external network blocked, all writes target in-memory fixtures."""
from playwright.sync_api import sync_playwright
from pathlib import Path
from datetime import datetime,timezone
import os,json
ROOT=Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:8776/'
engine=os.environ.get('HEADER_ENGINE','chromium')
fixture={f'salons/default/dates/2026-11-22/appointments/{i}':{'name':'測試客人'+i,'services':['洗剪'],'duration':2,'startTime':'10:00','start':4,'col':col,'designer':'6','note':'測試備註','showNoteOnCard':True} for i,col in [('a',1),('b',3)]}
with sync_playwright() as p:
 browser=getattr(p,engine).launch(**({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {}))
 for width,height in [(320,740),(390,844),(820,1180),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1000,timezone_id='Asia/Taipei',service_workers='block')
  ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''))
  ctx.add_init_script(path=str(ROOT/'tests/firebase-mock.js'));ctx.add_init_script('window.testDocs='+json.dumps(fixture,ensure_ascii=False)+';')
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.clock.install(time=datetime(2026,11,22,4,34,56,tzinfo=timezone.utc));page.goto(BASE);page.wait_for_selector('.appt')
  page.wait_for_timeout(100);assert not page.locator('#holeNotice').is_visible();assert page.locator('#refreshBtn').inner_text()=='↻ 同步資料'
  before=page.evaluate('JSON.stringify(testDocs)');card=page.locator('.appt').first.evaluate('(e)=>({height:e.style.height,color:e.style.backgroundColor,seat:e.parentElement.dataset.col,row:e.parentElement.dataset.row})')
  page.evaluate("document.querySelector('#stage').scrollTop=100");scroll=page.locator('#stage').evaluate('e=>e.scrollTop')
  page.locator('#refreshBtn').click();page.wait_for_function("/^已同步 \\d{2}:\\d{2}:\\d{2}$/.test(document.querySelector('#dataSyncResult').textContent)")
  stamp=page.locator('#dataSyncResult').inner_text().split(' ')[1];hh,mm,ss=map(int,stamp.split(':'));local_seconds=page.evaluate('new Date().getHours()*3600+new Date().getMinutes()*60+new Date().getSeconds()');assert (local_seconds-(hh*3600+mm*60+ss))%86400<=2
  assert page.locator('#stage').evaluate('e=>e.scrollTop')==scroll;assert page.locator('#dateInput').input_value()=='2026-11-22'
  assert page.evaluate('JSON.stringify(testDocs)')==before;assert page.evaluate('testWrites.length')==0;assert page.evaluate("testReads.slice(-6).every(r=>r.options.source==='server')")
  assert card==page.locator('.appt').first.evaluate('(e)=>({height:e.style.height,color:e.style.backgroundColor,seat:e.parentElement.dataset.col,row:e.parentElement.dataset.row})');assert not page.locator('#holeNotice').is_visible()
  page.evaluate("testReadFailures.push('salons/default/staff')");page.locator('#refreshBtn').click();page.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='error'");assert page.locator('#dataSyncResult').inner_text()=='更新失敗，請重試';assert page.evaluate('testWrites.length')==0
  page.evaluate('testReadFailures=[]');page.locator('#refreshBtn').click();page.wait_for_function("document.querySelector('#dataSyncResult').dataset.state==='success'")
  dialogs=[]
  def dialog(d):
   dialogs.append((d.type,d.message));d.dismiss()
  page.on('dialog',dialog)
  page.locator('#checkBtn').click();assert dialogs[-1]==('alert','發現可整理的空格');assert page.locator('#holeNotice').is_visible();assert page.evaluate('JSON.stringify(testDocs)')==before
  page.locator('#organizeBtn').click();assert dialogs[-1]==('confirm','這項操作可能變更客人的座位安排，確定要繼續嗎？');assert page.evaluate('JSON.stringify(testDocs)')==before;assert page.evaluate('testWrites.length')==0
  page.locator('#ignoreBtn').click();page.evaluate("testEmit('salons/default/dates/2026-11-22/appointments')");page.wait_for_timeout(60);assert not page.locator('#holeNotice').is_visible()
  page.locator('#nextDay').click();page.wait_for_timeout(60);assert not page.locator('#holeNotice').is_visible();page.locator('#checkBtn').click();assert dialogs[-1]==('alert','目前沒有明顯空格');assert not page.locator('#holeNotice').is_visible()
  page.locator('#prevDay').click();page.wait_for_selector('.appt');assert not page.locator('#holeNotice').is_visible();page.locator('#checkBtn').click()
  page.remove_listener('dialog',dialog);page.on('dialog',lambda d:d.accept())
  # Model the existing batch API in memory; never call a real Firebase backend.
  page.evaluate('''()=>{firebase.firestore().batch=()=>{const ops=[];return {delete:r=>ops.push(['delete',r]),set:(r,d)=>ops.push(['set',r,d]),commit:async()=>{for(const [op,r,d] of ops){testWrites.push({op,path:r.path,data:d});if(op==='delete')delete testDocs[r.path];else testDocs[r.path]=d}testEmit('salons/default/dates/2026-11-22/appointments')}}}}''')
  page.locator('#organizeBtn').click();page.wait_for_timeout(100)
  assert page.evaluate("testDocs['salons/default/dates/2026-11-22/appointments/a'].col")==1;assert page.evaluate("testDocs['salons/default/dates/2026-11-22/appointments/b'].col")==2
  assert page.evaluate('testWrites.length')==4;assert not page.locator('#holeNotice').is_visible();assert not errors,errors
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  print(f'PASS {engine} {width}: sync timestamp/read-only/date/scroll, failure and recovery, no auto notice, manual checks, cancel zero writes, confirmed original arrangement',flush=True)
  ctx.close()
 browser.close()
