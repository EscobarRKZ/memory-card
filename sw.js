const CACHE='memory-card-v28-vita-drafts';
const COVER_CACHE='memory-card-covers-v13';
const ASSETS=['./','./index.html','./styles.css','./mobile.css','./cover-fixes.css','./ui-enhancements.css','./title-search-helper.js','./switch-cover-helper.js','./ps3-cover-helper.js','./ps3-wikipedia-cover-helper.js','./ui-enhancements.js','./catalog-refresh-helper.js','./cover-refresh-helper.js','./modal-draft-helper.js','./app.js','./manifest.webmanifest','./icon.svg','./logo-192.png','./logo-512.png','./logo.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>![CACHE,COVER_CACHE].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  const isCover=e.request.destination==='image' && /(upload\.wikimedia\.org|commons\.wikimedia\.org|wikimedia\.org|raw\.githubusercontent\.com|art\.gametdb\.com|images\.weserv\.nl)$/.test(url.hostname);
  if(isCover){
    e.respondWith(caches.open(COVER_CACHE).then(async c=>{
      const hit=await c.match(e.request);
      if(hit && hit.ok) return hit;
      try{
        const r=await fetch(e.request);
        if(r.ok) await c.put(e.request,r.clone());
        return r;
      }catch(_){
        return hit && hit.ok ? hit : Response.error();
      }
    })); return;
  }
  if(url.origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
