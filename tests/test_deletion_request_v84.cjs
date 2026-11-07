/* Run: node tests/test_deletion_request_v84.cjs
 * Isolated DOM + mock Supabase. No network and no real account deletion.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../account-deletion-request-v84.js'),'utf8');

function element(){
  const handlers={};
  return {hidden:false,disabled:false,textContent:'',dataset:{},
    handlers,addEventListener:(name,fn)=>{handlers[name]=fn},
    querySelector:()=>null};
}
const state={current:null,stored:new Map(),inserts:[],signouts:0};
const users={
  A:{id:'user-a',email:'a@example.invalid'},
  B:{id:'user-b',email:'b@example.invalid'}
};
const client={
  auth:{
    async getUser(){return {data:{user:state.current?users[state.current]:null},
      error:state.current?null:{message:'not logged in'}};},
    async signInWithPassword({email,password}){
      if(!password||!Object.values(users).some(u=>u.email===email)){
        return {error:{message:'bad credentials'}};
      }
      state.current=email==='a@example.invalid'?'A':'B';
      return {error:null};
    },
    async signOut(){state.current=null;state.signouts++;return {error:null};}
  },
  from(table){
    assert.equal(table,'account_deletion_requests');
    return {
      select(fields){
        assert.equal(fields,'status,requested_at');
        return {eq(key,value){
          assert.equal(key,'user_id');
          return {async maybeSingle(){
            return {data:state.stored.get(value)||null,error:null};
          }};
        }};
      },
      async insert(row){
        state.inserts.push({...row});
        if(state.stored.has(row.user_id))return {error:{code:'23505'}};
        state.stored.set(row.user_id,{
          status:'pending',requested_at:'2026-11-07T13:00:00.000Z'});
        return {error:null};
      }
    };
  }
};

const signIn=element();
signIn.elements={email:{value:''},password:{value:''}};
const loginButton=element();
signIn.querySelector=()=>loginButton;
const account=element();
const emailText=element();
const requestForm=element();
const requestButton=element();
requestForm.querySelector=()=>requestButton;
requestForm.elements={confirmation:{value:''}};
const pending=element(),logout=element(),status=element();
const nodes={
  '[data-request-status]':status,'[data-request-login]':signIn,
  '[data-request-account]':account,'[data-request-email]':emailText,
  '[data-request-form]':requestForm,'[data-request-pending]':pending,
  '[data-request-logout]':logout
};
const page={querySelector:key=>nodes[key]};
const document={
  getElementById:id=>id==='mc-deletion-page'?page:null
};
const window={
  MC_BACKEND_V2:{enabled:true,supabaseUrl:'https://test.supabase.co',
    supabaseAnonKey:'public-example'},
  supabase:{createClient:()=>client}
};
new Function('document','window',src)(document,window);
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
const fire=async(node,type)=>node.handlers[type]({preventDefault(){}});
(async()=>{
  await settle();
  assert.equal(signIn.hidden,false);
  assert.equal(account.hidden,true);
  assert.equal(state.inserts.length,0);

  signIn.elements.email.value=users.A.email;
  signIn.elements.password.value='a-password';
  await fire(signIn,'submit');
  assert.equal(signIn.elements.password.value,'');
  assert.equal(signIn.hidden,true);
  assert.equal(account.hidden,false);
  assert.equal(emailText.textContent,users.A.email);
  assert.equal(requestForm.hidden,false);

  requestForm.elements.confirmation.value='NO';
  await fire(requestForm,'submit');
  assert.equal(state.inserts.length,0,'Incorrect confirmation must do nothing');

  requestForm.elements.confirmation.value='УДАЛИТЬ';
  await fire(requestForm,'submit');
  assert.equal(state.inserts.length,1);
  assert.deepEqual(state.inserts[0],{user_id:users.A.id,status:'pending'});
  assert.equal(requestForm.hidden,true);
  assert.equal(pending.hidden,false);
  assert.match(pending.textContent,/Запрос уже получен/);
  assert.equal(state.stored.size,1);

  await fire(logout,'click');
  assert.equal(signIn.hidden,false);
  assert.equal(account.hidden,true);
  signIn.elements.email.value=users.B.email;
  signIn.elements.password.value='b-password';
  await fire(signIn,'submit');
  assert.equal(emailText.textContent,users.B.email);
  assert.equal(requestForm.hidden,false,
    'User B must not see User A pending status');

  requestForm.elements.confirmation.value='УДАЛИТЬ';
  await fire(requestForm,'submit');
  assert.equal(state.stored.size,2);
  assert.deepEqual(state.inserts[1],{user_id:users.B.id,status:'pending'});
  assert.equal(state.signouts,1);
  assert.equal(Object.prototype.hasOwnProperty.call(window,'deleteUser'),false);
  console.log('v84 deletion requests: auth, confirmation, status, isolation, signout PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
