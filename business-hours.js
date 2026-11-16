/* Normal hours confirmed by the owner: daily 10:00–19:00, no break. */
(function(){
  const normal=[['10:00','19:00']], years=new Map();let database;
  const minutes=t=>{if(!/^\d{2}:\d{2}$/.test(t||''))return NaN;const [h,m]=t.split(':').map(Number);return h<=24&&m<60&&(h<24||m===0)?h*60+m:NaN};
  function resolve(date,calendar={},annual={}){
    const legacy=(annual.events||[]).find(e=>e.date===date),item=calendar.overrides?.[date]||(legacy?{...legacy,status:legacy.type}:null);
    if(['closed','spring','noBooking'].includes(item?.status))return {date,intervals:[],max:0,reason:'本日店休或不可預約'};
    let ranges=normal;
    if(item){
      if(['training','meeting'].includes(item.status)){
        const a=minutes(item.startTime),b=minutes(item.endTime);
        if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return {date,intervals:[],max:0,reason:'課程／會議未設定完整時間，請先確認店況'};
        ranges=normal.flatMap(([s,e])=>{const x=minutes(s),y=minutes(e);return [[x,Math.min(y,a)],[Math.max(x,b),y]].filter(([l,r])=>r>l)});
      }else if(item.startTime||item.endTime){ranges=[[item.startTime||normal[0][0],item.endTime||normal[0][1]]];}
      else if(['specialHours','halfDay','lateOpen','earlyClose','extended'].includes(item.status))return {date,intervals:[],max:0,reason:'特殊店況尚未設定時間，請先補齊'};
    }
    const intervals=ranges.map(([s,e])=>[typeof s==='number'?s:minutes(s),typeof e==='number'?e:minutes(e)]);
    if(intervals.some(([s,e])=>!Number.isFinite(s)||!Number.isFinite(e)||e<=s))return {date,intervals:[],max:0,reason:'營業時間設定不完整'};
    return {date,intervals,max:Math.floor(Math.max(0,...intervals.map(([s,e])=>(e-s)/30))),reason:''};
  }
  function validate(info,time,duration){const start=minutes(time),end=start+Number(duration)*30;if(!Number.isInteger(Number(duration))||duration<1)return '請選擇有效時長';if(!info.intervals.some(([s,e])=>start>=s&&end<=e))return info.reason||'預約超出當日連續營業區間，請調整開始時間或時長';return ''}
  async function get(date){if(!database)throw new Error('營業資料尚未連線，請稍後再試');const year=date.slice(0,4);if(!years.has(year)){let ready;const promise=new Promise(r=>ready=r),state={calendar:null,annual:null};years.set(year,promise);for(const [key,collection] of [['calendar','storeCalendar'],['annual','annualCalendars']])database.collection('salons').doc('default').collection(collection).doc(year).onSnapshot(doc=>{state[key]=doc.data()||{};if(state.calendar&&state.annual){ready(state);window.dispatchEvent(new Event('salon-hours-changed'))}},error=>{years.delete(year);ready({error});});}const state=await years.get(year);if(state.error)throw state.error;return resolve(date,state.calendar,state.annual)}
  window.SalonHours={resolve,validate,minutes,get,connect:db=>{database=db}};
})();
