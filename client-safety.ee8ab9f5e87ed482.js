/* Private local operation receipts. No customer payloads, passwords, tokens or authorization flags. */
(function(){
 function create({project,storage,clock=()=>Date.now(),random=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}){
  const prefix='salon-safety:'+project+':',pageId=random();let storageError=false,caseId;try{storage=storage||window.localStorage;caseId=storage.getItem(prefix+'case');if(!caseId){caseId=random();storage.setItem(prefix+'case',caseId)}}catch(_){storageError=true;caseId=pageId}
  function records(){const rows=[];try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix+'op:'))continue;const row=JSON.parse(storage.getItem(key));if(!row||row.id!==key.slice((prefix+'op:').length)||!['pending','unknown','confirmed','rejected','reviewed'].includes(row.state))throw Error('Invalid receipt');rows.push(row)}}catch(_){storageError=true}return rows}
  function put(row){try{storage.setItem(prefix+'op:'+row.id,JSON.stringify(row));return row}catch(_){storageError=true;throw Error('無法保留本機操作回條，請保留輸入並核對操作結果及瀏覽器儲存空間。')}}
  function begin({kind,uid,paths=[],persistence="unknown"}){if(storageError)throw Error('本機操作回條無法讀取，資料未送出。');const row={id:random(),pageId,kind,persistence,owner:uid||null,paths:[...new Set(paths)],state:'pending',startedAt:clock()};put(row);return row.id}
  function change(id,patch){const row=records().find(r=>r.id===id);if(!row)throw Error('本機操作回條缺失，請核對原操作。');return put({...row,...patch,changedAt:clock()})}
  function addPath(id,path){if(typeof path!=='string'||!path.startsWith('salons/default/'))return;const row=records().find(r=>r.id===id);if(row&&!row.paths.includes(path))change(id,{paths:[...row.paths,path]})}
  function finish(id,state,code=''){change(id,{state,code:/^[a-zA-Z0-9/._-]{0,80}$/.test(code)?code:'unknown'});if(state==='confirmed'||state==='rejected'){const resolved=records().filter(r=>['confirmed','rejected','reviewed'].includes(r.state)).sort((a,b)=>b.changedAt-a.changedAt);for(const row of resolved.slice(100)){try{storage.removeItem(prefix+'op:'+row.id)}catch(_){storageError=true}}}}
  function summary(uid){const unresolved=records().filter(r=>r.state==='pending'||r.state==='unknown');return {storageError,unresolved:unresolved.length,unknown:unresolved.filter(r=>r.state==='unknown').length,previousPage:unresolved.filter(r=>r.pageId!==pageId).length,foreignOwner:unresolved.some(r=>r.owner&&r.owner!==uid)}}
  function review(uid){const unresolved=records().filter(r=>r.state==='pending'||r.state==='unknown');if(unresolved.some(r=>r.owner&&r.owner!==uid))throw Error('有其他登入身分的操作待核對，請先恢復原身分；不會丟棄或轉送該身分的資料。');for(const row of unresolved)change(row.id,{state:'reviewed'})}
  function report(uid){return {format:1,caseId,pageId,generatedAt:new Date(clock()).toISOString(),scope:'local-receipts-and-current-auth-only',historyWarning:'舊版及其他歷史登入身分的操作可能沒有回條，不能由此證明所有待送資料為空。',...summary(uid),operations:records().map(r=>({operationId:r.id,kind:r.kind,persistence:r.persistence,paths:r.paths,state:r.state,startedAt:r.startedAt,changedAt:r.changedAt,code:r.code||'',currentOwner:r.owner===uid}))}}
  return {begin,addPath,finish,summary,review,report,pageId};
 }
 window.SalonClientSafety={create};
})();
