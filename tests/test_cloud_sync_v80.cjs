/* Run: node tests/test_cloud_sync_v80.cjs
 * Simulates the actual backend-v2.js lifecycle with an in-memory Supabase stub.
 * No credentials, network calls or real user data. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const backendSource = fs.readFileSync(path.join(__dirname,'../backend-v2.js'),'utf8');
const transfer = require('../cloud-transfer-v80.js');

async function run({size=1150,failRead=0,failWrite=0,cloudOwner='',localId='',localGames=[]}={}) {
  const games=Array.from({length:size},(_,i)=>({
    id:'g'+String(i).padStart(5,'0'),user_id:'mock-user',title:'Game '+i,
    platform:'PS5',status:'completed',updated_at:'2026-11-01',added_at:'2026-11-01'
  }));
  let readCount=0,uploaded=0,signOuts=0,persists=0,renders=0,timer=null,toast='';
  const session={user:{id:'mock-user',email:'sample@example.invalid'}};
  const auth={
    async getSession(){return {data:{session}};},
    onAuthStateChange(){},
    async signOut(){signOuts++;return {};}
  };
  const client={auth,from(table){
    if(table==='games')return {
      select(){return {eq(){return this},order(){return this},async range(begin,end){
        readCount++;
        if(readCount===failRead)return {error:{message:'mock read failure'}};
        return {data:games.slice(begin,end+1),count:begin===0?games.length:null,error:null};
      }};},
      async upsert(rows){uploaded+=rows.length;return {error:failWrite && uploaded>=failWrite?{message:'mock write failure'}:null};}
    };
    if(table==='profiles')return {
      select(){return {eq(){return this},async single(){
        return {data:{memory_id:'MC-AAAA-1111',display_name:'Player'},error:null};
      }};},
      update(){return {async eq(){return {error:null}}};}
    };
    if(table==='user_settings')return {
      select(){return {eq(){return this},async maybeSingle(){
        return {data:{payload:{settingsUpdatedAt:'2026-01-01'},updated_at:'2026-01-01'},error:null};
      }};},
      async upsert(){return {error:null};}
    };
    throw new Error('Unexpected table '+table);
  }};
  const state={settings:{
    userId:localId,cloudOwnerUid:cloudOwner,ownedPlatforms:['PS5'],settingsUpdatedAt:'2026-01-02'
  },games:localGames,view:'games'};
  const win={
    MC_BACKEND_V2:{enabled:true,supabaseUrl:'https://example.invalid',supabaseAnonKey:'mock-key'},
    supabase:{createClient:()=>client},
    MemoryCardCloudTransferV80:transfer,
    addEventListener(){}
  };
  const document={
    body:{insertAdjacentHTML(){}},
    querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}
  };
  new Function('window','document','state','persist','render','migrateSettings','migrateGame',
    'queueMicrotask','setTimeout','clearTimeout','console','setToast',backendSource)(
    win,document,state,async()=>{persists++;},()=>{renders++;},value=>value,value=>value,
    fn=>Promise.resolve().then(fn),fn=>{timer=fn;return 1;},()=>{},{error(){}},msg=>{toast=msg;}
  );
  for(let i=0;i<80;i++)await Promise.resolve();
  if(timer&&!failRead&&!cloudOwner&&!localId.startsWith('MC-9999'))await timer();
  for(let i=0;i<30;i++)await Promise.resolve();
  return {state,readCount,uploaded,signOuts,persists,renders,toast,
    sync:win.MemoryCardBackendV2.getSyncState(),busy:win.MemoryCardBackendV2.isBusy()};
}

(async()=>{
  const ok=await run();
  assert.equal(ok.readCount,3);
  assert.equal(ok.state.games.length,1150);
  assert.equal(ok.uploaded,1150);
  assert.equal(ok.state.settings.cloudOwnerUid,'mock-user');
  assert.equal(ok.sync.kind,'ok');
  assert.equal(ok.busy,false);

  const interrupted=await run({failRead:2});
  assert.equal(interrupted.uploaded,0);
  assert.equal(interrupted.state.games.length,0);
  assert.equal(interrupted.sync.kind,'error');
  assert.equal(interrupted.renders,0);

  const other=await run({
    size:40,cloudOwner:'old-account',localGames:[{id:'local',title:'Old local game'}]
  });
  assert.equal(other.signOuts,1);
  assert.equal(other.uploaded,0);
  assert.equal(other.state.games.length,1);
  assert.equal(other.sync.kind,'error');

  const legacy=await run({
    size:40,localId:'MC-9999-9999',localGames:[{id:'old',title:'Legacy game'}]
  });
  assert.equal(legacy.signOuts,1);
  assert.equal(legacy.uploaded,0);

  console.log('Cloud backend v80: 1150 games, failures, account isolation PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
