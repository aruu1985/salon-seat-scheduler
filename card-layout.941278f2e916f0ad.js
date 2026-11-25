/* Card text uses rendered CSS pixels, including table zoom. Never changes card geometry. */
(function(){
  function textWidth(element){if(!element?.textContent)return 0;const range=document.createRange();range.selectNodeContents(element);return range.getBoundingClientRect().width}
  function fit(card,arrivalPass=false){
    if(!arrivalPass)card.classList.remove('arrivalNeedsRail','arrivalTopSpace','arrivalCompact','arrivalStack');
    window.SalonArrival?.fit(card);
    const content=card.querySelector('.cardContent'),name=card.querySelector('.name');if(!content||!name)return;
    content.style.justifyContent='flex-start';const box=content.getBoundingClientRect();if(box.width<=0||box.height<=0)return;
    const width=box.width,height=box.height,note=content.querySelector('.cardNote');
    const nameMax=Math.min(18,11+width*.065),bodyMax=Math.min(14,10+width*.04);
    let best=null;
    function apply(mode,step,requestedLines=1){
      card.dataset.cardMode=mode;
      const compact=mode!=='normal';
      let body=Math.max(9,bodyMax-step*.6);const lines=compact?1:requestedLines,service=content.querySelector('.serviceLine');
      content.style.setProperty('--card-body-size',body+'px');content.style.setProperty('--card-note-lines','1');content.style.setProperty('--card-service-lines',String(lines));
      if(service){service.style.whiteSpace='nowrap';service.style.display='block';const fullWidth=textWidth(service),available=Math.max(0,service.getBoundingClientRect().width-.7);if(fullWidth>available*lines)body=Math.max(9,body*available*lines/fullWidth-.1);service.style.removeProperty('white-space');service.style.removeProperty('display');content.style.setProperty('--card-body-size',body+'px')}
      const meta=Math.max(9,Math.min(12,body-1)),marker=Math.max(8.5,Math.min(11,body*.85));
      content.style.setProperty('--card-meta-size',meta+'px');content.style.setProperty('--card-marker-size',marker+'px');content.style.setProperty('--card-gap',(compact?0:Math.max(.5,2-step*.2))+'px');
      const limit=Math.max(10,nameMax-step*.5);content.style.setProperty('--card-name-size',limit+'px');
      const available=Math.max(0,name.getBoundingClientRect().width-.7),measured=textWidth(name);
      let chosen=Math.max(10,Math.min(limit,measured?limit*available/measured-.1:limit));
      content.style.setProperty('--card-name-size',chosen+'px');
      for(let i=0;i<4&&chosen>10&&textWidth(name)>available;i++){chosen=Math.max(10,chosen-.2);content.style.setProperty('--card-name-size',chosen+'px')}
      const last=content.lastElementChild,bodyNode=content.querySelector('.cardBody');
      const bottom=Math.max(last?.getBoundingClientRect().bottom||box.top,bodyNode?.getBoundingClientRect().bottom||box.top);
      const fits=bottom<=box.bottom+.3;
      const fullServices=!service||service.scrollHeight<=service.clientHeight+1;
      return {mode,step,lines,fits,fullServices,fullName:textWidth(name)<=name.getBoundingClientRect().width-.2,size:chosen,score:(fits?1000:0)+(textWidth(name)<=name.getBoundingClientRect().width-.2?100:0)+(fullServices?30:0)+(compact?0:5)+chosen};
    }
    // Prefer a complete name and readable fonts. Compact mode shares header/body rows.
    outer:for(const mode of ['normal','compact'])for(let step=0;step<=12;step++)for(const lines of mode==='normal'?[1,2]:[1]){
      const candidate=apply(mode,step,lines);if(!best||candidate.score>best.score)best=candidate;
      if(candidate.fits&&candidate.fullName&&candidate.fullServices){best=candidate;break outer}
    }
    if(!best.fits)best={mode:'micro',step:12};
    apply(best.mode,best.step,best.lines);
    if(note&&best.mode==='normal'){
      const available=box.bottom-note.getBoundingClientRect().top,lh=parseFloat(getComputedStyle(note).lineHeight)||11;
      content.style.setProperty('--card-note-lines',String(Math.max(1,Math.floor(available/lh))));
    }
    const last=content.lastElementChild;content.style.justifyContent=(last?.getBoundingClientRect().bottom||box.top)<=box.bottom+.3?'center':'flex-start';
    if(!arrivalPass&&window.SalonArrival?.needsRail(card)){
      const alignment=content.style.justifyContent;content.style.justifyContent='flex-end';
      if(window.SalonArrival.needsRail(card)){
        content.style.justifyContent=alignment;const top=window.SalonArrival.topSpace(card);
        if(box.height-top>=50){card.classList.add('arrivalTopSpace');card.style.setProperty('--arrival-top-gap',top+'px');return fit(card,true)}
        // Before narrowing text, try the existing compact rows below a square corner target.
        card.classList.add('arrivalCompact');let compact=false;
        for(let step=0;step<=12;step++){content.style.justifyContent='flex-start';const candidate=apply('compact',step,1);content.style.justifyContent='flex-end';if(candidate.fits&&candidate.fullName&&!window.SalonArrival.needsRail(card)){compact=true;break}}
        if(!compact){
          card.classList.add('arrivalStack');card.style.setProperty('--arrival-stack-gap',Math.max(0,top-2)+'px');const control=card.querySelector('.arrivalButton');card.style.setProperty('--arrival-stack-width',((control?.getBoundingClientRect().width||0)+2)+'px');
          for(let step=0;step<=12;step++){content.style.justifyContent='flex-start';const candidate=apply('compact',step,1);if(candidate.fits&&candidate.fullName&&!window.SalonArrival.needsRail(card)){compact=true;break}}
        }
        if(!compact){card.classList.remove('arrivalCompact','arrivalStack');card.classList.add('arrivalNeedsRail');return fit(card,true)}
      }
    }
    card.dataset.nameComplete=String(textWidth(name)<=name.getBoundingClientRect().width-.2);
  }
  function fitAll(){document.querySelectorAll('.appt').forEach(card=>fit(card))}
  let frame=0;
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;fitAll()})}
  function init(paper){if(typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(paper);window.addEventListener('resize',schedule);document.fonts?.ready.then(schedule)}
  window.SalonCardLayout={fit,fitAll,init,schedule};
})();
