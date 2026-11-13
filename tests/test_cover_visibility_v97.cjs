/* v97: local account-scoped artwork visibility, dynamic UI and leak paths.
 * No network, Auth users, Supabase writes or real personal data.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('cover-visibility-v97.js');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const g={id:'game-1',title:'Test game',platform:'PS3',franchise:'Collection',
  coverUrl:'https://example.invalid/cover.jpg',coverSource:'manual-url',
  rating:9,notes:'SECRET NOTE',updatedAt:'2026-11-09T12:00:00Z'};
const snapshot=structuredClone(g),state={settings:{cloudOwnerUid:A},games:[g],
  view:'gameDetail',gameDetailId:g.id};
const esc=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const app=read('app.js'),start=app.indexOf('function coverMarkup('),end=app.indexOf('\nfunction franchiseChip',start);
assert.ok(start>=0&&end>start,'production cover renderer not found');
let externalEnabled=true;
const local=new Map(),events={},toasts=[];let renderCount=0,failStore=false;
const button={
  dataset:{},setAttribute(key,val){this[key]=val;},
  textContent:'',isConnected:true
};
let note=null,created=false;
const actions={
  querySelector(s){return s==='[data-mc-cover-toggle]'&&created?button:null;},
  appendChild(node){if(node!==button)throw Error('unexpected action child');created=true;},
  insertAdjacentElement(where,node){assert.equal(where,'afterend');note=node;}
};
const detail={
  querySelector(s){
    if(s==='.v16-detail-actions')return actions;
    if(s==='[data-mc-cover-visibility-note]')return note;
    return null;
  }
};
const document={
  querySelector(selector){return selector==='.v16-detail'?detail:null;},
  createElement(tag){
    if(tag==='button')return button;
    if(tag==='p')return {dataset:{},className:'',textContent:''};
    throw Error('Unexpected element '+tag);
  },
  addEventListener(name,fn){events[name]=fn;}
};
const window={
  document,
  localStorage:{
    getItem:key=>local.get(key)||null,
    setItem:(key,val)=>{if(failStore)throw Error('quota exceeded');local.set(key,val);}
  },
  MemoryCardCoverRightsV90:{enabled:()=>externalEnabled},
  queueMicrotask() {},
  addEventListener(name,fn){events[name]=fn;}
};
let render=()=>{renderCount++;};
const coverMarkup=new Function('window','safeImage','franchiseHue','platform','esc',
  app.slice(start,end)+'\nreturn coverMarkup;')(
  window,v=>/^https:\/\//.test(String(v))?v:'',()=>30,()=>({abbr:'PS3'}),esc);
const ctx=vm.createContext({window,document,state,render,coverMarkup,setToast:v=>toasts.push(v),
  module:{exports:{}},console});
vm.runInContext(source,ctx,{filename:'cover-visibility-v97.js'});
const api=window.MemoryCardCoverVisibilityV97;
assert.ok(api);
assert.equal(api.isHidden(g),false);
assert.equal(api.isVisible(g),true);
assert.ok(ctx.coverMarkup(g).includes(g.coverUrl));
assert.equal(local.size,0,'initially no user preference is written');
assert.equal(api.keyFor(A,'g1'),JSON.stringify([A,'g1']));
assert.equal(api.keyFor(B,'g1'),JSON.stringify([B,'g1']));
assert.equal(api.keyFor(A,''),'');
assert.equal(api.countFor(A),0);

assert.equal(api.setHiddenFor(A,g.id,true),true);
assert.equal(api.countFor(A),1);
assert.equal(api.isHidden(g),true);
assert.equal(api.isVisible(g),false);
const hiddenHtml=ctx.coverMarkup(g);
assert.ok(!hiddenHtml.includes(g.coverUrl),'hidden game must not expose cover URL in DOM');
assert.ok(!hiddenHtml.includes('<img'),'hidden game should use built-in placeholder');
assert.match(hiddenHtml,/data-mc-cover-hidden="1"/);
assert.equal(api.suppressedContainer({closest:()=>({dataset:{mcCoverHidden:'1'}})}),true);
assert.equal(api.suppressedContainer({closest:()=>null}),false);
assert.deepEqual(g,snapshot,'art visibility must not modify game notes, ratings, URL or timestamp');

ctx.render();
assert.equal(button.textContent,'Показать обложку');
assert.equal(button['aria-pressed'],'true');
assert.match(note.textContent,/игра.*оценка.*заметки/);

const click={
  target:{closest(selector){return selector==='[data-mc-cover-toggle]'?button:null;}},
  preventDefault(){this.prevented=true;},
  stopImmediatePropagation(){this.stopped=true;}
};
events.click(click);
assert.equal(click.prevented,true);assert.equal(click.stopped,true);
assert.equal(api.isHidden(g),false);
assert.equal(button.textContent,'Скрыть обложку');
assert.ok(ctx.coverMarkup(g).includes(g.coverUrl));
assert.ok(toasts.some(t=>t.includes('снова доступна')));
assert.deepEqual(g,snapshot);

api.setHiddenFor(A,g.id,true);
state.settings.cloudOwnerUid=B;
assert.equal(api.isHidden(g),false,'hidden setting cannot cross account boundary');
assert.equal(api.countFor(B),0);
api.setHiddenFor(B,g.id,true);
assert.equal(api.isHidden(g),true);
state.settings.cloudOwnerUid=A;
assert.equal(api.isHidden(g),true);
assert.equal(api.countFor(A),1);
assert.equal(api.countFor(B),1);
api.setHiddenFor(A,g.id,false);
assert.equal(api.isHidden(g),false);
assert.equal(api.isHiddenFor(B,g.id),true);

const previous=local.get(api.storageKey);
failStore=true;
assert.throws(()=>api.setHiddenFor(A,g.id,true),/не сохранил/);
failStore=false;
assert.equal(local.get(api.storageKey),previous);
assert.equal(api.isHiddenFor(A,g.id),false,'storage failure must not create a misleading hidden state');

// Another tab can hide a game while this one is open; storage event reloads
// the account-specific preferences and re-renders the current view.
const stored=JSON.parse(previous);
stored[api.keyFor(A,g.id)]=true;
local.set(api.storageKey,JSON.stringify(stored));
const rendersBefore=renderCount;
events.storage({key:api.storageKey});
assert.equal(api.isHidden(g),true);
assert.ok(renderCount>rendersBefore);
assert.equal(ctx.coverMarkup(g).includes(g.coverUrl),false);

externalEnabled=false;
assert.equal(api.isVisible(g),false);
externalEnabled=true;
api.setHiddenFor(A,g.id,false);
assert.equal(api.isVisible(g),true);

const files=[
 'product-v16.js','product-v17.js','share-card-v66.js',
 'manual-cover-picker-v18.js','cover-refresh-helper.js',
 'switch-cover-helper.js','ps3-cover-helper.js',
 'ps3-wikipedia-cover-helper.js'
];
for(const p of files){
  const value=read(p);
  assert.ok(value.includes('MemoryCardCoverVisibilityV97'),
    p+' lacks per-game suppression guard');
}
const a16=read('product-v16.js');
assert.ok(!a16.includes('window.MemoryCardCoverRightsV90?.enabled()&&g.coverUrl'),
  'direct collection and detail backgrounds must respect per-game hide');
assert.ok(!read('product-v17.js').includes('window.MemoryCardCoverRightsV90?.enabled() && current.coverUrl'),
  'home artwork backdrop must respect per-game hide');
const helper=read('cover-refresh-helper.js');
assert.match(helper,/isHiddenFor\(main\.settings\?\.cloudOwnerUid/);
for(const p of ['switch-cover-helper.js','ps3-cover-helper.js','ps3-wikipedia-cover-helper.js']){
  const v=read(p);
  assert.match(v,/suppressedContainer\(container\)/);
  assert.match(v,/suppressedContainer\(el\)/);
}
const share=read('share-card-v66.js');
assert.match(share,/isVisible\(game\) && game\.coverUrl/);
const picker=read('manual-cover-picker-v18.js');
assert.match(picker,/isHidden\(game\).*Сначала включи показ обложки/);
const index=read('index.html'),sw=read('sw.js'),updater=read('pwa-updates-v66.js');
assert.ok(Number(sw.match(/const VERSION=(\d+);/)?.[1])>=97,'v97 cover privacy must remain active in newer PWA releases');
assert.ok(Number(updater.match(/const BUILD\s*=\s*(\d+);/)?.[1])>=97,'updater must support v97 or later');
assert.ok(index.includes('cover-visibility-v97.js?v=97'));
assert.ok(sw.includes('"./cover-visibility-v97.js?v=97"'));
assert.ok(index.indexOf('device-health-v96.js?v=96')<index.indexOf('cover-visibility-v97.js?v=97'),
  'policy must wrap the final runtime renderer');
assert.deepEqual(g,snapshot);
console.log('v97 PASS: local scoped hide/show, no image DOM, direct backgrounds, PNG, resolvers, storage failures and account switching');
