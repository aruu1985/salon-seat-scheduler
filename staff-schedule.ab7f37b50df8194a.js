/* Shared read-time attendance rule. Never materializes fixed days into Firestore. */
(function(){
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
 function fixed(person,date){
  const raw=person?.fixedOffDay;if(raw===null||raw===undefined||raw===''||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
  const weekday=Number(raw),value=new Date(date+'T12:00:00Z');return Number.isInteger(weekday)&&weekday>=0&&weekday<=6&&Number.isFinite(value.getTime())&&value.toISOString().slice(0,10)===date&&value.getUTCDay()===weekday;
 }
 function resolve(person,date,monthly={},daily={}){
  const id=person?.id;for(const [source,entries] of [['daily',daily],['monthly',monthly]])if(own(entries,id))return {source,entry:entries[id]&&typeof entries[id]==='object'?{...entries[id]}:{status:'unknown',time:'',note:''}};
  return fixed(person,date)?{source:'fixed',entry:{status:'off',time:'',note:'固定休'}}:{source:'default',entry:{status:'normal',time:'',note:''}};
 }
 function off(person,date,monthly={}){return ['off','leave'].includes(resolve(person,date,monthly).entry.status)}
 function copyMonth(sourceMonth,targetMonth,source,target,people){
  const next=JSON.parse(JSON.stringify(target||{})),byId=new Map(people.map(p=>[p.id,p]));
  const [year,month]=targetMonth.split('-').map(Number),last=new Date(year,month,0).getDate();
  for(const [date,entries] of Object.entries(source||{})){
   if(date.slice(0,7)!==sourceMonth)continue;const day=Number(date.slice(8));if(!Number.isInteger(day)||day<1||day>last)continue;const targetDate=targetMonth+'-'+String(day).padStart(2,'0');
   for(const [id,entry] of Object.entries(entries||{})){
    if(own(next[targetDate],id))continue;
    const person=byId.get(id);if(person){
     // Old one-click fixed-rest materializations are rules, not day-number extra leave.
     if(fixed(person,date)&&entry?.status==='off'&&entry.note==='固定休'&&!entry.time&&!entry.workStart&&!entry.workEnd)continue;
     // Copying an old workday must not cancel the new month's fixed rest.
     if(fixed(person,targetDate)&&!['off','leave'].includes(entry?.status))continue;
    }
    next[targetDate]??={};next[targetDate][id]=JSON.parse(JSON.stringify(entry));
   }
  }return next;
 }
 window.SalonStaffSchedule={fixed,resolve,off,copyMonth};
})();
