const assert=require('node:assert/strict');global.window={};require('../service-capacity.js');const C=window.SalonCapacity;
const people=Array.from({length:5},(_,i)=>({id:''+i,code:''+i,role:i<3?'designer':'technician',entry:{working:true,status:'normal'}}));
const guest=(id,startTime='10:00',duration=2)=>({id,startTime,duration});
const evaluate=(n,staff=people,candidate=guest('new'),extra={})=>C.evaluate({date:'2028-02-29',appointments:Array.from({length:n},(_,i)=>guest('a'+i)),candidate,staff:{people:staff,complete:true},hours:{intervals:[[600,1140]]},...extra});
assert.equal(evaluate(4).needsWarning,false);assert.equal(evaluate(5).ranges[0].guestsMax,6);assert.equal(evaluate(5).ranges[0].staffMin,5);
for(const [status,time,start,expected] of [['late','10:30','10:00',4],['early','10:30','10:30',4],['afternoon','13:30','13:00',4],['morning','13:30','14:00',4]]){const staff=structuredClone(people);staff[4].entry={status,time};const r=evaluate(5,staff,guest('new',start),{appointments:Array.from({length:5},(_,i)=>guest('a'+i,start))});assert.equal(r.ranges[0].staffMin,expected)}
const half=structuredClone(people);half[4].entry={status:'normal',workStart:'10:15',workEnd:'10:45'};const r=evaluate(5,half);assert.equal(r.ranges.length,1);assert.equal(r.ranges[0].staffMin,4);assert.equal(r.ranges[0].staffMax,5);
const second=guest('new');second.secondaryService={enabled:true,secondaryDuration:2};assert.equal(evaluate(4,people,second).needsWarning,false);
assert.equal(evaluate(5,people,guest('a0')).needsWarning,false);
assert.equal(evaluate(5).ranges.length,1);assert.equal(evaluate(5).ranges[0].end,660);
const missing=structuredClone(people);missing[4].entry={status:'afternoon'};assert.equal(evaluate(1,missing).ranges[0].type,'incomplete');
assert.equal(evaluate(0,people,guest('new'),{appointmentsReady:false}).ranges[0].type,'incomplete');
assert.equal(evaluate(4,[...people,people[0]]).needsWarning,false);
const duplicate=structuredClone(people);duplicate.push({...people[0],id:'duplicate'});assert.equal(evaluate(0,duplicate).ranges[0].type,'incomplete');
assert.equal(evaluate(0,people,guest('new'),{appointments:[...Array.from({length:4},(_,i)=>guest('a'+i)),{...guest('cancelled'),status:'cancelled'}]}).needsWarning,false);
assert.equal(evaluate(5,people,guest('new','11:00')).needsWarning,false);
const before=JSON.stringify(people);evaluate(5);assert.equal(JSON.stringify(people),before);
assert.equal(C.availability({id:'fixed',role:'designer',entry:{status:'fixed-off-unconfirmed'}},[[600,1140]]).intervals,null);
console.log('PASS capacity assertions: counts, shifts, exact boundaries, secondary, edits, merging, missing data, duplicate staff, cancelled, half-open intervals, no mutation');
