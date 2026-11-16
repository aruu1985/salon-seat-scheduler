/* Retirement of the old offline shell: never combine cached and network assets.
   Hash-named release assets handle caching; Firestore owns data persistence. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('salon-seat-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method==='GET'&&new URL(event.request.url).origin===self.location.origin){
  event.respondWith(fetch(event.request,{cache:'no-store'}));
 }
});
