/* Run: node tests/test_server_rpc_v82.cjs
 * The production helper must use the server-only RPC; no direct table writes.
 * The real SQL RPC is tested in tests/test_server_cas_v82.sql. */
'use strict';
const assert=require('node:assert/strict');
const api=require('../cloud-conflicts-v81.js');

const game=i=>({
  id:'game-'+i,title:'Game '+i,platform:'PS5',status:'completed',
  addedAt:'2026-09-01T10:00:00.000Z',
  updatedAt:'2026-11-01T11:00:00.000Z',
  notes:'Local note '+i,rating:'9'
});
const toRow=g=>({
  user_id:'FORGED-OWNER',id:g.id,title:g.title,platform:g.platform,
  status:g.status,added_at:g.addedAt,updated_at:'UNTRUSTED_CLIENT_CLOCK',
  notes:g.notes,rating:9
});
(async()=>{
  const changes=Array.from({length:215},(_,i)=>({
    kind:'insert',id:game(i).id,revision:null,game:game(i)
  }));
  const batches=[];
  const client={
    async rpc(name,{p_changes}){
      assert.equal(name,'save_games_if_unchanged');
      assert.ok(p_changes.length<=100);
      assert.ok(p_changes.every(c=>!('user_id' in c.game)&&!('updated_at' in c.game)));
      batches.push(p_changes.length);
      return {data:p_changes.map(c=>({id:c.game.id,updated_at:'2026-11-07T11:00:00.000Z'})),error:null};
    },
    from(){throw Error('Direct games table writes forbidden');}
  };
  const result=await api.sendChanges(client,'trusted-user',changes,toRow);
  assert.deepEqual(batches,[100,100,15]);
  assert.equal(result.length,215);
  assert.equal(result[0].signature,api.signature(game(0)));
  assert.equal(result[0].revision,'2026-11-07T11:00:00.000Z');

  const stale={
    async rpc(){return {data:null,error:{code:'P0001',message:'MC_SYNC_CONFLICT'}};},
    from(){throw Error('Direct DB access forbidden');}
  };
  await assert.rejects(api.sendChanges(stale,'u',[{
    id:'g',kind:'update',revision:'2026-11-01T01:00:00Z',game:{...game(0),id:'g'}
  }],toRow),e=>e.code==='SYNC_CONFLICT');

  const missing={async rpc(){return {data:[],error:null}}};
  await assert.rejects(api.sendChanges(missing,'u',[changes[0]],toRow),e=>e.code==='SYNC_CONFLICT');

  const malformed={async rpc(){return {data:[{id:'incorrect',updated_at:'2026-11-07'}],error:null}}};
  await assert.rejects(api.sendChanges(malformed,'u',[changes[0]],toRow),e=>e.code==='SYNC_CONFLICT');

  await assert.rejects(api.sendChanges({from(){throw Error('NO FALLBACK')}},'u',[changes[0]],toRow),
    /Verified cloud writer is unavailable/);

  console.log('v82: server RPC only, 100-row bounded batches, no forged owner, stale/invalid acks rejected PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
