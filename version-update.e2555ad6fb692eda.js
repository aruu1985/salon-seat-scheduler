/* Manual updates only. The legacy /version.json endpoint remains frozen. */
(function(){
 const running=document.querySelector('meta[name="app-build"]')?.content;
 const channel=document.querySelector('meta[name="update-channel"]')?.content||'compat-version.json';
 let newest=null,banner,dialog,busy=false;
 function reasons(){
  const result=[];if(navigator.onLine===false)result.push('目前離線，請先恢復連線。');
  try{if([window.SalonSchedule,window.SalonStaff].some(m=>m?.draftStatus&&Object.values(m.draftStatus()).some(Boolean)))result.push('有尚未儲存的排班、店況或人員草稿。')}catch(_){result.push('無法確認草稿狀態。')}
  if(document.querySelector('.modal.open,dialog[open]:not(.updateHelp)'))result.push('請先完成並關閉編輯畫面。');
  const state=window.salonAuthConnection?.status();
  if(!state)result.push('此頁尚未提供連線確認，請使用更新診斷。');else if(!state.ready)result.push('登入或連線尚未恢復。');
  if(state?.permissionDenied)result.push('伺服器拒絕存取，請先核對權限。');
  if(state?.pendingOperations||['syncStatus','monthSaveState','dailySaveState'].some(id=>/等待同步|同步中/.test(document.getElementById(id)?.textContent||'')))result.push('仍有資料等待同步，請勿重複提交。');
  if(state?.uncertainWrites||state?.unresolvedReceipts)result.push('有操作結果待核對，請先確認原操作是否成功。');
  if(state?.verification&&state.verification!=='clear')result.push(state.verification==='checking'?'正在確認目前登入身分的待送資料。':'目前無法確認待送資料已完成。');
  if(state?.storageError)result.push('無法讀取本機操作回條，請先保留原頁面。');
  if(state?.serverFresh===false||['syncStatus','monthSaveState','dailySaveState'].some(id=>/同步失敗|更新失敗|離線快取/.test(document.getElementById(id)?.textContent||'')))result.push('尚未確認雲端同步成功。');
  if(document.getElementById('saveBtn')?.disabled)result.push('預約儲存尚未完成。');
  return [...new Set(result)];
 }
 function help(){
  if(!dialog){dialog=document.createElement('dialog');dialog.className='updateHelp';dialog.innerHTML='<h2>更新與連線恢復</h2><p class="updateReasons"></p><p>請保留原頁面與輸入，不要清除網站資料或重複新增預約。</p><button type="button" data-recover>原頁恢復連線</button><button type="button" data-new>保留原頁，另開更新診斷</button><button type="button" data-report>下載本機檢查紀錄</button><button type="button" data-close>返回原畫面</button>';
   dialog.querySelector('[data-close]').onclick=()=>dialog.close();
   dialog.querySelector('[data-recover]').onclick=async()=>{if(busy)return;busy=true;try{await window.salonRecoverConnection?.()}finally{busy=false;display();dialog.querySelector('.updateReasons').textContent=reasons().join('\n')||'已恢復，請核對畫面與同步結果。'}};
   dialog.querySelector('[data-new]').onclick=()=>{if(!confirm('原頁面與草稿會保留。新分頁先不連線 Firebase；恢復連線可能繼續傳送 SDK 待送資料。是否開啟更新診斷？'))return;const url=new URL('./update-recovery.html',location.href);if(newest)url.searchParams.set('build',newest);window.open(url.href,'_blank','noopener')};
   dialog.querySelector('[data-report]').onclick=()=>{const report=window.salonConnectionReport?.()||{build:running,reasons:reasons(),scope:'current-page-only'};const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SalonConnection-'+(report.caseId||'local')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
   document.body.append(dialog);
  }
  dialog.querySelector('.updateReasons').textContent=reasons().join('\n')||'沒有已知更新阻擋。歷史登入身分的待送資料無法完整盤點。';dialog.showModal();
 }
 function display(){
  if(!newest)return;
  if(!banner){banner=document.createElement('div');banner.className='updateBanner';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');banner.innerHTML='<span></span><button type="button" data-update>確認更新</button><button type="button" data-help>處理連線／更新問題</button>';
   (document.getElementById('stage')||document.body.lastElementChild)?.before(banner);
   banner.querySelector('[data-help]').onclick=help;
   banner.querySelector('[data-update]').onclick=async()=>{if(busy||reasons().length)return;busy=true;try{await window.salonAuthConnection?.verifyPending?.();if(reasons().length)return;if(!confirm('即將載入新版本。目前沒有偵測到未完成輸入或待送操作。是否更新？'))return;if(reasons().length)return;const url=new URL('./index.html',location.href);url.searchParams.set('build',newest);location.replace(url.href)}finally{busy=false;display()}};
  }
  const blocked=reasons();banner.querySelector('span').textContent=blocked.length?'新版已就緒，更新暫停：'+blocked.join(' '):'新版已就緒，您可在方便時確認更新。';banner.querySelector('[data-update]').disabled=busy||blocked.length>0;
 }
 async function check(){try{const response=await fetch('./'+channel+'?t='+Date.now(),{cache:'no-store'});if(!response.ok)return;const data=await response.json();if(running&&typeof data.build==='string'&&/^[a-zA-Z0-9._-]{1,96}$/.test(data.build)&&data.build!==running){newest=data.build;display()}}catch(_){/* Keep the current page and all drafts. */}}
 document.addEventListener('input',display,true);document.addEventListener('click',display,true);window.addEventListener('salon-connection-state',display);window.addEventListener('storage',display);window.addEventListener('offline',display);
 new MutationObserver(display).observe(document.body,{attributes:true,attributeFilter:['class','open'],subtree:true});
 for(const id of ['syncStatus','monthSaveState','dailySaveState']){const state=document.getElementById(id);if(state)new MutationObserver(display).observe(state,{childList:true,subtree:true,characterData:true})}
 window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});window.addEventListener('online',check);setInterval(check,60000);
 window.SalonVersionUpdate={reasons,check,help};
 if('serviceWorker'in navigator)window.addEventListener('load',async()=>{try{const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});await registration.update()}catch(_){/* Offline: no reload or storage cleanup. */}});
})();
