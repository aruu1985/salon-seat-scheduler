/* Read-only advisory dialog; closing it never changes or saves an appointment. */
(function(){
  let modal,panel,body,back,proceed,resolve;
  const range=(a,b)=>a===b?String(a):a+'～'+b;
  function init(){
    if(modal)return;modal=document.createElement('div');modal.className='modal';modal.id='capacityModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','capacityTitle');
    panel=document.createElement('div');panel.className='panel capacityPanel';const title=document.createElement('h2');title.id='capacityTitle';title.textContent='⚠️ 現場承接提醒';body=document.createElement('div');body.className='capacityBody';
    const note=document.createElement('p');note.className='hint';note.textContent='依目前可取得的排班與主預約資料估算；其他裝置仍可能變更。本提醒不會鎖定名額，也不取代座位與儲存驗證。';
    const actions=document.createElement('div');actions.className='actions';back=document.createElement('button');back.type='button';back.id='capacityBack';back.textContent='返回調整';proceed=document.createElement('button');proceed.type='button';proceed.id='capacityProceed';proceed.className='primary';proceed.textContent='仍要預約';actions.append(back,proceed);panel.append(title,body,note,actions);modal.append(panel);document.body.append(modal);
    function finish(value){modal.classList.remove('open');const done=resolve;resolve=null;done?.(value);setTimeout(()=>document.getElementById('saveBtn')?.focus({preventScroll:true}),0)}
    back.onclick=()=>finish(false);proceed.onclick=()=>finish(true);modal.onclick=e=>{if(e.target===modal)finish(false)};
    modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false)}if(e.key==='Tab'){e.preventDefault();(document.activeElement===back?proceed:back).focus()}});
  }
  function ask(report){init();body.replaceChildren();for(const r of report.ranges){
    const section=document.createElement('section'),heading=document.createElement('strong'),counts=document.createElement('p'),message=document.createElement('p');
    heading.textContent=SalonCapacity.label(r.start)+'～'+SalonCapacity.label(r.end);
    counts.textContent=(r.guestsComplete===false?'目前可確認預約：':'同時段預約：')+range(r.guestsMin,r.guestsMax)+' 位\n目前確認在班：'+(r.staffMin===null?'待確認（尚無可靠人力資料）':range(r.staffMin,r.staffMax)+' 位')+'\n'+(r.staffMin===null?'主要區安排基準：6 位':'一般安排基準：'+range(r.thresholdMin,r.thresholdMax)+' 位'+(r.type==='uncertain'?'（依已確認人力）':''));
    message.textContent=(r.type==='uncertain'?'可能需要額外承接／人力待確認。完整人力或預約資料尚未確認。\n\n':'')+'預約量已超過'+(r.type==='uncertain'?'目前可確認的':'')+'一般安排基準，可能需要設計師自行操作，或與客人協調稍候。\n\n請依現場狀況評估是否承接。';
    section.append(heading,counts,message);if(r.reasons.length){const reasons=document.createElement('p');reasons.className='hint';reasons.textContent=r.reasons.join('；');section.append(reasons)}body.append(section)
  }modal.classList.add('open');back.focus();return new Promise(done=>resolve=done)}
  function notice(text){const el=document.getElementById('capacityDataNotice');if(el){if(el.textContent!==text)el.textContent=text;if(el.hidden!==!text)el.hidden=!text}}

  window.SalonCapacityPrompt={ask,notice};
})();
