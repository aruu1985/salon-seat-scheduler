(function(){
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  const STATUS={normal:'正常上班',off:'休假',late:'晚到／晚上班',early:'提早下班',afternoon:'下半天',leave:'請假'};
  const COLORS=[['#f6a24c','橘色'],['#fff176','黃色'],['#ff75ad','桃紅色'],['#8ee072','綠色'],['#7dc8ff','藍色'],['#c6a4ff','紫色'],['#81d8d0','蒂芬妮藍']];
  const LEGACY_COLORS={'2':'#f6a24c','3':'#fff176','5':'#ff75ad','6':'#8ee072','7':'#7dc8ff','13':'#81d8d0'};
  let db=null,currentDate='',currentRole='designer',staff=[],staffing={entries:{}},monthly={exceptions:{}},notify=()=>{},staffUnsubscribe=null,dayUnsubscribe=null,monthUnsubscribe=null,dailySaveTimer=null;

  function staffRef(){return db.collection('salons').doc('default').collection('staff')}
  function dayRef(){return db.collection('salons').doc('default').collection('dates').doc(currentDate)}
  function roleLabel(role){return role==='technician'?'技術師':'設計師'}
  function sortStaff(items){return [...items].sort((a,b)=>a.role.localeCompare(b.role)||String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true}))}
  function staffColor(item){return item?.color||LEGACY_COLORS[String(item?.code)]||'#c6a4ff'}
  function colorOptions(selected){return COLORS.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
  function syncAppointmentDesigners(){const select=$('designer'),designers=sortStaff(staff.filter(item=>item.active!==false&&item.role==='designer'));if(!select||!designers.length)return;const selected=select.value;select.innerHTML='<option value="x">不指定／紫</option>'+designers.map(item=>`<option value="${esc(item.code)}">${esc(item.code)} ${esc(item.name||'')}</option>`).join('');if([...select.options].some(option=>option.value===selected))select.value=selected}
  function normalizeStaffing(value={}){
    if(value.entries)return {entries:{...value.entries}};
    const entries={};
    for(const id of value.onDutyIds||[])entries[id]={working:true,status:'normal',time:'',note:value.notes?.[id]||''};
    for(const id of value.leaveIds||[])entries[id]={working:false,status:'leave',time:'',note:value.notes?.[id]||''};
    return {entries};
  }
  function entryFor(id){const daily=staffing.entries||{},scheduled=monthly.exceptions?.[currentDate]||{};if(Object.prototype.hasOwnProperty.call(daily,id))return daily[id];if(Object.prototype.hasOwnProperty.call(scheduled,id)){const entry=scheduled[id];return {...entry,working:!['off','leave'].includes(entry.status)}}return {working:true,status:'normal',time:'',note:''}}
  function dailyEntryFor(id){return Object.prototype.hasOwnProperty.call(staffing.entries||{},id)?staffing.entries[id]:null}

  function renderMaster(){
    const active=sortStaff(staff.filter(item=>item.active!==false)),inactive=sortStaff(staff.filter(item=>item.active===false));
    $('activeStaffList').innerHTML=active.length?active.map(item=>`<details class="staffAccordion" data-staff-details="${esc(item.id)}"><summary><span class="staffColorDot" style="background:${item.role==='designer'?staffColor(item):'#aaa'}"></span><strong>${esc(roleLabel(item.role))}${esc(item.code)}</strong><span>${esc(item.name||'未填姓名')}</span><small>${item.role==='designer'&&item.fixedOffDay!==null&&item.fixedOffDay!==undefined?`固定週${'日一二三四五六'[item.fixedOffDay]}休`:''}</small></summary><div class="staffEditGrid"><label>編號<input data-staff-code="${esc(item.id)}" value="${esc(item.code)}"></label><label>姓名<input data-staff-name="${esc(item.id)}" value="${esc(item.name||'')}" placeholder="姓名"></label><label>備註<input data-staff-note="${esc(item.id)}" value="${esc(item.note||'')}" placeholder="備註"></label><label>固定休<select data-fixed-off="${esc(item.id)}"><option value="">無固定休</option>${['日','一','二','三','四','五','六'].map((day,index)=>`<option value="${index}" ${String(item.fixedOffDay)===String(index)?'selected':''}>星期${day}休</option>`).join('')}</select></label>${item.role==='designer'?`<label>顏色<select data-staff-color="${esc(item.id)}" style="border-left:12px solid ${staffColor(item)}">${colorOptions(staffColor(item))}</select></label>`:''}<span class="staffRowActions"><button class="primary" data-save-staff="${esc(item.id)}">儲存</button><button class="danger" data-disable-staff="${esc(item.id)}">停用</button></span></div></details>`).join(''):'<div class="hint">尚未新增人員。</div>';
    $('inactiveStaffList').innerHTML=inactive.length?inactive.map(item=>`<div class="staffRow"><span class="staffIdentity"><b>${esc(roleLabel(item.role))} ${esc(item.code)}號</b>${item.name?` ${esc(item.name)}`:''}</span><span class="hint">${esc(item.note||'')}</span><button data-restore-staff="${esc(item.id)}">恢復啟用</button></div>`).join(''):'<div class="hint">目前沒有停用人員。</div>';
    document.querySelectorAll('[data-disable-staff]').forEach(button=>button.onclick=()=>setActive(button.dataset.disableStaff,false));
    document.querySelectorAll('[data-restore-staff]').forEach(button=>button.onclick=()=>setActive(button.dataset.restoreStaff,true));
    document.querySelectorAll('[data-save-staff]').forEach(button=>button.onclick=()=>saveStaffDetails(button.dataset.saveStaff));
    document.querySelectorAll('[data-staff-color]').forEach(select=>select.onchange=()=>select.style.borderLeftColor=select.value);
    syncAppointmentDesigners();
  }
  function statusOptions(selected){return Object.entries(STATUS).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
  function dailyStatusOptions(item){const daily=dailyEntryFor(item.id),effective=entryFor(item.id),inheritLabel='依月底排班（'+STATUS[effective.status]+'）';return `<option value="inherit" ${daily?'':'selected'}>${inheritLabel}</option>`+statusOptions(daily?.status||'')}
  function renderDaily(){
    $('dailyStaffTitle').textContent=roleLabel(currentRole)+'當日臨時異動';
    $('dailyStaffDate').textContent=currentDate;
    const active=sortStaff(staff.filter(item=>item.active!==false&&item.role===currentRole));
    $('dailyStaffList').innerHTML=active.length?active.map(item=>{const daily=dailyEntryFor(item.id),entry=daily||entryFor(item.id),status=daily?.status||'inherit',needsTime=['late','early','afternoon'].includes(status);return `<div class="dailyStaffRow" data-daily-id="${esc(item.id)}"><span class="dailyIdentity"><b>${esc(item.code)}</b>${item.name?`　${esc(item.name)}`:''}</span><select class="dailyStatus status-${esc(status)}">${dailyStatusOptions(item)}</select><input type="time" class="dailyTime" value="${esc(daily?.time||'')}" ${needsTime?'':'disabled'}><input class="dailyNote" value="${esc(daily?.note||'')}" placeholder="備註（可空白）"></div>`}).join(''):'<div class="hint">目前沒有啟用中的'+roleLabel(currentRole)+'，請先到「設定 → 人員設定」新增。</div>';
    document.querySelectorAll('.dailyStatus').forEach(select=>select.onchange=()=>{syncDailyRow(select.closest('.dailyStaffRow'));queueDailySave()});
    document.querySelectorAll('.dailyTime,.dailyNote').forEach(input=>input.onchange=queueDailySave);
  }
  function syncDailyRow(row){
    const status=row.querySelector('.dailyStatus').value,time=row.querySelector('.dailyTime');
    row.querySelector('.dailyStatus').className='dailyStatus status-'+status;
    time.disabled=!['late','early','afternoon'].includes(status);if(time.disabled)time.value='';
  }
  function dashboardLines(role){
    const active=sortStaff(staff.filter(item=>item.active!==false&&item.role===role));
    const working=active.filter(item=>entryFor(item.id).working&&!['off','leave'].includes(entryFor(item.id).status));
    const codes=working.map(item=>esc(item.code)).join('、');
    const late=[],early=[],afternoon=[],notes=[];
    for(const item of working){const entry=entryFor(item.id),label=`${esc(item.code)}（${esc(entry.time||'未填')}）`;if(entry.status==='late')late.push(label);else if(entry.status==='early')early.push(label);else if(entry.status==='afternoon')afternoon.push(label);if(entry.note)notes.push(`${esc(item.code)}：${esc(entry.note)}`)}
    const lines=[];if(late.length)lines.push(`<span>晚到：${late.join('、')}</span>`);if(early.length)lines.push(`<span>早下班：${early.join('、')}</span>`);if(afternoon.length)lines.push(`<span>下半天：${afternoon.join('、')}</span>`);if(notes.length)lines.push(`<span class="dailyExtraNote">備註：${notes.join('；')}</span>`);
    return {codes:'上班：'+(codes||'無'),lines:lines.join('')};
  }
  function renderDashboard(){
    const designers=dashboardLines('designer'),technicians=dashboardLines('technician');
    $('todayDesigners').innerHTML=designers.codes;$('designerNotes').innerHTML=designers.lines;
    $('todayTechnicians').innerHTML=technicians.codes;$('technicianNotes').innerHTML=technicians.lines;
  }
  function renderAll(){renderMaster();renderDaily();renderDashboard()}
  async function addStaff(){
    const role=$('newStaffRole').value,code=$('newStaffCode').value.trim(),name=$('newStaffName').value.trim(),note=$('newStaffNote').value.trim(),fixedOffDay=$('newStaffFixedOff').value,color=role==='designer'?$('newStaffColor').value:null;
    if(!code){notify('請輸入人員編號。',true);return}
    if(staff.some(item=>item.role===role&&String(item.code).toLocaleLowerCase()===code.toLocaleLowerCase())){notify('這個人員編號已存在；若已停用，請從停用人員恢復。',true);return}
    try{$('addStaffBtn').disabled=true;await staffRef().add({role,code,name,note,color,fixedOffDay:fixedOffDay===''?null:Number(fixedOffDay),active:true,createdAtMs:Date.now()});$('newStaffCode').value='';$('newStaffName').value='';$('newStaffNote').value='';$('newStaffFixedOff').value='';notify('已新增'+roleLabel(role)+' '+code+'號。')}catch(error){notify('新增人員失敗：'+error.message,true)}finally{$('addStaffBtn').disabled=false}
  }
  async function setActive(id,active){try{await staffRef().doc(id).update({active,updatedAtMs:Date.now()});notify(active?'已恢復啟用。':'人員已停用，歷史預約不受影響。')}catch(error){notify('更新人員失敗：'+error.message,true)}}
  async function saveStaffDetails(id){const person=staff.find(item=>item.id===id),code=document.querySelector(`[data-staff-code="${id}"]`).value.trim(),name=document.querySelector(`[data-staff-name="${id}"]`).value.trim(),note=document.querySelector(`[data-staff-note="${id}"]`).value.trim(),fixed=document.querySelector(`[data-fixed-off="${id}"]`),color=document.querySelector(`[data-staff-color="${id}"]`)?.value||null;if(!code){notify('人員編號不可空白。',true);return}if(staff.some(item=>item.id!==id&&item.role===person.role&&String(item.code).toLocaleLowerCase()===code.toLocaleLowerCase())){notify('同職類已有相同編號，請使用其他編號。',true);return}const previousCodes=[...(person.previousCodes||[])];if(String(person.code)!==code&&!previousCodes.map(String).includes(String(person.code)))previousCodes.push(String(person.code));try{await staffRef().doc(id).update({code,name,note,color,previousCodes,fixedOffDay:fixed.value===''?null:Number(fixed.value),updatedAtMs:Date.now()});document.querySelector(`[data-staff-details="${id}"]`)?.removeAttribute('open');notify(roleLabel(person.role)+' '+code+'號主檔已儲存。')}catch(error){notify('人員資料儲存失敗：'+error.message,true)}}
  function collectRoleEntries(){
    const next={...staffing.entries};for(const person of staff.filter(item=>item.role===currentRole))delete next[person.id];
    document.querySelectorAll('.dailyStaffRow').forEach(row=>{const id=row.dataset.dailyId,status=row.querySelector('.dailyStatus').value,time=row.querySelector('.dailyTime').value,note=row.querySelector('.dailyNote').value.trim();if(status!=='inherit')next[id]={working:!['off','leave'].includes(status),status,time,note}});
    return next;
  }
  async function saveDaily(){if(!db)return;const state=$('dailySaveState');try{state.textContent='同步中…';const entries=collectRoleEntries();await dayRef().set({staffing:{entries},staffingUpdatedAtMs:Date.now()},{merge:true});state.textContent='已同步'}catch(error){state.textContent='同步失敗';notify('每日異動儲存失敗：'+error.message,true)}}
  function queueDailySave(){clearTimeout(dailySaveTimer);$('dailySaveState').textContent='等待同步…';dailySaveTimer=setTimeout(saveDaily,350)}
  async function clearDailyRole(){document.querySelectorAll('.dailyStaffRow').forEach(row=>{row.querySelector('.dailyStatus').value='inherit';row.querySelector('.dailyTime').value='';row.querySelector('.dailyNote').value='';syncDailyRow(row)});await saveDaily();renderDaily()}
  function setDate(date){currentDate=date;if(dayUnsubscribe)dayUnsubscribe();if(monthUnsubscribe)monthUnsubscribe();staffing={entries:{}};monthly={exceptions:{}};renderDaily();renderDashboard();if(!db||!date)return;dayUnsubscribe=dayRef().onSnapshot(doc=>{staffing=normalizeStaffing(doc.data()?.staffing||{});renderDaily();renderDashboard()},error=>notify('每日人員同步失敗：'+error.message,true));monthUnsubscribe=db.collection('salons').doc('default').collection('schedules').doc(date.slice(0,7)).onSnapshot(doc=>{monthly=doc.data()||{exceptions:{}};renderDaily();renderDashboard()},error=>notify('月底排班同步失敗：'+error.message,true))}
  function connect(database,date){db=database;setDate(date);if(staffUnsubscribe)staffUnsubscribe();staffUnsubscribe=staffRef().onSnapshot(snapshot=>{staff=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));renderAll()},error=>notify('人員資料同步失敗：'+error.message,true))}
  function open(){$('peopleModal').classList.add('open');renderMaster()}
  function openDaily(role){currentRole=role;$('dailyStaffModal').classList.add('open');renderDaily()}
  function bindBoard(id,role){const board=$(id);board.onclick=()=>openDaily(role);board.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDaily(role)}}}
  function syncNewRoleFields(){const designer=$('newStaffRole').value==='designer';$('newStaffColor').hidden=!designer;$('newStaffFixedOff').hidden=!designer}
  function colorForCode(code){if(String(code)==='x')return '#c6a4ff';const person=staff.find(item=>item.role==='designer'&&(String(item.code)===String(code)||(item.previousCodes||[]).map(String).includes(String(code))));return staffColor(person||{code})}
  function init(options={}){notify=options.notify||notify;$('addStaffBtn').onclick=addStaff;$('newStaffRole').onchange=syncNewRoleFields;syncNewRoleFields();$('peopleClose').onclick=()=>$('peopleModal').classList.remove('open');$('peopleModal').onclick=event=>{if(event.target===$('peopleModal'))$('peopleModal').classList.remove('open')};$('saveDailyStaffBtn').onclick=saveDaily;$('clearDailyStaffBtn').onclick=clearDailyRole;$('dailyStaffClose').onclick=$('dailyStaffCancel').onclick=()=>$('dailyStaffModal').classList.remove('open');$('dailyStaffModal').onclick=event=>{if(event.target===$('dailyStaffModal'))$('dailyStaffModal').classList.remove('open')};bindBoard('designerBoard','designer');bindBoard('technicianBoard','technician')}
  window.SalonStaff={init,connect,setDate,open,openDaily,colorForCode};
})();
