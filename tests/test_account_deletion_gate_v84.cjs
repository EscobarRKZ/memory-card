/* Run: node tests/test_account_deletion_gate_v84.cjs
 * Proves the staged irreversible endpoint cannot delete accounts by default.
 * No network, no real users and no service-role keys. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,
  '../supabase/functions/delete-account/index.ts'),'utf8');

const env={};
let handler=null,networkCalls=0;
const Deno={
  env:{get:key=>env[key]||''},
  serve(fn){handler=fn;}
};
class FakeResponse {
  constructor(body,{status,headers}={}){this.body=body;this.status=status||200;this.headers=headers;}
  async json(){return JSON.parse(this.body);}
}
const fakeFetch=async()=>{networkCalls++;throw Error('Network use is forbidden in the disabled gate test');};
new Function('Deno','Response','fetch',code)(Deno,FakeResponse,fakeFetch);
assert.equal(typeof handler,'function');

(async()=>{
  const options=await handler({method:'OPTIONS'});
  assert.equal(options.status,204);
  const get=await handler({method:'GET'});
  assert.equal(get.status,405);
  const post=await handler({method:'POST'});
  assert.equal(post.status,503);
  assert.deepEqual(await post.json(),{error:'DELETION_NOT_YET_ENABLED'});
  assert.equal(networkCalls,0);
  console.log('v84: irreversible deletion endpoint remains disabled by default PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
