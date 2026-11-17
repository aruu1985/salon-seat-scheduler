/* Display-only lanes within a seat. Never change stored times or seat assignments. */
(function(){
  function overlaps(a,b){const sa=Number(a.start),sb=Number(b.start),da=Number(a.duration),db=Number(b.duration);return da>0&&db>0&&sa<sb+db&&sb<sa+da}
  function arrange(appointments){
    const result=new Map(),seats=new Map();
    for(const appointment of appointments){const key=Number(appointment.col);if(!seats.has(key))seats.set(key,[]);seats.get(key).push(appointment)}
    for(const items of seats.values()){
      items.sort((a,b)=>Number(a.start)-Number(b.start)||Number(b.duration)-Number(a.duration)||String(a.id).localeCompare(String(b.id)));
      let group=[],end=-Infinity;
      function finish(){
        if(!group.length)return;
        const lanes=[],placements=[];
        for(const item of group){let lane=lanes.findIndex(value=>value<=Number(item.start));if(lane<0)lane=lanes.length;lanes[lane]=Number(item.start)+Number(item.duration);placements.push({item,lane})}
        for(const {item,lane} of placements){const conflicts=group.filter(other=>other.id!==item.id&&overlaps(item,other)).map(other=>other.id);result.set(item.id,{lane,lanes:lanes.length,conflicts})}
      }
      for(const item of items){const start=Number(item.start);if(group.length&&start>=end){finish();group=[];end=-Infinity}group.push(item);end=Math.max(end,start+Number(item.duration))}finish();
    }
    return result;
  }
  window.SalonSeatLayout={overlaps,arrange};
})();
