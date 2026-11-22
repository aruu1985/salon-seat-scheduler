(function(){
  const DATASET_URL='https://data.gov.tw/dataset/14718',SUCCESS_TTL=24*60*60*1000,FAILURE_TTL=10*60*1000;
  let notify=()=>{};const cache=Object.create(null),pending=new Map(),attempts=new Map();
  const cacheKey=year=>`salon-gov-calendar-${year}`;
  function officialUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&['data.gov.tw','www.dgpa.gov.tw','dgpa.gov.tw'].includes(url.hostname)}catch(_){return false}}
  function parseCsv(text){
    const rows=[];let row=[],cell='',quote=false;
    for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'&&quote&&next==='"'){cell+='"';i++;continue}if(ch==='"'){quote=!quote;continue}if(ch===','&&!quote){row.push(cell);cell='';continue}if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';continue}cell+=ch}
    row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
  }

  function normalizeDate(value){const digits=String(value||'').replace(/[^\d]/g,'');if(digits.length!==8)return '';const date=`${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`,parsed=new Date(date+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:''}
  function normalizeRows(csv,year){
    const rows=parseCsv(csv),head=rows.shift()||[],idxDate=head.findIndex(h=>/西元日期|^date$/i.test(h)),idxHoliday=head.findIndex(h=>/是否放假|^isholiday$|^holiday$/i.test(h)),idxName=head.findIndex(h=>/備註|name|description/i.test(h));
    if(idxDate<0||idxHoliday<0)throw Error('官方 CSV 欄位不符');const days={};
    for(const row of rows){const date=normalizeDate(row[idxDate]);if(!date||date.slice(0,4)!==String(year))continue;const flag=String(row[idxHoliday]??'').trim();if(!['0','1','2'].includes(flag))throw Error('官方 CSV 假日欄位不符');const isHoliday=flag==='2',name=String(row[idxName]??'').trim();if(isHoliday||name)days[date]={date,name:name||'政府假日',isHoliday,source:'行政院人事行政總處'}}return days;
  }
  function validCache(value,year){
    if(!value||Number(value.year)!==year||value.source!==DATASET_URL||!officialUrl(value.url||value.officialCsvUrl)||!value.days||Array.isArray(value.days)||!Object.keys(value.days).length)return false;
    return Object.entries(value.days).every(([date,item])=>normalizeDate(date)===date&&date.slice(0,4)===String(year)&&item?.date===date&&typeof item.isHoliday==='boolean'&&typeof item.name==='string'&&item.source==='行政院人事行政總處');
  }
  function readCache(year){if(validCache(cache[year],year))return cache[year];try{const value=JSON.parse(localStorage.getItem(cacheKey(year))||'null');if(validCache(value,year))cache[year]=value}catch(_){}return cache[year]||null}
  function remember(year,value){cache[year]=value;try{localStorage.setItem(cacheKey(year),JSON.stringify(value))}catch(_){}return value}
  async function request(url,json=false){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('政府假日讀取失敗 HTTP '+response.status);if(String(url).startsWith('https:')&&response.url&&!officialUrl(response.url))throw Error('官方來源轉址至未確認網域');return await(json?response.json():response.text())}finally{clearTimeout(timer)}}
  function linkYear(text,year){return new RegExp(`${year-1911}年中華民國政府行政機關辦公日曆表(?![_\\w\\u4e00-\\u9fff]*Google)`).test(text)}
  async function findOfficialCsv(year){
    const html=await request(DATASET_URL),doc=new DOMParser().parseFromString(html,'text/html');
    for(const link of doc.querySelectorAll('a[href]')){const url=new URL(link.getAttribute('href'),DATASET_URL).href;if(linkYear(link.textContent||'',year)&&officialUrl(url))return url}
    for(const match of html.matchAll(/https:\/\/www\.dgpa\.gov\.tw\/FileConversion\?[^"'<]+/g)){const url=match[0].replace(/\\u0026/g,'&').replace(/&amp;/g,'&');if(officialUrl(url)&&linkYear(decodeURIComponent(url),year)&&!/Google/i.test(url))return url}
    throw Error(`未取得 ${year} 年官方 CSV 連結`);
  }
  async function ensureYear(year){
    year=Number(year);if(!Number.isInteger(year)||year<1000||year>9999)throw Error('年份必須為四位數');
    if(pending.has(year))return pending.get(year);const cached=readCache(year),attempt=attempts.get(year),now=Date.now();
    if(attempt&&now-attempt.time<(attempt.ok?SUCCESS_TTL:FAILURE_TTL))return cached||attempt.result;
    if(cached&&Number.isFinite(cached.updatedAtMs)&&now-cached.updatedAtMs>=0&&now-cached.updatedAtMs<SUCCESS_TTL)return cached;
    const job=(async()=>{try{const url=await findOfficialCsv(year),days=normalizeRows(await request(url),year);const value={year,days,url,source:DATASET_URL,updatedAtMs:Date.now()};if(!validCache(value,year))throw Error('官方假日資料不完整');remember(year,value);attempts.set(year,{time:Date.now(),ok:true});return value}
      catch(error){let value=cached;if(!value){try{const bundled=await request(`gov-holidays/${year}.json`,true);if(validCache(bundled,year))value=remember(year,bundled)}catch(_){}}
        if(value){attempts.set(year,{time:Date.now(),ok:false,result:value});return value}
        const result={year,days:{},source:DATASET_URL,error:'未取得可用官方資料'};attempts.set(year,{time:Date.now(),ok:false,result});notify(`${year} 年尚無可用的官方政府假日資料（可能尚未公布或暫時無法連線）；不推算假日，本店排班仍可正常使用。`,true);return result}
    })();pending.set(year,job);try{return await job}finally{pending.delete(year)}
  }
  function init(options={}){notify=options.notify||notify}
  window.SalonGovCalendar={init,ensureYear,holidays:async year=>(await ensureYear(year)).days||{},cached:year=>readCache(Number(year))?.days||{},source:DATASET_URL};
})();
