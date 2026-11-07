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

  // v82: all game writes go through a narrowly scoped authenticated RPC.
  // The server, not the browser, determines the owner and new revision.
  // Do not fall back to direct INSERT/UPDATE: that would undo protection.
  async function sendChanges(client,userId,writes,toRow){
    if(!userId||typeof toRow!=='function'||typeof client?.rpc!=='function'){
      throw new Error('Verified cloud writer is unavailable');
    }
    if(!Array.isArray(writes))throw new Error('Invalid write plan');
    const changes=[],seen=new Set();
    for(const change of writes){
      const id=string(change?.id);
      if(!id||!change.game||id!==string(change.game.id)||seen.has(id)){
        throw new Error('Invalid or duplicate game change');
      }
      seen.add(id);
      const kind=change.kind;
      const revision=change.revision==null?null:string(change.revision);
      if((kind==='insert'&&revision!==null)||(kind==='update'&&!revision)){
        throw new Error('Invalid cloud revision in write plan');
      }
      if(kind!=='insert'&&kind!=='update')throw new Error('Invalid cloud operation');

      const row={...toRow(change.game),id};
      // Owner and updated_at are deliberately ignored on the server as well.
      delete row.user_id;
      delete row.updated_at;
      changes.push({kind,revision,game:row,id,signature:signature(change.game)});
    }
    const applied=[];
    for(let offset=0;offset<changes.length;offset+=100){
      const part=changes.slice(offset,offset+100);
      const {data,error}=await client.rpc('save_games_if_unchanged',{
        p_changes:part.map(({kind,revision,game})=>({kind,revision,game}))
      });
      if(error){
        if(String(error.message||'').includes('MC_SYNC_CONFLICT')||
           String(error.code||'')==='23505'){
          throw conflictError(part[0].id,'Cloud revision changed during the save');
        }
        throw error;
      }
      if(!Array.isArray(data)||data.length!==part.length){
        throw conflictError(part[0].id,'Unconfirmed cloud write response');
      }
      const byId=new Map();
      for(const item of data){
        const id=string(item?.id);
        if(!id||byId.has(id)||!item?.updated_at){
          throw conflictError(part[0].id,'Invalid cloud acknowledgement');
        }
        byId.set(id,item);
      }
      for(const change of part){
        const item=byId.get(change.id);
        if(!item)throw conflictError(change.id,'Missing cloud acknowledgement');
        applied.push({
          id:change.id,
          revision:string(item.updated_at),
          signature:change.signature
        });
      }
    }
    return applied;
  }

  const api=Object.freeze({KEY,ARCHIVE_KEY,signature,plan,sendChanges,conflictError});
  root.MemoryCardConflictV81=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
