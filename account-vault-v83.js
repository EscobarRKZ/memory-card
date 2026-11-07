/* Memory Card v83: per-account local IndexedDB vault.
 * An account switch is an atomic switch of the active "main" record, not
 * a merge. Guest/legacy records are archived rather than auto-attached.
 * Never uploads, deletes user games, or changes Supabase credentials. */
(function(root){
  'use strict';
  const PREFIX='mc-account-v83:';
  const GUEST='mc-guest-v83';
  const MAIN='main';
  const STORE_NAME='state';
  let gate=Promise.resolve();

  function keyFor(owner){
    if(typeof owner!=='string'||!owner.trim()||owner.length>120)throw new Error('Invalid account ID');
    return PREFIX+owner;
  }
  function clone(item){
    return typeof structuredClone==='function' ? structuredClone(item) : JSON.parse(JSON.stringify(item));
  }
  function validSnapshot(data){
    return !!data && typeof data==='object' && !Array.isArray(data) &&
      Array.isArray(data.games) && data.settings && typeof data.settings==='object' &&
      !Array.isArray(data.settings);
  }
  function fresh(owner=''){
    return {
      games:[],
      settings:migrateSettings({
        ...DEFAULT_SETTINGS,profileName:'Игрок',userId:'',
        cloudOwnerUid:owner,cloudSyncBaselineV81:undefined,
        cloudConflictArchiveV81:undefined,autoSync:false
      })
    };
  }
  function take(){
    return clone({games:state.games,settings:state.settings});
  }
  function restore(item,owner){
    if(!validSnapshot(item))throw new Error('Invalid saved account library');
    state.games=item.games.map(migrateGame);
    state.settings=migrateSettings({...item.settings,cloudOwnerUid:owner});
    if(!owner) {
      state.settings.userId='';
      state.settings.cloudSyncBaselineV81=undefined;
      state.settings.cloudConflictArchiveV81=undefined;
    }
    state.settings.autoSync=false;
    state.modal=null;
    state.view='home';
    state.platformFilter='';
    state.search='';
    state.statusFilter='all';
    state.collectionId='';
    state.gameDetailId='';
    state.franchiseName='';
    state.friendProfile=null;
    state.social={loading:false,loaded:false,friends:[],incoming:[],outgoing:[],profile:null,error:''};
  }

  async function read(key){
    const db=await dbOpen();
    return new Promise((resolve,reject)=>{
      let tx;
      try{
        tx=db.transaction(STORE_NAME,'readonly');
        const req=tx.objectStore(STORE_NAME).get(key);
        req.onsuccess=()=>resolve(req.result??null);
        req.onerror=()=>reject(req.error||new Error('Failed to read local account'));
        tx.onabort=()=>reject(tx.error||new Error('Account read interrupted'));
      }catch(error){reject(error);}
    }).finally(()=>{try{db.close?.();}catch(_){}});
  }

  async function writeAtomic(entries){
    const db=await dbOpen();
    return new Promise((resolve,reject)=>{
      try{
        const tx=db.transaction(STORE_NAME,'readwrite');
        const store=tx.objectStore(STORE_NAME);
        for(const [key,value] of entries)store.put(value,key);
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error||new Error('Account data save failed'));
        tx.onabort=()=>reject(tx.error||new Error('Account data save interrupted'));
      }catch(error){reject(error);}
    }).finally(()=>{try{db.close?.();}catch(_){}});
  }

  function serial(fn){
    const result=gate.then(fn);
    gate=result.catch(()=>{});
    return result;
  }

  async function activate(owner){
    return serial(async()=>{
      const uid=String(owner||'');
      const targetKey=keyFor(uid);
      const oldOwner=String(state.settings?.cloudOwnerUid||'');
      const current=take();
      if(oldOwner===uid){
        await writeAtomic([[targetKey,current]]);
        return {changed:false,owner:uid};
      }
      const existing=await read(targetKey);
      if(existing!==null && !validSnapshot(existing))throw new Error('Account storage is corrupted; refusing to replace it');
      if(existing && existing.settings?.cloudOwnerUid &&
         String(existing.settings.cloudOwnerUid)!==uid){
        throw new Error('Saved library belongs to a different account');
      }
      const target=existing?clone(existing):fresh(uid);
      target.settings.cloudOwnerUid=uid;

      // The previous active workspace is stored even when signed out or
      // when the last login belongs to another user. An unbound workspace
      // goes to a guest archive, never silently into another cloud account.
      const sourceKey=oldOwner?keyFor(oldOwner):GUEST;
      const entries=[[sourceKey,current],[targetKey,target],[MAIN,target]];
      await writeAtomic(entries);
      restore(target,uid);
      return {changed:true,from:oldOwner||'guest',owner:uid,hadSavedCopy:!!existing};
    });
  }

  async function deactivate(){
    return serial(async()=>{
      const oldOwner=String(state.settings?.cloudOwnerUid||'');
      // Already signed out, no private library visible.
      if(!oldOwner)return {changed:false};
      const current=take(),blank=fresh();
      await writeAtomic([[keyFor(oldOwner),current],[MAIN,blank]]);
      restore(blank,'');
      return {changed:true,owner:oldOwner};
    });
  }

  async function guestInfo(){
    return serial(async()=>{
      const data=await read(GUEST);
      return validSnapshot(data)?{games:data.games.length,exists:true}:{games:0,exists:false};
    });
  }

  const api=Object.freeze({activate,deactivate,guestInfo,keyFor,
    guestKey:GUEST,isSnapshot:validSnapshot});
  root.MemoryCardAccountVaultV83=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
