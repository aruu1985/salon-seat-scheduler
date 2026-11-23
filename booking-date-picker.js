/* Main date interaction only. The YYYY-MM-DD input and its existing change handler remain authoritative. */
(function(){
 const pad=n=>String(n).padStart(2,'0');
 const daysInMonth=(year,month)=>[31,(year%4===0&&(year%100!==0||year%400===0))?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
 function parse(value){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||'');if(!match)return null;const [year,month,day]=match.slice(1).map(Number);return year>=1&&year<=9999&&month>=1&&month<=12&&day>=1&&day<=daysInMonth(year,month)?{year,month,day}:null}
 function createModel(value){
  const original=parse(value);if(!original)throw new Error('預約日期無效');let state={...original},preferred=original.day;
  return {get value(){return `${String(state.year).padStart(4,'0')}-${pad(state.month)}-${pad(state.day)}`},get parts(){return {...state}},
   setMonth(year,month){const total=Math.min(9999*12-1,Math.max(0,(year-1)*12+month-1));state.year=Math.floor(total/12)+1;state.month=total%12+1;state.day=Math.min(preferred,daysInMonth(state.year,state.month))},
   shiftMonth(delta){this.setMonth(state.year,state.month+delta)},
   selectDay(day){if(Number.isInteger(day)&&day>=1&&day<=daysInMonth(state.year,state.month)){state.day=day;preferred=day}},
   reset(){state={...original};preferred=original.day}
  };
 }
 function attach(input,trigger){
  let model,stage='calendar',original;
  const dialog=document.createElement('dialog');dialog.id='bookingDatePicker';dialog.className='bookingDatePicker';dialog.setAttribute('aria-labelledby','bookingDateTitle');
  dialog.innerHTML='<div class="bookingDatePanel"><h2 id="bookingDateTitle">選擇日期</h2><div class="bookingDateBody"><section data-calendar><div class="bookingMonthNav"><button type="button" data-month-prev aria-label="上一個月">‹</button><button type="button" data-year-month aria-label="選擇年份與月份"></button><button type="button" data-month-next aria-label="下一個月">›</button></div><div class="bookingWeekdays" aria-hidden="true">'+[...'日一二三四五六'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="bookingDays" role="group" aria-label="選擇日期"></div></section><section data-year-month-panel hidden><div class="bookingYearMonthWheels"><div class="bookingWheelFrame"><div class="bookingWheelCenter"></div><div class="bookingDateWheel" data-year-wheel tabindex="0" role="listbox" aria-label="年份"></div></div><div class="bookingWheelFrame"><div class="bookingWheelCenter"></div><div class="bookingDateWheel" data-month-wheel tabindex="0" role="listbox" aria-label="月份"></div></div></div></section><p class="bookingDateDraft" aria-live="polite"></p></div><div class="bookingDateActions"><button type="button" data-reset>重置</button><button type="button" data-cancel>取消</button><button type="button" data-confirm class="bookingDateConfirm" aria-label="套用日期">✓</button></div></div>';
  document.body.append(dialog);const find=s=>dialog.querySelector(s),calendar=find('[data-calendar]'),yearMonth=find('[data-year-month-panel]'),grid=find('.bookingDays'),confirmButton=find('[data-confirm]');
  function draftLabel(){const {year,month,day}=model.parts;find('.bookingDateDraft').textContent=`${year}年${month}月${day}日`}
  function renderCalendar(focus=false){
   const {year,month,day}=model.parts;find('[data-year-month]').textContent=`${year}年${month}月 ▾`;find('[data-month-prev]').disabled=year===1&&month===1;find('[data-month-next]').disabled=year===9999&&month===12;
   const first=new Date(0);first.setUTCFullYear(year,month-1,1);first.setUTCHours(12,0,0,0);grid.replaceChildren();
   for(let n=0;n<first.getUTCDay();n++){const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');grid.append(blank)}
   for(let n=1;n<=daysInMonth(year,month);n++){const button=document.createElement('button');button.type='button';button.dataset.day=n;button.textContent=n;button.tabIndex=n===day?0:-1;button.setAttribute('aria-pressed',String(n===day));button.setAttribute('aria-label',`${year}年${month}月${n}日`);button.onclick=()=>{model.selectDay(n);renderCalendar(true)};grid.append(button)}draftLabel();if(focus)find('[aria-pressed="true"]').focus({preventScroll:true});
  }
  function wheel(element,kind){
   let first=1,last=12,timer;
   const value=()=>model.parts[kind];
   function set(n){const p=model.parts;model.setMonth(kind==='year'?n:p.year,kind==='month'?n:p.month);paint();draftLabel()}
   function paint(){for(const button of element.children)button.setAttribute('aria-selected',String(Number(button.dataset.value)===value()));element.setAttribute('aria-activedescendant','booking-'+kind+'-'+value())}
   function indexValue(){return Math.min(last,Math.max(first,first+Math.round(element.scrollTop/44)))}
   function position(n){set(n);if(n<first||n>last){fill();return}element.scrollTop=(value()-first)*44}
   function fill(){clearTimeout(timer);first=kind==='year'?Math.max(1,value()-50):1;last=kind==='year'?Math.min(9999,value()+50):12;element.replaceChildren();for(let n=first;n<=last;n++){const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.id='booking-'+kind+'-'+n;option.dataset.value=n;option.setAttribute('role','option');option.textContent=n+(kind==='year'?'年':'月');option.onclick=()=>position(n);element.append(option)}position(value())}
   function flush(){clearTimeout(timer);set(indexValue())}
   element.addEventListener('scroll',()=>{if(stage!=='year-month'||!dialog.open)return;clearTimeout(timer);set(indexValue());timer=setTimeout(()=>{if(kind==='year'&&((value()<=first+2&&first>1)||(value()>=last-2&&last<9999)))fill();else position(value())},140)},{passive:true});
   element.addEventListener('keydown',event=>{const delta={ArrowDown:1,ArrowUp:-1,PageDown:10,PageUp:-10}[event.key];if(delta||event.key==='Home'||event.key==='End'){event.preventDefault();const max=kind==='year'?9999:12;position(event.key==='Home'?1:event.key==='End'?max:Math.max(1,Math.min(max,value()+delta)))}else if(event.key==='Enter'){event.preventDefault();confirm()}});
   return {fill,flush,stop:()=>clearTimeout(timer)};
  }
  const years=wheel(find('[data-year-wheel]'),'year'),months=wheel(find('[data-month-wheel]'),'month');
  function showCalendar(focus=true){stage='calendar';yearMonth.hidden=true;calendar.hidden=false;find('#bookingDateTitle').textContent='選擇日期';confirmButton.setAttribute('aria-label','套用日期');renderCalendar(focus)}
  function showYearMonth(){stage='year-month';calendar.hidden=true;yearMonth.hidden=false;find('#bookingDateTitle').textContent='選擇年份與月份';confirmButton.setAttribute('aria-label','確認年月，選擇日期');years.fill();months.fill();find('[data-year-wheel]').focus({preventScroll:true})}
  function close(){years.stop();months.stop();dialog.close();trigger.focus({preventScroll:true})}
  function confirm(){
   if(stage==='year-month'){years.flush();months.flush();showCalendar();return}
   const value=model.value;
   if(input.value!==original){window.salonNotify?.('目前日期已變更，請重新開啟日期選擇器。',true);close();return}
   close();if(input.value===value)return;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  find('[data-year-month]').onclick=showYearMonth;find('[data-month-prev]').onclick=()=>{model.shiftMonth(-1);renderCalendar()};find('[data-month-next]').onclick=()=>{model.shiftMonth(1);renderCalendar()};
  find('[data-reset]').onclick=()=>{model.reset();if(stage==='year-month'){years.fill();months.fill();draftLabel()}else renderCalendar()};find('[data-cancel]').onclick=close;confirmButton.onclick=confirm;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()});dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close()});
  grid.addEventListener('keydown',event=>{const p=model.parts,delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(delta){event.preventDefault();const d=new Date(0);d.setUTCFullYear(p.year,p.month-1,p.day+delta);if(d.getUTCFullYear()<1||d.getUTCFullYear()>9999)return;model.setMonth(d.getUTCFullYear(),d.getUTCMonth()+1);model.selectDay(d.getUTCDate());renderCalendar(true)}else if(event.key==='PageUp'||event.key==='PageDown'){event.preventDefault();model.shiftMonth(event.key==='PageUp'?-1:1);renderCalendar(true)}});
  return {open(){if(dialog.open)return;original=input.value;if(!parse(original))return;model=createModel(original);dialog.showModal();showCalendar()}};
 }
 window.SalonBookingDatePicker={attach,createModel,daysInMonth,parse};
})();
