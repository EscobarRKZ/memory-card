/* v93: cloud retry safety and real backend recovery in a deterministic, offline mock. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const backend=fs.readFileSync(path.join(__dirname,'../backend-v2.js'),'utf8');
const retry=require('../cloud-retry-v93.js');
const transfer=require('../cloud-transfer-v80.js');
const conflicts=require('../cloud-conflicts-v81.js');
const ID='11111111-1111-4111-8111-111111111111';
const game={id:'one',title:'Metroid Prime',platform:'GC',status:'completed',
  releaseYear:'',genre:'',franchise:'',coverUrl:'',coverSource:'',rating:'8',
  replay:0,notes:'Original',addedAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z'};
const cases=[
 [{status:503,message:'Service unavailable'},true],
 [{status:429,message:'Too many requests'},true],
 [{status:500,message:'Internal server error'},true],
 [{code:'ETIMEDOUT',message:'socket closed'},true],
 [{message:'Failed to fetch'},true],
 [{message:'offline'},true],
 [{status:400,message:'Bad request'},false],
 [{status:401,message:'Unauthorized'},false],
 [{status:403,message:'Forbidden'},false],
 [{code:'SYNC_CONFLICT',message:'Cloud revision conflict'},false],
 [{code:'P0001',message:'MC_SYNC_CONFLICT'},false],
 [{code:'LOCAL_ACCOUNT_MISMATCH'},false],
 [{code:'23505',message:'duplicate'},false],
 [{status:422,message:'Invalid payload'},false],
 [{status:429,message:'JWT expired'},false]
];
for(const [err,expected] of cases)assert.equal(retry.shouldRetry(err),expected,JSON.stringify(err));
assert.equal(retry.MAX_ATTEMPTS,5);
assert.deepEqual([1,2,3,4,5].map(i=>retry.nextDelay(i,()=>.5)),[1500,3000,6000,12000,24000]);
assert.ok(retry.nextDelay(100,()=>1)<=retry.MAX_DELAY_MS);
assert.equal(retry.nextDelay(2,()=>0),2400);
assert.equal(retry.nextDelay(2,()=>1),3600);

const remote=new Map(),listeners={},queue=new Map(),readHistory=[],rpcHistory=[];
let nextTimerId=0,failRead=true,failRpc=false,forceConflict=false,rev=0,renders=0;
let activeSession={user:{id:ID,email:'test@example.invalid'}},authChange;
function setTimer(fn,delay){const id=++nextTimerId;queue.set(id,{fn,delay});return id;}
function clearTimer(id){queue.delete(id);}
async function settle(){for(let i=0;i<180;i++)await Promise.resolve();}
async function fireTimer(){
  const next=[...queue.entries()].filter(([id,v])=>v.delay>0)[0];
  assert.ok(next,'Expected scheduled backoff timer');
  queue.delete(next[0]);
  next[1].fn();
  await settle();
}
const client={
 auth:{
  async getSession(){return {data:{session:activeSession}};},
  onAuthStateChange(fn){authChange=fn;},
  async signOut(){activeSession=null;return {error:null};}
 },
 from(table){
  if(table==='games')return {select(){let owner='';
    return {eq(name,v){if(name==='user_id')owner=v;return this;},
      order(){return this;},
      async range(start,end){
        readHistory.push({owner,start,end});
        if(failRead)return {data:null,error:{status:503,message:'Failed to fetch'}};
        const rows=[...remote.values()].filter(g=>g.user_id===owner).sort((a,b)=>a.id.localeCompare(b.id));
        return {data:rows.slice(start,end+1).map(g=>({...g})),count:start===0?rows.length:null,error:null};
      }
    };
  }};
  if(table==='profiles')return {
    select(){return {eq(){return this;},async single(){return {data:{memory_id:'MC-AAAA-1111',display_name:'Player'},error:null};}};},
    update(){return {async eq(){return {error:null};}};}
  };
  if(table==='user_settings')return {
    select(){return {eq(){return this;},async maybeSingle(){return {data:{payload:{settingsUpdatedAt:'2026-01-01'},updated_at:'2026-01-01'},error:null};}};},
    async upsert(){return {error:null};}
  };
  throw Error('Unexpected table '+table);
 },
 async rpc(name,args){
  assert.equal(name,'save_games_if_unchanged');
  rpcHistory.push({readCount:readHistory.length,changes:args.p_changes});
  if(failRpc)return {data:null,error:{status:503,message:'Service unavailable'}};
  if(forceConflict)return {data:null,error:{code:'P0001',message:'MC_SYNC_CONFLICT'}};
  const ack=[];
  for(const value of args.p_changes){
    const before=remote.get(value.game.id);
    if(value.kind==='insert'&&before)return {data:null,error:{code:'23505',message:'MC_SYNC_CONFLICT'}};
    if(value.kind==='update'&&(!before||before.updated_at!==value.revision))
      return {data:null,error:{code:'P0001',message:'MC_SYNC_CONFLICT'}};
    const updated_at=new Date(Date.now()+rev++*2000).toISOString();
    remote.set(value.game.id,{...value.game,user_id:ID,updated_at});
    ack.push({id:value.game.id,updated_at});
  }
  return {data:ack,error:null};
 }
};
const state={view:'games',games:[{...game}],settings:{cloudOwnerUid:ID,
  userId:'MC-AAAA-1111',settingsUpdatedAt:'2026-11-01',ownedPlatforms:['GC']},modal:null};
const window={
  MC_BACKEND_V2:{enabled:true,supabaseUrl:'https://test.invalid',supabaseAnonKey:'publishable-test'},
  supabase:{createClient:()=>client},
  MemoryCardCloudTransferV80:transfer,
  MemoryCardConflictV81:conflicts,
  MemoryCardCloudRetryV93:retry,
  MemoryCardInitialLoad:Promise.resolve(),
  addEventListener(k,fn){listeners['window:'+k]=fn;}
};
const document={
 body:{insertAdjacentHTML(){}},querySelector(){return null},querySelectorAll(){return []},
 addEventListener(type,fn){listeners[type]=fn;}
};
new Function('window','document','state','Element','persist','render','migrateSettings','migrateGame',
  'queueMicrotask','setTimeout','clearTimeout','console','setToast','applyTheme',backend)(
  window,document,state,class {},async()=>{},()=>{renders++;},x=>x,x=>x,
  queueMicrotask,setTimer,clearTimer,{error(){},warn(){}},()=>{},()=>{}
);
(async()=>{
  await settle();
  const api=window.MemoryCardBackendV2;
  assert.equal(api.getSyncState().kind,'error');
  assert.equal(api.getSyncState().retryAttempt,1);
  assert.equal(api.getSyncState().retryScheduled,true);
  assert.equal(remote.size,0);
  assert.equal(state.games.length,1,'failed initial read must not erase local games');
  failRead=false;
  await fireTimer();
  assert.equal(api.getSyncState().kind,'ok');
  assert.equal(api.getSyncState().retryAttempt,0);
  assert.equal(api.getSyncState().retryScheduled,false);
  assert.equal(remote.get('one').title,'Metroid Prime');
  assert.equal(rpcHistory.length,1,'new cloud insert only after successful full download');

  // Failed RPC must retry ONLY through a fresh read and new CAS plan, not
  // blindly replay the previous mutating request.
  state.games[0].notes='Changed locally';
  failRpc=true;
  const beforeReads=readHistory.length;
  await api.sync();
  assert.equal(api.getSyncState().kind,'error');
  assert.equal(api.getSyncState().retryScheduled,true);
  assert.equal(remote.get('one').notes,'Original');
  assert.equal(rpcHistory.length,2);
  failRpc=false;
  await fireTimer();
  assert.equal(api.getSyncState().kind,'ok');
  assert.equal(remote.get('one').notes,'Changed locally');
  assert.equal(rpcHistory.length,3);
  assert.ok(rpcHistory[2].readCount>rpcHistory[1].readCount);
  assert.ok(readHistory.length>=beforeReads+2);

  // A compare-and-swap conflict must stop automatically. Local notes survive.
  state.games[0].notes='Another local edit';
  forceConflict=true;
  await api.sync();
  assert.equal(api.getSyncState().kind,'conflict');
  assert.equal(api.getSyncState().retryScheduled,false);
  assert.equal(state.games[0].notes,'Another local edit');
  forceConflict=false;

  // Explicit sync restarts retry budget and never forms an unbounded loop.
  failRead=true;
  await api.sync();
  for(let i=1;i<=retry.MAX_ATTEMPTS;i++){
    assert.equal(api.getSyncState().retryAttempt,i);
    assert.equal(api.getSyncState().retryScheduled,true);
    await fireTimer();
  }
  assert.equal(api.getSyncState().retryAttempt,retry.MAX_ATTEMPTS);
  assert.equal(api.getSyncState().retryScheduled,false);
  assert.match(api.getSyncState().message,/Лимит повторов исчерпан/);
  assert.equal(state.games[0].notes,'Another local edit');
  await api.sync();
  assert.equal(api.getSyncState().retryAttempt,1,'manual sync refreshes retry budget');

  // Auth change must cancel a scheduled retry from the previous account.
  authChange('SIGNED_OUT',null);
  assert.equal(api.getSyncState().retryScheduled,false);
  assert.equal(api.getSyncState().retryAttempt,0);
  assert.equal(queue.size,1,'only the Auth-state handling callback remains queued');
  console.log('v93 cloud retry PASS: bounded exponential delays, full re-download before retry, no auto-retry on conflict, data retention and auth cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});
