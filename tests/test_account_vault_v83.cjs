/* Run: node tests/test_account_vault_v83.cjs
 * Real account-vault source + app.persist extracted from app.js.
 * Fake transactional IndexedDB, no credentials, network or production data. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vaultCode=fs.readFileSync(path.join(__dirname,'../account-vault-v83.js'),'utf8');
const appCode=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const copy=x=>structuredClone(x);

class MemoryDB {
  constructor(records){this.records=new Map(records||[]);this.failNextWrite=false;}
  async open(){
    const context=this;
    return {close(){},
      transaction(storeName,mode){
        assert.equal(storeName,'state');
        const planned=new Map(context.records);
        const tx={error:null,aborted:false,abort(){
          this.aborted=true;this.error=new Error('aborted');
          queueMicrotask(()=>this.onabort?.());
        }};
        let scheduled=false;
        const complete=()=>{
          if(scheduled)return;
          scheduled=true;
          queueMicrotask(()=>{
            if(tx.aborted)return;
            if(context.failNextWrite&&mode==='readwrite'){
              context.failNextWrite=false;tx.abort();return;
            }
            if(mode==='readwrite')context.records=planned;
            tx.oncomplete?.();
          });
        };
        const store={
          get(key){
            const req={result:undefined};
            queueMicrotask(()=>{
              if(tx.aborted)return;
              req.result=planned.has(key)?copy(planned.get(key)):undefined;
              req.onsuccess?.();
            });
            return req;
          },
          put(value,key){
            if(mode!=='readwrite')throw new Error('readonly');
            planned.set(key,copy(value));complete();
          }
        };
        tx.objectStore=()=>store;
        return tx;
      }
    };
  }
}
const ownerA='11111111-1111-4111-8111-111111111111';
const ownerB='22222222-2222-4222-8222-222222222222';
const game=(id,title)=>({id,title,status:'completed',platform:'PS5',
  addedAt:'2026-01-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'});
const defaults={theme:'system',ownedPlatforms:['PS5'],profileName:'Игрок'};
const makeSettings=owner=>({...defaults,cloudOwnerUid:owner,userId:owner===''
  ?'':'MC-AAAA-1111',autoSync:false});
const aSnapshot={games:[game('a1','Zelda'),game('a2','Kirby')],settings:makeSettings(ownerA)};
const db=new MemoryDB([
 ['main',aSnapshot],
 ['sync-backups-v1',[{id:'backup-1',games:[game('a1','Zelda')],settings:makeSettings(ownerA)}]]
]);
const state={games:copy(aSnapshot.games),settings:copy(aSnapshot.settings),
  social:{friends:[{id:'oldfriend'}],incoming:[1]},view:'settings',modal:null};
const window={};
const migrateSettings=x=>({...defaults,...x});
const migrateGame=x=>({...x});
const vault=new Function('window','state','dbOpen','DEFAULT_SETTINGS','migrateSettings',
  'migrateGame','structuredClone','module',vaultCode+
  'return window.MemoryCardAccountVaultV83;')(
  window,state,()=>db.open(),defaults,migrateSettings,migrateGame,structuredClone,{exports:{}}
);
window.MemoryCardAccountVaultV83=vault;

(async()=>{
  const first=await vault.activate(ownerA);
  assert.equal(first.changed,false);
  assert.equal(db.records.get(vault.keyFor(ownerA)).games.length,2);
  assert.equal(db.records.get('sync-backups-v1:'+ownerA).length,1);

  const signedOut=await vault.deactivate();
  assert.equal(signedOut.changed,true);
  assert.equal(state.games.length,0);
  assert.equal(state.settings.cloudOwnerUid,'');
  assert.equal(state.social.friends.length,0);
  assert.equal(db.records.get('main').games.length,0);
  assert.equal(db.records.get(vault.keyFor(ownerA)).games.length,2);

  const switched=await vault.activate(ownerB);
  assert.equal(switched.changed,true);
  assert.equal(state.games.length,0);
  assert.equal(state.settings.cloudOwnerUid,ownerB);
  assert.equal(db.records.get(vault.keyFor(ownerA)).games.length,2);

  // Mirror a B game through the real app persistence function.
  state.games=[game('b1','Tetris')];
  const start=appCode.indexOf('async function persist() {');
  const stop=appCode.indexOf('\nfunction resolvedTheme()',start);
  assert.ok(start>=0&&stop>start);
  const persist=new Function('window','state','dbOpen','STORE','KEY','console',
    appCode.slice(start,stop)+'\nreturn persist;')(
    window,state,()=>db.open(),'state','main',console
  );
  await persist();
  assert.equal(db.records.get(vault.keyFor(ownerB)).games.length,1);

  await vault.activate(ownerA);
  assert.equal(state.games.length,2);
  assert.equal(state.games[0].title,'Zelda');
  assert.equal(db.records.get(vault.keyFor(ownerB)).games.length,1);
  await vault.deactivate();
  await vault.activate(ownerB);
  assert.equal(state.games.length,1);
  assert.equal(state.games[0].title,'Tetris');
  assert.equal(db.records.get(vault.keyFor(ownerA)).games.length,2);

  // A stale tab with A should not overwrite B's active workspace.
  const badState={games:[game('a3','Stale')],settings:makeSettings(ownerA)};
  const stalePersist=new Function('window','state','dbOpen','STORE','KEY','console',
    appCode.slice(start,stop)+'\nreturn persist;')(
    window,badState,()=>db.open(),'state','main',{warn(){}}
  );
  await assert.rejects(stalePersist(),/aborted|Local save aborted/);
  assert.equal(db.records.get('main').games[0].title,'Tetris');

  await vault.deactivate();
  // Legacy/guest data is not silently added to B or A.
  const guest=[game('guest1','Guest Zelda'),game('guest2','Guest Mario')];
  state.games=copy(guest);
  state.settings=makeSettings('');
  db.records.set('main',{games:copy(guest),settings:copy(state.settings)});
  await vault.activate(ownerA);
  assert.equal(state.games.length,2);
  assert.equal(state.games[0].title,'Zelda');
  assert.equal((await vault.guestInfo()).games,2);
  await vault.deactivate();
  await vault.activate(ownerB);
  assert.equal(state.games.length,1);
  assert.equal((await vault.guestInfo()).games,2,
    'Empty signed-out workspace must not overwrite archived guest games');
  const imported=await vault.importGuest();
  assert.deepEqual(imported,{imported:2,skipped:0});
  assert.equal(state.games.length,3);
  assert.equal(db.records.get(vault.keyFor(ownerA)).games.length,2);
  const duplicate=await vault.importGuest();
  assert.deepEqual(duplicate,{imported:0,skipped:2});
  assert.equal(state.games.length,3);
  assert.equal(db.records.get(vault.guestKey).games.length,2);

  // A failed transaction must not switch in-memory owner or active DB.
  const memoryBefore=copy(state.games),diskBefore=copy(db.records.get('main'));
  db.failNextWrite=true;
  await assert.rejects(vault.activate(ownerA),/aborted/);
  assert.deepEqual(state.games,memoryBefore);
  assert.deepEqual(db.records.get('main'),diskBefore);
  assert.equal(state.settings.cloudOwnerUid,ownerB);

  console.log('v83 account vault: A/B isolation, logout, backups, guest import, stale-tab and atomic failure PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
