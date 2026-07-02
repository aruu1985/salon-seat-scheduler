(function(){
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  let db=null,currentDate='',staff=[],staffing={onDutyIds:[],leaveIds:[],notes:{}},notify=()=>{},staffUnsubscribe=null,dayUnsubscribe=null;

  function staffRef(){return db.collection('salons').doc('default').collection('staff')}
  function dayRef(){return db.collection('salons').doc('default').collection('dates').doc(currentDate)}
  function roleLabel(role){return role==='technician'?'技術師':'設計師'}
  function sortStaff(items){return [...items].sort((a,b)=>a.role.localeCompare(b.role)||String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true}))}
  function emptyStaffing(){return {onDutyIds:[],leaveIds:[],notes:{}}}

  function renderMaster(){
    const active=sortStaff(staff.filter(item=>item.active!==false)),inactive=sortStaff(staff.filter(item=>item.active===false));
    $('activeStaffList').innerHTML=active.length?active.map(item=>`<div class="staffRow"><span class="staffIdentity"><b>${esc(roleLabel(item.role))} ${esc(item.code)}號</b>${item.name?` ${esc(item.name)}`:''}</span><input data-staff-note="${esc(item.id)}" value="${esc(item.note||'')}" placeholder="人員備註"><button data-save-note="${esc(item.id)}">儲存備註</button><button class="danger" data-disable-staff="${esc(item.id)}">停用</button></div>`).join(''):'<div class="hint">尚未新增人員。</div>';
    $('inactiveStaffList').innerHTML=inactive.length?inactive.map(item=>`<div class="staffRow"><span class="staffIdentity"><b>${esc(roleLabel(item.role))} ${esc(item.code)}號</b>${item.name?` ${esc(item.name)}`:''}</span><span class="hint">${esc(item.note||'')}</span><button data-restore-staff="${esc(item.id)}">恢復啟用</button></div>`).join(''):'<div class="hint">目前沒有停用人員。</div>';
    document.querySelectorAll('[data-disable-staff]').forEach(button=>button.onclick=()=>setActive(button.dataset.disableStaff,false));
    document.querySelectorAll('[data-restore-staff]').forEach(button=>button.onclick=()=>setActive(button.dataset.restoreStaff,true));
    document.querySelectorAll('[data-save-note]').forEach(button=>button.onclick=()=>saveStaffNote(button.dataset.saveNote));
  }
  function renderDaily(){
    $('dailyStaffDate').textContent=currentDate||'尚未選擇日期';
    const active=sortStaff(staff.filter(item=>item.active!==false));
    $('dailyStaffList').innerHTML=active.length?active.map(item=>{const onDuty=staffing.onDutyIds.includes(item.id),leave=staffing.leaveIds.includes(item.id),note=staffing.notes[item.id]||'';return `<div class="dailyStaffRow" data-daily-id="${esc(item.id)}"><label class="dailyIdentity"><input type="checkbox" class="dailyOnDuty" ${onDuty?'checked':''}>${esc(roleLabel(item.role))} <b>${esc(item.code)}號</b>${item.name?` ${esc(item.name)}`:''}</label><input class="dailyNote" value="${esc(note)}" placeholder="例：18:00下班、14:30到班、下半天"><label class="leaveToggle"><input type="checkbox" class="dailyLeave" ${leave?'checked':''}>請假</label></div>`}).join(''):'<div class="hint">請先新增啟用中的人員。</div>';
    document.querySelectorAll('.dailyLeave').forEach(box=>box.onchange=()=>{if(box.checked)box.closest('.dailyStaffRow').querySelector('.dailyOnDuty').checked=false});
  }
  function noteLines(role){
    const active=staff.filter(item=>item.active!==false&&item.role===role),visible=active.filter(item=>staffing.onDutyIds.includes(item.id)||staffing.leaveIds.includes(item.id));
    return visible.map(item=>{const note=staffing.notes[item.id];return note?`<span>${esc(note)}：${esc(item.code)}號</span>`:''}).filter(Boolean).join('');
  }
  function leaveLines(role){
    return staff.filter(item=>item.active!==false&&item.role===role&&staffing.leaveIds.includes(item.id)).map(item=>`<span class="leaveAlert">請假：${role==='technician'?'技術師':''}${esc(item.code)}號</span>`).join('');
  }
  function renderDashboard(){
    for(const role of ['designer','technician']){
      const people=sortStaff(staff.filter(item=>item.active!==false&&item.role===role&&staffing.onDutyIds.includes(item.id)&&!staffing.leaveIds.includes(item.id))),codes=people.map(item=>esc(item.code)).join('　')||'尚未設定';
      $(role==='designer'?'todayDesigners':'todayTechnicians').innerHTML=codes;
      $(role==='designer'?'designerNotes':'technicianNotes').innerHTML=noteLines(role)+leaveLines(role);
    }
  }
  function renderAll(){renderMaster();renderDaily();renderDashboard()}
  async function addStaff(){
    const role=$('newStaffRole').value,code=$('newStaffCode').value.trim(),name=$('newStaffName').value.trim(),note=$('newStaffNote').value.trim();
    if(!code){notify('請輸入人員編號。',true);return}
    if(staff.some(item=>item.role===role&&String(item.code).toLocaleLowerCase()===code.toLocaleLowerCase())){notify('這個人員編號已存在；若已停用，請從停用人員恢復。',true);return}
    try{$('addStaffBtn').disabled=true;await staffRef().add({role,code,name,note,active:true,createdAtMs:Date.now()});$('newStaffCode').value='';$('newStaffName').value='';$('newStaffNote').value='';notify('已新增'+roleLabel(role)+' '+code+'號。')}catch(error){notify('新增人員失敗：'+error.message,true)}finally{$('addStaffBtn').disabled=false}
  }
  async function setActive(id,active){try{await staffRef().doc(id).update({active,updatedAtMs:Date.now()});notify(active?'已恢復啟用。':'人員已停用，歷史預約不受影響。')}catch(error){notify('更新人員失敗：'+error.message,true)}}
  async function saveStaffNote(id){const input=Array.from(document.querySelectorAll('[data-staff-note]')).find(item=>item.dataset.staffNote===id);try{await staffRef().doc(id).update({note:input.value.trim(),updatedAtMs:Date.now()});notify('人員備註已儲存。')}catch(error){notify('備註儲存失敗：'+error.message,true)}}
  async function saveDaily(){
    const onDutyIds=[],leaveIds=[],notes={};
    document.querySelectorAll('.dailyStaffRow').forEach(row=>{const id=row.dataset.dailyId,note=row.querySelector('.dailyNote').value.trim();if(row.querySelector('.dailyOnDuty').checked)onDutyIds.push(id);if(row.querySelector('.dailyLeave').checked)leaveIds.push(id);if(note)notes[id]=note});
    try{$('saveDailyStaffBtn').disabled=true;await dayRef().set({staffing:{onDutyIds,leaveIds,notes},staffingUpdatedAtMs:Date.now()},{merge:true});notify('每日上班人員已同步到主畫面。');$('peopleModal').classList.remove('open')}catch(error){notify('每日人員儲存失敗：'+error.message,true)}finally{$('saveDailyStaffBtn').disabled=false}
  }
  function setDate(date){
    currentDate=date;if(dayUnsubscribe)dayUnsubscribe();staffing=emptyStaffing();renderDaily();renderDashboard();if(!db||!date)return;
    dayUnsubscribe=dayRef().onSnapshot(doc=>{staffing={...emptyStaffing(),...(doc.data()?.staffing||{})};renderDaily();renderDashboard()},error=>notify('每日人員同步失敗：'+error.message,true));
  }
  function connect(database,date){
    db=database;setDate(date);if(staffUnsubscribe)staffUnsubscribe();staffUnsubscribe=staffRef().onSnapshot(snapshot=>{staff=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));renderAll()},error=>notify('人員資料同步失敗：'+error.message,true));
  }
  function open(){$('peopleModal').classList.add('open');renderAll()}
  function init(options={}){notify=options.notify||notify;$('addStaffBtn').onclick=addStaff;$('saveDailyStaffBtn').onclick=saveDaily;$('peopleClose').onclick=()=>$('peopleModal').classList.remove('open');$('peopleModal').onclick=event=>{if(event.target===$('peopleModal'))$('peopleModal').classList.remove('open')}}
  window.SalonStaff={init,connect,setDate,open};
})();
