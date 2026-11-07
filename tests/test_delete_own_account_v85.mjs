/* Self-service deletion authorization regression tests.
 * Uses the exact Edge Function core, in memory. NO real Auth users/data. */
import assert from 'node:assert/strict';
import { createDeleteOwnAccountHandler } from '../supabase/functions/delete-own-account/logic.mjs';

const origin='https://escobarrkz.github.io';
const uid='11111111-1111-4111-8111-111111111111';
const env={
 SUPABASE_URL:'https://mock.supabase.invalid',
 SUPABASE_ANON_KEY:'test-anon',
 SUPABASE_SERVICE_ROLE_KEY:'test-admin'
};
const phrase='УДАЛИТЬ НАВСЕГДА';
const req=(body,opts={})=>new Request('https://mock.supabase.invalid/functions/v1/delete-own-account',{
 method:opts.method||'POST',
 headers:{
  'content-type':opts.contentType||'application/json',
  'origin':opts.origin??origin,
  ...(opts.authorization===false?{}:{Authorization:'Bearer mock.user.jwt'}),
  ...opts.headers
 },
 ...(opts.method==='OPTIONS'||opts.method==='GET'?{}:{body:JSON.stringify(body)})
});
function setup(config={}){
 const calls={adminDelete:[],identity:0,passwords:[],requests:0,storage:0,keys:[]};
 const fakeUser={id:uid,email:'test@example.invalid',is_anonymous:false};
 const createClient=(url,key)=>{
  calls.keys.push(key);
  if(key==='test-anon')return {auth:{
   async getUser(token){calls.identity++;return token==='mock.user.jwt'&&!config.invalidJwt?
    {data:{user:config.anonymous?{...fakeUser,is_anonymous:true}:fakeUser},error:null}:
    {data:{user:null},error:{message:'invalid'}}},
   async signInWithPassword(args){
    calls.passwords.push(args);
    if(config.badPassword||args.password!=='correct-password-123'||config.reauthWrongUser){
      return config.reauthWrongUser?
        {data:{user:{id:'someone-else'}},error:null}:
        {data:null,error:{message:'invalid login credentials'}};
    }
    return {data:{user:fakeUser},error:null};
   }
  }};
  if(key==='test-admin')return {
   from(table){assert.equal(table,'account_deletion_requests');return {
    select(){return {eq(column,value){
      assert.equal(column,'user_id');assert.equal(value,uid);
      return {async maybeSingle(){calls.requests++;return config.noRequest?
        {data:null,error:null}:
        config.requestError?{data:null,error:{message:'unavailable'}}:
        {data:{status:config.requestStatus||'pending'},error:null}}
    }}}
   }},
   storage:{async listBuckets(){
    calls.storage++;
    if(config.storageError)return {data:null,error:{message:'unavailable'}};
    return {data:config.hasBuckets?[{id:'photos'}]:[],error:null};
   }},
   auth:{admin:{async deleteUser(user){
    calls.adminDelete.push(user);
    return config.deleteError?{error:{message:'denied'}}:{error:null};
   }}}
  };
  throw Error('Unrecognized API key');
 };
 const handler=createDeleteOwnAccountHandler({
  createClient,env:k=>env[k],
  allowedOrigins:[origin]
 });
 return {handler,calls};
}
async function check(config,request,code,status){
 const t=setup(config);
 const response=await t.handler(request);
 const data=await response.json();
 assert.equal(response.status,status);
 assert.equal(data.code,code);
 return {...t,response,data};
}
const body={confirmation:phrase,password:'correct-password-123',captchaToken:'validated-captcha'};
const ok=await check({},req(body),'DELETED',200);
assert.equal(ok.data.deleted,true);
assert.deepEqual(ok.calls.adminDelete,[uid]);
assert.equal(ok.calls.passwords.length,1);
assert.equal(ok.calls.passwords[0].options.captchaToken,'validated-captcha');
assert.equal(ok.calls.requests,1);
assert.equal(ok.calls.storage,1);
assert.equal(ok.response.headers.get('Access-Control-Allow-Origin'),origin);
assert.ok(!JSON.stringify(ok.data).includes(body.password));

const noAuth=await check({},req(body,{authorization:false}),'AUTH_REQUIRED',401);
assert.equal(noAuth.calls.identity,0);assert.equal(noAuth.calls.adminDelete.length,0);
const badOrigin=await check({},req(body,{origin:'https://evil.example'}),'ORIGIN_DENIED',403);
assert.equal(badOrigin.calls.adminDelete.length,0);
const noRequest=await check({noRequest:true},req(body),'REQUEST_REQUIRED',409);
assert.equal(noRequest.calls.passwords.length,0);
const already=await check({requestStatus:'processing'},req(body),'REQUEST_NOT_PENDING',409);
assert.equal(already.calls.adminDelete.length,0);
const badPw=await check({badPassword:true},req(body),'REAUTH_FAILED',403);
assert.equal(badPw.calls.adminDelete.length,0);
const wrongIdentity=await check({reauthWrongUser:true},req(body),'REAUTH_FAILED',403);
assert.equal(wrongIdentity.calls.adminDelete.length,0);
const badJwt=await check({invalidJwt:true},req(body),'AUTH_REQUIRED',401);
assert.equal(badJwt.calls.adminDelete.length,0);
const unknown=await check({},req({...body,user_id:uid}),'CONFIRMATION_REQUIRED',400);
assert.equal(unknown.calls.adminDelete.length,0);
const noPhrase=await check({},req({...body,confirmation:'УДАЛИТЬ'}),'CONFIRMATION_REQUIRED',400);
assert.equal(noPhrase.calls.adminDelete.length,0);
const anonymous=await check({anonymous:true},req(body),'AUTH_REQUIRED',401);
assert.equal(anonymous.calls.adminDelete.length,0);
const buckets=await check({hasBuckets:true},req(body),'STORAGE_REVIEW_REQUIRED',409);
assert.equal(buckets.calls.adminDelete.length,0);
const storageFailed=await check({storageError:true},req(body),'STORAGE_CHECK_FAILED',503);
assert.equal(storageFailed.calls.adminDelete.length,0);
const databaseFailed=await check({requestError:true},req(body),'REQUEST_CHECK_FAILED',503);
assert.equal(databaseFailed.calls.adminDelete.length,0);
const deleteFailed=await check({deleteError:true},req(body),'DELETE_FAILED',503);
assert.equal(deleteFailed.data.deleted,undefined);
const method=await check({},req({}, {method:'GET'}),'METHOD_NOT_ALLOWED',405);
assert.equal(method.calls.identity,0);
const options=setup({});
const preflight=await options.handler(req({}, {method:'OPTIONS'}));
assert.equal(preflight.status,204);
assert.equal(options.calls.adminDelete.length,0);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
assert.equal(ok.calls.keys.filter(x=>x==='test-admin').length,1);
console.log('v85: JWT, password, ownership, pending request, CORS, storage guard, hard delete and failure paths PASS');
