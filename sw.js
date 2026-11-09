const VERSION=92;
const CACHE='memory-card-v92-backup-safety';
const COVER_CACHE='memory-card-covers-v14';
const ASSETS=["./mobile-card-layout-v74.css?v=74","./","./index.html","./delete-account.html","./account-deletion-page-v84.css?v=85","./local-delete-cleanup-v85.js?v=85","./account-deletion-page-v84.js?v=85","./manifest.webmanifest","./logo-192.png","./styles.css","./mobile.css","./cover-fixes.css","./ui-enhancements.css?v=61","./universal-title-search-v62.css","./profile-social.css?v=88","./product-v13.css","./product-v14.css","./product-v16.css","./product-v17.css","./theme-unified-v18.css","./collection-card-badges-v18.css","./manual-cover-picker-v18.css","./settings-dashboard-v18.css","./onboarding-v20.css","./backend-v2.css?v=84","./backlog-v23.css?v=73","./playing-detail-actions-v24.css","./mobile-nav-v21.css?v=77","./game-card-fixes-v25.css?v=27","./library-ux-v63.css?v=64","./visual-polish-v65.css?v=65","./experience-v66.css?v=75","./title-search-helper.js?v=76","./switch-cover-helper.js?v=90","./ps3-cover-helper.js?v=90","./ps3-wikipedia-cover-helper.js?v=90","./ui-enhancements.js?v=61","./catalog-refresh-helper.js?v=64","./modal-draft-helper.js","./app.js?v=92","./cover-sources.js?v=64","./profile-core.js?v=81","./onboarding-v20.js","./friends-supabase-v2.js?v=88","./cover-refresh-helper.js?v=90","./product-v13.js?v=60","./mutation-stability-guard.js","./product-v14.js","./achievements-v16.js","./product-v16.js?v=90","./product-v17.js?v=90","./manual-cover-picker-v18.js?v=90","./collection-card-badges-v18.js?v=74","./settings-dashboard-v18.js?v=90","./catalog-dashboard-runtime-v18.js","./theme-core-v19.js","./backend-config.js","./cloud-transfer-v80.js?v=80","./cloud-conflicts-v81.js?v=82","./account-vault-v83.js?v=83","./account-deletion-v84.js?v=85","./auth-messages-v89.js?v=89","./backend-v2.js?v=89","./rotation-consistency-v21.js","./game-detail-history-v22.js","./backlog-v23.js?v=73","./mobile-nav-v21.js?v=77","./mobile-search-v24.js","./playing-detail-actions-v24.js","./game-card-fixes-v25.js?v=26","./universal-title-search-v62.js","./library-ux-v63.js?v=74","./experience-v66.js?v=90","./share-card-v66.js?v=90","./pwa-updates-v66.js?v=92","./icon.svg","./logo-512.png","./logo.png","./memory-delight-v67.css?v=70","./memory-delight-v67.js?v=70","./memory-companion-v68.css?v=68","./library-context-v69.css?v=76","./memory-companion-v68.js?v=68","./tactile-v78.css?v=78","./quick-actions-v78.css?v=79","./tactile-v78.js?v=78","./quick-actions-v78.js?v=79","./cover-rights-v90.js?v=90","./cover-rights-v90.css?v=90","./privacy.html","./backup-safety-v92.js?v=92","./backup-center-v92.css?v=92"];
// First install activates normally. Later versions wait for the user's Update click.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('message',event=>{
  if(event.data?.type==='MC_SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if(event.data?.type==='MC_GET_VERSION') event.ports[0]?.postMessage({version:VERSION});
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  const versions=keys.filter(key=>/^memory-card-v\d+-/.test(key))
    .sort((a,b)=>Number(b.match(/-v(\d+)-/)[1])-Number(a.match(/-v(\d+)-/)[1]));
  const previous=versions.filter(key=>Number(key.match(/-v(\d+)-/)[1])<VERSION).slice(0,1);
  const keep=new Set([CACHE,...previous,...versions.filter(key=>Number(key.match(/-v(\d+)-/)[1])>VERSION)]);
  // Keep one previous release for tabs still running old code. Never remove other apps' caches.
  await Promise.all(versions.filter(key=>!keep.has(key)).map(key=>caches.delete(key)));
  // Drop only Memory Card's own legacy cache of third-party cover bytes.
  await caches.delete(COVER_CACHE);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const versioned=/\.(js|css)$/.test(url.pathname)&&url.searchParams.has('v');
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(versioned){const hit=await cache.match(event.request);if(hit)return hit;}
    try{
      const response=await fetch(event.request,event.request.mode==='navigate'?{cache:'no-cache'}:{});
      if(response.ok)event.waitUntil(cache.put(event.request,response.clone()).catch(()=>{}));
      return response;
    }catch(_){
      const hit=await caches.match(event.request);if(hit)return hit;
      // Do not impersonate the account-deletion or privacy page with the app.
      // Only known routes may use a cached document when the network is down.
      if(event.request.mode==='navigate'){
        const name=url.pathname.split('/').pop();
        if(name==='delete-account.html')return (await cache.match('./delete-account.html'))||Response.error();
        if(name==='privacy.html')return (await cache.match('./privacy.html'))||Response.error();
        if(name===''||name==='index.html')return (await cache.match('./index.html'))||Response.error();
      }
      return Response.error();
    }
  })());
});
