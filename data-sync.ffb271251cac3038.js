/* Reads only: one explicit server refresh for the selected date's complete board. */
(function(){
  const fingerprint=value=>JSON.stringify(normalize(value));
  function normalize(value){
    if(value?.toMillis){if(Number.isInteger(value.seconds)&&Number.isInteger(value.nanoseconds))return {timestampSeconds:value.seconds,timestampNanos:value.nanoseconds};return {timestampMs:value.toMillis()}}
    if(Array.isArray(value))return value.map(normalize);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])]));
    return value;
  }
  function appointmentFingerprint(value){const copy={...value};delete copy.arrival;return fingerprint(copy)}
  async function readDate(db,date){
    if(!navigator.onLine)throw new Error('目前離線');
    const salon=db.collection('salons').doc('default'),year=date.slice(0,4);
    const refs=[salon.collection('dates').doc(date).collection('appointments'),salon.collection('staff'),salon.collection('dates').doc(date),salon.collection('schedules').doc(date.slice(0,7)),salon.collection('storeCalendar').doc(year),salon.collection('annualCalendars').doc(year)];
    let timer;const snapshots=await Promise.race([Promise.all(refs.map(ref=>ref.get({source:'server'}))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('同步逾時')),20000)})]).finally(()=>clearTimeout(timer));
    if(!navigator.onLine||snapshots.some(snapshot=>(snapshot.metadata?.fromCache||snapshot.metadata?.hasPendingWrites)))throw new Error('尚未取得伺服器最新資料');
    const [appointments,staff,daily,monthly,calendar,annual]=snapshots;
    return {appointments,staff:staff.docs.map(doc=>({id:doc.id,...doc.data()})),daily:daily.data()||{},monthly:monthly.data()||{},calendar:calendar.data()||{},annual:annual.data()||{}};
  }
  async function save(db,ref,data,expected){
    if(!navigator.onLine)throw new Error('目前離線，請連線後再儲存');
    await db.runTransaction(async transaction=>{
      const current=await transaction.get(ref);
      if(expected===null?current.exists:!current.exists||appointmentFingerprint(current.data())!==expected)throw new Error('其他裝置已修改或刪除此預約。輸入已保留，請取消後重新開啟最新資料再修改。');
      const previous=current.exists?current.data():{},next={...previous,...data};
      // Status has a separate transaction; stale form data must never replace it.
      if(Object.prototype.hasOwnProperty.call(previous,'arrival'))next.arrival=previous.arrival;else delete next.arrival;
      transaction.set(ref,next);
    });
  }
  window.SalonDataSync={fingerprint,appointmentFingerprint,readDate,save};
})();
