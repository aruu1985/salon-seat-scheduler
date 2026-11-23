/* Read-only advisory dialog; closing it never changes or saves an appointment. */
(function(){
  let modal,panel,body,back,proceed,resolve;
  const range=(a,b)=>a===b?String(a):a+'～'+b;
  function init(){
    if(modal)return;modal=document.createElement('div');modal.className='modal';modal.id='capacityModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','capacityTitle');
    panel=document.createElement('div');panel.className='panel capacityPanel';const title=document.createElement('h2');title.id='capacityTitle';title.textContent='⚠️ 人力提醒';body=document.createElement('div');body.className='capacityBody';
    const note=document.createElement('p');note.className='hint';note.textContent='依目前可取得的排班與主預約資料估算；其他裝置仍可能變更。本提醒不會鎖定名額，也不取代座位與儲存驗證。';
    const actions=document.createElement('div');actions.className='actions';back=document.createElement('button');back.type='button';back.id='capacityBack';back.textContent='返回調整';proceed=document.createElement('button');proceed.type='button';proceed.id='capacityProceed';proceed.className='primary';proceed.textContent='仍要預約';actions.append(back,proceed);panel.append(title,body,note,actions);modal.append(panel);document.body.append(modal);
    function finish(value){modal.classList.remove('open');const done=resolve;resolve=null;done?.(value);setTimeout(()=>document.getElementById('saveBtn')?.focus({preventScroll:true}),0)}
    back.onclick=()=>finish(false);proceed.onclick=()=>finish(true);modal.onclick=e=>{if(e.target===modal)finish(false)};
    modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false)}if(e.key==='Tab'){e.preventDefault();(document.activeElement===back?proceed:back).focus()}});
  }
  function ask(report){init();body.replaceChildren();for(const r of report.ranges){const section=document.createElement('section'),heading=document.createElement('strong'),counts=document.createElement('p'),message=document.createElement('p');heading.textContent=SalonCapacity.label(r.start)+'～'+SalonCapacity.label(r.end);counts.textContent='同時段預約：'+range(r.guestsMin,r.guestsMax)+' 位\n'+(r.type==='incomplete'?'實際上班：無法確認（已確認 '+range(r.staffMin,r.staffMax)+' 位）':'實際上班：'+range(r.staffMin,r.staffMax)+' 位');message.textContent=r.type==='incomplete'?'人力資料不完整，請確認現場人力後再決定。':'目前預約人數已超過上班人數，請確認現場是否能承接。';section.append(heading,counts,message);if(r.reasons.length){const reasons=document.createElement('p');reasons.className='hint';reasons.textContent=r.reasons.join('；');section.append(reasons)}body.append(section)}modal.classList.add('open');back.focus();return new Promise(done=>resolve=done)}
  window.SalonCapacityPrompt={ask};
})();
