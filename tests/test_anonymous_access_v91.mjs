/* v91 public-data isolation fixture tests. No live accounts involved. */
import assert from 'node:assert/strict';
import {parsePublicConfig,checkAnonymousIsolation} from '../scripts/check-anonymous-access.mjs';

const config=parsePublicConfig("window.MC_BACKEND_V2={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'sb_publishable_123ABC'};");
assert.equal(config.origin,'https://example.supabase.co');
assert.throws(()=>parsePublicConfig("window.MC_BACKEND_V2={supabaseUrl:'https://evil.example',supabaseAnonKey:'sb_publishable_123'}"),/host/);
assert.throws(()=>parsePublicConfig("window.MC_BACKEND_V2={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'sb_secret_abc'}"),/publishable/);
function mockFetch(responses={}){
  return async(url,options)=>{
    assert.equal(options.method,'GET');
    assert.equal(options.credentials,'omit');
    assert.equal(Object.hasOwn(options.headers,'Authorization'),false);
    assert.equal(Object.hasOwn(options.headers,'apikey'),true);
    const key=new URL(url).pathname.split('/').at(-1);
    if(options.headers['Accept-Profile']==='mc_private')
      return new Response('{"message":"schema not exposed"}',{status:406});
    const rows=responses[key]??[];
    return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}});
  };
}
const good=await checkAnonymousIsolation({...config,fetchImpl:mockFetch()});
assert.equal(good.ok,true);
assert.equal(good.tablesChecked.length,7);
assert.ok(good.tablesChecked.every(x=>x.result==='empty'));
await assert.rejects(checkAnonymousIsolation({
  ...config,fetchImpl:mockFetch({games:[{id:'MUST_NOT_PRINT',notes:'PRIVATE'}]})
}),/ANONYMOUS_DATA_EXPOSURE: games/);
await assert.rejects(checkAnonymousIsolation({
  ...config,fetchImpl:async()=>new Response('{}',{status:500})
}),/HTTP 500/);
console.log('Anonymous access audit fixtures PASS: no auth, zero record disclosure, fail closed');
