(function(){
  const DATASET_URL='https://data.gov.tw/dataset/14718';
  let notify=()=>{},cache={};
  const pad=n=>String(n).padStart(2,'0');
  const cacheKey=year=>`salon-gov-calendar-${year}`;
  const esc=value=>String(value??'');
  function parseCsv(text){
    const rows=[];let row=[],cell='',quote=false;
    for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'&&quote&&next==='"'){cell+='"';i++;continue}if(ch==='"'){quote=!quote;continue}if(ch===','&&!quote){row.push(cell);cell='';continue}if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';continue}cell+=ch}
    row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
  }
  function normalizeDate(value){
    const digits=String(value||'').replace(/[^\d]/g,'');
    if(digits.length===8)return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`;
    return '';
  }
  function normalizeRows(csv,year){
    const rows=parseCsv(csv),head=rows.shift()||[],idxDate=head.findIndex(h=>/西元日期|date/i.test(h)),idxHoliday=head.findIndex(h=>/是否放假|isholiday|holiday/i.test(h)),idxName=head.findIndex(h=>/備註|name|description/i.test(h));
    const days={};
    for(const row of rows){const date=normalizeDate(row[idxDate]||row[0]);if(!date||date.slice(0,4)!==String(year))continue;const isHoliday=String(row[idxHoliday]??row[2]??'').trim()==='2',name=String(row[idxName]??row[3]??'').trim();if(isHoliday||name)days[date]={date,name:name||'政府假日',isHoliday,source:'行政院人事行政總處'}}
    return days;
  }
  function readCache(year){if(cache[year])return cache[year];try{const value=JSON.parse(localStorage.getItem(cacheKey(year))||'null');if(value?.days)cache[year]=value}catch(e){}return cache[year]||null}
  function writeCache(year,days,url){const value={year,days,url,updatedAtMs:Date.now(),source:DATASET_URL};cache[year]=value;try{localStorage.setItem(cacheKey(year),JSON.stringify(value))}catch(e){}return value}
  function linkYear(text,year){const roc=year-1911;return new RegExp(`${roc}年中華民國政府行政機關辦公日曆表(?![_\\w\\u4e00-\\u9fff]*Google)`).test(text)}
  async function findOfficialCsv(year){
    const html=await fetch(DATASET_URL,{cache:'no-store'}).then(res=>{if(!res.ok)throw new Error('政府資料集頁面讀取失敗 HTTP '+res.status);return res.text()});
    const doc=new DOMParser().parseFromString(html,'text/html'),links=[...doc.querySelectorAll('a[href]')];
    const link=links.find(a=>linkYear(a.textContent||'',year)&&/dgpa\.gov\.tw|data\.gov\.tw/i.test(a.href))||links.find(a=>linkYear(a.textContent||'',year));
    if(!link){
      const roc=year-1911,urls=[...html.matchAll(/https:\/\/www\.dgpa\.gov\.tw\/FileConversion\?[^"'<]+/g)].map(match=>match[0].replace(/\\u0026/g,'&').replace(/&amp;/g,'&'));
      const url=urls.find(value=>{const text=decodeURIComponent(value);return text.includes(`${roc}年中華民國政府行政機關辦公日曆表`)&&!/Google/i.test(text)});
      if(url)return url;
      throw new Error(`找不到 ${year} 年官方 CSV 連結`);
    }
    return new URL(link.getAttribute('href'),DATASET_URL).href;
  }
  async function readBundledCache(year){
    const response=await fetch(`gov-holidays/${year}.json`,{cache:'no-store'});
    if(!response.ok)throw new Error('沒有內建政府假日快取 HTTP '+response.status);
    const data=await response.json();
    if(!data.days||!Object.keys(data.days).length)throw new Error('內建政府假日快取沒有資料');
    cache[year]=data;try{localStorage.setItem(cacheKey(year),JSON.stringify(data))}catch(e){}return data;
  }
  async function ensureYear(year){
    year=Number(year);const cached=readCache(year);
    try{const url=await findOfficialCsv(year),csv=await fetch(url,{cache:'no-store'}).then(res=>{if(!res.ok)throw new Error('政府 CSV 讀取失敗 HTTP '+res.status);return res.text()}),days=normalizeRows(csv,year);if(!Object.keys(days).length)throw new Error('政府 CSV 沒有可用日期資料');return writeCache(year,days,url)}
    catch(error){try{const bundled=await readBundledCache(year);notify('政府假日資料暫時無法即時更新，已使用官方快取。');return bundled}catch(e){}if(cached){notify('政府假日資料暫時無法更新，已使用上次快取。');return cached}notify('政府假日資料暫時無法更新，本店排班仍可正常使用。',true);return {year,days:{},error:error.message,source:DATASET_URL}}
  }
  async function holidays(year){return (await ensureYear(year)).days||{}}
  function cached(year){return readCache(year)?.days||{}}
  function init(options={}){notify=options.notify||notify}
  window.SalonGovCalendar={init,ensureYear,holidays,cached,source:DATASET_URL};
})();
