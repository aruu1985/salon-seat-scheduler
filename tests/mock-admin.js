// Test-only adapter for the existing multi-step delete/trash/audit flow.
// All operations stay in testDocs; external Firebase requests are blocked by the test.
(function(){
 const db=firebase.firestore(),collection=db.collection;
 function make(path){const parts=path.split('/');let result=collection(parts[0]);for(let i=1;i<parts.length;i++)result=i%2?result.doc(parts[i]):result.collection(parts[i]);return wrap(result)}
 function wrap(ref){return {...ref,get parent(){return make(ref.path.split('/').slice(0,-1).join('/'))},collection:n=>wrap(ref.collection(n)),doc:n=>wrap(ref.doc(n)),async add(data){const result=wrap(ref.doc());await result.set(data);return result},async get(options){const snapshot=await ref.get(options);if(snapshot.docs)snapshot.docs=snapshot.docs.map(doc=>({...doc,ref:make(ref.path+'/'+doc.id)}));else snapshot.ref=wrap(ref);return snapshot},async delete(){delete testDocs[ref.path];testRevision++;testWrites.push({path:ref.path,deleted:true});testEmit(ref.path)}}}
 db.collection=n=>wrap(collection(n));
 db.collectionGroup=name=>({async get(){return {docs:Object.entries(testDocs).filter(([path])=>path.split('/').at(-2)===name).map(([path,data])=>({id:path.split('/').pop(),ref:make(path),data:()=>data}))}}});
 db.batch=()=>{const operations=[];return {set(ref,data){operations.push(()=>ref.set(data));return this},delete(ref){operations.push(()=>ref.delete());return this},async commit(){for(const operation of operations)await operation()}}};
})();
firebase.firestore.Timestamp={fromMillis:milliseconds=>({seconds:Math.floor(milliseconds/1000),nanoseconds:(milliseconds%1000)*1000000})};
