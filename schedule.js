(function(){
  const $=id=>document.getElementById(id),pad=n=>String(n).padStart(2,'0');
  const STATUS={normal:'正常上班',off:'休假',late:'晚到／晚上班',early:'提早下班',afternoon:'下半天',leave:'請假'};
  const STORE={normal:'正常營業',closed:'本店公休',halfDay:'半日營業',lateOpen:'延後營業',earlyClose:'提早打烊',extended:'延長營業',noBooking:'不可預約',training:'教育課程',meeting:'半日會議',specialOpen:'特殊營業日',spring:'春節店休'};
  const LEGACY={closed:'closed',spring:'spring',training:'training',meeting:'meeting',earlyClose:'earlyClose',noBooking:'noBooking',specialOpen:'specialOpen'};
  let db=null,notify=()=>{},staff=[],month='',selectedDate='',currentDate='',draft={exceptions:{}},store={overrides:{}},legacyEvents=[],govDays={},monthUnsub=null,staffUnsub=null,storeUnsub=null,legacyUnsub=null,currentStoreUnsub=null,currentLegacyUnsub=null,annualStoreUnsub=null,annualLegacyUnsub=null,currentStoreData={overrides:{}},currentGovDays={},monthSaveTimer=null,storeSaveTimer=null,loadingMonth=false,monthRevision=0,monthDirty=false,annualMonth='',annualSelected=new Set(),personMode=null,displayFilter='all',screenshotMode=false;
  const clone=value=>JSON.parse(JSON.stringify(value||{}));
  const esc=value=>String(value??'').replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
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
  const entryAt=(date,id)=>draft.exceptions?.[date]?.[id]||{status:'normal',time:'',note:''};
  const personById=id=>staff.find(person=>person.id===id);
  const personLeaveTitle=person=>`${person.code}${person.name?` ${person.name}`:''}`;
  const isFixedOff=(person,date)=>person&&person.fixedOffDay!==null&&person.fixedOffDay!==undefined&&new Date(`${date}T12:00:00`).getDay()===Number(person.fixedOffDay);
  function personIsOffOn(person,date,source=draft.exceptions){
    const entry=source?.[date]?.[person.id];
    if(entry)return entry.status==='off'||entry.status==='leave';
    return isFixedOff(person,date);
  }
  function personSelectedKey(selected){return [...selected].sort().join('|')}
  const displayFilterLabel=()=>displayFilter==='designer'?'設計師':displayFilter==='technician'?'技術師':'';
  const staffMatchesDisplay=person=>displayFilter==='all'||person.role===displayFilter;
  const isLeaveStatus=status=>status==='off'||status==='leave';
  function staffColor(person){return person.role==='technician'?'#256f86':(person.color||'#444')}
  function updateDisplayControls(){
    document.querySelectorAll('[data-schedule-filter]').forEach(button=>button.classList.toggle('active',button.dataset.scheduleFilter===displayFilter));
    const modeButton=$('scheduleScreenshotMode');if(modeButton){modeButton.classList.toggle('active',screenshotMode);modeButton.textContent=screenshotMode?'退出截圖模式':'📷 截圖模式'}
    const modal=$('scheduleModal');if(modal)modal.classList.toggle('scheduleScreenshot',screenshotMode);
    const title=$('scheduleAnnouncementTitle');if(title)title.textContent=month?`${Number(month.slice(0,4))}年${Number(month.slice(5,7))}月${displayFilterLabel()}休假表`:'每月休假表';
  }
  function setDisplayFilter(value){displayFilter=value||'all';renderAll()}
  function toggleScreenshotMode(){
    if(!screenshotMode&&personModeDirty()&&!confirmPersonDiscard())return;
    if(!screenshotMode)personMode=null;
    screenshotMode=!screenshotMode;
    renderAll();
  }
  function leavePeopleForDate(date,entries){
    return activeStaff().filter(person=>{
      if(!staffMatchesDisplay(person))return false;
      if(personMode?.active&&person.id===personMode.personId)return personMode.selected.has(date);
      const entry=entries[person.id];
      return entry&&isLeaveStatus(entry.status);
    });
  }
  function govDisplayName(name){
    const text=String(name||'政府假日');
    if(text.includes('教師'))return '教師節';
    if(text.includes('中秋'))return '中秋節';
    if(text.includes('國慶'))return '國慶日';
    return text.replace(/紀念日／?/g,'').replace(/放假日/g,'').trim()||text;
  }
  function legacyOverride(date){const event=legacyEvents.find(item=>item.date===date);return event?{status:LEGACY[event.type]||event.type,title:event.title||STORE[LEGACY[event.type]]||event.type,legacy:true}:null}
  function storeOverride(date){return store.overrides?.[date]||legacyOverride(date)}
  function storeLabel(item){if(!item)return '正常營業';let label=STORE[item.status]||item.status;if(item.endTime)label+='至'+item.endTime;if(item.startTime)label=item.startTime+'起'+label;return item.title||label}
  function storeClass(item){if(!item)return 'store-normal';if(['closed','spring','noBooking'].includes(item.status))return 'store-closed';if(['earlyClose','halfDay','lateOpen'].includes(item.status))return 'store-warning';return 'store-open'}
  function ensureDate(date){draft.exceptions=draft.exceptions||{};draft.exceptions[date]=draft.exceptions[date]||{};return draft.exceptions[date]}
  function setEntry(date,id,value){const day=ensureDate(date),person=personById(id);if(value.status==='normal'&&!value.note){if(isFixedOff(person,date))day[id]={status:'normal',time:'',note:'固定休改上班'};else delete day[id]}else day[id]=value;if(!Object.keys(day).length)delete draft.exceptions[date]}
  function statusShort(entry){if(entry.status==='late')return `${entry.time||''}到班`;if(entry.status==='early')return `${entry.time||''}下班`;if(entry.status==='afternoon')return `下半天${entry.time?' '+entry.time:''}`;return STATUS[entry.status]||''}
  function renderRoster(){for(const [role,target] of [['designer','scheduleDesigners'],['technician','scheduleTechnicians']]){$(target).innerHTML=activeStaff().filter(p=>p.role===role).map(p=>`<button class="rosterPerson rosterButton ${personMode?.personId===p.id?'active':''}" data-person-id="${esc(p.id)}" type="button"><b ${p.color?`style="background:${esc(p.color)}"`:''}>${esc(p.code)}</b><span>${esc(p.name||'')}</span>${p.fixedOffDay!==null&&p.fixedOffDay!==undefined?`<small>固定週${'日一二三四五六'[p.fixedOffDay]}休</small>`:'<small>點選整月排休</small>'}</button>`).join('')||'<small>尚無啟用人員</small>'};document.querySelectorAll('[data-person-id]').forEach(button=>button.onclick=()=>startPersonMode(button.dataset.personId))}
  function dayBadges(date){const gov=govDays[date],storeDay=storeOverride(date),badges=[];if(gov)badges.push(`<span class="calendarEvent govEvent" title="${esc(gov.name||'政府假日')}">🇹🇼 ${esc(govDisplayName(gov.name))}</span>`);badges.push(`<span class="calendarEvent ${storeClass(storeDay)}">${storeDay&&storeDay.status!=='normal'?'🔴':'🟢'} 店：${esc(storeLabel(storeDay))}</span>`);return badges.join('')}
  function renderCalendar(){
    if(!month)return;const [year,mon]=month.split('-').map(Number),first=new Date(year,mon-1,1).getDay(),days=monthDays(month),cells=[];
    for(let i=0;i<first;i++)cells.push('<div class="monthDay outside"></div>');
    for(let day=1;day<=days;day++){
      const date=dateAt(day),entries=draft.exceptions?.[date]||{},personPick=personMode?.selected?.has(date),leavePeople=leavePeopleForDate(date,entries),nameSize=Math.min(5,Math.max(1,leavePeople.length));
      const names=leavePeople.map(person=>`<span class="monthLeaveName ${person.role==='technician'?'technician':'designer'}" style="--staff-color:${esc(staffColor(person))}">${esc(personLabel(person))}</span>`).join('');
      const namesBlock=names?`<div class="monthLeaveNames leaveCount${nameSize}">${names}</div>`:'';
      const specialLines=!screenshotMode&&!personMode?activeStaff().filter(p=>staffMatchesDisplay(p)&&entries[p.id]&&entries[p.id].status!=='normal'&&!isLeaveStatus(entries[p.id].status)).map(p=>{const entry=entries[p.id];return `<span class="scheduleMark status-${esc(entry.status)}">${esc(roleLabel(p.role).slice(0,1))} ${esc(personLabel(p))} ${esc(statusShort(entry))}</span>`}).join(''):'';
      const personLine=personMode&&personPick?'<span class="scheduleMark personLeaveMarker">✓ 本人休假</span>':'';
      cells.push(`<button class="monthDay ${date===selectedDate?'selected':''} ${personPick?'personLeavePicked':''} ${leavePeople.length?'hasLeaveNames':''}" data-date="${date}"><b>${day}</b>${dayBadges(date)}${personLine}${namesBlock}${specialLines}</button>`)
    }
    $('monthCalendar').innerHTML=cells.join('');document.querySelectorAll('.monthDay[data-date]').forEach(cell=>cell.onclick=()=>{if(screenshotMode)return;if(personMode)togglePersonDate(cell.dataset.date);else selectDate(cell.dataset.date)});
  }
  function statusOptions(selected){return Object.entries(STATUS).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
  function storeOptions(selected){return Object.entries(STORE).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
  function renderStoreEditor(prefix,date){const item=storeOverride(date)||{status:'normal',title:'',startTime:'',endTime:'',note:''};$(`${prefix}StoreStatus`).value=item.status||'normal';$(`${prefix}StoreTitle`).value=item.title||'';$(`${prefix}StoreStart`).value=item.startTime||'';$(`${prefix}StoreEnd`).value=item.endTime||'';$(`${prefix}StoreNote`).value=item.note||''}
  function readStoreForm(prefix,date){return {date,status:$(`${prefix}StoreStatus`).value,title:$(`${prefix}StoreTitle`).value.trim(),startTime:$(`${prefix}StoreStart`).value,endTime:$(`${prefix}StoreEnd`).value,note:$(`${prefix}StoreNote`).value.trim(),updatedAtMs:Date.now()}}
  function renderEditor(){
    if(personMode?.active){
      const person=personById(personMode.personId);
      $('selectedScheduleDate').textContent=person?`${personLeaveTitle(person)}｜${month} 休假`:'個人排休';
      $('annualDayEvents').innerHTML='<span>點左側人員可快速切換；點月曆日期可加入／取消休假。</span>';
      $('dayScheduleRows').innerHTML=`<section class="dayRole personModeHelp"><h4>個人排休模式</h4><p>直接點月曆日期，一次排完整個月。修改先留在草稿，按「儲存休假」才同步 Firebase。</p><p>政府假日與本店店休只作為資訊顯示，不會自動變成人員休假。</p></section>`;
      return;
    }
    if(!selectedDate){$('selectedScheduleDate').textContent='請選擇日期';$('dayScheduleRows').innerHTML='';return}
    $('selectedScheduleDate').textContent=selectedDate;const gov=govDays[selectedDate],storeDay=storeOverride(selectedDate);
    $('annualDayEvents').innerHTML=(gov?`<span>🇹🇼 政府：${esc(gov.name||'政府假日')}</span>`:'')+`<span class="${storeClass(storeDay)}">店況：${esc(storeLabel(storeDay))}</span>`;
    renderStoreEditor('month',selectedDate);
    $('dayScheduleRows').innerHTML=['designer','technician'].map(role=>`<section class="dayRole"><h4>${roleLabel(role)}</h4>${activeStaff().filter(p=>p.role===role).map(p=>{const entry=entryAt(selectedDate,p.id),timed=['late','early','afternoon'].includes(entry.status);return `<div class="dayScheduleRow" data-staff-id="${esc(p.id)}"><input type="checkbox" class="schedulePick" title="多人快速設定"><span><b>${esc(p.code)}</b> ${esc(p.name||'')}</span><select class="scheduleStatus">${statusOptions(entry.status)}</select><input type="time" class="scheduleTime" value="${esc(entry.time||'')}" ${timed?'':'disabled'}><input class="scheduleNote" value="${esc(entry.note||'')}" placeholder="備註"></div>`}).join('')}</section>`).join('');
    document.querySelectorAll('.scheduleStatus,.scheduleTime,.scheduleNote').forEach(control=>control.onchange=()=>updateRow(control.closest('.dayScheduleRow')));
  }
  function updateRow(row){const status=row.querySelector('.scheduleStatus').value,time=row.querySelector('.scheduleTime'),note=row.querySelector('.scheduleNote').value.trim();time.disabled=!['late','early','afternoon'].includes(status);if(time.disabled)time.value='';setEntry(selectedDate,row.dataset.staffId,{status,time:time.value,note});renderCalendar();queueMonthSave()}
  function selectDate(date){selectedDate=date;renderCalendar();renderEditor()}
  async function loadGovYear(year){govDays=window.SalonGovCalendar?.cached(year)||{};renderAll();govDays=await window.SalonGovCalendar.holidays(year);renderAll()}
  function selectMonth(value){if(!confirmPersonDiscard())return;clearTimeout(monthSaveTimer);personMode=null;monthRevision++;monthDirty=false;month=value;$('scheduleMonth').value=value;selectedDate=`${value}-01`;if(monthUnsub)monthUnsub();if(storeUnsub)storeUnsub();if(legacyUnsub)legacyUnsub();if(!db){draft={exceptions:{}};store={overrides:{}};legacyEvents=[];renderAll();return}loadingMonth=true;$('monthSaveState').textContent='讀取中…';monthUnsub=scheduleRef(value).onSnapshot(doc=>{if(personMode?.active)return;if(monthDirty&&!loadingMonth)return;draft=clone(doc.data()||{exceptions:{}});loadingMonth=false;$('monthSaveState').textContent='已同步';renderAll()},error=>{loadingMonth=false;$('monthSaveState').textContent='讀取失敗';notify('月排班讀取失敗：'+error.message,true)});const year=value.slice(0,4);storeUnsub=storeRef(year).onSnapshot(doc=>{store=clone(doc.data()||{overrides:{}});renderAll()},error=>notify('本店店況讀取失敗：'+error.message,true));legacyUnsub=annualRef(year).onSnapshot(doc=>{legacyEvents=doc.data()?.events||[];renderAll()},error=>notify('舊年度行事曆讀取失敗：'+error.message,true));loadGovYear(Number(year))}
  function renderAll(){renderRoster();renderCalendar();renderEditor();renderPersonBar();updateDisplayControls();if($('annualCalendarModal')?.classList.contains('open'))renderAnnualCalendar()}
  function shiftMonth(amount){const [year,mon]=month.split('-').map(Number),date=new Date(year,mon-1+amount,1);selectMonth(`${date.getFullYear()}-${pad(date.getMonth()+1)}`)}
  function applyFixedOff(){for(const person of activeStaff().filter(p=>p.role==='designer'&&p.fixedOffDay!==null&&p.fixedOffDay!==undefined)){for(let day=1;day<=monthDays(month);day++){const date=dateAt(day),hasOverride=Object.prototype.hasOwnProperty.call(draft.exceptions?.[date]||{},person.id);if(new Date(`${date}T12:00:00`).getDay()===Number(person.fixedOffDay)&&!hasOverride)setEntry(date,person.id,{status:'off',time:'',note:'固定休'})}}renderAll();queueMonthSave();notify('固定休已套用並自動同步，可直接改任一天為上班。')}
  async function copyPrevious(){if(!db)return;const [year,mon]=month.split('-').map(Number),previous=new Date(year,mon-2,1),key=`${previous.getFullYear()}-${pad(previous.getMonth()+1)}`,doc=await scheduleRef(key).get(),source=doc.data()?.exceptions||{},next={};for(const [date,entries] of Object.entries(source)){const day=Number(date.slice(-2));if(day<=monthDays(month))next[dateAt(day)]=clone(entries)}draft={exceptions:next};renderAll();queueMonthSave();notify(`已複製 ${key} 並自動同步。`)}
  async function saveMonth(){if(!db||loadingMonth){if(!db)notify('Firebase 尚未連線。',true);return}const state=$('monthSaveState'),revision=monthRevision,payload=clone(draft.exceptions||{});try{state.textContent='同步中…';await scheduleRef(month).set({exceptions:payload,updatedAtMs:Date.now()});if(revision===monthRevision){monthDirty=false;state.textContent='已同步'}}catch(error){state.textContent='同步失敗';notify('排班儲存失敗：'+error.message,true)}}
  function queueMonthSave(){clearTimeout(monthSaveTimer);monthRevision++;monthDirty=true;$('monthSaveState').textContent='等待同步…';monthSaveTimer=setTimeout(saveMonth,450)}
  function clearMonth(){if(!confirm(`確定清除 ${month} 全部例外排班？`))return;draft={exceptions:{}};renderAll();queueMonthSave()}
  function exportMonth(){const rows=['日期,職類,編號,姓名,狀態,時間,備註'];for(const [date,entries] of Object.entries(draft.exceptions||{})){for(const [id,entry] of Object.entries(entries)){const p=staff.find(item=>item.id===id);rows.push([date,roleLabel(p?.role),p?.code||id,p?.name||'',STATUS[entry.status],entry.time||'',entry.note||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))}}const blob=new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${month}-排班.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
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
    $('personLeaveCount').textContent=`已選 ${personMode.selected.size} 天`;
    $('personLeaveHint').textContent=personModeDirty()?'尚未儲存：點日期可繼續調整。':'目前沒有未儲存修改。';
  }
  function cancelPersonMode(){if(!personMode?.active)return;draft={exceptions:clone(personMode.base||{})};personMode=null;$('monthSaveState').textContent='已取消個人草稿';renderAll();notify('已取消個人排休修改，正式資料未變更。')}
  async function savePersonMode(){
    if(!personMode?.active)return;
    const person=personById(personMode.personId);if(!person)return;
    const next=clone(personMode.base||{}),selected=personMode.selected;
    for(let day=1;day<=monthDays(month);day++){
      const date=dateAt(day),picked=selected.has(date),fixed=isFixedOff(person,date);
      next[date]=next[date]||{};
      if(picked)next[date][person.id]={status:'off',time:'',note:fixed?'固定休':'個人排休'};
      else if(fixed)next[date][person.id]={status:'normal',time:'',note:'固定休改上班'};
      else delete next[date][person.id];
      if(!Object.keys(next[date]).length)delete next[date];
    }
    draft={exceptions:next};const count=selected.size,label=personLeaveTitle(person);personMode=null;renderAll();await saveMonth();notify(`${label} 已儲存 ${count} 天休假。`);
  }
  function annualShift(amount){const [year,mon]=annualMonth.split('-').map(Number),date=new Date(year,mon-1+amount,1);openAnnualMonth(`${date.getFullYear()}-${pad(date.getMonth()+1)}`)}
  function openAnnualMonth(value){annualMonth=value;$('annualMonthTitle').textContent=`${Number(value.slice(0,4))} 年 ${Number(value.slice(5,7))} 月`;$('annualYear').value=value.slice(0,4);annualSelected.clear();if(annualStoreUnsub)annualStoreUnsub();if(annualLegacyUnsub)annualLegacyUnsub();if(db){annualStoreUnsub=storeRef(value.slice(0,4)).onSnapshot(doc=>{store=clone(doc.data()||{overrides:{}});renderAnnualCalendar();renderCalendar();renderEditor()},error=>notify('本店店況讀取失敗：'+error.message,true));annualLegacyUnsub=annualRef(value.slice(0,4)).onSnapshot(doc=>{legacyEvents=doc.data()?.events||[];renderAnnualCalendar();renderCalendar();renderEditor()},error=>notify('舊年度行事曆讀取失敗：'+error.message,true))}loadGovYear(Number(value.slice(0,4)));renderAnnualCalendar()}
  function openAnnual(){const current=month||$('dateInput')?.value?.slice(0,7)||new Date().toISOString().slice(0,7);$('annualCalendarModal').classList.add('open');openAnnualMonth(current)}
  function renderAnnualCalendar(){if(!annualMonth)return;const [year,mon]=annualMonth.split('-').map(Number),first=new Date(year,mon-1,1).getDay(),days=monthDays(annualMonth),cells=[];for(let i=0;i<first;i++)cells.push('<div class="annualMonthDay outside"></div>');for(let day=1;day<=days;day++){const date=dateIn(annualMonth,day),gov=govDays[date],item=storeOverride(date),selected=annualSelected.has(date);cells.push(`<button class="annualMonthDay ${selected?'picked':''}" data-annual-date="${date}"><b>${day}</b>${gov?`<span class="calendarEvent govEvent">🇹🇼 ${esc(gov.name||'政府假日')}</span>`:''}<span class="calendarEvent ${storeClass(item)}">${item&&item.status!=='normal'?'🔴':'🟢'} ${esc(storeLabel(item))}</span></button>`)}$('annualMonthCalendar').innerHTML=cells.join('');document.querySelectorAll('[data-annual-date]').forEach(button=>button.onclick=()=>{const date=button.dataset.annualDate;if(annualSelected.has(date))annualSelected.delete(date);else annualSelected.add(date);renderAnnualCalendar()});$('annualPickedCount').textContent=annualSelected.size?`已選 ${annualSelected.size} 天`:'尚未選日期'}
  async function saveStoreDates(dates,item){if(!db){notify('Firebase 尚未連線，無法儲存店況。',true);return}const year=String(dates[0]||annualMonth).slice(0,4),next=clone(store.overrides||{});for(const date of dates){if(item.status==='normal'&&!item.title&&!item.startTime&&!item.endTime&&!item.note)delete next[date];else next[date]={...item,date}}await storeRef(year).set({overrides:next,updatedAtMs:Date.now()},{merge:true});notify(`已更新 ${dates.length} 天店況。`)}
  function saveAnnualStore(){const dates=[...annualSelected].sort();if(!dates.length){notify('請先在月曆點選日期。',true);return}saveStoreDates(dates,readStoreForm('annual',dates[0]));annualSelected.clear();renderAnnualCalendar()}
  function saveMonthStore(){if(!selectedDate)return;saveStoreDates([selectedDate],readStoreForm('month',selectedDate))}
  function renderTodayEvents(){const item=currentStoreData.overrides?.[currentDate],gov=currentGovDays[currentDate],box=$('todayEvents');box.hidden=!item&&!gov;box.innerHTML=(gov?`<span><b>🇹🇼 政府</b> ${esc(gov.name||'政府假日')}</span>`:'')+(item?`<span><b>店況</b> ${esc(storeLabel(item))}</span>`:'')}
  function setCurrentDate(date){currentDate=date;if(currentStoreUnsub)currentStoreUnsub();if(currentLegacyUnsub)currentLegacyUnsub();currentStoreData={overrides:{}};currentGovDays={};if(!db||!date)return;const year=date.slice(0,4);currentGovDays=window.SalonGovCalendar?.cached(Number(year))||{};currentStoreUnsub=storeRef(year).onSnapshot(doc=>{currentStoreData=doc.data()||{overrides:{}};renderTodayEvents()},error=>notify('今日店況讀取失敗：'+error.message,true));window.SalonGovCalendar?.ensureYear(Number(year)).then(data=>{currentGovDays=data.days||{};renderTodayEvents()}).catch(()=>renderTodayEvents())}
  function connect(database){db=database;if(staffUnsub)staffUnsub();staffUnsub=staffRef().onSnapshot(snapshot=>{staff=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));renderAll()},error=>notify('排班人員讀取失敗：'+error.message,true))}
  function init(options={}){notify=options.notify||notify;$('scheduleClose').onclick=()=>{if(confirmPersonDiscard()){$('scheduleModal').classList.remove('open');personMode=null;screenshotMode=false;updateDisplayControls()}};$('monthPrev').onclick=()=>shiftMonth(-1);$('monthNext').onclick=()=>shiftMonth(1);$('scheduleMonth').onchange=event=>selectMonth(event.target.value);$('applyFixedOff').onclick=applyFixedOff;$('copyPreviousMonth').onclick=copyPrevious;$('clearMonthSchedule').onclick=()=>{if(confirmPersonDiscard())clearMonth()};$('exportMonth').onclick=exportMonth;$('personLeaveCancel').onclick=cancelPersonMode;$('personLeaveSave').onclick=savePersonMode;$('scheduleScreenshotMode').onclick=toggleScreenshotMode;$('scheduleAnnouncementTitle').onclick=()=>{if(screenshotMode)toggleScreenshotMode()};document.querySelectorAll('[data-schedule-filter]').forEach(button=>button.onclick=()=>setDisplayFilter(button.dataset.scheduleFilter));$('saveMonthSchedule').onclick=saveMonth;$('saveMonthStore').onclick=saveMonthStore;$('nextScheduleDay').onclick=nextDay;document.querySelectorAll('[data-quick-status]').forEach(button=>button.onclick=()=>quickStatus(button.dataset.quickStatus));$('annualClose').onclick=()=>$('annualCalendarModal').classList.remove('open');$('annualPrevMonth').onclick=()=>annualShift(-1);$('annualNextMonth').onclick=()=>annualShift(1);$('annualYear').onchange=()=>openAnnualMonth(`${$('annualYear').value}-01`);$('saveAnnualStore').onclick=saveAnnualStore;Object.entries(STORE).forEach(([value,label])=>{for(const id of ['annualStoreStatus','monthStoreStatus'])$(id)?.append(new Option(label,value))})}
  window.SalonSchedule={init,connect,open,openAnnual,setCurrentDate};
})();
