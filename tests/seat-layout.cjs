const assert=require('assert/strict'),vm=require('vm'),fs=require('fs');const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('seat-layout.js','utf8'),context);const {arrange,overlaps}=context.window.SalonSeatLayout;
const a={id:'a',col:1,start:4,duration:2},adjacent={id:'b',col:1,start:6,duration:3};assert.equal(overlaps(a,adjacent),false);assert.equal(arrange([a,adjacent]).get('a').lanes,1);
const b={...adjacent,start:5};let layout=arrange([a,b]);assert.equal(layout.get('a').lanes,2);assert.notEqual(layout.get('a').lane,layout.get('b').lane);assert.equal(layout.get('a').conflicts[0],'b');
const c={id:'c',col:1,start:7,duration:2};layout=arrange([a,b,c]);assert.equal(layout.get('c').lanes,2);assert.equal(layout.get('a').lane,layout.get('c').lane);
const three=[a,{...b,start:4},{...c,start:4}];layout=arrange(three);assert.equal(new Set([...layout.values()].map(x=>x.lane)).size,3);
layout=arrange([a,{...b,col:2}]);assert.equal(layout.get('a').lanes,1);assert.equal(layout.get('a').conflicts.length,0);
const before=JSON.stringify(three);arrange(three);assert.equal(JSON.stringify(three),before);
console.log('PASS adjacency, real overlap, chained overlap lane reuse, triple conflict, separate seats, no input mutation');
