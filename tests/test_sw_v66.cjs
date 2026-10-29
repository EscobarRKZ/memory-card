// Deterministic worker event/cache tests. Not a live service-worker registration.
const {readFileSync}=require('node:fs');
const vm=require('node:vm');const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8');
const handlers={},storage=new Map(),removed=[],network=[];let skip=0,claims=0;
const origin='https://memory-card.test';
const key=req=>typeof req==='string'?new URL(req,origin+'/').href:req.url;
const makeCache=name=>{
 if(!storage.has(name))storage.set(name,new Map());
 const data=storage.get(name);
 return {addAll:async requests=>{for(const r of requests){assert.equal(r.cache,'reload');data.set(key(r),new Response('asset'))}},match:async req=>data.get(key(req))?.clone(),put:async(req,res)=>{data.set(key(req),res)}};
};
const caches={open:async name=>makeCache(name),keys:async()=>[...storage.keys()],delete:async name=>{removed.push(name);return storage.delete(name)},match:async req=>{for(const m of storage.values()){const hit=m.get(key(req));if(hit)return hit.clone()}}};
class ScopedRequest extends Request{constructor(url,options){super(new URL(url,origin+'/'),options)}}
const self={location:{origin},clients:{claim:async()=>{claims++}},skipWaiting:async()=>{skip++},addEventListener:(type,fn)=>handlers[type]=fn};
let fail=false;
const fetch=async(req,options)=>{network.push({url:req.url,options});if(fail)throw Error('offline');return new Response('network')};
vm.runInNewContext(source,{self,caches,fetch,URL,Request:ScopedRequest,Response,Set,Promise});
const event=base=>Object.assign({promises:[],waitUntil(p){this.promises.push(p)},respondWith(p){this.response=p}},base);
(async()=>{
 const install=event({});handlers.install(install);await Promise.all(install.promises);assert.equal(skip,0);
 await caches.open('memory-card-v65-visual-polish');await caches.open('memory-card-v64-vr-desktop-platform');await caches.open('memory-card-v67-future-waiting');await caches.open('another-app');await caches.open('memory-card-covers-v14');
 const activate=event({});handlers.activate(activate);await Promise.all(activate.promises);
 assert.equal(claims,1);assert.deepEqual(removed,['memory-card-v64-vr-desktop-platform']);
 const message=event({data:{type:'MC_SKIP_WAITING'}});handlers.message(message);await Promise.all(message.promises);assert.equal(skip,1);
 const run=async(url,mode='cors')=>{
  const e=event({request:{url:origin+url,method:'GET',mode,destination:url.endsWith('.png')?'image':'script'}});
  handlers.fetch(e);const result=await e.response;await Promise.all(e.promises);return result;
 };
 let response=await run('/experience-v66.js?v=66');assert.equal(await response.text(),'asset');assert.equal(network.length,0);
 response=await run('/index.html','navigate');assert.equal(await response.text(),'network');assert.equal(network[0].options.cache,'no-cache');
 fail=true;response=await run('/missing.js');assert.equal(response.type,'error');
 response=await run('/some-route','navigate');assert.equal(await response.text(),'network');
 console.log(JSON.stringify({activation:'explicit only',previousCacheRetained:true,futureCacheRetained:true,unrelatedCacheRetained:true,htmlFallback:'navigation only',assetCache:'versioned',installBypassesHttpCache:true}));
})().catch(err=>{console.error(err);process.exit(1)});
