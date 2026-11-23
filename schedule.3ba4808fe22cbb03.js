(function(){
  const $=id=>document.getElementById(id),pad=n=>String(n).padStart(2,'0');
  const STATUS={normal:'正常上班',off:'休假',late:'晚到／晚上班',early:'提早下班',afternoon:'下半天',leave:'請假'};
  const STORE={normal:'正常營業',specialHours:'特殊營業時間',closed:'本店公休',halfDay:'半日營業',lateOpen:'延後營業',earlyClose:'提早打烊',extended:'延長營業',noBooking:'不可預約',training:'教育課程',meeting:'半日會議',specialOpen:'特殊營業日',spring:'春節店休'};
  const storeDrafts={month:{date:null,dirty:false},annual:{date:null,dirty:false}};
  const LEGACY={closed:'closed',spring:'spring',training:'training',meeting:'meeting',earlyClose:'earlyClose',noBooking:'noBooking',specialOpen:'specialOpen'};
  let db=null,notify=()=>{},staff=[],month='',selectedDate='',currentDate='',draft={exceptions:{}},store={overrides:{}},legacyEvents=[],govDays={},monthUnsub=null,staffUnsub=null,storeUnsub=null,legacyUnsub=null,currentStoreUnsub=null,currentLegacyUnsub=null,annualStoreUnsub=null,annualLegacyUnsub=null,currentStoreData={overrides:{}},currentAnnualData={},currentGeneration=0,currentRevision=0,currentFailed=false,currentGovDays={},monthSaveTimer=null,storeSaveTimer=null,loadingMonth=false,monthRevision=0,monthDirty=false,annualMonth='',annualSelected=new Set(),personMode=null,displayFilter='all',screenshotMode=false,screenshotRestoreState=null;
  const clone=value=>JSON.parse(JSON.stringify(value||{}));
  const esc=value=>String(value??'').replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  const storeYears=new Map(),legacyYears=new Map(),govYears=new Map();let monthWatch=0,annualWatch=0,monthNavigation=false;
  const staffRef=()=>db.collection('salons').doc('default').collection('staff');
  const scheduleRef=value=>db.collection('salons').doc('default').collection('schedules').doc(value);
  const annualRef=year=>db.collection('salons').doc('default').collection('annualCalendars').doc(String(year));
  const storeRef=year=>db.collection('salons').doc('default').collection('storeCalendar').doc(String(year));
  const activeStaff=()=>staff.filter(person=>person.active!==false).sort((a,b)=>a.role.localeCompare(b.role)||String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true}));
  const roleLabel=role=>role==='technician'?'技術師':'設計師';
  const personLabel=person=>person.name||person.code;
  const monthDays=value=>new Date(Number(value.slice(0,4)),Number(value.slice(5,7)),0).getDate();
  const dateAt=day=>`${month}-${pad(day)}`;
  const dateIn=(value,day)=>`${value}-${pad(day)}`;
  const entryAt=(date,id)=>SalonStaffSchedule.resolve(personById(id),date,draft.exceptions?.[date]||{}).entry;
  const personById=id=>staff.find(person=>person.id===id);
  const personLeaveTitle=person=>`${person.code}${person.name?` ${person.name}`:''}`;
  const isFixedOff=(person,date)=>SalonStaffSchedule.fixed(person,date);
  function personIsOffOn(person,date,source=draft.exceptions){return SalonStaffSchedule.off(person,date,source?.[date]||{})}
  function personSelectedKey(selected){return [...selected].sort().join('|')}
  const displayFilterLabel=()=>displayFilter==='designer'?'設計師':displayFilter==='technician'?'技術師':'';
  const staffMatchesDisplay=person=>displayFilter==='all'||person.role===displayFilter;
  const isLeaveStatus=status=>status==='off'||status==='leave';
  const isRestDisplayStatus=status=>status==='off'||status==='leave'||status==='afternoon';
  const leaveSubText=entry=>entry?.status==='afternoon'?`下半天${entry.time?` ${entry.time}`:''}`:'';
  const hasWorkTime=entry=>Boolean(entry?.workStart||entry?.workEnd);
  const workTimeLines=entry=>[entry?.workStart?`上班 ${entry.workStart}`:'',entry?.workEnd?`下班 ${entry.workEnd}`:''].filter(Boolean);
  function workTimeControl(field,label,value){return `<label class="specialTimeField">${label}<span><input type="time" step="60" class="${field}" aria-label="特殊${label}時間" value="${esc(value||'')}"><button type="button" data-clear-work="${field}" aria-label="清除${label}時間">清除</button></span></label>`}
  function staffColor(person){return person.role==='technician'?'#256f86':window.SalonStaff.colorForPerson(person)}
  function updateDisplayControls(){
    document.querySelectorAll('[data-schedule-filter]').forEach(button=>button.classList.toggle('active',button.dataset.scheduleFilter===displayFilter));
    const modeButton=$('scheduleScreenshotMode');if(modeButton){modeButton.classList.toggle('active',screenshotMode);modeButton.textContent=screenshotMode?'退出截圖模式':'📷 截圖模式'}
    const modal=$('scheduleModal');if(modal)modal.classList.toggle('scheduleScreenshot',screenshotMode);
    const back=ensureScreenshotBackButton();if(back)back.hidden=!screenshotMode;
    const title=$('scheduleAnnouncementTitle');if(title)title.textContent=month?`${Number(month.slice(0,4))}年${Number(month.slice(5,7))}月${displayFilterLabel()}休假表`:'每月休假表';
  }
  function setDisplayFilter(value){displayFilter=value||'all';renderAll()}
  function toggleScreenshotMode(){
    if(!screenshotMode&&personModeDirty()&&!confirmPersonDiscard())return;
    if(!screenshotMode)personMode=null;
    screenshotMode=!screenshotMode;
    renderAll();
  }
  function ensureScreenshotBackButton(){
    let button=$('scheduleScreenshotBack');
    if(button)return button;
    button=document.createElement('button');button.id='scheduleScreenshotBack';button.className='scheduleScreenshotBack';button.type='button';button.textContent='← 返回';button.hidden=true;button.onclick=exitScreenshotMode;
    document.body.appendChild(button);
    return button;
  }
  function exitScreenshotMode(){
    if(screenshotRestoreState)screenshotRestoreState.cancelled=true;
    restoreScreenshotState();
  }
  async function restoreScreenshotState(state=screenshotRestoreState){
    if(state?.restored)return;
    if(!state){screenshotMode=false;renderAll();return}
    state.restored=true;
    screenshotMode=state.screenshotMode;personMode=state.personMode;displayFilter=state.displayFilter;month=state.month;selectedDate=state.selectedDate;
    const button=$('scheduleScreenshotMode');if(button)button.disabled=false;
    screenshotRestoreState=null;renderAll();await nextPaint();const main=$('scheduleModal')?.querySelector('main');if(main){main.scrollTop=state.layoutScroll;main.scrollLeft=state.mainLeft||0}const panel=$('scheduleModal')?.querySelector('.schedulePanel'),layout=$('scheduleModal')?.querySelector('.scheduleLayout');if(panel)panel.scrollTop=state.panelTop||0;if(layout)layout.scrollLeft=state.layoutLeft||0;window.scrollTo(state.scrollX,state.scrollY);
  }
  const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}
  function scheduleImageSnapshot(){
    const cells=[...$('monthCalendar').querySelectorAll('.monthDay[data-date]')],firstWeekday=new Date(month+'-01T12:00:00').getDay();
    const days=cells.map(cell=>({day:Number(cell.dataset.date.slice(-2)),badges:[...cell.querySelectorAll('.calendarEvent')].map(el=>({text:el.innerText,color:getComputedStyle(el).color})),people:[...cell.querySelectorAll('.monthLeaveEntry')].map(el=>{const name=el.querySelector('.monthLeaveName');return {name:name.textContent,color:getComputedStyle(name).color,outline:name.classList.contains('monthLeaveNameOutlined')?'#513522':null,detail:[...el.querySelectorAll('small')].map(item=>item.textContent).join('／')}})}));
    if(days.length!==monthDays(month))throw new Error('IncompleteCalendar');
    return {title:$('scheduleAnnouncementTitle').textContent,firstWeekday,days};
  }
  async function captureScheduleScreenshot(){
    if(screenshotRestoreState||personModeDirty()&&!confirmPersonDiscard())return;
    const state={cancelled:false,screenshotMode,personMode,displayFilter,month,selectedDate,scrollX:window.scrollX,scrollY:window.scrollY,layoutScroll:$('scheduleModal')?.querySelector('main')?.scrollTop||0,mainLeft:$('scheduleModal')?.querySelector('main')?.scrollLeft||0,panelTop:$('scheduleModal')?.querySelector('.schedulePanel')?.scrollTop||0,layoutLeft:$('scheduleModal')?.querySelector('.scheduleLayout')?.scrollLeft||0};
    const filename=`${$('scheduleAnnouncementTitle')?.textContent||'休假表'}.png`,button=$('scheduleScreenshotMode');
    screenshotRestoreState=state;let stage='prepare';
    try{
      personMode=null;screenshotMode=true;if(button)button.disabled=true;renderAll();await nextPaint();
      stage='render';
      if(state.cancelled)throw Object.assign(new Error('cancel'),{name:'AbortError'});
      const blob=await SalonScheduleImage.render(scheduleImageSnapshot()),file=new File([blob],filename,{type:'image/png'});
      if(state.cancelled)throw Object.assign(new Error('cancel'),{name:'AbortError'});
      stage='share';
      if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:filename})}catch(error){if(error?.name!=='NotAllowedError')throw error;downloadBlob(blob,filename)}}
      else downloadBlob(blob,filename);
      notify('休假表圖片已產生。');
    }catch(error){
      if(error?.name==='AbortError')notify('已取消分享休假表。');
      else{console.error('休假表截圖失敗',{stage,code:error?.name||'Error',reason:['CanvasUnavailable','InvalidCalendar','InvalidTitle','IncompleteCalendar','PNGTimeout','PNGEmpty'].includes(error?.message)?error.message:undefined});notify('休假表圖片未能產生或分享，畫面已恢復，請重試。',true)}
    }finally{
      await restoreScreenshotState(state);
    }
  }
  function leavePeopleForDate(date,entries){
    return activeStaff().filter(person=>{
      if(!staffMatchesDisplay(person))return false;
      if(personMode?.active&&person.id===personMode.personId)return personMode.selected.has(date);
      const entry=entryAt(date,person.id);
      return entry&&(isRestDisplayStatus(entry.status)||(!screenshotMode&&hasWorkTime(entry)));
    }).map(person=>({person,entry:entryAt(date,person.id)}));
  }
  function govDisplayName(name){
    const text=String(name||'政府假日');
    if(text.includes('教師'))return '教師節';
    if(text.includes('中秋'))return '中秋節';
    if(text.includes('國慶'))return '國慶日';
    return text.replace(/紀念日／?/g,'').replace(/放假日/g,'').trim()||text;
  }
  function pruneViewYears(){const keep=new Set([month.slice(0,4),annualMonth.slice(0,4)]);for(const map of [storeYears,legacyYears,govYears])for(const year of map.keys())if(!keep.has(year))map.delete(year)}
  function legacyOverride(date){const event=(legacyYears.get(date.slice(0,4))||[]).find(item=>item.date===date);return event?{status:LEGACY[event.type]||event.type,title:event.title||STORE[LEGACY[event.type]]||event.type,legacy:true}:null}
  function storeOverride(date){return storeYears.get(date.slice(0,4))?.overrides?.[date]||legacyOverride(date)}
  function storeTimeText(item){if(!item||['normal','closed','spring'].includes(item.status))return '';return [item.startTime?`上班 ${item.startTime}`:'',item.endTime?`下班 ${item.endTime}`:''].filter(Boolean).join('／')}
  function isNormalStoreItem(item){return !item||(!item.title&&!item.startTime&&!item.endTime&&!item.note&&(!item.status||item.status==='normal'))}
  function storeLabel(item){if(!item)return '正常營業';const base=STORE[item.status]||item.status,time=storeTimeText(item),title=item.title||'';if(item.status==='specialHours')return `${title||'特殊營業'}${time?` ${time}`:''}`.trim();if(title&&time)return `${title} ${time}`;if(title)return title;if(time)return `${base} ${time}`;return base}
  function storeClass(item){if(!item)return 'store-normal';if(['closed','spring','noBooking'].includes(item.status))return 'store-closed';if(['earlyClose','halfDay','lateOpen'].includes(item.status))return 'store-warning';return 'store-open'}
  function ensureDate(date){draft.exceptions=draft.exceptions||{};draft.exceptions[date]=draft.exceptions[date]||{};return draft.exceptions[date]}
  function setEntry(date,id,value){const day=ensureDate(date),person=personById(id);if(value.status==='normal'&&!value.note&&!hasWorkTime(value)){if(isFixedOff(person,date))day[id]={status:'normal',time:'',note:'固定休改上班'};else delete day[id]}else day[id]=value;if(!Object.keys(day).length)delete draft.exceptions[date]}
  function statusShort(entry){if(entry.status==='late')return `${entry.time||''}到班`;if(entry.status==='early')return `${entry.time||''}下班`;if(entry.status==='afternoon')return `下半天${entry.time?' '+entry.time:''}`;return STATUS[entry.status]||''}
  function renderRoster(){for(const [role,target] of [['designer','scheduleDesigners'],['technician','scheduleTechnicians']]){$(target).innerHTML=activeStaff().filter(p=>p.role===role).map(p=>`<button class="rosterPerson rosterButton ${personMode?.personId===p.id?'active':''}" data-person-id="${esc(p.id)}" type="button"><b ${p.color?`style="background:${esc(p.color)}"`:''}>${esc(p.code)}</b><span>${esc(p.name||'')}</span>${p.fixedOffDay!==null&&p.fixedOffDay!==undefined?`<small>固定週${'日一二三四五六'[p.fixedOffDay]}休</small>`:'<small>點選整月排休</small>'}</button>`).join('')||'<small>尚無啟用人員</small>'};document.querySelectorAll('[data-person-id]').forEach(button=>button.onclick=()=>startPersonMode(button.dataset.personId))}
  function dayBadges(date){const item=storeOverride(date);if(!item||item.status==='normal')return '';const closed=['closed','spring'].includes(item.status),label=closed?'店休':`店：${item.title||STORE[item.status]||item.status}`,time=storeTimeText(item);return `<span class="calendarEvent storeEvent ${storeClass(item)}">${esc(label)}${time?`<br>${esc(time).replace('／','<br>')}`:''}</span>`}
  function renderCalendar(){
    if(!month)return;const [year,mon]=month.split('-').map(Number),first=new Date(year,mon-1,1).getDay(),days=monthDays(month),cells=[];
    for(let i=0;i<first;i++)cells.push('<div class="monthDay outside"></div>');
    for(let day=1;day<=days;day++){
      const date=dateAt(day),entries=draft.exceptions?.[date]||{},personPick=personMode?.selected?.has(date),leavePeople=leavePeopleForDate(date,entries),nameSize=Math.min(5,Math.max(1,leavePeople.length));
      const names=leavePeople.map(({person,entry})=>`<span class="monthLeaveEntry"><span class="monthLeaveName ${person.role==='technician'?'technician':'designer'}${person.role==='designer'&&person.name?.trim()==='品婷'?' monthLeaveNameOutlined':''}" style="--staff-color:${esc(staffColor(person))}">${esc(personLabel(person))}</span>${[leaveSubText(entry),...(!screenshotMode?workTimeLines(entry):[])].filter(Boolean).map(text=>`<small>${esc(text)}</small>`).join('')}</span>`).join('');
      const namesBlock=names?`<div class="monthLeaveNames leaveCount${nameSize}">${names}</div>`:'';
      const specialLines=!screenshotMode&&!personMode?activeStaff().filter(p=>staffMatchesDisplay(p)&&entries[p.id]&&entries[p.id].status!=='normal'&&!isRestDisplayStatus(entries[p.id].status)&&!hasWorkTime(entries[p.id])).map(p=>{const entry=entries[p.id];return `<span class="scheduleMark status-${esc(entry.status)}">${esc(roleLabel(p.role).slice(0,1))} ${esc(personLabel(p))} ${esc(statusShort(entry))}</span>`}).join(''):'';
      const personLine=personMode&&personPick?`<span class="scheduleMark personLeaveMarker">✓ ${isFixedOff(personById(personMode.personId),date)?'固定休日':'額外休假'}</span>`:'';
      cells.push(`<button class="monthDay ${date===selectedDate?'selected':''} ${personPick?'personLeavePicked':''} ${leavePeople.length?'hasLeaveNames':''}" data-date="${date}"><b>${day}</b>${dayBadges(date)}${personLine}${namesBlock}${specialLines}</button>`)
    }
    $('monthCalendar').innerHTML=cells.join('');document.querySelectorAll('.monthDay[data-date]').forEach(cell=>cell.onclick=()=>{if(screenshotMode)return;if(personMode)togglePersonDate(cell.dataset.date);else selectDate(cell.dataset.date)});
  }
  function statusOptions(selected){return Object.entries(STATUS).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
  function storeOptions(selected){return Object.entries(STORE).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
  function renderStoreEditor(prefix,date){const state=storeDrafts[prefix];if(state.dirty&&state.date===date)return;state.date=date;state.dirty=false;const item=storeOverride(date)||{status:'normal',title:'',startTime:'',endTime:'',note:''};$(`${prefix}StoreStatus`).value=item.status||'normal';$(`${prefix}StoreTitle`).value=item.title||'';$(`${prefix}StoreStart`).value=item.startTime||'';$(`${prefix}StoreEnd`).value=item.endTime||'';$(`${prefix}StoreNote`).value=item.note||'';syncStoreTimeControls(prefix)}
  function syncStoreTimeControls(prefix){const hidden=['normal','closed','spring'].includes($(`${prefix}StoreStatus`).value);$(`${prefix}StoreStart`).closest('.storeTimeGrid').hidden=hidden}
  function initSpecialTimeControls(){for(const prefix of ['annual','month']){for(const suffix of ['Status','Title','Start','End','Note']){const input=$(`${prefix}Store${suffix}`);for(const type of ['input','change'])input.addEventListener(type,()=>{storeDrafts[prefix].dirty=true})}for(const [suffix,label] of [['Start','上班'],['End','下班']]){const input=$(`${prefix}Store${suffix}`),wrapper=document.createElement('label');wrapper.className='specialTimeField';wrapper.textContent=label;input.before(wrapper);const group=document.createElement('span');wrapper.append(group);group.append(input);input.step='60';input.setAttribute('aria-label',label+'時間');const clear=document.createElement('button');clear.type='button';clear.textContent='清除';clear.setAttribute('aria-label','清除'+label+'時間');clear.onclick=()=>{input.value='';storeDrafts[prefix].dirty=true};group.append(clear)}$(`${prefix}StoreStatus`).onchange=()=>syncStoreTimeControls(prefix);syncStoreTimeControls(prefix)}}
  function readStoreForm(prefix,date){const status=$(`${prefix}StoreStatus`).value,untimed=['normal','closed','spring'].includes(status);return {date,status,title:$(`${prefix}StoreTitle`).value.trim(),startTime:untimed?'':$(`${prefix}StoreStart`).value,endTime:untimed?'':$(`${prefix}StoreEnd`).value,note:$(`${prefix}StoreNote`).value.trim(),updatedAtMs:Date.now()}}
  function renderEditor(){
    if(personMode?.active){
      const person=personById(personMode.personId);
      $('selectedScheduleDate').textContent=person?`${personLeaveTitle(person)}｜${month} 休假`:'個人排休';
      $('annualDayEvents').innerHTML='<span>點左側人員可快速切換；點月曆日期可加入／取消休假。</span>';
      $('dayScheduleRows').innerHTML=`<section class="dayRole personModeHelp"><h4>個人排休模式</h4><p>直接點月曆日期，一次排完整個月。修改先留在草稿，按「儲存休假」才同步 Firebase。</p><p>政府假日與本店店休只作為資訊顯示，不會自動變成人員休假。</p></section>`;
      return;
    }
    if(!selectedDate){$('selectedScheduleDate').textContent='請選擇日期';$('dayScheduleRows').innerHTML='';return}
    $('selectedScheduleDate').textContent=selectedDate;const gov=(govYears.get(selectedDate.slice(0,4))||{})[selectedDate],storeDay=storeOverride(selectedDate);
    $('annualDayEvents').innerHTML=(gov?`<span>🇹🇼 政府：${esc(gov.name||'政府假日')}</span>`:'')+`<span class="${storeClass(storeDay)}">店況：${esc(storeLabel(storeDay))}</span>`;
    renderStoreEditor('month',selectedDate);
    $('dayScheduleRows').innerHTML=['designer','technician'].map(role=>`<section class="dayRole"><h4>${roleLabel(role)}</h4>${activeStaff().filter(p=>p.role===role).map(p=>{const entry=entryAt(selectedDate,p.id),timed=['late','early','afternoon'].includes(entry.status);return `<div class="dayScheduleRow" data-staff-id="${esc(p.id)}"><input type="checkbox" class="schedulePick" title="多人快速設定"><span><b>${esc(p.code)}</b> ${esc(p.name||'')}</span><select class="scheduleStatus">${statusOptions(entry.status)}</select><input type="time" class="scheduleTime" value="${esc(entry.time||'')}" ${timed?'':'disabled'}><input class="scheduleNote" value="${esc(entry.note||'')}" placeholder="備註"><div class="personWorkTimes">${workTimeControl('workStart','上班',entry.workStart)}${workTimeControl('workEnd','下班',entry.workEnd)}</div></div>`}).join('')}</section>`).join('');
    document.querySelectorAll('.scheduleStatus,.scheduleTime,.scheduleNote,.workStart,.workEnd').forEach(control=>control.onchange=()=>updateRow(control.closest('.dayScheduleRow')));
    document.querySelectorAll('[data-clear-work]').forEach(button=>button.onclick=()=>{const row=button.closest('.dayScheduleRow');row.querySelector('.'+button.dataset.clearWork).value='';updateRow(row)});
  }
  function updateRow(row){const status=row.querySelector('.scheduleStatus').value,time=row.querySelector('.scheduleTime'),note=row.querySelector('.scheduleNote').value.trim(),workStart=row.querySelector('.workStart').value,workEnd=row.querySelector('.workEnd').value;time.disabled=!['late','early','afternoon'].includes(status);if(time.disabled)time.value='';setEntry(selectedDate,row.dataset.staffId,{...entryAt(selectedDate,row.dataset.staffId),status,time:time.value,note,workStart,workEnd});renderCalendar();queueMonthSave()}
  function selectDate(date){selectedDate=date;renderCalendar();renderEditor()}
  async function loadGovYear(year){const key=String(year);govYears.set(key,window.SalonGovCalendar?.cached(year)||{});renderAll();const days=await window.SalonGovCalendar.holidays(year);govYears.set(key,days);pruneViewYears();renderAll()}
  async function selectMonth(value){if(monthNavigation||!confirmPersonDiscard())return;monthNavigation=true;try{clearTimeout(monthSaveTimer);if(monthDirty&&!(await saveMonth()))return;personMode=null;monthRevision++;monthDirty=false;month=value;const ticket=++monthWatch;$('scheduleMonth').value=value;selectedDate=`${value}-01`;if(monthUnsub)monthUnsub();if(storeUnsub)storeUnsub();if(legacyUnsub)legacyUnsub();if(!db){draft={exceptions:{}};store={overrides:{}};legacyEvents=[];renderAll();return}loadingMonth=true;$('monthSaveState').textContent='讀取中…';monthUnsub=scheduleRef(value).onSnapshot(doc=>{if(ticket!==monthWatch)return;if(personMode?.active)return;if(monthDirty&&!loadingMonth)return;draft=clone(doc.data()||{exceptions:{}});loadingMonth=false;$('monthSaveState').textContent='已同步';renderAll()},error=>{if(ticket!==monthWatch)return;loadingMonth=false;$('monthSaveState').textContent='讀取失敗';notify('月排班讀取失敗：'+error.message,true)});const year=value.slice(0,4);storeUnsub=storeRef(year).onSnapshot(doc=>{if(ticket!==monthWatch)return;store=clone(doc.data()||{overrides:{}});storeYears.set(year,store);renderAll()},error=>notify('本店店況讀取失敗：'+error.message,true));legacyUnsub=annualRef(year).onSnapshot(doc=>{if(ticket!==monthWatch)return;legacyEvents=doc.data()?.events||[];legacyYears.set(year,legacyEvents);renderAll()},error=>notify('舊年度行事曆讀取失敗：'+error.message,true));loadGovYear(Number(year))}finally{monthNavigation=false}}
  function renderAll(){renderRoster();renderCalendar();renderEditor();renderPersonBar();updateDisplayControls();if($('annualCalendarModal')?.classList.contains('open'))renderAnnualCalendar()}
  function shiftMonth(amount){const [year,mon]=month.split('-').map(Number),date=new Date(year,mon-1+amount,1);selectMonth(`${date.getFullYear()}-${pad(date.getMonth()+1)}`)}
  function applyFixedOff(){renderAll();notify('固定休已依人員設定自動套用，既有例外保持不變，不需重複儲存。')}
  async function copyPrevious(){
    if(!db||!confirmPersonDiscard())return;personMode=null;
    const targetMonth=month,[year,mon]=month.split('-').map(Number),previous=new Date(year,mon-2,1),key=`${previous.getFullYear()}-${pad(previous.getMonth()+1)}`;
    try{const doc=await scheduleRef(key).get();if(month!==targetMonth||personMode?.active){notify('編輯月份或模式已變更，未套用上一個月排班。',true);return}
      const next=SalonStaffSchedule.copyMonth(key,month,doc.data()?.exceptions||{},draft.exceptions||{},staff),changed=JSON.stringify(next)!==JSON.stringify(draft.exceptions||{});
      draft={...draft,exceptions:next};renderAll();if(changed)queueMonthSave();notify(`已補入 ${key} 可複製的例外；本月既有設定與固定休保持不變。`)
    }catch(error){notify('上一個月排班讀取失敗，未修改本月：'+error.message,true)}
  }
  async function saveMonth(){if(!db||loadingMonth){if(!db)notify('Firebase 尚未連線。',true);return false}const state=$('monthSaveState'),revision=monthRevision,payload=clone(draft.exceptions||{});try{state.textContent='同步中…';await scheduleRef(month).set({exceptions:payload,updatedAtMs:Date.now()},{mergeFields:['exceptions','updatedAtMs']});if(revision===monthRevision){monthDirty=false;state.textContent='已同步'}return true}catch(error){state.textContent='同步失敗';notify('排班儲存失敗：'+error.message,true);return false}}
  function queueMonthSave(){clearTimeout(monthSaveTimer);monthRevision++;monthDirty=true;$('monthSaveState').textContent='等待同步…';monthSaveTimer=setTimeout(saveMonth,450)}
  function clearMonth(){if(!confirm(`確定清除 ${month} 全部例外排班？`))return;draft={exceptions:{}};renderAll();queueMonthSave()}
  function exportMonth(){const rows=['日期,職類,編號,姓名,狀態,時間,備註'];for(let day=1;day<=monthDays(month);day++){const date=dateAt(day),entries={...(draft.exceptions?.[date]||{})};for(const person of activeStaff())if(!Object.prototype.hasOwnProperty.call(entries,person.id)&&isFixedOff(person,date))entries[person.id]=entryAt(date,person.id);for(const [id,entry] of Object.entries(entries)){const p=staff.find(item=>item.id===id);rows.push([date,roleLabel(p?.role),p?.code||id,p?.name||'',STATUS[entry.status],entry.time||'',entry.note||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))}}const blob=new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${month}-排班.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
  function quickStatus(status){const picked=[...document.querySelectorAll('.dayScheduleRow')].filter(row=>row.querySelector('.schedulePick').checked);if(!picked.length){notify('請先勾選要快速設定的人員。',true);return}for(const row of picked){row.querySelector('.scheduleStatus').value=status;updateRow(row)}renderEditor()}
  function nextDay(){if(!selectedDate)return;const date=new Date(`${selectedDate}T12:00:00`);date.setDate(date.getDate()+1);const next=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;if(next.slice(0,7)===month)selectDate(next)}
  function open(){const current=$('dateInput')?.value?.slice(0,7)||new Date().toISOString().slice(0,7);$('scheduleModal').classList.add('open');selectMonth(current)}
  function personModeDirty(){return Boolean(personMode?.active&&personSelectedKey(personMode.selected)!==personMode.initialKey)}
  function confirmPersonDiscard(){
    if(!personModeDirty())return true;
    const person=personById(personMode.personId),name=person?.name||person?.code||'此人員';
    return confirm(`${name}的休假尚未儲存。\n\n按「確定」放棄修改。\n按「取消」繼續編輯。`);
  }
  function startPersonMode(personId){
    if(personMode?.personId===personId)return;
    if(!confirmPersonDiscard())return;
    const person=personById(personId);if(!person)return;
    const selected=new Set(),source=clone(draft.exceptions||{});
    for(let day=1;day<=monthDays(month);day++){const date=dateAt(day);if(personIsOffOn(person,date,source))selected.add(date)}
    personMode={active:true,personId,base:source,selected,initialKey:personSelectedKey(selected)};
    $('monthSaveState').textContent='個人排休草稿';
    renderAll();
  }
  function togglePersonDate(date){
    if(!personMode?.active)return;
    if(personMode.selected.has(date))personMode.selected.delete(date);else personMode.selected.add(date);
    $('monthSaveState').textContent=personModeDirty()?'個人草稿尚未儲存':'個人排休草稿';
    renderAll();
  }
  function renderPersonBar(){
    const bar=$('personLeaveBar');if(!bar)return;
    bar.hidden=!personMode?.active;
    if(!personMode?.active)return;
    const person=personById(personMode.personId);
    $('personLeaveTitle').textContent=person?`${personLeaveTitle(person)}｜${month}休假`:'個人排休';
    const fixedCount=[...personMode.selected].filter(date=>isFixedOff(person,date)).length;
    $('personLeaveCount').textContent=`已選 ${personMode.selected.size} 天（固定休日 ${fixedCount} 天／額外 ${personMode.selected.size-fixedCount} 天）`;
    $('personLeaveHint').textContent=personModeDirty()?'尚未儲存：點日期可繼續調整。':'目前沒有未儲存修改。';
  }
  function cancelPersonMode(){if(!personMode?.active)return;draft={exceptions:clone(personMode.base||{})};personMode=null;$('monthSaveState').textContent='已取消個人草稿';renderAll();notify('已取消個人排休修改，正式資料未變更。')}
  async function savePersonMode(){
    if(!personMode?.active)return;
    const person=personById(personMode.personId);if(!person)return;
    if(!personModeDirty()){personMode=null;renderAll();$('monthSaveState').textContent=monthDirty?'等待同步…':'已同步';notify('休假未變更，固定休已自動計入。');return}
    const next=clone(personMode.base||{}),selected=personMode.selected;
    for(let day=1;day<=monthDays(month);day++){
      const date=dateAt(day),picked=selected.has(date),fixed=isFixedOff(person,date);
      next[date]=next[date]||{};
      const existing=next[date][person.id],wasPicked=personIsOffOn(person,date,personMode.base);
      if(picked!==wasPicked){
        if(picked)next[date][person.id]={...existing,status:'off',time:'',note:fixed?'固定休':'個人排休'};
        else if(fixed||hasWorkTime(existing))next[date][person.id]={...existing,status:'normal',time:'',note:fixed?'固定休改上班':''};
        else delete next[date][person.id];
      }
      if(!Object.keys(next[date]).length)delete next[date];
    }
    draft={exceptions:next};const count=selected.size,label=personLeaveTitle(person);personMode=null;renderAll();if(await saveMonth())notify(`${label} 已儲存 ${count} 天休假。`);
  }
  function annualShift(amount){const [year,mon]=annualMonth.split('-').map(Number),date=new Date(year,mon-1+amount,1);openAnnualMonth(`${date.getFullYear()}-${pad(date.getMonth()+1)}`)}
  function openAnnualMonth(value){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||Number(value.slice(0,4))<1000)return;annualMonth=value;const ticket=++annualWatch;$('annualMonthTitle').textContent=`${Number(value.slice(0,4))} 年 ${Number(value.slice(5,7))} 月`;$('annualYear').value=value.slice(0,4);annualSelected.clear();if(annualStoreUnsub)annualStoreUnsub();if(annualLegacyUnsub)annualLegacyUnsub();if(db){annualStoreUnsub=storeRef(value.slice(0,4)).onSnapshot(doc=>{if(ticket!==annualWatch)return;store=clone(doc.data()||{overrides:{}});storeYears.set(value.slice(0,4),store);renderAnnualCalendar();renderCalendar();renderEditor()},error=>notify('本店店況讀取失敗：'+error.message,true));annualLegacyUnsub=annualRef(value.slice(0,4)).onSnapshot(doc=>{if(ticket!==annualWatch)return;legacyEvents=doc.data()?.events||[];legacyYears.set(value.slice(0,4),legacyEvents);renderAnnualCalendar();renderCalendar();renderEditor()},error=>notify('舊年度行事曆讀取失敗：'+error.message,true))}loadGovYear(Number(value.slice(0,4)));renderAnnualCalendar()}
  function openAnnual(){const current=month||$('dateInput')?.value?.slice(0,7)||new Date().toISOString().slice(0,7);$('annualCalendarModal').classList.add('open');openAnnualMonth(current)}
  function renderAnnualCalendar(){if(!annualMonth)return;const [year,mon]=annualMonth.split('-').map(Number),first=new Date(year,mon-1,1).getDay(),days=monthDays(annualMonth),cells=[];for(let i=0;i<first;i++)cells.push('<div class="annualMonthDay outside"></div>');for(let day=1;day<=days;day++){const date=dateIn(annualMonth,day),gov=(govYears.get(date.slice(0,4))||{})[date],item=storeOverride(date),selected=annualSelected.has(date),storeText=isNormalStoreItem(item)?'🟢 正常營業':`🔴 ${esc(storeLabel(item))}`;cells.push(`<button class="annualMonthDay ${selected?'picked':''}" data-annual-date="${date}"><b>${day}</b>${gov?`<span class="calendarEvent govEvent">🇹🇼 ${esc(gov.name||'政府假日')}</span>`:''}<span class="calendarEvent storeEvent ${storeClass(item)}">${storeText}</span></button>`)}$('annualMonthCalendar').innerHTML=cells.join('');document.querySelectorAll('[data-annual-date]').forEach(button=>button.onclick=()=>{const date=button.dataset.annualDate;if(annualSelected.has(date))annualSelected.delete(date);else annualSelected.add(date);if(annualSelected.size===1)renderStoreEditor('annual',[...annualSelected][0]);renderAnnualCalendar()});$('annualPickedCount').textContent=annualSelected.size?`已選 ${annualSelected.size} 天`:'尚未選日期'}
  async function saveStoreDates(dates,item,prefix){if(!db){notify('Firebase 尚未連線，無法儲存店況。',true);return}const year=String(dates[0]||annualMonth).slice(0,4);if(!dates.length||dates.some(date=>date.slice(0,4)!==year))throw Error('請只選取同一年度日期');await db.runTransaction(async transaction=>{const ref=storeRef(year),snapshot=await transaction.get(ref),next=clone(snapshot.data()?.overrides||{});for(const date of dates){if(item.status==='normal'&&!item.title&&!item.startTime&&!item.endTime&&!item.note)delete next[date];else next[date]={...item,date}}transaction.set(ref,{overrides:next,updatedAtMs:Date.now()},{mergeFields:['overrides','updatedAtMs']})});if(prefix)storeDrafts[prefix].dirty=false;notify(`已更新 ${dates.length} 天店況。`)}
  async function saveAnnualStore(){const dates=[...annualSelected].sort();if(!dates.length){notify('請先在月曆點選日期。',true);return}try{await saveStoreDates(dates,readStoreForm('annual',dates[0]),'annual');for(const date of dates)annualSelected.delete(date);renderAnnualCalendar()}catch(error){notify('店況儲存失敗：'+error.message,true)}}
  async function saveMonthStore(){if(!selectedDate)return;try{await saveStoreDates([selectedDate],readStoreForm('month',selectedDate),'month')}catch(error){notify('店況儲存失敗：'+error.message,true)}}
  function renderTodayEvents(){const legacy=(currentAnnualData.events||[]).find(event=>event.date===currentDate),item=currentStoreData.overrides?.[currentDate]||(legacy?{...legacy,status:LEGACY[legacy.type]||legacy.type}:null),gov=currentGovDays[currentDate],box=$('todayEvents');box.hidden=!item&&!gov;box.innerHTML=(gov?`<span><b>🇹🇼 政府</b> ${esc(gov.name||'政府假日')}</span>`:'')+(item?`<span><b>店況</b> ${esc(storeLabel(item))}</span>`:'')}
  function loadCurrentGov(){const year=currentDate.slice(0,4),generation=currentGeneration;window.SalonGovCalendar?.ensureYear(Number(year)).then(data=>{if(generation!==currentGeneration)return;currentGovDays=data.days||{};renderTodayEvents()}).catch(()=>{if(generation===currentGeneration)renderTodayEvents()})}
  function setCurrentDate(date,force=false){
    if(!force&&date.slice(0,4)===currentDate.slice(0,4)&&currentStoreUnsub&&currentLegacyUnsub){currentDate=date;currentGovDays=window.SalonGovCalendar?.cached(Number(date.slice(0,4)))||{};renderTodayEvents();loadCurrentGov();return;}
    const generation=++currentGeneration;currentDate=date;if(currentStoreUnsub)currentStoreUnsub();if(currentLegacyUnsub)currentLegacyUnsub();currentStoreData={overrides:{}};currentAnnualData={};currentGovDays={};renderTodayEvents();if(!db||!date)return;const year=date.slice(0,4);currentGovDays=window.SalonGovCalendar?.cached(Number(year))||{};
    const failed=error=>{if(generation!==currentGeneration)return;currentFailed=true;notify('店況讀取失敗：'+error.message,true)};
    currentStoreUnsub=storeRef(year).onSnapshot(doc=>{if(generation!==currentGeneration)return;currentRevision++;currentStoreData=doc.data()||{overrides:{}};renderTodayEvents()},failed);
    currentLegacyUnsub=annualRef(year).onSnapshot(doc=>{if(generation!==currentGeneration)return;currentRevision++;currentAnnualData=doc.data()||{};renderTodayEvents()},failed);
    loadCurrentGov();
  }
  function applyRefresh(date,value,revision){if(date!==currentDate||(revision!==undefined&&revision!==currentRevision))return;currentStoreData=value.calendar;currentAnnualData=value.annual;renderTodayEvents();if(currentFailed){currentFailed=false;setCurrentDate(date,true)}}
  function connect(database){db=database;if(staffUnsub)staffUnsub();staffUnsub=staffRef().onSnapshot(snapshot=>{staff=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));renderAll()},error=>notify('排班人員讀取失敗：'+error.message,true))}
  function stopMonth(){monthWatch++;[monthUnsub,storeUnsub,legacyUnsub].forEach(stop=>stop?.());monthUnsub=storeUnsub=legacyUnsub=null}
  function stopAnnual(){annualWatch++;[annualStoreUnsub,annualLegacyUnsub].forEach(stop=>stop?.());annualStoreUnsub=annualLegacyUnsub=null}
  function init(options={}){notify=options.notify||notify;$('scheduleClose').onclick=async()=>{if(confirmPersonDiscard()){clearTimeout(monthSaveTimer);if(monthDirty&&!(await saveMonth()))return;$('scheduleModal').classList.remove('open');stopMonth();personMode=null;screenshotMode=false;updateDisplayControls()}};$('monthPrev').onclick=()=>shiftMonth(-1);$('monthNext').onclick=()=>shiftMonth(1);$('scheduleMonth').onchange=event=>selectMonth(event.target.value);$('applyFixedOff').onclick=applyFixedOff;$('copyPreviousMonth').onclick=copyPrevious;$('clearMonthSchedule').onclick=()=>{if(confirmPersonDiscard())clearMonth()};$('exportMonth').onclick=exportMonth;$('personLeaveCancel').onclick=cancelPersonMode;$('personLeaveSave').onclick=savePersonMode;$('scheduleScreenshotMode').onclick=captureScheduleScreenshot;$('scheduleAnnouncementTitle').onclick=()=>{if(screenshotMode)exitScreenshotMode()};$('scheduleModal').addEventListener('click',event=>{if(!screenshotMode)return;if(event.target.closest('.monthCalendar,.monthWeek,.scheduleDisplayBar'))return;exitScreenshotMode()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&screenshotMode)exitScreenshotMode()});document.querySelectorAll('[data-schedule-filter]').forEach(button=>button.onclick=()=>setDisplayFilter(button.dataset.scheduleFilter));$('saveMonthSchedule').onclick=saveMonth;$('saveMonthStore').onclick=saveMonthStore;$('nextScheduleDay').onclick=nextDay;document.querySelectorAll('[data-quick-status]').forEach(button=>button.onclick=()=>quickStatus(button.dataset.quickStatus));$('annualClose').onclick=()=>{$('annualCalendarModal').classList.remove('open');stopAnnual()};$('annualPrevMonth').onclick=()=>annualShift(-1);$('annualNextMonth').onclick=()=>annualShift(1);$('annualYear').onchange=()=>{const year=$('annualYear').value;if(/^\d{4}$/.test(year)&&Number(year)>=1000)openAnnualMonth(`${year}-01`);else notify('請輸入四位數年份（1000～9999）。',true)};$('saveAnnualStore').onclick=saveAnnualStore;Object.entries(STORE).forEach(([value,label])=>{for(const id of ['annualStoreStatus','monthStoreStatus'])$(id)?.append(new Option(label,value))});initSpecialTimeControls()}
  window.SalonSchedule={init,connect,open,openAnnual,setCurrentDate,applyRefresh,revision:()=>currentRevision};
})();
