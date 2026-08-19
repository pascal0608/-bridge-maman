const CACHE='bridge-sef-v31';
const ASSETS=['./','index.html','styles-v31.css','app-v31.js','manifest.webmanifest'];
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c));return r;})
      .catch(()=>caches.match(req).then(r=>r||caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(resp=>{const c=resp.clone();caches.open(CACHE).then(x=>x.put(req,c));return resp;})));
});
