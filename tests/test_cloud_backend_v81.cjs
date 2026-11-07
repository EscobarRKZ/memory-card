/* Run: node tests/test_cloud_backend_v81.cjs
 * Two-device simulation of the REAL backend and sync helper, no network or DB writes. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const backend=fs.readFileSync(path.join(__dirname,'../backend-v2.js'),'utf8');
const transfer=require('../cloud-transfer-v80.js');
const conflicts=require('../cloud-conflicts-v81.js');
const clone=x=>JSON.parse(JSON.stringify(x));

class Server {
  constructor(rows=[]){
    this.games=new Map(rows.map(r=>[r.id,clone(r)]));
    this.profile={memory_id:'MC-ABCD-1234',display_name:'Player'};
    this.settings={payload:{settingsUpdatedAt:'2026-01-01'},updated_at:'2026-01-01'};
    this.updates=0;this.inserts=[];this.failRead=false;this.raceUpdate=null;
  }
  client(){
    const server=this;
    return {
      auth:{
        async getSession(){return {data:{session:{user:{id:'u',email:'tester@example.invalid'}}}};},
        onAuthStateChange(){},
        async signOut(){return {error:null};}
      },
      from(table){
        if(table==='games'){
          return {
            select(){let filter={};return {
              eq(k,v){filter[k]=v;return this;},
              order(){return this;},
              async range(from,to){
                if(server.failRead)return {data:[],error:{message:'offline'}};
                const rows=[...server.games.values()].filter(r=>r.user_id===filter.user_id)
                  .sort((a,b)=>a.id.localeCompare(b.id));
                return {data:clone(rows.slice(from,to+1)),count:from===0?rows.length:null,error:null};
              }
            };},
            update(row){const filter={};return {
              eq(k,v){filter[k]=v;return this;},
              async select(){
                if(server.raceUpdate){
                  server.raceUpdate(server);
                  server.raceUpdate=null;
                }
                const previous=server.games.get(filter.id);
                if(!previous||filter.user_id!==previous.user_id||filter.updated_at!==previous.updated_at)return {data:[],error:null};
                server.games.set(filter.id,clone(row));
                server.updates++;
                return {data:[{id:row.id,updated_at:row.updated_at}],error:null};
              }
            };},
            insert(rows){return {async select(){
              if(!Array.isArray(rows))throw new Error('Insert must be batched');
              server.inserts.push(rows.length);
              if(rows.some(r=>server.games.has(r.id)))return {data:null,error:{code:'23505',message:'duplicate'}};
              rows.forEach(row=>server.games.set(row.id,clone(row)));
              return {data:rows.map(r=>({id:r.id,updated_at:r.updated_at})),error:null};
            }};}
          };
        }
        if(table==='profiles')return {
          select(){return {eq(){return this;},async single(){return {data:clone(server.profile),error:null};}};},
          update(row){return {async eq(){server.profile.display_name=row.display_name;return {error:null};}};}
        };
        if(table==='user_settings')return {
          select(){return {eq(){return this;},async maybeSingle(){return {data:clone(server.settings),error:null};}};},
          async upsert(row){server.settings={payload:clone(row.payload),updated_at:row.updated_at};return {error:null};}
        };
        throw new Error('Unexpected database table '+table);
      }
    };
  }
}

class Button {
  constructor(id,choice){this.dataset={v81Id:id,v81Resolve:choice};}
  closest(selector){return selector==='[data-v81-resolve]'?this:null;}
}

function device(server,initial=[]){
  const state={view:'games',modal:null,settings:{
    ownedPlatforms:['GC'],settingsUpdatedAt:'2026-01-01'
  },games:clone(initial)};
  const listeners={};
  let saves=0,renders=0;
  const window={
    MC_BACKEND_V2:{enabled:true,supabaseUrl:'mock',supabaseAnonKey:'mock'},
    supabase:{createClient:()=>server.client()},
    MemoryCardCloudTransferV80:transfer,
    MemoryCardConflictV81:conflicts,
    confirm:()=>true,
    addEventListener(type,fn){listeners['window:'+type]=fn;}
  };
  const document={
    body:{insertAdjacentHTML(){}},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    addEventListener(type,fn){listeners[type]=fn;}
  };
  new Function('window','document','state','Element','persist','render','migrateSettings','migrateGame',
    'queueMicrotask','setTimeout','clearTimeout','console','setToast',backend)(
    window,document,state,Button,
    async()=>{saves++;},()=>{renders++;},x=>x,x=>x,
    fn=>Promise.resolve().then(fn),
    ()=>1,()=>{},{error(){}},()=>{}
  );
  return {state,listeners,get api(){return window.MemoryCardBackendV2;},
    get saves(){return saves;},get renders(){return renders;}};
}
async function settle(){for(let i=0;i<140;i++)await Promise.resolve();}
const record={
  user_id:'u',id:'game1',title:'Metroid Prime',platform:'GC',status:'completed',
  release_year:'',genre:'',franchise:'',cover_url:'',cover_source:'',rating:8,replay:0,
  notes:'Original',added_at:'2026-01-01T00:00:00Z',
  updated_at:'2026-10-01T00:00:00Z',deleted_at:null
};
(async()=>{
  const server=new Server([record]);
  const a=device(server),b=device(server);
  await settle();
  assert.equal(a.state.games.length,1);
  assert.equal(b.state.games.length,1);
  assert.equal(server.updates,0,'initial sync must not write unchanged games');

  a.state.games[0].notes='Edited by phone';
  await a.api.sync();
  assert.equal(server.games.get('game1').notes,'Edited by phone');
  assert.equal(server.updates,1);

  b.state.games[0].notes='Edited by laptop offline';
  await b.api.sync();
  assert.equal(b.api.getSyncState().conflicts,1);
  assert.equal(server.games.get('game1').notes,'Edited by phone');
  assert.equal(b.state.games[0].notes,'Edited by laptop offline');
  assert.equal(server.updates,1,'conflict must not overwrite remote');

  b.listeners.click({target:new Button('game1','local'),preventDefault(){}});
  await settle();
  assert.equal(server.games.get('game1').notes,'Edited by laptop offline');
  assert.equal(b.api.getSyncState().conflicts,0);
  assert.equal(b.state.settings.cloudConflictArchiveV81.length,1);
  assert.equal(b.state.settings.cloudConflictArchiveV81[0].remote.notes,'Edited by phone');

  // Only the edited game should be transferred. A full remote read must not
  // produce unconditional UPDATEs for every other unchanged game.
  const again=server.updates;
  await b.api.sync();
  assert.equal(server.updates,again);

  // Cloud-only changes flow to a device whose local copy matches its baseline.
  const remoteOnly=device(server);
  await settle();
  const prior=server.games.get('game1');
  server.games.set('game1',{...prior,notes:'Edited remotely',updated_at:'2026-11-07T12:50:00Z'});
  await remoteOnly.api.sync();
  assert.equal(remoteOnly.state.games[0].notes,'Edited remotely');

  // A concurrent write between read and UPDATE is caught by the atomic
  // revision predicate even if the client read was initially current.
  const race=device(server);
  await settle();
  race.state.games[0].notes='Offline race edit';
  server.raceUpdate=s=>{
    const row=s.games.get('game1');
    s.games.set('game1',{...row,notes:'Other device wins',updated_at:'2026-11-07T12:51:00Z'});
  };
  await race.api.sync();
  assert.equal(server.games.get('game1').notes,'Other device wins');
  assert.equal(race.state.games[0].notes,'Offline race edit');
  assert.equal(race.api.getSyncState().kind,'conflict');

  // Incomplete network read must preserve the entire local library.
  const offline=device(server);
  await settle();
  const before=clone(offline.state.games);
  server.failRead=true;
  await offline.api.sync();
  assert.deepEqual(offline.state.games,before);
  assert.equal(offline.api.getSyncState().kind,'error');
  server.failRead=false;

  // New account with a large existing local library: INSERT batches.
  const empty=new Server();
  const local=Array.from({length:205},(_,i)=>({
    id:'new'+i,title:'Game '+i,platform:'GC',status:'completed',
    addedAt:'2026-10-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'
  }));
  const fresh=device(empty,local);
  await settle();
  assert.equal(empty.games.size,205);
  assert.deepEqual(empty.inserts,[100,100,5]);
  assert.equal(fresh.api.getSyncState().conflicts,0);

  console.log('v81: two devices, conflicts, explicit resolution, CAS, offline, 205 inserts PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
