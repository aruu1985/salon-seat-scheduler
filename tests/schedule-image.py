"""Real PNG export in isolated browsers. All Firestore data is synthetic; external requests blocked."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageColor
import os,json,math
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('SALON_TEST_BASE','http://127.0.0.1:19818/');ENGINE=os.environ.get('HEADER_ENGINE','chromium');OUT=Path('/tmp/salon-month-images');OUT.mkdir(exist_ok=True)
people=[{'id':'d'+str(c),'code':str(c),'name':name,'role':'designer','active':True,'fixedOffDay':day,'color':color} for c,name,day,color in [(2,'婉婷',1,'#f6a24c'),(3,'品婷',3,'#fff176'),(5,'左左',4,'#ff75ad'),(6,'Sam',2,'#8ee072'),(7,'文文',1,'#7dc8ff')]]
people += [{'id':'t'+str(c),'code':str(c),'name':'技術'+str(c),'role':'technician','active':True} for c in range(21,31)]
fixture={'salons/default/staff/'+p['id']:{k:v for k,v in p.items() if k!='id'} for p in people}
exceptions={'2026-12-01':{'d6':{'status':'normal','note':'固定休改上班'}},'2026-12-14':{'d2':{'status':'normal','note':'上班例外'}},'2026-12-05':{'d2':{'status':'off','note':'額外休假'},'t21':{'status':'afternoon','time':'14:30'}} ,'2026-12-31':{p['id']:{'status':'off'} for p in people}}
fixture['salons/default/schedules/2026-12']={'exceptions':exceptions};fixture['salons/default/storeCalendar/2026']={'overrides':{'2026-12-24':{'status':'closed','title':'本店公休'}}}
instrument='''
window.imageText=[];window.imageRects=[];
const originalText=CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){const m=this.measureText(text);window.imageText.push({text,x,y,width:m.width,font:this.font,color:this.fillStyle,baseline:this.textBaseline});return originalText.call(this,text,x,y,...rest)};
'''
with sync_playwright() as pw:
 browser=pw.webkit.launch(headless=True) if ENGINE=='webkit' else pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180),(1180,820),(1440,1000)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1200,accept_downloads=True,service_workers='block',timezone_id='Asia/Taipei');ctx.add_init_script((ROOT/'tests/firebase-mock.js').read_text()+';window.testDocs='+json.dumps(fixture,ensure_ascii=False)+';'+instrument);ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(status=200,body=''));page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_function("document.querySelector('#syncStatus').textContent.includes('已同步')");page.locator('#dateInput').fill('2026-12-01');page.locator('#dateInput').dispatch_event('change');page.locator('#settingsBtn').click();page.locator('#monthlyScheduleBtn').click();page.wait_for_function("document.querySelector('#monthSaveState').textContent==='已同步'");before=page.evaluate('JSON.stringify(testDocs)')
  def export(month,mode):
   if page.locator('#scheduleMonth').input_value()!=month:page.locator('#scheduleMonth').fill(month);page.locator('#scheduleMonth').dispatch_event('change');page.wait_for_function("document.querySelector('#monthSaveState').textContent==='已同步'")
   page.locator('[data-schedule-filter="'+mode+'"]').click();title=page.locator('#scheduleAnnouncementTitle').inner_text()
   # The expected visible records include fixed rules and explicit monthly exceptions.
   expected=page.evaluate('''([people,month,mode])=>{const entries=testDocs['salons/default/schedules/'+month]?.exceptions||{},days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();return Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0');return {day:i+1,names:people.filter(p=>(mode==='all'||p.role===mode)&&['off','leave','afternoon'].includes(SalonStaffSchedule.resolve(p,date,entries[date]||{}).entry.status)).map(p=>p.name)}})}''',[people,month,mode])
   page.evaluate('imageText=[]');
   with page.expect_download() as download:page.locator('#scheduleScreenshotMode').click()
   file=OUT/f'{ENGINE}-{width}-{month}-{mode}.png';download.value.save_as(file)
   page.wait_for_function("!document.querySelector('#scheduleModal').classList.contains('scheduleScreenshot')&&!document.querySelector('#scheduleScreenshotMode').disabled")
   assert download.value.suggested_filename==title+'.png';drawn=page.evaluate('imageText');assert drawn[0]['text']==title
   expectedNames=[n for d in expected for n in d['names']];names=[item['text'] for item in drawn if item['text'] in [p['name'] for p in people]];assert names==expectedNames,(ENGINE,width,mode,names,expectedNames)
   if month=='2026-12':assert any(item['text']=='店休' for item in drawn)
   if month=='2026-12' and mode!='designer':assert any(item['text']=='下半天 14:30' for item in drawn)
   dates=[item['text'] for item in drawn if '24px' in item['font']];assert dates==[str(i+1) for i in range(len(expected))];assert not any(s in item['text'] for item in drawn for s in ['截圖模式','畫面已恢復','返回主畫面','清除本月','更新當日','顯示篩選'])
   image=Image.open(file).convert('RGB');assert image.width*image.height<=4000000;assert image.width>1000 and image.height>600;scale=image.width/1400;assert max(image.getextrema()[0])-min(image.getextrema()[0])>100
   # Verify actual pixels, not just callbacks: every drawn string's box has non-white ink,
   # including all names on busy December 31. Bounds must fit the complete bitmap.
   for item in drawn:
    x,y,w=item['x'],item['y'],item['width'];size=float(item['font'].split('px')[0].split()[-1]);left=x if '24px' in item['font'] else x-w/2
    assert left>=0 and left+w<=1400+1;assert y+size+4<=image.height/scale+1
    box=(max(0,int((left-3)*scale)),max(0,int(y*scale)),min(image.width,math.ceil((left+w+3)*scale)),min(image.height,math.ceil((y+size+6)*scale)));crop=image.crop(box);assert any(min(pixel)<220 for pixel in crop.getdata()),(item['text'],box)
    if item['text'] in expectedNames:assert ImageColor.getrgb(item['color']) in set(crop.getdata()),('Missing color pixels',item['text'])
   assert page.locator('#scheduleAnnouncementTitle').inner_text()==title;assert page.locator('.dayEditor').is_visible();assert not page.locator('#scheduleScreenshotBack').is_visible();assert page.evaluate('testWrites.length')==0;assert page.evaluate('JSON.stringify(testDocs)')==before
   return file
  for mode in ['designer','technician','all']:export('2026-12',mode)
  export('2028-02','designer');export('2027-01','all')
  # Failed encode and denied file sharing both restore UI. No drafts or data writes.
  page.evaluate("()=>{window.oldToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(done){done(null)}}")
  page.locator('#scheduleScreenshotMode').click();page.wait_for_function("document.querySelector('#toast').textContent.includes('畫面已恢復')");page.wait_for_function("!document.querySelector('#scheduleModal').classList.contains('scheduleScreenshot')");assert page.locator('#scheduleScreenshotMode').is_enabled();assert page.locator('.dayEditor').is_visible();page.evaluate('()=>{HTMLCanvasElement.prototype.toBlob=oldToBlob}')
  page.evaluate("()=>{Object.defineProperty(navigator,'canShare',{configurable:true,writable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:()=>Promise.reject(new DOMException('denied','NotAllowedError'))})}")
  export('2026-12','all')
  # Sharing success and user cancellation are separate from encode failures.
  page.evaluate("()=>{navigator.share=async({files})=>{window.sharedImage={name:files[0].name,size:files[0].size,type:files[0].type}}}")
  page.locator('#scheduleScreenshotMode').click();page.wait_for_function("window.sharedImage&&!document.querySelector('#scheduleModal').classList.contains('scheduleScreenshot')");assert page.evaluate('sharedImage.size')>1000;assert page.evaluate('sharedImage.type')=='image/png'
  page.evaluate("()=>{navigator.share=()=>Promise.reject(new DOMException('cancel','AbortError'))}");page.locator('#scheduleScreenshotMode').click();page.wait_for_function("document.querySelector('#toast').textContent.includes('已取消分享')");page.wait_for_function("!document.querySelector('#scheduleModal').classList.contains('scheduleScreenshot')");assert page.locator('#scheduleScreenshotMode').is_enabled()
  page.evaluate("()=>{navigator.share=()=>Promise.reject(new DOMException('denied','NotAllowedError'))}")
  # Active personal mode returns to the same person after export.
  if width>=561:
   page.locator('[data-person-id="d2"]').click();prior=page.locator('#personLeaveCount').inner_text()
   with page.expect_download():page.locator('#scheduleScreenshotMode').click()
   page.wait_for_function("!document.querySelector('#scheduleModal').classList.contains('scheduleScreenshot')");assert page.locator('#personLeaveBar').is_visible();assert page.locator('#personLeaveCount').inner_text()==prior
  # Cancel a pending render, immediately retry, then finish the stale render: only retry downloads.
  page.evaluate("()=>{window.realImageRender=SalonScheduleImage.render;let calls=0;SalonScheduleImage.render=async s=>{if(++calls===1)await new Promise(ok=>window.releaseImage=ok);return realImageRender(s)}}")
  observed=[];page.on('download',lambda d:observed.append(d.suggested_filename));page.locator('#scheduleScreenshotMode').click();page.wait_for_function('typeof releaseImage==="function"');page.locator('#scheduleScreenshotBack').click();page.wait_for_function("!document.querySelector('#scheduleModal').classList.contains('scheduleScreenshot')")
  with page.expect_download():page.locator('#scheduleScreenshotMode').click()
  page.wait_for_function("!document.querySelector('#scheduleModal').classList.contains('scheduleScreenshot')");page.evaluate('()=>{releaseImage()}');page.wait_for_timeout(500);assert len(observed)==1;page.evaluate('()=>{SalonScheduleImage.render=realImageRender}')
  assert page.evaluate('testWrites.length')==0;assert page.evaluate('JSON.stringify(testDocs)')==before;assert not errors,errors
  print(f'PASS {ENGINE} {width}x{height}: real PNGs for three filters, December 31 busy day, fixed+extra+work exception, leap/other months, full strings/pixels/bounds/colors, safe encode failure, denied-share download, restored editor, zero writes',flush=True);ctx.close()
 browser.close()
