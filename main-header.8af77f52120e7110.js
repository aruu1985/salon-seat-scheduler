/* Presentation only: selected date stays YYYY-MM-DD and never queries or writes data. */
(function(){
  const weekdays='日一二三四五六';
  function dateLabel(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
    const date=new Date(value+'T12:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return '';
    const [year,month,day]=value.split('-');
    return `${year}年${Number(month)}月${Number(day)}日（${weekdays[date.getUTCDay()]}）`;
  }
  function updateDate(){const input=document.getElementById('dateInput'),label=dateLabel(input.value);document.getElementById('dateDisplay').textContent=label||'選擇日期';input.setAttribute('aria-label',label?'預約日期 '+label:'預約日期')}
  function init(){const input=document.getElementById('dateInput'),trigger=document.getElementById('datePickerOpen'),picker=SalonBookingDatePicker.attach(input,trigger);input.addEventListener('input',updateDate);input.closest('.dateControl').addEventListener('click',event=>{event.preventDefault();picker.open()});updateDate()}

  window.SalonMainHeader={dateLabel,updateDate,init};
})();
