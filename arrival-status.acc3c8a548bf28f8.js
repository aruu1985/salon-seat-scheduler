/* Standalone arrival status. No companion implementation or production write adapter. */
(function(){
 const labels={arrived:'✓ 有來','not-arrived':'✕ 沒來',unmarked:'未標記'};
 function value(raw){if(raw===undefined)return {status:null,revision:0};if(!raw||typeof raw!=='object'||Object.keys(raw).some(key=>!['status','revision'].includes(key))||!Number.isSafeInteger(raw.revision)||raw.revision<1||![null,'arrived','not-arrived'].includes(raw.status))throw Error('到店標記格式不符，請先同步後再試');return {status:raw.status,revision:raw.revision}}
 function symbol(raw){try{return value(raw).status==='arrived'?'✓':value(raw).status==='not-arrived'?'✕':'⋯'}catch(_){return '?'}}
 const same=(a,b)=>{const x=value(a),y=value(b);return x.status===y.status&&x.revision===y.revision};
 let database,project,auth,dialog,active;
 function configure(db,projectId,authentication){database=db;project=projectId;auth=authentication}
 async function save(date,id,status,expected,expectedBusiness){
  if(window.SALON_ARRIVAL_CONFIG?.phase==='compatibility')throw Error('相容版本尚未啟用到店標記，未儲存');
  if(window.SALON_ARRIVAL_CONFIG?.enabled!==true||window.SALON_ARRIVAL_CONFIG.writesEnabled!==true||project!=='demo-salon-counter')throw Error('到店標記尚未開放正式寫入；目前只供隔離測試');
  if(!navigator.onLine)throw Error('目前離線，標記未儲存，請連線後重試');
  if(!auth?.currentUser||auth.currentUser.isAnonymous)throw Error('到店標記需要經核准的店內人員帳號，匿名登入沒有此權限');

  if(typeof expectedBusiness!=='string')throw Error('尚未取得最新預約，請同步後再標記');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!id||String(id).includes('/')||![null,'arrived','not-arrived'].includes(status))throw Error('到店標記資料不正確');
  const ref=database.collection('salons').doc('default').collection('dates').doc(date).collection('appointments').doc(id);
  return database.runTransaction(async tx=>{
   await window.SalonCounterAuth.authorizeTransaction(tx);
   const doc=await tx.get(ref);if(!doc.exists)throw Error('這筆預約已刪除，未新增或重建資料');
   if(window.SalonDataSync.appointmentFingerprint(doc.data())!==expectedBusiness)throw Error('預約內容已由其他裝置變更，請重新開啟狀態選單');
   const raw=doc.data().arrival;
   if(!same(raw,expected))throw Error('其他裝置已更新到店標記，請重新開啟選單後再選擇');
   const previous=value(raw);if(previous.revision===Number.MAX_SAFE_INTEGER)throw Error('標記版本已達上限，請聯絡管理者');
   const next={status,revision:previous.revision+1};tx.update(ref,{arrival:next});return next;
  });
 }
 function createDialog(){if(dialog)return;dialog=document.createElement('dialog');dialog.className='arrivalDialog';dialog.setAttribute('aria-labelledby','arrivalHeading');dialog.innerHTML='<h2 id="arrivalHeading">客人到店狀態</h2><p class="arrivalCustomer"></p><p class="arrivalResult" role="status"></p><div class="arrivalChoices"></div><button type="button" class="arrivalCancel">取消</button>';
  for(const [status,label]of [['arrived',labels.arrived],['not-arrived',labels['not-arrived']],[null,'清除記號']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.arrivalChoice=status===null?'clear':status;button.onclick=async()=>{const selected=active;if(!selected||dialog.dataset.busy==='true')return;dialog.dataset.busy='true';dialog.querySelectorAll('button').forEach(b=>b.disabled=true);dialog.querySelector('.arrivalResult').textContent='正在儲存……';try{await save(selected.date,selected.id,status,selected.expected,selected.business);dialog.close();window.salonNotify?.('到店標記已儲存')}catch(error){dialog.querySelector('.arrivalResult').textContent=error.code==='permission-denied'?'櫃檯授權已失效或資料已變更，未儲存；請重新確認授權與預約':error.message}finally{dialog.dataset.busy='false';dialog.querySelectorAll('button').forEach(b=>b.disabled=b.dataset.arrivalChoice!==undefined&&!canEdit())}};dialog.querySelector('.arrivalChoices').append(button)}
  dialog.querySelector('.arrivalCancel').onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(dialog.dataset.busy==='true')event.preventDefault()});dialog.addEventListener('close',()=>{const old=active;active=null;document.querySelector(`.appt[data-id="${CSS.escape(old?.id||'')}"] .arrivalButton`)?.focus({preventScroll:true})});document.body.append(dialog);
 }
 function attach(card,appointment,date,business){
  const writable=canEdit();let parsed;try{parsed=value(appointment.arrival)}catch(_){parsed={status:'invalid'}}if(!writable&&parsed.status===null)return;
  card.classList.add('hasArrivalControl');const button=document.createElement(writable?'button':'span');if(writable)button.type='button';button.className='arrivalButton';button.draggable=false;button.textContent=symbol(appointment.arrival);let current;try{current=value(appointment.arrival).status}catch(_){current='invalid'}button.dataset.arrival=current||'unmarked';button.title='到店狀態：'+(labels[current||'unmarked']||'資料待確認');button.setAttribute('aria-label',button.title+'，點擊修改 '+appointment.name);button.setAttribute('aria-haspopup','dialog');
  if(!writable){button.classList.add('arrivalReadonly');button.removeAttribute('aria-haspopup');button.title+='（唯讀）';button.setAttribute('aria-label',button.title+'（唯讀）');card.append(button);return}
  for(const type of ['click','dblclick','keydown','dragstart','pointerdown'])button.addEventListener(type,event=>{event.stopPropagation();if(type==='dragstart')event.preventDefault()});
  button.addEventListener('click',()=>{createDialog();active={date,id:appointment.id,expected:appointment.arrival,business};dialog.querySelector('.arrivalCustomer').textContent=date+'｜'+appointment.name;dialog.querySelector('.arrivalResult').textContent='';dialog.showModal()});card.append(button);
 }
 function fit(card){const b=card.querySelector('.arrivalButton');if(!b)return;b.style.height=Math.min(28,b.getBoundingClientRect().width,card.clientHeight)+'px';b.style.fontSize=Math.max(7,Math.min(18,b.clientWidth-2,b.clientHeight-2))+'px';const bar=card.querySelector('.secondaryBar');if(bar){const x=b.getBoundingClientRect(),y=bar.getBoundingClientRect(),overlap=x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top;bar.classList.toggle('arrivalBarOverlap',overlap);bar.style.setProperty('--arrival-label-gap-width',Math.max(0,y.right-x.left)+'px');bar.style.setProperty('--arrival-label-gap-height',Math.max(0,x.bottom-y.top)+'px')}}
 function needsRail(card){const controls=[card.querySelector('.arrivalButton'),card.querySelector('.conflictLabel')].filter(Boolean).map(e=>e.getBoundingClientRect()),content=card.querySelector('.cardContent');if(!content)return false;const clip=content.getBoundingClientRect();return [...content.querySelectorAll('.tri,.name,.serviceLine,.cardNote,.cardSecondaryHint')].some(el=>{if(!el.textContent)return false;const bounds=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);return [...range.getClientRects()].some(r=>{const left=Math.max(r.left,bounds.left,clip.left),right=Math.min(r.right,bounds.right,clip.right),top=Math.max(r.top,bounds.top,clip.top),bottom=Math.min(r.bottom,bounds.bottom,clip.bottom);return right>left&&bottom>top&&controls.some(c=>left<c.right+1&&right>c.left-1&&top<c.bottom+1&&bottom>c.top-1)})})}
 function topSpace(card){const top=card.getBoundingClientRect().top;return Math.ceil(Math.max(...[card.querySelector('.arrivalButton'),card.querySelector('.conflictLabel')].filter(Boolean).map(el=>el.getBoundingClientRect().bottom))-top+1)}
 function canEdit(){return window.SALON_ARRIVAL_CONFIG?.phase!=='compatibility'&&window.SALON_ARRIVAL_CONFIG?.writesEnabled===true&&window.SalonCounterAuth.canWrite()}
 function permissionChanged(){if(!dialog?.open)return;const writable=canEdit();dialog.querySelectorAll('[data-arrival-choice]').forEach(b=>b.disabled=dialog.dataset.busy==='true'||!writable);if(!writable){dialog.dataset.permissionBlocked='true';dialog.querySelector('.arrivalResult').textContent=window.SALON_ARRIVAL_CONFIG?.writesEnabled!==true?'到店功能目前為唯讀預覽':window.SalonCounterAuth.getState().reason}else if(dialog.dataset.permissionBlocked==='true'&&dialog.dataset.busy!=='true'){dialog.dataset.permissionBlocked='false';dialog.querySelector('.arrivalResult').textContent=''}}
 window.SalonArrival={canEdit,permissionChanged,topSpace,needsRail,fit,value,symbol,same,configure,save,attach};
})();
