/* v85: best-effort local cleanup AFTER authenticated hard deletion succeeds.
 * Shared with the standalone webpage, which does not load the main app.
 * Never clears other users' IndexedDB accounts or guest archives. */
(function(root){
  'use strict';
  const DB='memory-card-db',STORE='state',MAIN='main';

  async function purgeOwner(owner){
    const uid=String(owner||'');
    if(!/^[0-9a-fA-F-]{36}$/.test(uid)){
      throw new Error('Invalid deleted account identity');
    }
    if(!root.indexedDB)return {purged:false,reason:'STORAGE_UNAVAILABLE'};
    const db=await new Promise((resolve,reject)=>{
      const request=root.indexedDB.open(DB);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Local storage unavailable'));
    });
    try{
      if(!db.objectStoreNames.contains(STORE)){
        return {purged:true,activeCleared:false};
      }
      let clearedMain=false;
      await new Promise((resolve,reject)=>{
        try{
          const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
          const active=store.get(MAIN);
          active.onsuccess=()=>{
            const activeOwner=String(active.result?.settings?.cloudOwnerUid||'');
            // A separate user may be signed in on another tab. Only clear
            // main if the active owner matches the account just deleted.
            if(activeOwner===uid){
              store.put({games:[],settings:{cloudOwnerUid:'',autoSync:false}},MAIN);
              clearedMain=true;
            }
            store.delete('mc-account-v83:'+uid);
            store.delete('sync-backups-v1:'+uid);
          };
          active.onerror=()=>tx.abort();
          tx.oncomplete=resolve;
          tx.onerror=()=>reject(tx.error||new Error('Local deletion failed'));
          tx.onabort=()=>reject(tx.error||new Error('Local cleanup was interrupted'));
        }catch(error){reject(error);}
      });
      return {purged:true,activeCleared:clearedMain};
    }finally{try{db.close?.()}catch(_){}}
  }
  root.MemoryCardLocalDeleteV85=Object.freeze({purgeOwner});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.MemoryCardLocalDeleteV85;
})(typeof window!=='undefined'?window:{});
