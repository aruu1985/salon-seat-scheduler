/* Presentation only. Never use these labels as stored appointment values. */
(function(){
  const identities=[['先生','S'],['小姐','J'],['女士','J'],['太太','T'],['幼稚園','幼'],['幼兒園','幼'],['國中生','國'],['國中','國'],['高中生','高'],['高中','高']];
  const shortcuts=['小姐','先生','小孩','女士','太太','幼稚園','國中生','高中生'];
  const services={'S洗':'S洗','洗髮':'洗','洗':'洗','剪髮':'剪','K剪':'剪','剪':'剪','洗剪':'洗剪','燙髮':'燙','燙':'燙','染髮':'染','染':'染','補染':'補','護髮':'護','護':'護','頭皮':'頭','造型':'型','單造型':'型','美甲':'甲'};
  const endings=[...identities.map(([name])=>name),'小孩'].sort((a,b)=>b.length-a.length);
  function name(value){const full=String(value??'');const match=identities.find(([ending])=>full.endsWith(ending));return match?full.slice(0,-match[0].length)+match[1]:full}
  function appendIdentity(value,ending){const full=String(value??'').trim();if(!shortcuts.includes(ending))return full;const previous=endings.find(item=>full.endsWith(item));return (previous?full.slice(0,-previous.length):full)+ending}
  function identityLabel(value){const entry=identities.find(([full])=>full===value);return entry?`${value}（${entry[1]}）`:value}
  function service(value){return Object.prototype.hasOwnProperty.call(services,value)?services[value]:value}
  function serviceLabel(value){return Object.prototype.hasOwnProperty.call(services,value)?`${value}（${service(value)}）`:value}
  function appointment(value){return {name:name(value.name),services:(value.services||[]).filter(item=>typeof item==='string'&&item.trim()).map(service).join('＋')}}
  window.SalonAppointmentFormat={name,appendIdentity,identityLabel,service,serviceLabel,appointment,shortcuts};
})();
