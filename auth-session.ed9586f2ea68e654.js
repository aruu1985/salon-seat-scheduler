/* Connection lifecycle only. Firestore rules remain the authorization boundary. */
(function(){
  const MESSAGE='登入身分已失效，已暫停資料讀寫；輸入已保留。請使用「同步資料」確認恢復。';
  function create({auth,database,onState=()=>{},online=()=>navigator.onLine,ledger=null,persistence="unknown",requireServerSnapshot=false,verificationTimeout=5000}){
    let phase='starting',epoch=0,uid=null,previousKind=null,lost=false,job=null,stopAuth,networkPause=Promise.resolve(),disposed=false;
    let verification='unchecked',serverFresh=!requireServerSnapshot,verifyJob=null;
    let pending=0,uncertainWrites=false,permissionDenied=false,networkError=false,initialSettled=false,resolveInitial,rejectInitial,booting=true,startPromise;
    const initial=new Promise((resolve,reject)=>{resolveInitial=resolve;rejectInitial=reject});
    const watches=new Set(),wrapped=new WeakMap(),original=new WeakMap();
    const error=()=>Object.assign(new Error(MESSAGE),{code:'app/auth-unavailable'});
    const valid=()=>!disposed&&phase==='ready'&&!!auth.currentUser&&auth.currentUser.uid===uid;
    function status(){const local=ledger?.summary(auth.currentUser?.uid)||{};return {phase,ready:valid(),requiresConfirmation:lost,pendingOperations:pending,uncertainWrites,permissionDenied,networkError,counterRecovery:previousKind==='account',verification,serverFresh,persistence,unresolvedReceipts:local.unresolved||0,foreignOwner:!!local.foreignOwner,storageError:!!local.storageError}}
    function publish(){onState(status())}
    function verifyPending(){
      if(verifyJob?.ticket===epoch)return verifyJob.promise;
      const work={ticket:epoch,promise:null};verification='checking';publish();verifyJob=work;
      work.promise=Promise.resolve().then(async()=>{
        let outcome='unconfirmed',timer;
        try{assert(work.ticket);if(typeof database.waitForPendingWrites!=='function'){outcome='unavailable';return}await Promise.race([database.waitForPendingWrites(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Pending verification timeout')),verificationTimeout)})]);assert(work.ticket);outcome='clear'}catch(_){}finally{clearTimeout(timer);if(work.ticket===epoch){verification=outcome;publish()}}
      }).finally(()=>{if(verifyJob===work)verifyJob=null});return work.promise;
    }

    function assert(ticket=epoch){if(!valid()||ticket!==epoch)throw error()}
    const unwrap=value=>original.get(value)||value;
    function pause(reason='lost'){
      verification='unchecked';serverFresh=!requireServerSnapshot;epoch++;phase=reason;uid=null;lost=true;if(pending)uncertainWrites=true;
      for(const watch of watches){watch.stop?.();watch.stop=null}
      // Preserve SDK persistence. Never terminate, clear persistence, or replay an application write.
      networkPause=networkPause.catch(()=>{}).then(()=>database.disableNetwork()).catch(()=>{networkError=true});
      publish();
    }
    function snapshot(value){
      if(!value||typeof value!=='object')return value;
      if(typeof value.onSnapshot==='function'&&typeof value.get==='function')return wrap(value);
      if(Array.isArray(value.docs))return new Proxy(value,{get(target,key){if(key==='docs')return target.docs.map(snapshot);if(key==='forEach')return cb=>target.forEach(doc=>cb(snapshot(doc)));const result=Reflect.get(target,key,target);return typeof result==='function'?result.bind(target):result}});
      if(value.ref)return new Proxy(value,{get(target,key){if(key==='ref')return wrap(target.ref);const result=Reflect.get(target,key,target);return typeof result==='function'?result.bind(target):result}});
      return value;
    }
    function begin(watch){
      if(!valid()||watch.stop||watch.failed)return;
      const ticket=epoch;
      const next=value=>{if(valid()&&ticket===epoch&&watches.has(watch))watch.next(snapshot(value))};
      const failed=e=>{if(ticket!==epoch||!watches.has(watch))return;watch.failed=true;watch.stop?.();watch.stop=null;if(e?.code==='permission-denied'){permissionDenied=true;publish()}watch.fail?.(e)};
      watch.stop=watch.target.onSnapshot(...watch.options,next,failed);
    }
    async function activate(user){
      if(disposed)return;
      if(uid&&uid!==user.uid&&pending)uncertainWrites=true;
      const ticket=++epoch;phase='restoring';uid=user.uid;previousKind=user.isAnonymous?'anonymous':'account';for(const w of watches){w.stop?.();w.stop=null}publish();
      await networkPause;
      if(ticket!==epoch||auth.currentUser?.uid!==user.uid||disposed)return;
      try{await database.enableNetwork()}catch(e){if(ticket===epoch){networkError=true;phase='network-error';publish()}throw e}
      if(ticket!==epoch||auth.currentUser?.uid!==user.uid||disposed)return;
      networkError=false;lost=false;phase='ready';verification='unchecked';previousKind=user.isAnonymous?'anonymous':'account';
      publish();for(const watch of watches){watch.stop?.();watch.stop=null;watch.failed=false;begin(watch)}
      if(requireServerSnapshot)verifyPending();
    }
    async function complete(operation,ticket,write=false,descriptor={kind:'write',paths:[]}){
      assert(ticket);if(write&&requireServerSnapshot){await verifyPending();assert(ticket);if(verification!=='clear'||!serverFresh)throw Error('尚未確認待送資料與雲端連線，新寫入已暫停；請保留輸入並核對，勿重複提交。')}const local=ledger?.summary(auth.currentUser?.uid);
      if(write&&(uncertainWrites||local?.unknown||local?.previousPage))throw Error('先前操作結果尚未確認，請先核對，再解除寫入暫停；請勿重複提交。');
      if(write&&!online()&&persistence!=='persistent')throw Error('本機尚未確認可持久保存離線資料，未送出；請保留輸入並連線後再試。');
      const receipt=write?ledger?.begin({...descriptor,uid:auth.currentUser.uid,persistence}):null;
      if(write){pending++;verification='unchecked';publish()}
      try{const result=await operation(receipt);assert(ticket);permissionDenied=false;if(receipt)ledger.finish(receipt,'confirmed');return snapshot(result)}
      catch(e){if(e?.code==='permission-denied'&&ticket===epoch){permissionDenied=true;publish()}if(write&&(!valid()||ticket!==epoch)){uncertainWrites=true;if(receipt){try{ledger.finish(receipt,'unknown','auth-changed')}catch(_){/* The durable pending receipt remains. */}}throw Object.assign(new Error('登入狀態已變更，操作結果尚未確認；請恢復後核對，勿重複提交。'),{code:'app/auth-unavailable'})}if(receipt){const rejected=e.appTransactionAborted||['permission-denied','invalid-argument','failed-precondition','not-found','already-exists'].includes(e?.code);if(!rejected)uncertainWrites=true;try{ledger.finish(receipt,rejected?'rejected':'unknown',e?.code||'operation-error')}catch(_){uncertainWrites=true}}throw e}
      finally{if(write){pending--;publish();if(valid()&&requireServerSnapshot)verifyPending()}}
    }
    function transaction(raw,ticket,receipt){return new Proxy(raw,{get(target,key){const method=Reflect.get(target,key,target);if(typeof method!=='function')return method;return (...args)=>{assert(ticket);if(receipt&&args[0]?.path)ledger.addPath(receipt,args[0].path);const result=method.apply(target,args.map(unwrap));return key==='get'?Promise.resolve(result).then(value=>{assert(ticket);return snapshot(value)}):result===target?transaction(target,ticket,receipt):result}}})}
    function wrap(target){
      if(!target||typeof target!=='object')return target;
      if(wrapped.has(target))return wrapped.get(target);
      const proxy=new Proxy(target,{get(raw,key){
        const value=Reflect.get(raw,key,raw);
        if(key==='parent'||key==='firestore')return wrap(value);
        if(typeof value!=='function')return value;
        if(key==='onSnapshot')return (...args)=>{
          const index=typeof args[0]==='function'?0:1;
          const watch={target:raw,options:args.slice(0,index),next:args[index],fail:args[index+1],stop:null,failed:false};
          watches.add(watch);begin(watch);return ()=>{watch.stop?.();watches.delete(watch)};
        };
        if(key==='runTransaction')return (callback,...options)=>{
          const ticket=epoch;
          return complete(receipt=>value.call(raw,async tx=>{assert(ticket);try{const result=await callback(transaction(tx,ticket,receipt));assert(ticket);return result}catch(e){throw Object.assign(new Error(e.message||'交易未完成'),{code:e.code,appTransactionAborted:true})}},...options),ticket,true,{kind:'transaction',paths:[]});
        };
        if(key==='batch')return ()=>{assert();const ticket=epoch,batch=value.call(raw),batchPaths=[];let guardedBatch;guardedBatch=new Proxy(batch,{get(b,k){if(k==='commit')return ()=>complete(()=>b.commit(),ticket,true,{kind:'batch',paths:batchPaths});const m=Reflect.get(b,k,b);return typeof m==='function'?(...args)=>{assert(ticket);if(args[0]?.path)batchPaths.push(args[0].path);m.apply(b,args.map(unwrap));return guardedBatch}:m}});return guardedBatch};
        if(['get','set','update','delete','add'].includes(key))return (...args)=>{const ticket=epoch;return complete(()=>value.apply(raw,args.map(unwrap)),ticket,key!=='get',{kind:key,paths:raw.path?[raw.path]:[]})};
        if(['collection','doc','collectionGroup','where','orderBy','limit','limitToLast','startAt','startAfter','endAt','endBefore','withConverter'].includes(key))return (...args)=>wrap(value.apply(raw,args.map(unwrap)));
        return value.bind(raw);
      }});
      wrapped.set(target,proxy);original.set(proxy,target);return proxy;
    }
    function start(){
      if(startPromise)return startPromise;
      startPromise=(async()=>{
      if(typeof auth.onAuthStateChanged!=='function')throw Error('Firebase 登入狀態監聽不可用，已停止連線');
      stopAuth=auth.onAuthStateChanged(user=>{
        if(disposed)return;
        if(!initialSettled){initialSettled=true;resolveInitial(user);return}
        if(booting)return;
        if(!user){if(phase!=='lost')pause();return}
        if(valid()&&uid===user.uid)return;
        if(lost){publish();return} // No silent anonymous recovery or queued-write resumption.
        activate(user).catch(()=>{});
      },()=>{if(!initialSettled){initialSettled=true;rejectInitial(error())}pause('auth-error')});
      let user=await initial;
      if(!user){if(ledger?.summary(null).unresolved)throw Error('既有身分仍有操作待核對，未自動建立新匿名身分；請保留原頁面並核對。');phase='signing-in';publish();await auth.signInAnonymously();user=auth.currentUser}
      if(!user)throw error();
      if(!valid())await activate(user);
      if(!valid())throw error();return wrap(database);
      })().catch(e=>{pause('startup-error');throw e}).finally(()=>{booting=false});return startPromise;
    }
    async function recover({acknowledgePending=false}={}){
      if(booting&&startPromise){try{await startPromise;return}catch(_){/* Retry only after startup has actually failed. */}}
      if(job)return job;
      job=(async()=>{
        if(!online())throw Error('目前離線，登入尚未恢復；輸入與待送資料保留。');
        if(networkError)throw Error('無法確認連線暫停狀態，請先保留畫面並由管理者檢查，尚未恢復。');
        if(!acknowledgePending)throw Error('恢復登入可能讓 SDK 繼續傳送既有待送資料，請先確認後再恢復。');
        let user=auth.currentUser;
        if(ledger?.summary(user?.uid).foreignOwner)throw Error('有其他登入身分的操作待核對，請先恢復原身分；未轉送或丟棄資料。');
        if(!user&&previousKind==='account')throw Error('先前為專用帳號，請重新登入原帳號；不會自動切換匿名身分。');
        phase='recovering';publish();
        if(!user){await networkPause;await auth.signInAnonymously();user=auth.currentUser}
        if(!user)throw error();
        await activate(user);
      })().catch(e=>{if(!valid()){phase='lost';publish()}throw e}).finally(()=>{job=null});
      return job;
    }
    function dispose(){disposed=true;epoch++;stopAuth?.();for(const w of watches)w.stop?.();watches.clear()}
    return {start,recover,dispose,database:wrap(database),assert,blocked:()=>{const s=status();return !s.ready||pending>0||lost||uncertainWrites||s.unresolvedReceipts>0||s.storageError||(requireServerSnapshot&&(verification!=='clear'||!serverFresh))},verifyPending,noteServerSnapshot:()=>{if(!serverFresh){serverFresh=true;publish()}},report:()=>({...ledger?.report(auth.currentUser?.uid),build:window.document?.querySelector('meta[name=app-build]')?.content,connection:status()}),acknowledgeOutcomeReview:()=>{assert();if(pending||(requireServerSnapshot&&(verification!=='clear'||!serverFresh)))throw Error('仍有操作或連線結果等待確認，不可解除暫停。');ledger?.review(auth.currentUser.uid);uncertainWrites=false;publish()},status};
  }
  window.SalonAuthSession={create};
})();
