const CACHE='memory-card-v8';
const COVER_CACHE='memory-card-covers-v3';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg','./logo-192.png','./logo-512.png','./logo.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>![CACHE,COVER_CACHE].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  const isCover=e.request.destination==='image' && /(upload\.wikimedia\.org|commons\.wikimedia\.org|wikimedia\.org)$/.test(url.hostname);
  if(isCover){
    e.respondWith(caches.open(COVER_CACHE).then(async c=>{
      const hit=await c.match(e.request); if(hit) return hit;
      try{const r=await fetch(e.request); c.put(e.request,r.clone()); return r;}catch(_){return hit;}
    })); return;
  }
  if(url.origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
