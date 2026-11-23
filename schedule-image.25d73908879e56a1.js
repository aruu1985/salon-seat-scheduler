/* Read-only, viewport-independent PNG renderer. No HTML/SVG or external images. */
(function(){
  const WIDTH=1400,MARGIN=28,CELL=(WIDTH-MARGIN*2)/7,FONT='-apple-system,BlinkMacSystemFont,"Noto Sans TC","Segoe UI",sans-serif';
  function lines(context,text,width){
    const output=[];let line='';
    for(const character of String(text??'')){if(character==='\n'){output.push(line);line='';continue}if(line&&context.measureText(line+character).width>width){output.push(line);line=''}line+=character}
    if(line)output.push(line);return output;
  }
  async function render(snapshot){
    if(document.fonts?.ready)await document.fonts.ready;
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw new Error('CanvasUnavailable');
    const first=snapshot.firstWeekday,days=snapshot.days;if(!Number.isInteger(first)||first<0||first>6||!days.length)throw new Error('InvalidCalendar');
    // Lay out complete strings before allocating the bitmap. A busy week grows vertically.
    function blocks(day){
      const result=[];
      for(const badge of day.badges||[])result.push({text:badge.text,color:badge.color,size:18,weight:500,gap:8});
      for(const person of day.people||[]){result.push({text:person.name,color:person.color,outline:person.outline,size:28,weight:800,gap:3});if(person.detail)result.push({text:person.detail,color:'#62594e',size:18,weight:500,gap:7})}
      for(const block of result){context.font=`${block.weight} ${block.size}px ${FONT}`;block.lines=lines(context,block.text,CELL-24);block.height=block.lines.length*(block.size+7)+block.gap}
      return result;
    }
    const layouts=days.map(day=>({day,blocks:blocks(day)})),weeks=Math.ceil((first+days.length)/7),heights=Array.from({length:weeks},()=>150);
    layouts.forEach((item,index)=>{const row=Math.floor((first+index)/7);heights[row]=Math.max(heights[row],56+item.blocks.reduce((sum,block)=>sum+block.height,0))});
    const top=124,height=top+heights.reduce((sum,n)=>sum+n,0)+MARGIN;
    // Conservative iOS bitmap budget; use one complete image even on a narrow screen.
    const scale=Math.min(2,Math.sqrt(4000000/(WIDTH*height)),8192/height,8192/WIDTH);
    canvas.width=Math.floor(WIDTH*scale);canvas.height=Math.floor(height*scale);context.scale(scale,scale);
    context.fillStyle='#fff';context.fillRect(0,0,WIDTH,height);context.textBaseline='top';context.textAlign='center';
    context.font=`800 38px ${FONT}`;context.fillStyle='#28231f';const titleLines=lines(context,snapshot.title,WIDTH-56);if(titleLines.length!==1)throw new Error('InvalidTitle');context.fillText(snapshot.title,WIDTH/2,22);
    context.font=`700 23px ${FONT}`;context.fillStyle='#6b6258';[...'日一二三四五六'].forEach((name,col)=>context.fillText(name,MARGIN+CELL*(col+.5),83));
    let y=top;
    for(let row=0;row<weeks;row++){
      for(let col=0;col<7;col++){
        const x=MARGIN+col*CELL,h=heights[row],item=layouts[row*7+col-first];
        context.fillStyle=item?'#fff':'#f8f6f2';context.fillRect(x,y,CELL,h);context.strokeStyle='#d2c9bb';context.lineWidth=1;context.strokeRect(x,y,CELL,h);
        if(!item)continue;
        context.textAlign='left';context.font=`700 24px ${FONT}`;context.fillStyle='#6b6258';context.fillText(String(item.day.day),x+10,y+9);context.textAlign='center';let textY=y+46;
        for(const block of item.blocks){context.font=`${block.weight} ${block.size}px ${FONT}`;context.fillStyle=block.color||'#333';
          for(const line of block.lines){if(block.outline){context.strokeStyle=block.outline;context.lineWidth=2.6;context.lineJoin='round';context.strokeText(line,x+CELL/2,textY)}context.fillText(line,x+CELL/2,textY);textY+=block.size+7}textY+=block.gap;
        }
      }y+=heights[row];
    }
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('PNGTimeout')),10000);try{canvas.toBlob(blob=>{clearTimeout(timer);if(blob?.size)resolve(blob);else reject(new Error('PNGEmpty'))},'image/png')}catch(error){clearTimeout(timer);reject(error)}})}
    finally{canvas.width=canvas.height=0}
  }
  window.SalonScheduleImage={render};
})();
