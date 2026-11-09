/* Memory Card v90: offline cover-rights safety tests. No external images are requested. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const settings=new Map(),events={},deleted=[];let renders=0;
const window={
 localStorage:{getItem:k=>settings.get(k)||null,setItem:(k,v)=>settings.set(k,v)},
 caches:{delete:async k=>{deleted.push(k);return true}},
 document:{addEventListener:(name,fn)=>{events[name]=fn}},
 addEventListener:(name,fn)=>{events[name]=fn},
 render:()=>{renders++}
};
const context=vm.createContext({window,Promise,module:{exports:{}}});
vm.runInContext(read('cover-rights-v90.js'),context,{filename:'cover-rights-v90.js'});
const policy=window.MemoryCardCoverRightsV90;
assert.ok(policy&&!policy.enabled(),'third-party art must default off');
assert.equal(settings.has(policy.storageKey),false);
assert.match(policy.describe('libretro:Sony_-_PlayStation','https://raw.githubusercontent.com/a.png'),/Libretro Thumbnails.*права.*не подтверждены/);
assert.match(policy.describe('gametdb-switch:ABCD','https://art.gametdb.com/switch/cover/EN/ABCD.jpg'),/GameTDB/);
assert.match(policy.describe('manual-url','https://example.invalid/img.png'),/Ссылка пользователя/);
const g={title:'Test game',coverUrl:'https://example.invalid/cover.png',coverSource:'manual-url',franchise:'',platform:'PS3'};
const initialUrl=g.coverUrl;
const app=read('app.js'),start=app.indexOf('function coverMarkup('),end=app.indexOf('\nfunction franchiseChip',start);
assert.ok(start>=0&&end>start);
const esc=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const cover=new Function('window','safeImage','franchiseHue','platform','esc',
 app.slice(start,end)+'\nreturn coverMarkup;')(
 window,s=>/^https:\/\//.test(s)?s:'',()=>20,()=>({abbr:'PS3'}),esc);
assert.ok(!cover(g).includes('<img'), 'disabled art should render a placeholder');
assert.ok(!cover(g).includes(g.coverUrl), 'disabled art must not put URL in DOM');
policy.setEnabled(true);
assert.equal(settings.get(policy.storageKey),'enabled');
assert.ok(cover(g).includes(g.coverUrl),'enabled art should use saved URL');
policy.setEnabled(false);
assert.equal(settings.get(policy.storageKey),'disabled');
assert.equal(g.coverUrl,initialUrl,'toggling must not erase game metadata');
assert.ok(!cover(g).includes('<img'));
assert.deepEqual(deleted,['memory-card-covers-v14']);
assert.equal(typeof events.change,'function');
events.change({target:{closest:q=>q==='[data-mc-external-covers]'?{checked:true}:null}});
assert.equal(policy.enabled(),true);
assert.equal(renders,1);
events.storage({key:policy.storageKey,newValue:'disabled'});
assert.equal(policy.enabled(),false);
assert.equal(renders,2);
const index=read('index.html');
const appScript=index.match(/\.\/app\.js\?v=\d+/)?.[0];
assert.ok(appScript&&index.indexOf('./cover-rights-v90.js?v=90')<index.indexOf(appScript),'cover policy must load before the current app entrypoint');
assert.match(index,/cover-rights-v90.css\?v=90/);
assert.match(read('settings-dashboard-v18.js'),/data-mc-external-covers/);
for(const p of [
 'manual-cover-picker-v18.js','cover-refresh-helper.js','switch-cover-helper.js',
 'ps3-cover-helper.js','ps3-wikipedia-cover-helper.js','experience-v66.js',
 'product-v16.js','product-v17.js','share-card-v66.js'
])assert.ok(
  read(p).includes('window.MemoryCardCoverRightsV90?.enabled()') ||
  read(p).includes('window.MemoryCardCoverVisibilityV97?.isVisible('),
  'unguarded artwork path: '+p
);
const share=read('share-card-v66.js');
assert.ok(!share.includes('image:cover(game.coverUrl)'),'PNG preview cannot eagerly download art');
assert.ok(!share.includes('data-share-art checked'),'public share art opt-in required');
const sw=read('sw.js');
assert.ok(!sw.includes("event.request.destination==='image'"),'do not intercept cross-origin image requests');
assert.ok(sw.includes('await caches.delete(COVER_CACHE)'),'old artwork cache should be purged on activation');
console.log('v90 PASS: safe default, saved URLs, no external image DOM, guarded resolvers and cache cleanup');
