/* v81 — conflict-aware, compare-and-swap cloud sync.
   Pure logic; local snapshot is never sent to the cloud. */
(function(root){
  'use strict';
  const KEY='cloudSyncBaselineV81';
  const ARCHIVE_KEY='cloudConflictArchiveV81';

  function date(value){
    if(!value)return '';
    const d=new Date(value);
    return Number.isFinite(d.getTime())?d.toISOString():String(value);
  }
  function string(value){return value==null?'':String(value);}
  function signature(game){
    return JSON.stringify([
      string(game?.title).trim(),
      string(game?.platform||'PSP'),
      string(game?.status||'completed'),
      string(game?.releaseYear),
      string(game?.genre),
      string(game?.franchise),
      string(game?.coverUrl),
      string(game?.coverSource),
      game?.rating===''||game?.rating==null?null:Number(game.rating),
      Number(game?.replay||0),
      string(game?.notes),
      date(game?.addedAt),
      date(game?.deletedAt)
    ]);
  }
  function gameMap(items,label){
    const map=new Map();
    if(!Array.isArray(items))throw new Error('Invalid '+label+' collection');
    for(const game of items){
      const id=string(game?.id);
      if(!id||map.has(id))throw new Error('Duplicate or empty '+label+' game ID');
      map.set(id,game);
    }
    return map;
  }
  function remoteSnapshot(remote){
    return {signature:signature(remote),revision:string(remote?.updatedAt)};
  }
  function plan(local,remote,baseline={}){
    const a=gameMap(local,'local'),b=gameMap(remote,'cloud');
    const old=baseline&&typeof baseline==='object'&&baseline.records&&typeof baseline.records==='object'?baseline.records:{};
    const all=new Set([...a.keys(),...b.keys(),...Object.keys(old)]);
    const merged=[],writes=[],conflicts=[];
    const records={};
    for(const id of all){
      const l=a.get(id),r=b.get(id),base=old[id];
      const ls=l?signature(l):null,rs=r?signature(r):null;
      if(r && !r.updatedAt)throw new Error('Cloud record lacks revision: '+id);
      if(l&&r){
        const current=remoteSnapshot(r);
        records[id]=current;
        if(ls===rs){merged.push(r);continue;}
        if(!base){
          conflicts.push({id,local:l,remote:r,reason:'unknown-base'});
          continue;
        }
        const lc=ls!==base.signature,rc=rs!==base.signature;
        if(!lc){merged.push(r);continue;}
        if(!rc){merged.push(l);writes.push({kind:'update',id,game:l,revision:current.revision});continue;}
        conflicts.push({id,local:l,remote:r,reason:'both-changed'});
        continue;
      }
      if(r){
        records[id]=remoteSnapshot(r);
        merged.push(r);
        continue;
      }
      if(l){
        if(base){conflicts.push({id,local:l,remote:null,reason:'remote-missing'});continue;}
        merged.push(l);
        writes.push({kind:'insert',id,game:l,revision:null});
      }
    }
    return {merged,writes,conflicts,baseline:{records}};
  }

  function conflictError(id,message){
    const err=new Error(message||'Cloud version conflict for '+id);
    err.code='SYNC_CONFLICT';
    err.gameId=id;
    return err;
  }

  async function sendChanges(client,userId,writes,toRow){
    if(!userId||typeof toRow!=='function')throw new Error('Invalid cloud sync context');
    if(!Array.isArray(writes))throw new Error('Invalid write plan');
    const applied=[];
    for(const change of writes){
      const id=string(change.id);
      if(!id||!change.game||id!==string(change.game.id))throw new Error('Invalid game change');
      const row={...toRow(change.game),user_id:userId,id};
      // Using the request time ensures the revision changes even if the
      // original local timestamp is older than the remote revision.
      row.updated_at=new Date().toISOString();
      let result;
      if(change.kind==='insert'){
        result=await client.from('games').insert(row).select('id,updated_at');
      }else if(change.kind==='update'&&change.revision){
        result=await client.from('games').update(row)
          .eq('user_id',userId).eq('id',id)
          .eq('updated_at',change.revision).select('id,updated_at');
      }else throw new Error('Invalid write operation');
      if(result?.error){
        const code=String(result.error.code||'');
        if(code==='23505'||code==='PGRST116')throw conflictError(id,'Game was created by another device');
        throw result.error;
      }
      const rows=result?.data;
      if(!Array.isArray(rows)||rows.length!==1||string(rows[0].id)!==id||!rows[0].updated_at){
        throw conflictError(id,'Cloud game changed since last read');
      }
      applied.push({id,revision:string(rows[0].updated_at),signature:signature(change.game)});
    }
    return applied;
  }
  const api=Object.freeze({KEY,ARCHIVE_KEY,signature,plan,sendChanges,conflictError});
  root.MemoryCardConflictV81=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
