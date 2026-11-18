/* Read-only presentation of the existing in-memory appointment and staff master. */
(function(){
  function timeRange(start,duration){
    const parts=String(start||'').split(':').map(Number);if(parts.length!==2||parts.some(n=>!Number.isFinite(n)))return start||'';
    const end=parts[0]*60+parts[1]+Number(duration)*30,days=Math.floor(end/1440),minutes=((end%1440)+1440)%1440;
    return `${start} ～ ${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}${days>0?`（${days===1?'隔日':days+'天後'}）`:''}`;
  }
  function render(container,appointment,context){
    container.replaceChildren();
    const title=document.createElement('h3');title.className='detailCustomer';title.textContent=appointment.name;container.appendChild(title);
    function section(label){if(label){const h=document.createElement('h4');h.textContent=label;container.appendChild(h)}const dl=document.createElement('dl');dl.className='detailRows';container.appendChild(dl);return dl}
    function row(dl,label,value,optional=false){if(optional&&!String(value??'').trim())return;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value??'');dl.append(dt,dd)}
    const main=section();row(main,'電話',appointment.phone,true);row(main,'預約日期',context.date);row(main,'開始／結束',timeRange(context.start,appointment.duration));row(main,'座位',context.seat);row(main,'設計師',context.staffLabel(appointment.designer,'designer'));row(main,'消費項目',(appointment.services||[]).join('＋')||'未填寫');row(main,'額外指定人員',appointment.assign?context.staffLabel(appointment.assign):'',true);row(main,'備註',appointment.note,true);
    if(context.conflict)row(main,'座位狀態','⚠ 同座位時間衝突');
    const secondary=context.secondary;
    if(secondary){const dl=section('第二服務');row(dl,'服務類型',secondary.secondaryServiceType);row(dl,'服務項目',secondary.secondaryItem,true);row(dl,'對應人員',secondary.secondaryStaff?context.staffLabel(secondary.secondaryStaff):'',true);row(dl,'日期',secondary.secondaryDate);row(dl,'開始／結束',timeRange(secondary.secondaryTime,secondary.secondaryDuration));row(dl,'第二服務備註',secondary.secondaryNote,true)}
  }
  window.SalonAppointmentDetails={render,timeRange};
})();
