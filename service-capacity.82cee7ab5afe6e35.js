/* Advisory headcount only. No Firestore access, seat assignment or service-stage inference. */
(function(){
  const minute=value=>{if(!/^\d{2}:\d{2}$/.test(value||''))return NaN;const [h,m]=value.split(':').map(Number);return h<24&&m<60||h===24&&m===0?h*60+m:NaN};
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
  function evaluate({date,appointments,candidate,staff,hours,appointmentsReady=true}){
    const issues=[...(staff.issues||[])];if(!staff.complete)issues.push('人員出勤資料尚未完成同步');if(!appointmentsReady)issues.push('預約資料尚未完成同步');
    const window=interval(candidate);if(!window)return {ranges:[],issues:['預約起訖資料無法判定'],needsWarning:true};
    const people=[],ids=new Map(),codes=new Set();
    for(const person of staff.people||[]){if(person.active===false)continue;const id=String(person.id||'');if(!id){issues.push('員工識別資料缺漏');continue}if(ids.has(id)){if(JSON.stringify(ids.get(id))!==JSON.stringify(person))issues.push('同一員工識別碼有不一致資料');continue}ids.set(id,person);const key=(person.role==='assistant'?'technician':person.role)+':'+person.code;if(person.code&&codes.has(key)){issues.push(String(person.code)+'：人員編號重複，總人數無法確認');continue}codes.add(key);people.push(availability(person,hours.intervals||[]))}
    const rows=[],seen=new Set();for(const [i,row] of (appointments||[]).entries()){if(row.id===candidate.id||!active(row))continue;const key=row.id??'row-'+i;if(seen.has(key))continue;seen.add(key);const range=interval(row);if(!range){issues.push('既有預約起訖資料不完整');continue}rows.push(range)}if(active(candidate))rows.push(window);
    const [start,end]=window,points=new Set([start,end]);for(let t=Math.ceil(start/30)*30;t<end;t+=30)points.add(t);
    for(const range of rows)for(const t of range)if(t>start&&t<end)points.add(t);
    for(const p of people)for(const range of p.intervals||[])for(const t of range)if(t>start&&t<end)points.add(t);
    const sorted=[...points].sort((a,b)=>a-b),ranges=[];
    for(let i=0;i<sorted.length-1;i++){const a=sorted[i],b=sorted[i+1],guests=rows.filter(([s,e])=>s<b&&a<e).length,known=people.filter(p=>p.intervals?.some(([s,e])=>s<=a&&b<=e)).length,missing=people.filter(p=>p.intervals===null).map(p=>p.reason);const incomplete=issues.length>0||missing.length>0;if(!incomplete&&guests<=known)continue;
      const type=incomplete?'incomplete':'overload',reasons=[...new Set([...issues,...missing])].sort(),last=ranges.at(-1);
      if(last&&last.end===a&&last.type===type){last.end=b;last.guestsMin=Math.min(last.guestsMin,guests);last.guestsMax=Math.max(last.guestsMax,guests);last.staffMin=Math.min(last.staffMin,known);last.staffMax=Math.max(last.staffMax,known);last.reasons=[...new Set([...last.reasons,...reasons])].sort()}
      else ranges.push({start:a,end:b,type,guestsMin:guests,guestsMax:guests,staffMin:known,staffMax:known,reasons});
    }
    return {date,ranges,issues:[...new Set(issues)].sort(),needsWarning:ranges.length>0};
  }
  window.SalonCapacity={evaluate,availability,minute,label,signature:report=>JSON.stringify(report)};
})();
