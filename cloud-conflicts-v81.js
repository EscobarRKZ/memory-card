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
    const rows=[],ids=new Set();
    for(const change of writes){
      const id=string(change.id);
      if(!id||!change.game||id!==string(change.game.id)||ids.has(id)){
        throw new Error('Invalid or duplicate game change');
      }
      ids.add(id);
      const row={...toRow(change.game),user_id:userId,id};
      const previous=Date.parse(string(change.revision));
      const moment=Number.isFinite(previous)?Math.max(Date.now(),previous+1):Date.now();
      row.updated_at=new Date(moment).toISOString();
      rows.push({change,row});
    }
    const applied=[];
    const added=rows.filter(x=>x.change.kind==='insert');
    const updates=rows.filter(x=>x.change.kind!=='insert');
    // Bounded, atomic INSERT batches. A duplicate PK aborts that entire batch.
    for(let offset=0;offset<added.length;offset+=100){
      const batch=added.slice(offset,offset+100);
      const result=await client.from('games').insert(batch.map(x=>x.row)).select('id,updated_at');
      if(result?.error){
        if(String(result.error.code)==='23505')throw conflictError(batch[0].change.id,'Another device already created a game in this batch');
        throw result.error;
      }
      const returned=result?.data;
      if(!Array.isArray(returned)||returned.length!==batch.length){
        throw conflictError(batch[0].change.id,'Incomplete cloud insert response');
      }
      const returnedById=new Map(returned.map(x=>[string(x.id),x]));
      for(const {change} of batch){
        const item=returnedById.get(change.id);
        if(!item?.updated_at)throw conflictError(change.id,'Cloud insert was not confirmed');
        applied.push({id:change.id,revision:string(item.updated_at),signature:signature(change.game)});
      }
    }
    // Conditional UPDATE is one database statement with an exact revision
    // predicate, not a read-then-unconditional-write race.
    for(const {change,row} of updates){
      if(change.kind!=='update'||!change.revision)throw new Error('Invalid update operation');
      const result=await client.from('games').update(row)
        .eq('user_id',userId).eq('id',change.id)
        .eq('updated_at',change.revision).select('id,updated_at');
      if(result?.error)throw result.error;
      if(!Array.isArray(result?.data)||result.data.length!==1||
          string(result.data[0].id)!==change.id||!result.data[0].updated_at){
        throw conflictError(change.id,'Cloud game changed since last read');
      }
      applied.push({id:change.id,revision:string(result.data[0].updated_at),
        signature:signature(change.game)});
    }
    return applied;
  }

  const api=Object.freeze({KEY,ARCHIVE_KEY,signature,plan,sendChanges,conflictError});
  root.MemoryCardConflictV81=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
