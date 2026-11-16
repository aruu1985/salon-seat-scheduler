(function(){
 const label=n=>n===1?'30 分鐘':`${n/2} 小時`;let active=null;
 const dialog=document.createElement('dialog');dialog.className='durationDialog';dialog.innerHTML='<h2>選擇時長</h2><p class="wheelStatus" aria-live="polite"></p><div class="wheelFrame"><div class="wheelCenter"></div><div class="durationWheel" tabindex="0" role="listbox" aria-label="預約時長"></div></div><div class="actions"><button type="button" data-cancel>取消</button><button type="button" class="primary" data-confirm>確認</button></div>';document.body.append(dialog);
 const wheel=dialog.querySelector('.durationWheel'),status=dialog.querySelector('.wheelStatus');let draft=1,max=1,values=[1],timer;
 function position(index){index=Math.min(values.length-1,Math.max(0,index));draft=values[index];wheel.scrollTop=index*44;paint()}
 function paint(){wheel.querySelectorAll('[role=option]').forEach((el,i)=>{el.setAttribute('aria-selected',String(values[i]===draft));});wheel.setAttribute('aria-activedescendant','wheel-option-'+values.indexOf(draft));status.textContent=label(draft)+(draft>max?'（原值超出當日上限）':'')}
 function close(){dialog.close();active?.button.focus();active=null}
 wheel.addEventListener('scroll',()=>{draft=values[Math.min(values.length-1,Math.max(0,Math.round(wheel.scrollTop/44)))];paint();clearTimeout(timer);timer=setTimeout(()=>position(values.indexOf(draft)),140)},{passive:true});
 wheel.addEventListener('keydown',e=>{let n=values.indexOf(draft);if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(e.key)){e.preventDefault();n=e.key==='Home'?0:e.key==='End'?values.length-1:values.indexOf(draft)+({ArrowDown:1,ArrowUp:-1,PageDown:5,PageUp:-5}[e.key]);position(n)}else if(e.key==='Enter'){e.preventDefault();confirm()}});
 function confirm(){if(!active)return;if(![...active.input.options].some(o=>Number(o.value)===draft))active.input.add(new Option(label(draft),draft));active.input.value=String(draft);active.button.textContent=label(draft);active.input.dispatchEvent(new Event('change',{bubbles:true}));close()}
 dialog.querySelector('[data-cancel]').onclick=close;dialog.querySelector('[data-confirm]').onclick=confirm;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 function attach(id,date){const input=document.getElementById(id);input.hidden=true;const button=document.createElement('button');button.type='button';button.className='durationTrigger';button.setAttribute('aria-haspopup','dialog');input.after(button);
 const refresh=()=>{const n=Number(input.value);button.textContent=label(n||1)};new MutationObserver(refresh).observe(input,{childList:true,subtree:true});input.addEventListener('change',refresh);refresh();
 button.onclick=async()=>{try{const info=await SalonHours.get(date());if(!info.max)throw new Error(info.reason||'本日沒有可預約時段');active={input,button};max=info.max;values=Array.from({length:max},(_,i)=>i+1);const original=Number(input.value)||1;if(!values.includes(original))values.push(original);wheel.innerHTML=values.map((n,i)=>`<button type="button" role="option" tabindex="-1" id="wheel-option-${i}">${label(n)}${n>max?'（原值）':''}</button>`).join('');wheel.querySelectorAll('button').forEach((el,i)=>el.onclick=()=>position(i));dialog.showModal();position(values.indexOf(original));wheel.focus()}catch(e){window.salonNotify?.(e.message,true)}};
 return {refresh,set:n=>{if(![...input.options].some(o=>Number(o.value)===Number(n)))input.add(new Option(label(Number(n)),n));input.value=String(n);refresh()}};
 }
 window.SalonWheel={attach,label};
})();
