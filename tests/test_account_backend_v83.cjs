/* Run: node tests/test_account_backend_v83.cjs
 * Actual v83 vault + v82 backend with a transactional IndexedDB fake
 * and two isolated, nonproduction Supabase identities. No network. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const backend=fs.readFileSync(path.join(__dirname,'../backend-v2.js'),'utf8');
const vaultSource=fs.readFileSync(path.join(__dirname,'../account-vault-v83.js'),'utf8');
const transfer=require('../cloud-transfer-v80.js');
const conflict=require('../cloud-conflicts-v81.js');
const clone=x=>structuredClone(x);
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const game=(user,id,title)=>({
  user_id:user,id,title,platform:'PS5',status:'completed',
  release_year:'',genre:'',franchise:'',cover_url:'',cover_source:'',
  rating:8,replay:0,notes:'',
  added_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-11-01T00:00:00.000Z',
  deleted_at:null
});
const remote=new Map([[A,[game(A,'a','Zelda')]],[B,[game(B,'b','Tetris')]]]);
const defaults={theme:'system',profileName:'Игрок',ownedPlatforms:['PS5']};
const state={
 games:[{id:'a',title:'Zelda',platform:'PS5',status:'completed',
  addedAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z',
  rating:'8',replay:0,notes:'',coverUrl:'',coverSource:'',releaseYear:'',genre:'',franchise:''}],
 settings:{...defaults,cloudOwnerUid:A,userId:'MC-AAAA-1111',settingsUpdatedAt:'2026-01-01'},
 view:'games',modal:null,search:'',statusFilter:'all'
};
const data=new Map([['main',clone({games:state.games,settings:state.settings})]]);
const dbOpen=async()=>({
 close(){},
 transaction(_,mode){
  const staged=new Map(data);
  const tx={aborted:false,error:null,abort(){
    this.aborted=true;this.error=new Error('aborted');queueMicrotask(()=>this.onabort?.());
  }};
  let scheduled=false;
  const complete=()=>{
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{
      if(!tx.aborted){if(mode==='readwrite'){data.clear();for(const [k,v] of staged)data.set(k,v);}tx.oncomplete?.();}
    });
  };
  tx.objectStore=()=>({
   get(key){
    const req={};
    queueMicrotask(()=>{
      req.result=staged.has(key)?clone(staged.get(key)):undefined;
      req.onsuccess?.();
    });
    return req;
   },
   put(value,key){staged.set(key,clone(value));complete();}
  });
  return tx;
 }
});
const oldPersistStart=app.indexOf('async function persist() {');
const oldPersistEnd=app.indexOf('\nfunction resolvedTheme()',oldPersistStart);
assert.ok(oldPersistStart>=0&&oldPersistEnd>oldPersistStart);
const window={
 MC_BACKEND_V2:{enabled:true,supabaseUrl:'https://test.invalid',supabaseAnonKey:'public-test'},
 MemoryCardCloudTransferV80:transfer,MemoryCardConflictV81:conflict,
 MemoryCardInitialLoad:Promise.resolve(),confirm:()=>true,
 addEventListener(){}
};
const migrateSettings=x=>({...defaults,...x});
const migrateGame=x=>({...x});
const corePersist=new Function('window','state','dbOpen','STORE','KEY','console',
 app.slice(oldPersistStart,oldPersistEnd)+'\nreturn persist;')(
 window,state,dbOpen,'state','main',console
);
const vault=new Function('window','state','dbOpen','DEFAULT_SETTINGS','migrateSettings',
 'migrateGame','structuredClone','module',vaultSource+
 '\nreturn window.MemoryCardAccountVaultV83;')(
 window,state,dbOpen,defaults,migrateSettings,migrateGame,structuredClone,{exports:{}}
);
window.MemoryCardAccountVaultV83=vault;
const sessions={
 [A]:{user:{id:A,email:'a@example.invalid'}},
 [B]:{user:{id:B,email:'b@example.invalid'}}
};
let selected=A,authChange=null;
const client={
 auth:{
  async getSession(){return {data:{session:selected?sessions[selected]:null}};},
  onAuthStateChange(fn){authChange=fn;},
  async signOut(){selected=null;return {error:null};}
 },
 from(table){
  if(table==='games'){
   return {select(){const args={};return {
    eq(k,v){args[k]=v;return this;},
    order(){return this;},
    async range(from,to){
     const rows=remote.get(args.user_id)||[];
     return {data:clone(rows.slice(from,to+1)),count:from===0?rows.length:null,error:null};
    }
   }}};
  }
  if(table==='profiles')return {
   select(){return {eq(k,id){return {async single(){
    return {data:{memory_id:id===A?'MC-AAAA-1111':'MC-BBBB-2222',display_name:id===A?'A':'B'},error:null};
   }}};},
   update(){return {async eq(){return {error:null};}}}
  };
  if(table==='user_settings')return {
   select(){return {eq(){return {async maybeSingle(){
    return {data:{payload:{settingsUpdatedAt:'2026-01-01'},updated_at:'2026-01-01'},error:null};
   }}};},
   async upsert(){return {error:null};}
  };
  throw Error('Unexpected table '+table);
 },
 async rpc(){throw Error('Unchanged records must not be uploaded');}
};
window.supabase={createClient:()=>client};
const doc={
 body:{insertAdjacentHTML(){}},querySelector(){return null},
 querySelectorAll(){return []},addEventListener(){}
};
const timers=[];
const setTimer=(fn,delay)=>{timers.push({fn,delay});return timers.length};
const runTimers=async()=>{
 const due=timers.splice(0).filter(t=>t.delay===0);
 for(const t of due)await t.fn();
};
let renderCount=0;
new Function('window','document','state','Element','persist','render','migrateSettings','migrateGame',
 'queueMicrotask','setTimeout','clearTimeout','console','setToast','applyTheme',backend)(
 window,doc,state,class {},corePersist,()=>{renderCount++;},migrateSettings,migrateGame,
 queueMicrotask,setTimer,()=>{},console,()=>{},()=>{}
);
(async()=>{
 for(let i=0;i<100;i++)await Promise.resolve();
 assert.equal(state.settings.cloudOwnerUid,A);
 assert.equal(state.games.length,1);
 assert.equal(state.games[0].title,'Zelda');

 await window.MemoryCardBackendV2.logout();
 assert.equal(state.games.length,0);
 assert.equal(state.settings.cloudOwnerUid,'');
 assert.equal(data.get(vault.keyFor(A)).games.length,1);

 selected=B;
 authChange('SIGNED_IN',sessions[B]);
 await runTimers();
 for(let i=0;i<100;i++)await Promise.resolve();
 assert.equal(state.settings.cloudOwnerUid,B);
 assert.equal(state.games.length,1);
 assert.equal(state.games[0].title,'Tetris');
 assert.equal(data.get(vault.keyFor(A)).games[0].title,'Zelda');

 await window.MemoryCardBackendV2.logout();
 assert.equal(state.games.length,0);
 selected=A;
 authChange('SIGNED_IN',sessions[A]);
 await runTimers();
 for(let i=0;i<100;i++)await Promise.resolve();
 assert.equal(state.settings.cloudOwnerUid,A);
 assert.equal(state.games.length,1);
 assert.equal(state.games[0].title,'Zelda');
 assert.equal(data.get(vault.keyFor(B)).games[0].title,'Tetris');
 assert.ok(renderCount>0);
 console.log('v83 backend: login A, logout, login B, logout, restore A without cross-account writes PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
