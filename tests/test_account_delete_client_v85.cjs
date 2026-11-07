/* v85: never treat a pending request as an executed deletion. */
'use strict';
const assert=require('node:assert/strict');
const api=require('../account-deletion-v84.js');
const uid='11111111-1111-4111-8111-111111111111';
function client({pending=true,success=true,notAuthorized=false}={}){
 const calls=[];
 return {calls,auth:{async getUser(){return notAuthorized?{data:{user:null},error:{message:'expired'}}:
    {data:{user:{id:uid,email:'sample@example.invalid'}},error:null}}},
 from(name){assert.equal(name,'account_deletion_requests');return {select(){
  return {eq(){return this},async maybeSingle(){
    return {data:pending?{status:'pending',requested_at:'2026-11-07'}:null,error:null};
  }};
 }}},
 functions:{async invoke(name,opts){
  calls.push({name,body:opts.body});
  return success?{data:{deleted:true,code:'DELETED'},error:null}:
    {data:null,error:{context:{json:async()=>({code:'REAUTH_FAILED'})}}};
 }}};
}
(async()=>{
 const c=client();
 const result=await api.deletePermanently(c,{
  confirmation:'УДАЛИТЬ НАВСЕГДА',
  password:'a-long-secret-password',
  captchaToken:'token'
 });
 assert.equal(result.deleted,true);
 assert.equal(result.owner,uid);
 assert.equal(c.calls.length,1);
 assert.equal(c.calls[0].name,'delete-own-account');
 assert.equal(c.calls[0].body.user_id,undefined);
 assert.equal(c.calls[0].body.email,undefined);
 assert.equal(c.calls[0].body.captchaToken,'token');
 await assert.rejects(api.deletePermanently(c,{confirmation:'УДАЛИТЬ',password:'a-long-secret-password'}));
 assert.equal(c.calls.length,1);
 const noRequest=client({pending:false});
 await assert.rejects(api.deletePermanently(noRequest,{confirmation:'УДАЛИТЬ НАВСЕГДА',password:'valid-pass'}),/Сначала отправь заявку/);
 assert.equal(noRequest.calls.length,0);
 const failed=client({success:false});
 await assert.rejects(api.deletePermanently(failed,{confirmation:'УДАЛИТЬ НАВСЕГДА',password:'valid-pass'}),e=>e.code==='REAUTH_FAILED');
 const unauthorized=client({notAuthorized:true});
 await assert.rejects(api.deletePermanently(unauthorized,{confirmation:'УДАЛИТЬ НАВСЕГДА',password:'valid-pass'}),e=>e.code==='NOT_AUTHENTICATED');
 assert.equal(unauthorized.calls.length,0);
 console.log('v85 client: user authorization, pending status, explicit phrase, secure RPC call and failure cases PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
