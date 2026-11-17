const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');
const context={window:{},navigator:{onLine:true},setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(fs.readFileSync('data-sync.js','utf8'),context);const api=context.window.SalonDataSync;
(async()=>{
 assert.equal(api.fingerprint({a:1,b:{x:2}}),api.fingerprint({b:{x:2},a:1}));assert.notEqual(api.fingerprint({updatedAt:{toMillis:()=>1}}),api.fingerprint({updatedAt:{toMillis:()=>2}}));
 let stored={name:'new',duration:18},writes=0;
 const db={async runTransaction(fn){await fn({get:async()=>({exists:!!stored,data:()=>stored}),set:(_,data)=>{stored=data;writes++}})}};
 await assert.rejects(()=>api.save(db,{}, {name:'stale'},api.fingerprint({name:'old'})),/其他裝置/);assert.equal(writes,0);
 await api.save(db,{}, {name:'edited',duration:18},api.fingerprint(stored));assert.equal(writes,1);
 await assert.rejects(()=>api.save(db,{}, {name:'duplicate'},null),/其他裝置/);assert.equal(writes,1);
 stored=null;await assert.rejects(()=>api.save(db,{}, {name:'resurrect'},api.fingerprint({name:'deleted'})),/其他裝置/);assert.equal(writes,1);
 context.navigator.onLine=false;await assert.rejects(()=>api.save(db,{}, {},null),/離線/);assert.equal(writes,1);
 console.log('PASS canonical fingerprints, timestamp changes, optimistic edit, stale/deleted/duplicate rejection, offline rejection');
})().catch(error=>{console.error(error);process.exitCode=1});
