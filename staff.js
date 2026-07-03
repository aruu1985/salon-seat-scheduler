(function(){
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  const STATUS={normal:'正常上班',off:'休假',late:'晚到／晚上班',early:'提早下班',afternoon:'下半天',leave:'請假'};
  let db=null,currentDate='',currentRole='designer',staff=[],staffing={entries:{}},monthly={exceptions:{}},notify=()=>{},staffUnsubscribe=null,dayUnsubscribe=null,monthUnsubscribe=null;

  function staffRef(){return db.collection('salons').doc('default').collection('staff')}
  function dayRef(){return db.collection('salons').doc('default').collection('dates').doc(currentDate)}
  function roleLabel(role){return role==='technician'?'技術師':'設計師'}
  function sortStaff(items){return [...items].sort((a,b)=>a.role.localeCompare(b.role)||String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true}))}
  function normalizeStaffing(value={}){
    if(value.entries)return {entries:{...value.entries}};
    const entries={};
    for(const id of value.onDutyIds||[])entries[id]={working:true,status:'normal',time:'',note:value.notes?.[id]||''};
    for(const id of value.leaveIds||[])entries[id]={working:false,status:'leave',time:'',note:value.notes?.[id]||''};
    return {entries};
  }
  function entryFor(id){const daily=staffing.entries||{},scheduled=monthly.exceptions?.[currentDate]||{};if(Object.prototype.hasOwnProperty.call(daily,id))return daily[id];if(Object.prototype.hasOwnProperty.call(scheduled,id)){const entry=scheduled[id];return {...entry,working:!['off','leave'].includes(entry.status)}}return {working:true,status:'normal',time:'',note:''}}

  function renderMaster(){
    const active=sortStaff(staff.filter(item=>item.active!==false)),inactive=sortStaff(staff.filter(item=>item.active===false));
    $('activeStaffList').innerHTML=active.length?active.map(item=>`<div class="staffRow"><span class="staffIdentity"><b>${esc(roleLabel(item.role))} ${esc(item.code)}號</b>${item.name?` ${esc(item.name)}`:''}</span><input data-staff-note="${esc(item.id)}" value="${esc(item.note||'')}" placeholder="人員備註"><select data-fixed-off="${esc(item.id)}"><option value="">無固定休</option>${['日','一','二','三','四','五','六'].map((day,index)=>`<option value="${index}" ${String(item.fixedOffDay)===String(index)?'selected':''}>星期${day}休</option>`).join('')}</select><button data-save-staff="${esc(item.id)}">儲存</button><button class="danger" data-disable-staff="${esc(item.id)}">停用</button></div>`).join(''):'<div class="hint">尚未新增人員。</div>';
    $('inactiveStaffList').innerHTML=inactive.length?inactive.map(item=>`<div class="staffRow"><span class="staffIdentity"><b>${esc(roleLabel(item.role))} ${esc(item.code)}號</b>${item.name?` ${esc(item.name)}`:''}</span><span class="hint">${esc(item.note||'')}</span><button data-restore-staff="${esc(item.id)}">恢復啟用</button></div>`).join(''):'<div class="hint">目前沒有停用人員。</div>';
    document.querySelectorAll('[data-disable-staff]').forEach(button=>button.onclick=()=>setActive(button.dataset.disableStaff,false));
    document.querySelectorAll('[data-restore-staff]').forEach(button=>button.onclick=()=>setActive(button.dataset.restoreStaff,true));
    document.querySelectorAll('[data-save-staff]').forEach(button=>button.onclick=()=>saveStaffDetails(button.dataset.saveStaff));
  }
  function statusOptions(selected){return Object.entries(STATUS).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
  function renderDaily(){
    $('dailyStaffTitle').textContent=roleLabel(currentRole)+'當日上班設定';
    $('dailyStaffDate').textContent=currentDate;
    const active=sortStaff(staff.filter(item=>item.active!==false&&item.role===currentRole));
    $('dailyStaffList').innerHTML=active.length?active.map(item=>{const entry=entryFor(item.id),needsTime=entry.status==='late'||entry.status==='early';return `<div class="dailyStaffRow" data-daily-id="${esc(item.id)}"><label class="dailyCheck"><input type="checkbox" class="dailyOnDuty" ${entry.working?'checked':''}></label><span class="dailyIdentity"><b>${esc(item.code)}</b>${item.name?`　${esc(item.name)}`:''}</span><select class="dailyStatus status-${esc(entry.status)}">${statusOptions(entry.status)}</select><input type="time" class="dailyTime" value="${esc(entry.time||'')}" ${needsTime?'':'disabled'}><input class="dailyNote" value="${esc(entry.note||'')}" placeholder="可空白"></div>`}).join(''):'<div class="hint">目前沒有啟用中的'+roleLabel(currentRole)+'，請先到「設定 → 人員設定」新增。</div>';
    document.querySelectorAll('.dailyStatus').forEach(select=>select.onchange=()=>syncDailyRow(select.closest('.dailyStaffRow')));
    document.querySelectorAll('.dailyOnDuty').forEach(box=>box.onchange=()=>{const row=box.closest('.dailyStaffRow');if(box.checked&&row.querySelector('.dailyStatus').value==='leave')row.querySelector('.dailyStatus').value='normal';syncDailyRow(row)});
  }
  function syncDailyRow(row){
    const status=row.querySelector('.dailyStatus').value,onDuty=row.querySelector('.dailyOnDuty'),time=row.querySelector('.dailyTime');
    row.querySelector('.dailyStatus').className='dailyStatus status-'+status;
    if(status==='leave'||status==='off')onDuty.checked=false;else onDuty.checked=true;
    time.disabled=status!=='late'&&status!=='early';if(time.disabled)time.value='';
  }
  function dashboardLines(role){
    const active=sortStaff(staff.filter(item=>item.active!==false&&item.role===role));
    const working=active.filter(item=>entryFor(item.id).working&&!['off','leave'].includes(entryFor(item.id).status));
    const codes=working.map(item=>esc(item.code)).join('、');
    const lines=[];
    const off=active.filter(item=>entryFor(item.id).status==='off');if(off.length)lines.push(`<span class="offAlert">休假：${off.map(item=>esc(item.code)).join('、')}</span>`);
    for(const item of active){const entry=entryFor(item.id);if(entry.status==='leave')lines.push(`<span class="leaveAlert">請假：${role==='technician'?'技術師':''}${esc(item.code)}號</span>`);else if(entry.working&&entry.status==='late')lines.push(`<span>${esc(entry.time||'未填時間')}到班：${esc(item.code)}號</span>`);else if(entry.working&&entry.status==='early')lines.push(`<span>${esc(entry.time||'未填時間')}下班：${esc(item.code)}號</span>`);else if(entry.working&&entry.status==='afternoon')lines.push(`<span>下半天：${esc(item.code)}號</span>`);if(entry.note)lines.push(`<span class="dailyExtraNote">備註：${esc(item.code)}號 ${esc(entry.note)}</span>`)}
    return {codes:'上班：'+(codes||'尚未設定'),lines:lines.join('')};
  }
  function renderDashboard(){
    const designers=dashboardLines('designer'),technicians=dashboardLines('technician');
    $('todayDesigners').innerHTML=designers.codes;$('designerNotes').innerHTML=designers.lines;
    $('todayTechnicians').innerHTML=technicians.codes;$('technicianNotes').innerHTML=technicians.lines;
  }
  function renderAll(){renderMaster();renderDaily();renderDashboard()}
  async function addStaff(){
    const role=$('newStaffRole').value,code=$('newStaffCode').value.trim(),name=$('newStaffName').value.trim(),note=$('newStaffNote').value.trim(),fixedOffDay=$('newStaffFixedOff').value;
    if(!code){notify('請輸入人員編號。',true);return}
    if(staff.some(item=>item.role===role&&String(item.code).toLocaleLowerCase()===code.toLocaleLowerCase())){notify('這個人員編號已存在；若已停用，請從停用人員恢復。',true);return}
    try{$('addStaffBtn').disabled=true;await staffRef().add({role,code,name,note,fixedOffDay:fixedOffDay===''?null:Number(fixedOffDay),active:true,createdAtMs:Date.now()});$('newStaffCode').value='';$('newStaffName').value='';$('newStaffNote').value='';$('newStaffFixedOff').value='';notify('已新增'+roleLabel(role)+' '+code+'號。')}catch(error){notify('新增人員失敗：'+error.message,true)}finally{$('addStaffBtn').disabled=false}
  }
  async function setActive(id,active){try{await staffRef().doc(id).update({active,updatedAtMs:Date.now()});notify(active?'已恢復啟用。':'人員已停用，歷史預約不受影響。')}catch(error){notify('更新人員失敗：'+error.message,true)}}
  async function saveStaffDetails(id){const note=document.querySelector(`[data-staff-note="${id}"]`),fixed=document.querySelector(`[data-fixed-off="${id}"]`);try{await staffRef().doc(id).update({note:note.value.trim(),fixedOffDay:fixed.value===''?null:Number(fixed.value),updatedAtMs:Date.now()});notify('人員資料與固定休已儲存。')}catch(error){notify('人員資料儲存失敗：'+error.message,true)}}
  function collectRoleEntries(){
    const next={...staffing.entries};for(const person of staff.filter(item=>item.role===currentRole))delete next[person.id];
    document.querySelectorAll('.dailyStaffRow').forEach(row=>{const id=row.dataset.dailyId,status=row.querySelector('.dailyStatus').value,working=row.querySelector('.dailyOnDuty').checked,time=row.querySelector('.dailyTime').value,note=row.querySelector('.dailyNote').value.trim();if(working||status==='leave'||status==='off'||note)next[id]={working,status,time,note}});
    return next;
  }
  async function saveDaily(){try{$('saveDailyStaffBtn').disabled=true;const entries=collectRoleEntries();await dayRef().set({staffing:{entries},staffingUpdatedAtMs:Date.now()},{merge:true});notify(roleLabel(currentRole)+'當日人員已同步到主畫面。');$('dailyStaffModal').classList.remove('open')}catch(error){notify('每日人員儲存失敗：'+error.message,true)}finally{$('saveDailyStaffBtn').disabled=false}}
  async function clearDailyRole(){document.querySelectorAll('.dailyStaffRow').forEach(row=>{row.querySelector('.dailyOnDuty').checked=false;row.querySelector('.dailyStatus').value='normal';row.querySelector('.dailyTime').value='';row.querySelector('.dailyNote').value='';syncDailyRow(row);row.querySelector('.dailyOnDuty').checked=false});await saveDaily()}
  function setDate(date){currentDate=date;if(dayUnsubscribe)dayUnsubscribe();if(monthUnsubscribe)monthUnsubscribe();staffing={entries:{}};monthly={exceptions:{}};renderDaily();renderDashboard();if(!db||!date)return;dayUnsubscribe=dayRef().onSnapshot(doc=>{staffing=normalizeStaffing(doc.data()?.staffing||{});renderDaily();renderDashboard()},error=>notify('每日人員同步失敗：'+error.message,true));monthUnsubscribe=db.collection('salons').doc('default').collection('schedules').doc(date.slice(0,7)).onSnapshot(doc=>{monthly=doc.data()||{exceptions:{}};renderDaily();renderDashboard()},error=>notify('月底排班同步失敗：'+error.message,true))}
  function connect(database,date){db=database;setDate(date);if(staffUnsubscribe)staffUnsubscribe();staffUnsubscribe=staffRef().onSnapshot(snapshot=>{staff=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));renderAll()},error=>notify('人員資料同步失敗：'+error.message,true))}
  function open(){$('peopleModal').classList.add('open');renderMaster()}
  function openDaily(role){currentRole=role;$('dailyStaffModal').classList.add('open');renderDaily()}
  function bindBoard(id,role){const board=$(id);board.onclick=()=>openDaily(role);board.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDaily(role)}}}
  function init(options={}){notify=options.notify||notify;$('addStaffBtn').onclick=addStaff;$('peopleClose').onclick=()=>$('peopleModal').classList.remove('open');$('peopleModal').onclick=event=>{if(event.target===$('peopleModal'))$('peopleModal').classList.remove('open')};$('saveDailyStaffBtn').onclick=saveDaily;$('clearDailyStaffBtn').onclick=clearDailyRole;$('dailyStaffClose').onclick=$('dailyStaffCancel').onclick=()=>$('dailyStaffModal').classList.remove('open');$('dailyStaffModal').onclick=event=>{if(event.target===$('dailyStaffModal'))$('dailyStaffModal').classList.remove('open')};bindBoard('designerBoard','designer');bindBoard('technicianBoard','technician')}
  window.SalonStaff={init,connect,setDate,open,openDaily};
})();
