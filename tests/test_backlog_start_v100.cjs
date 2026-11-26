/* v100: isolated tests for the production Backlog transition, no accounts/network. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const product=load('product-v16.js');
const begin=product.indexOf('let startingBacklog=false;'),end=product.indexOf('async function removeBacklog',begin);
assert.ok(begin>=0&&end>begin,'production Backlog handler must exist');
const source=product.slice(begin,end);
function fixture({fail=false,excluded=false,disabled=false}={}){
  const settings={currentDesktop:'PS5',currentHandheld:'3DS',settingsUpdatedAt:'old',language:'ru'};
  const original={id:'g1',title:'Game',status:'backlog',platform:'PS4',rating:'7',notes:'note',coverUrl:'cover',addedAt:'old-date',updatedAt:'old',replay:1};
  const state={games:[{...original},{id:'completed',status:'completed'}],settings,modal:{type:'game'},view:'backlog'};
  let writes=0,syncs=0,navs=0,toasts=[];
  const start=new Function('state','platform','currentSettingKey','nowIso','mcRotationEnabled','rotationFor','setCurrentPlatform','persist','scheduleAutoSync','navigate','setToast','console',source+';return startBacklog;')(
    state,()=>({group:'desktop'}),()=> 'currentDesktop',()=> 'new',()=>!disabled,
    ()=>excluded?['PS5']:['PS5','PS4'],id=>{settings.currentDesktop=id;},
    async()=>{writes++;if(fail)throw Error('quota');},()=>syncs++,
    view=>{navs++;state.view=view;},(msg,options)=>toasts.push({msg,options}),{error:()=>{}});
  return {state,original,start,metrics:()=>({writes,syncs,navs,toasts})};
}
(async()=>{
  const a=fixture();
  await Promise.all([a.start('g1'),a.start('g1')]);
  assert.deepEqual(a.state.games[0],{...a.original,status:'playing',updatedAt:'new'});
  assert.equal(a.state.settings.currentDesktop,'PS4');
  assert.equal(a.state.settings.currentHandheld,'3DS');
  assert.equal(a.state.settings.settingsUpdatedAt,'new');
  assert.equal(a.state.view,'playing');
  assert.equal(a.state.modal,null);
  assert.equal(a.metrics().writes,1);
  assert.equal(a.metrics().syncs,1);
  assert.equal(a.metrics().navs,1);
  assert.equal(a.metrics().toasts[0].options.render,false);
  const b=fixture({fail:true});
  await b.start('g1');
  assert.deepEqual(b.state.games[0],b.original);
  assert.equal(b.state.settings.currentDesktop,'PS5');
  assert.equal(b.state.settings.settingsUpdatedAt,'old');
  assert.equal(b.metrics().syncs,0);
  assert.equal(b.metrics().navs,0);
  assert.equal(b.state.view,'backlog');
  for(const mode of [{excluded:true},{disabled:true}]){
    const c=fixture(mode);
    await c.start('g1');
    assert.equal(c.state.games[0].status,'playing');
    assert.equal(c.state.settings.currentDesktop,'PS5');
    assert.equal(c.state.settings.settingsUpdatedAt,'old');
  }
  const d=fixture();
  await d.start('completed');
  assert.equal(d.metrics().writes,0);
  assert.ok(load('app.js').includes('data-v16-backlog-start'));
  assert.ok(load('memory-delight-v67.js').includes('options.render === false'));
  assert.ok(load('index.html').includes('mobile-fluidity-v100.css?v=100'));
  assert.ok(load('sw.js').includes('mobile-fluidity-v100.css?v=100'));
  console.log('v100 Backlog PASS: same record, rotation, no duplicates, single navigation, failure rollback, excluded/disabled rotation and PWA assets');
})().catch(error=>{console.error(error);process.exitCode=1;});
