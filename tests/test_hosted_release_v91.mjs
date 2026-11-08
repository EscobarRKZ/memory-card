/* v91: deterministic smoke checker fixture tests; no production logins. */
import assert from 'node:assert/strict';
import {checkHosted,parseArgs,inspectSnapshot} from '../scripts/check-hosted-release.mjs';

const fixture=version=>({
  '':'<!doctype html><html><head><title>Memory Card</title></head><body><div id="app"></div><a href="./privacy.html">privacy</a><a href="./delete-account.html">delete</a><script src="./pwa-updates-v66.js?v='+version+'"></script></body></html>',
  'delete-account.html':'<html><form id="login"></form><script src="./account-deletion-page-v84.js?v=85"></script><a href="./privacy.html">Privacy</a></html>',
  'privacy.html':'<html><h1>Конфиденциальность Memory Card</h1><a href="./delete-account.html">Удаление</a></html>',
  'manifest.webmanifest':JSON.stringify({name:'Memory Card — Game Log',display:'standalone',scope:'./',start_url:'./'}),
  'sw.js':'const VERSION='+version+';\nself.addEventListener("fetch",()=>{});'
});
const base='http://127.0.0.1:1234/memory-card/';
function fakeFetch(parts){
  return async url=>{
    const route=new URL(url).pathname.slice('/memory-card/'.length);
    return new Response(parts[route]||'Not found',{
      status:parts[route]?200:404,
      headers:{'content-type':route.endsWith('.webmanifest')?'application/json':'text/html'}
    });
  };
}
const sample=fixture(91);
const passed=await checkHosted({base,expectedVersion:91,fetchImpl:fakeFetch(sample)});
assert.equal(passed.version,91);
assert.equal(passed.checkedRoutes.length,5);
assert.equal(passed.hasExternalDeletion,true);
assert.equal(parseArgs(['--attempts','2','--delay-ms','0']).attempts,2);
await assert.rejects(checkHosted({base,expectedVersion:92,fetchImpl:fakeFetch(sample)}),/updater is stale/);
await assert.rejects(checkHosted({base:'http://example.com/memory-card/',expectedVersion:91,fetchImpl:fakeFetch(sample)}),/HTTPS origins/);
const bad={...sample,'privacy.html':'not a privacy notice'};
assert.throws(()=>inspectSnapshot(bad,91),/Privacy page/);
const missing={...sample};delete missing['delete-account.html'];
await assert.rejects(checkHosted({base,expectedVersion:91,fetchImpl:fakeFetch(missing)}),/HTTP 404/);
const oldWorker={...sample,'sw.js':"const VERSION=91;\nevent.request.destination==='image';"};
assert.throws(()=>inspectSnapshot(oldWorker,91),/Legacy cross-origin/);
console.log('v91 hosted smoke fixtures PASS: correct version, missing privacy, old SW, origin and routes');
