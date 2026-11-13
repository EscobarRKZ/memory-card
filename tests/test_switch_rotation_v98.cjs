/* Memory Card v98: Nintendo Switch belongs to a user-chosen rotation.
 * Exercises production migration, owned-platform filtering and change handler
 * in an isolated JS VM. Never touches real browser data or Supabase users.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const load=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=load('app.js'),profile=load('profile-core.js'),onboarding=load('onboarding-v20.js');
function slice(src,start,end,label){
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing '+label+' production source');
  return src.slice(a,b);
}
const context=vm.createContext({
  state:{settings:{switchGroup:'desktop'},games:[{id:'g-switch',title:'My Switch game',platform:'SWITCH',notes:'Personal note',rating:'9'}]},
  window:{},
  Date,
  console,
  nowIso:()=>new Date('2026-11-13T12:00:00.000Z').toISOString(),
  saves:0,renders:0,syncs:0,toasts:[],saveFails:false
});
context.persist=async()=>{context.saves++;if(context.saveFails)throw Error('Quota');};
context.render=()=>{context.renders++;};
context.scheduleAutoSync=()=>{context.syncs++;};
context.setToast=s=>context.toasts.push(s);
vm.runInContext(slice(app,'const PLATFORMS = [','const CATALOG_SEED =','platform catalog'),context);
vm.runInContext(slice(app,'const DEFAULT_SETTINGS = {','let state = {','defaults'),context);
vm.runInContext(slice(app,'function platformGroupFor(','function esc(','platform classification'),context);
vm.runInContext(slice(app,'function normalizeRotation(','function migrateGame(','core settings migrations'),context);
vm.runInContext('const legacyOwned=PLATFORMS.map(p=>p.id);',context);
vm.runInContext(slice(profile,'  normalizeRotation = function(ids, group, switchGroup','  const baseIcon','profile owned-platform migration'),context);
context.mcOwnedPlatforms=(...args)=>context.window.mcOwnedPlatforms(...args);
vm.runInContext('const VERSION=1;\n'+slice(onboarding,'  const baseMigrateSettings = migrateSettings;','  function pending()','onboarding migration'),context);
vm.runInContext(slice(app,'async function changeSwitchGroup(','async function moveRotation(','Switch action'),context);

const make=raw=>context.migrateSettings(raw);
const gameSnapshot=JSON.stringify(context.state.games);
const base=make({
  switchGroup:'desktop',
  ownedPlatforms:['PSP','VITA','PS3','WIIU','SWITCH'],
  handheldRotation:['VITA','PSP'],
  desktopRotation:['WIIU','SWITCH','PS3'],
  currentHandheld:'VITA',currentDesktop:'SWITCH',
  onboardingVersion:1,onboardingCompleted:true,
  settingsUpdatedAt:'2026-11-11T12:00:00.000Z'
});
context.state.settings=base;
assert.equal(context.platform('SWITCH').group,'desktop');
assert.equal(context.platformGroupFor('SWITCH','handheld'),'handheld');
assert.equal(context.platformGroupFor('SWITCH','desktop'),'desktop');
assert.equal(context.platformGroupFor('PS3','handheld'),'desktop');
assert.equal(context.platform('PSP').group,'handheld');
assert.ok(context.window.mcOwnedPlatforms('desktop').includes('SWITCH'));
assert.ok(!context.window.mcOwnedPlatforms('handheld').includes('SWITCH'));
assert.ok(context.rotationFor('desktop').includes('SWITCH'));
assert.ok(!context.rotationFor('handheld').includes('SWITCH'));

// The production migrations must use the incoming account's switchGroup,
// not whatever account happens to be active in this tab already.
const remote=make({
  ...base,switchGroup:'handheld',
  handheldRotation:['VITA','PSP','SWITCH'],
  desktopRotation:['WIIU','PS3'],
  currentDesktop:'PS3'
});
assert.equal(remote.switchGroup,'handheld');
assert.equal(remote.handheldRotation.includes('SWITCH'),true);
assert.equal(remote.desktopRotation.includes('SWITCH'),false);
assert.equal(remote.currentDesktop,'PS3');
assert.equal(context.platform('SWITCH').group,'desktop','migration cannot modify a different active account');

(async()=>{
  const moved=await context.changeSwitchGroup('handheld');
  assert.equal(moved,true);
  assert.equal(context.state.settings.switchGroup,'handheld');
  assert.equal(context.platform('SWITCH').group,'handheld');
  assert.ok(context.window.mcOwnedPlatforms('handheld').includes('SWITCH'));
  assert.ok(!context.window.mcOwnedPlatforms('desktop').includes('SWITCH'));
  assert.equal(context.rotationFor('handheld').filter(x=>x==='SWITCH').length,1);
  assert.equal(context.rotationFor('desktop').includes('SWITCH'),false);
  assert.equal(context.state.settings.currentHandheld,'VITA','unrelated current rotation remains selected');
  assert.equal(context.state.settings.currentDesktop,'WIIU','old Switch current selection falls back safely');
  assert.equal(context.saves,1);
  assert.equal(context.renders,1);
  assert.equal(context.syncs,1);
  assert.match(context.toasts.at(-1),/портативной ротации/);
  assert.equal(JSON.stringify(context.state.games),gameSnapshot,'game progress/ratings are unchanged');

  const noChange=await context.changeSwitchGroup('handheld');
  assert.equal(noChange,false);
  assert.equal(context.saves,1);

  const restored=await context.changeSwitchGroup('desktop');
  assert.equal(restored,true);
  assert.equal(context.platform('SWITCH').group,'desktop');
  assert.equal(context.state.settings.desktopRotation.filter(x=>x==='SWITCH').length,1);
  assert.equal(context.state.settings.handheldRotation.includes('SWITCH'),false);
  assert.equal(JSON.stringify(context.state.games),gameSnapshot);
  assert.equal(context.saves,2);

  assert.equal((await context.changeSwitchGroup('invalid-group')),false,'invalid values must do nothing');
  assert.equal(context.saves,2);

  const saved=JSON.stringify(context.state.settings),saveCount=context.saves,syncs=context.syncs;
  context.saveFails=true;
  assert.equal(await context.changeSwitchGroup('handheld'),false,'failed save must not claim a move');
  assert.equal(JSON.stringify(context.state.settings),saved,'failed write rolls local settings back');
  assert.equal(context.saves,saveCount+1);
  assert.equal(context.syncs,syncs,'failed write must not schedule cloud sync');
  assert.match(context.toasts.at(-1),/Не удалось сохранить/);
  assert.equal(JSON.stringify(context.state.games),gameSnapshot);

  const corrupt=make({...base,switchGroup:'invalid'});
  assert.equal(corrupt.switchGroup,'desktop','unknown legacy value defaults to desktop');

  // Onboarding migration retains the chosen group, including device lists.
  const onboardingSelection=make({
    ...remote,ownedPlatforms:['SWITCH','PS3'],handheldRotation:['SWITCH'],
    desktopRotation:['PS3'],currentHandheld:'SWITCH',currentDesktop:'PS3',
    onboardingVersion:1,onboardingCompleted:true
  });
  assert.deepEqual(Array.from(onboardingSelection.handheldRotation),['SWITCH']);
  assert.deepEqual(Array.from(onboardingSelection.desktopRotation),['PS3']);

  const idx=load('index.html'),sw=load('sw.js'),updates=load('pwa-updates-v66.js');
  const other=load('settings-dashboard-v18.js'),stat=load('product-v14.js'),b=load('backend-v2.js');
  const pc=load('profile-core.js');
  assert.match(app,/data-action="switch-group"/);
  assert.match(app,/data-switch-group="handheld"/);
  assert.match(app,/data-switch-group="desktop"/);
  assert.match(other,/\.switch-group-panel.*rotation/);
  assert.match(stat,/platformGroupFor\(p.id,state.settings\?\.switchGroup\)/);
  assert.match(pc,/switchGroup:state.settings.switchGroup/,'profile sync carries placement to other devices');
  assert.ok(!/['"]switchGroup['"]/.test((b.match(/for\(const key of \[.*?\]\) delete out\[key\]/s)||[])[0]||''),'cloud writer must not drop the switch placement');
  assert.match(idx,/switch-group-v98\.css\?v=98/);
  assert.match(idx,/app\.js\?v=98/);
  assert.match(idx,/profile-core\.js\?v=98/);
  assert.match(idx,/onboarding-v20\.js\?v=98/);
  assert.match(idx,/settings-dashboard-v18\.js\?v=98/);
  assert.match(sw,/const VERSION=98;/);
  assert.match(updates,/const BUILD = 98;/);
  assert.ok(sw.includes('"./switch-group-v98.css?v=98"'));
  console.log('v98 PASS: Switch portable/desktop grouping, rotations, account migration, rollback, onboarding and synced settings');
})().catch(err=>{console.error(err);process.exitCode=1;});
