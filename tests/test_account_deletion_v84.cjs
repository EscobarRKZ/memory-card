/* Run: node tests/test_account_deletion_v84.cjs
 * Fake auth and RLS-enforced request table, with no real user or database. */
'use strict';
const assert=require('node:assert/strict');
const requests=require('../account-deletion-v84.js');

function setup({userId='owner-a',existing=null,denyAuth=false,conflict=false}={}){
  const rows=existing?[{...existing,user_id:userId}]:[];
  let inserts=0,deletes=0,updates=0;
  const client={
    auth:{async getUser(){
      return denyAuth?{data:{user:null},error:{message:'Unauthorized'}}:
        {data:{user:{id:userId,email:'user@example.invalid'}},error:null};
    }},
    from(table){
      assert.equal(table,'account_deletion_requests');
      return {
        select(cols){assert.equal(cols,'id,status,requested_at');return {
          eq(column,id){assert.equal(column,'user_id');assert.equal(id,userId);return this;},
          async maybeSingle(){
            return {data:rows.find(r=>r.user_id===userId)||null,error:null};
          }
        };},
        async insert(row){
          inserts++;
          assert.equal(row.user_id,userId);
          assert.equal(row.status,'pending');
          if(conflict&&inserts===1){
            rows.push({id:'req-race',user_id:userId,status:'pending',requested_at:'2026-11-07'});
            return {error:{code:'23505'}};
          }
          if(rows.some(r=>r.user_id===userId))return {error:{code:'23505'}};
          rows.push({id:'req-1',user_id:userId,status:'pending',requested_at:'2026-11-07'});
          return {error:null};
        },
        update(){updates++;throw Error('No account deletion request updates permitted');},
        delete(){deletes++;throw Error('No deletion from UI permitted');}
      };
    }
  };
  return {client,rows,get inserts(){return inserts},get unsafeWrites(){return deletes+updates}};
}

(async()=>{
  const a=setup();
  assert.deepEqual(await requests.status(a.client),{
    requested:false,status:null,requestedAt:null
  });
  const first=await requests.request(a.client);
  assert.equal(first.requested,true);
  assert.equal(first.alreadyRequested,false);
  assert.equal(a.inserts,1);
  const again=await requests.request(a.client);
  assert.equal(again.alreadyRequested,true);
  assert.equal(a.inserts,1);
  assert.equal(a.unsafeWrites,0);
  assert.equal(a.rows[0].status,'pending');

  const b=setup({userId:'owner-b',existing:{id:'req-b',status:'pending',requested_at:'2026-11-07'}});
  const bResult=await requests.request(b.client);
  assert.equal(bResult.alreadyRequested,true);
  assert.equal(b.inserts,0);

  const raced=setup({userId:'owner-race',conflict:true});
  const race=await requests.request(raced.client);
  assert.equal(race.requested,true);
  assert.equal(race.alreadyRequested,true);

  const unauthorized=setup({denyAuth:true});
  await assert.rejects(requests.request(unauthorized.client),e=>e.code==='NOT_AUTHENTICATED');
  assert.equal(unauthorized.inserts,0);

  await assert.rejects(requests.request({auth:{getUser:async()=>({data:{user:null}})}}),
    /Сервис аккаунтов недоступен/);
  console.log('v84: own-account requests, deduplication, unique-race, no deletion and no unauthenticated writes PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
