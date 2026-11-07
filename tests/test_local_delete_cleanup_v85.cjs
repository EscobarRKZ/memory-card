/* v85: deletion cleanup only removes the target owner's local keys. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../local-delete-cleanup-v85.js'),'utf8');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const records=new Map([
 ['main',{games:[{id:'a'}],settings:{cloudOwnerUid:A}}],
 ['mc-account-v83:'+A,{games:[{id:'a'}],settings:{cloudOwnerUid:A}}],
 ['sync-backups-v1:'+A,[{id:'snapshot-a'}]],
 ['mc-account-v83:'+B,{games:[{id:'b'}],settings:{cloudOwnerUid:B}}],
 ['sync-backups-v1:'+B,[{id:'snapshot-b'}]],
 ['mc-guest-v83',{games:[{id:'guest'}],settings:{}}],
 ['sync-backups-v1',[{id:'legacy-unknown-owner'}]]
]);
const clone=x=>JSON.parse(JSON.stringify(x));
const db={
 objectStoreNames:{contains:name=>name==='state'},
 close(){},
 transaction(name,mode){
  assert.equal(name,'state');assert.equal(mode,'readwrite');
  const staged=new Map(records);
  const tx={error:null,aborted:false,abort(){
    this.aborted=true;this.error=new Error('aborted');queueMicrotask(()=>this.onabort?.());
  }};
  let pending=false;
  const done=()=>{
    if(pending)return;
    pending=true;queueMicrotask(()=>{
      if(tx.aborted)return;
      records.clear();for(const [k,v] of staged)records.set(k,v);
      tx.oncomplete?.();
    });
  };
  tx.objectStore=()=>({
    get(key){const request={};queueMicrotask(()=>{
      request.result=staged.get(key)?clone(staged.get(key)):null;
      request.onsuccess?.();
    });return request;},
    put(value,key){staged.set(key,clone(value));done()},
    delete(key){staged.delete(key);done()}
  });
  return tx;
 }
};
const index={open(){const req={};queueMicrotask(()=>{req.result=db;req.onsuccess?.()});return req}};
const win={indexedDB:index},mockModule={exports:{}};
new Function('window','module',source)(win,mockModule);
const api=mockModule.exports;
(async()=>{
  const result=await api.purgeOwner(A);
  assert.equal(result.purged,true);
  assert.equal(result.activeCleared,true);
  assert.deepEqual(records.get('main').games,[]);
  assert.equal(records.has('mc-account-v83:'+A),false);
  assert.equal(records.has('sync-backups-v1:'+A),false);
  assert.equal(records.get('mc-account-v83:'+B).games[0].id,'b');
  assert.equal(records.get('sync-backups-v1:'+B)[0].id,'snapshot-b');
  assert.equal(records.get('mc-guest-v83').games[0].id,'guest');
  assert.equal(records.get('sync-backups-v1')[0].id,'legacy-unknown-owner');

  records.set('main',{games:[{id:'b'}],settings:{cloudOwnerUid:B}});
  records.set('mc-account-v83:'+A,{games:[{id:'a'}],settings:{cloudOwnerUid:A}});
  const other=await api.purgeOwner(A);
  assert.equal(other.activeCleared,false);
  assert.equal(records.get('main').games[0].id,'b');
  assert.equal(records.has('mc-account-v83:'+A),false);
  await assert.rejects(api.purgeOwner('INVALID'),/Invalid deleted account identity/);
  const withoutIDB={exports:{}};
  new Function('window','module',source)({},withoutIDB);
  assert.equal((await withoutIDB.exports.purgeOwner(B)).purged,false);
  console.log('v85 local cleanup: only target account removed, other accounts and guest backups retained PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
