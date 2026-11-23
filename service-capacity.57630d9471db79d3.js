/* Advisory headcount only. No Firestore access, seat assignment or service-stage inference. */
(function(){
  const minute=value=>{if(typeof value!=='string'||!/^\d{2}:\d{2}$/.test(value||''))return NaN;const [h,m]=value.split(':').map(Number);return h<24&&m<60||h===24&&m===0?h*60+m:NaN};
  const label=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  const roles=new Set(['designer','technician','assistant']);
  const cancelled=new Set(['cancelled','canceled','cancel','deleted','取消','已取消','已刪除']);
  function active(row){return row.cancelled!==true&&row.canceled!==true&&row.isCancelled!==true&&row.deleted!==true&&row.isDeleted!==true&&!cancelled.has(String(row.status||'').toLowerCase())}
  function interval(row){const start=row.startTime?minute(row.startTime):480+Number(row.start)*30,duration=Number(row.duration);return Number.isFinite(start)&&Number.isFinite(duration)&&duration>0?[start,start+duration*30]:null}
  function availability(person,hours){
    const e=person.entry||{},status=e.status,code=String(person.code||person.id||'未識別人員');
    const unknown=reason=>({id:person.id,code,intervals:null,reason:code+'：'+reason});
    if(!roles.has(person.role))return unknown('人員角色無法判定');
    if(status==='fixed-off-unconfirmed')return unknown('固定休未套用，缺少當日出勤確認');
    if(e.working===false||['off','leave'].includes(status))return {id:person.id,code,intervals:[]};
    if(!['normal','late','early','afternoon','morning'].includes(status))return unknown('班別資料缺漏或無法判定');
    let start=0,end=1440;const hasStart=Boolean(e.workStart),hasEnd=Boolean(e.workEnd),timedStart=['late','afternoon'].includes(status),timedEnd=['early','morning'].includes(status);
    const ws=hasStart?minute(e.workStart):null,we=hasEnd?minute(e.workEnd):null,t=e.time?minute(e.time):null;
    if(hasStart&&!Number.isFinite(ws)||hasEnd&&!Number.isFinite(we)||e.time&&!Number.isFinite(t))return unknown('上下班時間格式無效');
    if(timedStart){if(t===null&&!hasStart)return unknown('未設定實際到班時間');if(t!==null&&hasStart&&t!==ws)return unknown('到班時間與特殊上班時間不一致');start=t===null?ws:t}
    if(timedEnd){if(t===null&&!hasEnd)return unknown('未設定實際下班時間');if(t!==null&&hasEnd&&t!==we)return unknown('下班時間與特殊下班時間不一致');end=t===null?we:t}
    if(hasStart)start=ws;if(hasEnd)end=we;if(end<=start)return unknown('上下班區間無效（跨夜班別尚無法判定）');
    return {id:person.id,code,intervals:hours.flatMap(([a,b])=>{const l=Math.max(a,start),r=Math.min(b,end);return r>l?[[l,r]]:[]})};
  }
  // Confirmed staff are a lower bound; unknown people never become assumed attendance.
  function inspectStaff(staff,hours){
    const issues=[...(staff.issues||[])],byId=new Map(),conflicts=new Set(),codes=new Map(),people=[];
    for(const p of staff.people||[]){if(p.active===false)continue;const id=String(p.id||'');if(!id){issues.push('員工識別資料缺漏');continue}if(byId.has(id)){if(JSON.stringify(byId.get(id))!==JSON.stringify(p))conflicts.add(id);continue}byId.set(id,p)}
    for(const [id,p] of byId){const key=(p.role==='assistant'?'technician':p.role)+':'+p.code;if(p.code!==undefined&&p.code!==null&&p.code!==''){const ids=codes.get(key)||[];ids.push(id);codes.set(key,ids)}}
    for(const ids of codes.values())if(ids.length>1)for(const id of ids)conflicts.add(id);
    for(const [id,p] of byId){if(conflicts.has(id)){people.push({id,code:p.code,intervals:null,reason:String(p.code||id)+'：人員識別或編號重複，出勤待確認'});continue}people.push(availability(p,hours))}
    const unknown=people.filter(p=>p.intervals===null).map(p=>p.reason),reliable=Boolean(staff.complete&&people.some(p=>p.intervals!==null));
    if(!staff.complete)issues.push('人員出勤資料尚未完成同步');if(!reliable)issues.push('暫無可靠人力資料');
    return {people,reliable,issues:[...new Set(issues)],unknown};
  }
  function notice({staff,appointmentsReady=true,appointments=[]}){
    if(!appointmentsReady)return '資料同步中或待確認，暫無法完成精確承接比較。';
    if(appointments.some(row=>active(row)&&!interval(row)))return '預約起訖資料待確認，承接評估僅採可確認的預約。';
    const info=inspectStaff(staff,[[0,1440]]);if(!info.reliable)return '人力資料待確認，暫無法完成精確承接比較。';
    return info.unknown.length||info.issues.length?'人力待確認：部分班別尚未確認，承接評估只採已確認人員。':'';
  }
  function evaluate({date,appointments,candidate,staff,hours,appointmentsReady=true}){
    const info=inspectStaff(staff,hours.intervals||[]),issues=[...info.issues],window=interval(candidate),noticeText=notice({staff,appointmentsReady,appointments});
    const result=ranges=>({date,ranges,issues:[...new Set(issues)].sort(),notice:noticeText,needsWarning:ranges.length>0});
    if(!window||!appointmentsReady||!active(candidate))return result([]);
    const original=candidate.id==null?null:appointments.find(row=>row.id===candidate.id),old=original&&active(original)?interval(original):null;
    // With a malformed original, increased exposure cannot be established safely.
    if(original&&active(original)&&!old){issues.push('原預約起訖資料無法比較');return {...result([]),notice:'原預約起訖資料待確認，暫無法比較修改前後負載。'}}
    const rows=[],seen=new Set();let guestsComplete=true;
    for(const [i,row] of appointments.entries()){if(candidate.id!=null&&row.id===candidate.id||!active(row))continue;const key=row.id??'row-'+i;if(seen.has(key))continue;seen.add(key);const range=interval(row);if(!range){guestsComplete=false;issues.push('既有預約起訖資料不完整');continue}rows.push(range)}rows.push(window);
    const [start,end]=window,points=new Set([start,end]);for(let t=Math.ceil(start/30)*30;t<end;t+=30)points.add(t);
    for(const range of [...rows,...(old?[old]:[])])for(const t of range)if(t>start&&t<end)points.add(t);
    for(const p of info.people)for(const range of p.intervals||[])for(const t of range)if(t>start&&t<end)points.add(t);
    const sorted=[...points].sort((a,b)=>a-b),ranges=[];
    for(let i=0;i<sorted.length-1;i++){
      const a=sorted[i],b=sorted[i+1];if(old&&old[0]<=a&&b<=old[1])continue; // Same load or shorter: no repeat advisory.
      const guests=rows.filter(([s,e])=>s<b&&a<e).length,known=info.reliable?info.people.filter(p=>p.intervals?.some(([s,e])=>s<=a&&b<=e)).length:null;
      const threshold=known===null?6:Math.min(6,known);
      if(guests<=6&&(known===null||guests<=threshold))continue;
      const uncertain=!info.reliable||info.unknown.length>0||issues.length>0||!guestsComplete,type=uncertain?'uncertain':'overload',reasons=[...new Set([...issues,...info.unknown])].sort(),last=ranges.at(-1);
      if(last&&last.end===a&&last.type===type){last.end=b;last.guestsMin=Math.min(last.guestsMin,guests);last.guestsMax=Math.max(last.guestsMax,guests);if(known!==null){last.staffMin=Math.min(last.staffMin,known);last.staffMax=Math.max(last.staffMax,known)}last.thresholdMin=Math.min(last.thresholdMin,threshold);last.thresholdMax=Math.max(last.thresholdMax,threshold)}
      else ranges.push({start:a,end:b,type,guestsMin:guests,guestsMax:guests,guestsComplete,staffMin:known,staffMax:known,thresholdMin:threshold,thresholdMax:threshold,reasons});
    }
    return result(ranges);
  }
  window.SalonCapacity={evaluate,availability,inspectStaff,notice,minute,label,signature:report=>JSON.stringify(report)};
})();
