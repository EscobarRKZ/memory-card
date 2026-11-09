/* Memory Card v92: offline regression for account-bound archives & safe imports.
 * Does not create Auth users, delete data or connect to Supabase.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const backup=require('../backup-safety-v92.js');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const a={id:'game-a',title:'Original',platform:'PS5',status:'completed',updatedAt:'2026-01-01',notes:'Private'};
const duplicate={...a,title:'Malicious overwrite',updatedAt:'2035-12-12'};
const b={id:'game-b',title:'New game',platform:'3DS',status:'playing',updatedAt:'2026-02-01'};
const backupA={version:92,ownerUid:A,games:[duplicate,b],settings:{cloudOwnerUid:A,syncSecret:'DO-NOT-IMPORT',userId:'FOREIGN',theme:'light'}};
const planned=backup.prepareImport(backupA,[a],A);
assert.equal(planned.added,1);assert.equal(planned.skipped,1);
assert.equal(planned.games[0].title,'Original');
assert.equal(planned.games[1].title,'New game');
assert.equal(a.title,'Original','pure planner must not mutate existing rows');
assert.throws(()=>backup.prepareImport({...backupA,ownerUid:B,settings:{cloudOwnerUid:B}},[a],A),/другому аккаунту/);
assert.throws(()=>backup.prepareImport({...backupA,ownerUid:B},[a],A),/противоречивые/);
assert.throws(()=>backup.prepareImport({...backupA,games:[a,a]},[],A),/повторяющийся ID/);
assert.throws(()=>backup.prepareImport({...backupA,games:[{...b,id:'x" onclick="alert(1)'}]},[],A),/Неверные поля/);
assert.throws(()=>backup.prepareImport({...backupA,games:[{...b,platform:'PS5" onmouseover="bad'}]},[],A),/Неверные поля/);
assert.throws(()=>backup.prepareImport({...backupA,games:[{...b,releaseYear:'<script>'}]},[],A),/Неверные поля/);
assert.throws(()=>backup.prepareImport({ownerUid:A,settings:{cloudOwnerUid:A},games:Array(50001).fill(b)},[],A),/слишком много записей/);
assert.throws(()=>backup.validateFileSize(40*1024*1024+1),/слишком большой/);
assert.equal(backup.validateFileSize(1024),true);
const unowned=backup.prepareImport({version:11,games:[b],settings:{syncSecret:'old'}},[a],A);
assert.equal(unowned.unowned,true);
const ownSnapshot={id:'snap-A',createdAt:'2026-01-02T00:00:00Z',reason:'manual',games:[b],
  settings:{cloudOwnerUid:A,userId:'MC-AAAA-1111',syncSecret:'private'}};
assert.equal(backup.prepareRestore(ownSnapshot,A,1).count,1);
assert.throws(()=>backup.prepareRestore(ownSnapshot,B,1),/другому аккаунту/);
assert.throws(()=>backup.prepareRestore({...ownSnapshot,settings:{userId:'MC-AAAA-1111'}},A,1),/подтвердить владельца/);
assert.throws(()=>backup.prepareRestore({...ownSnapshot,games:[]},A,1),/Пустую копию/);
const exported=backup.exportPayload([a],{cloudOwnerUid:A,userId:'MC-AAAA-1111',
  syncSecret:'secret',sheetEndpoint:'https://private.example',authToken:'BEARER',
  cloudSyncBaselineV81:{secret:'tokens'},theme:'light',collections:[{id:'favs',gameIds:['game-a']}]},A);
assert.equal(exported.format,'memory-card-library');
assert.equal(exported.ownerUid,A);
assert.equal(exported.settings.theme,'light');
assert.equal(exported.settings.collections[0].gameIds[0],'game-a');
for(const key of ['userId','cloudOwnerUid','syncSecret','sheetEndpoint','authToken','cloudSyncBaselineV81'])
 assert.equal(exported.settings[key],undefined,'export must strip '+key);
assert.deepEqual(backup.prepareImport(exported,[],A).games,[a]);

// Execute the production import function with isolated fakes.
function extract(startToken,endToken,params,name){
 const start=src.indexOf(startToken),end=src.indexOf(endToken,start);
 assert.ok(start>=0&&end>start,'function block missing: '+name);
 return new Function(...params,src.slice(start,end)+'\nreturn '+name+';');
}
let state={games:[{...a}],settings:{cloudOwnerUid:A,userId:'MC-AAAA-1111',
  cloudSyncBaselineV81:{owner:A,records:{}},syncSecret:'KEEP',theme:'dark'}};
const toasts=[],alerts=[],prompts=[];let snapshots=0,writes=0,renders=0,shouldFail=false;
const importFn=extract('async function importData(e) {',"\ndocument.addEventListener('visibilitychange'",
 ['state','window','confirm','setToast','alert','createLocalSnapshot','migrateGame','persist','render'],'importData')(
 state,{MemoryCardBackupSafetyV92:backup},
 question=>{prompts.push(question);return true;},
 msg=>toasts.push(msg),msg=>alerts.push(msg),
 async()=>{snapshots++;},
 game=>game,
 async()=>{writes++;if(shouldFail)throw Error('quota exceeded');},
 ()=>{renders++}
);
const file=payload=>({size:JSON.stringify(payload).length,text:async()=>JSON.stringify(payload)});
const event=payload=>({target:{files:[file(payload)],value:'selected'}});
(async()=>{
 await importFn(event(backupA));
 assert.equal(state.games.length,2);assert.equal(state.games[0].title,'Original');
 assert.equal(state.games[1].title,'New game');
 assert.equal(state.settings.cloudOwnerUid,A);
 assert.equal(state.settings.syncSecret,'KEEP');
 assert.equal(state.settings.theme,'dark','JSON imports never overwrite user preferences');
 assert.equal(snapshots,1);assert.equal(writes,1);assert.equal(renders,1);
 assert.ok(prompts[0].includes('Совпадающие ID (1)'));
 const prev=[...state.games];
 await importFn(event({...backupA,ownerUid:B,settings:{cloudOwnerUid:B}}));
 assert.deepEqual(state.games,prev);assert.equal(snapshots,1);assert.equal(writes,1);
 assert.ok(alerts.some(x=>x.includes('другому аккаунту')));
 await importFn(event(backupA));
 assert.equal(snapshots,1,'duplicate-only import must not create an unnecessary snapshot');
 shouldFail=true;
 await importFn(event({...backupA,games:[{...b,id:'game-c'}]}));
 assert.equal(snapshots,2);assert.equal(writes,2);
 assert.deepEqual(state.games,prev,'failed save must roll back in-memory imports');
 assert.ok(toasts.some(x=>x.includes('Добавлено 1 игр')));

 // Exercise the production restoration function without real IndexedDB.
 const restoredSnapshot={...ownSnapshot};
 const snapshotsData=[restoredSnapshot];let restoreWrites=0,restoreSnapshots=0,restoreRenders=0;
 const restoreState={games:[{...a}],settings:{cloudOwnerUid:A,userId:'MC-AAAA-1111',
   cloudSyncBaselineV81:{owner:A,records:{'game-a':{revision:'x'}}}}};
 const restoreFn=extract('async function restoreLocalBackupById(snapshotId){',
 '\nasync function restoreLatestSnapshot()',[
 'state','window','readLocalBackupRecords','createLocalSnapshot','persist','render','setToast','confirm','migrateGame'
 ],'restoreLocalBackupById')(
 restoreState,{MemoryCardBackupSafetyV92:backup},
 async()=>snapshotsData,async()=>{restoreSnapshots++;},
 async()=>{restoreWrites++;},()=>{restoreRenders++;},()=>{},()=>true,
 game=>game
 );
 await restoreFn('snap-A');
 assert.equal(restoreState.games.length,1);
 assert.equal(restoreState.games[0].id,'game-b');
 assert.equal(restoreState.settings.cloudOwnerUid,A);
 assert.ok(restoreState.settings.cloudSyncBaselineV81.records['game-a'],
   'restore must not import old cloud revision tracking or account settings');
 assert.equal(restoreSnapshots,1);assert.equal(restoreWrites,1);assert.equal(restoreRenders,1);
 restoreState.games=[{...a}];restoreState.settings.cloudOwnerUid=B;
 await assert.rejects(restoreFn('snap-A'),/другому аккаунту/);
 assert.equal(restoreSnapshots,1,'foreign backup must be blocked before a write');

 // Snapshot write must preserve existing entries and abort if the active main UID differs.
 const objects=new Map([['main',{games:[a],settings:{cloudOwnerUid:A}}],
  ['sync-backups-v1:'+A,[{...ownSnapshot}]]]);
 function dbOpen(){return Promise.resolve({
  close(){},
  transaction(_name,mode){
   const staged=new Map(objects);
   let finished=false;
   const tx={error:null,oncomplete:null,onerror:null,onabort:null,
     abort(){if(finished)return;finished=true;queueMicrotask(()=>this.onabort?.());}};
   const complete=()=>{
     if(finished)return;finished=true;
     queueMicrotask(()=>{if(mode==='readwrite'){
       objects.clear();for(const [k,v] of staged)objects.set(k,v);}
       tx.oncomplete?.();
     });
   };
   const store={
     get(key){const req={};queueMicrotask(()=>{
       if(finished)return;req.result=staged.get(key);req.onsuccess?.();
     });return req;},
     put(value,key){staged.set(key,structuredClone(value));queueMicrotask(complete);}
   };
   tx.objectStore=()=>store;
   return tx;
  }
 });}
 const stateForSnapshot={games:[a],settings:{cloudOwnerUid:A}};
 const snapshotFn=extract("async function createLocalSnapshot(reason = 'manual') {",
 "\nasync function readLocalBackupRecords()",[
 'state','BACKUP_KEY','KEY','STORE','MAX_LOCAL_BACKUPS','uid','nowIso','clonePlain','dbOpen'
 ],'createLocalSnapshot')(
 stateForSnapshot,'sync-backups-v1','main','state',10,
 ()=> 'snap-created',()=> '2026-11-09T08:00:00.000Z',
 x=>structuredClone(x),dbOpen);
 await snapshotFn('manual');
 const backups=objects.get('sync-backups-v1:'+A);
 assert.equal(backups.length,2);assert.equal(backups[0].id,'snap-created');
 objects.set('main',{games:[],settings:{cloudOwnerUid:B}});
 await assert.rejects(snapshotFn('manual'),/аккаунт сменился/);
 assert.equal(objects.get('sync-backups-v1:'+A).length,2,
   'stale tab may not write to previous owner key');
 console.log('v92 backup PASS: ownership, safe portable JSON, add-only import, rollback, restore isolation, atomic snapshots');
})().catch(e=>{console.error(e);process.exitCode=1;});
