/* v96: offline regression for sanitized, read-only device and cloud diagnostics.
 * No real account, network, browser storage mutation or Supabase write.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(dir,p),'utf8');
const health=require('../device-health-v96.js');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const secret={
  email:'user-secret@example.invalid',userId:A,token:'eyJ-super-secret',notes:'Private therapy note',
  title:'Secret backlog game',fullError:'SECRET INTERNAL SUPABASE',settings:{syncSecret:'TOP_SECRET'}
};
const raw=health.safeReport({
  ...secret,account:'signed-in',localGames:12,cloudGames:11,cloud:'ok',
  localBackups:2,network:'browser-online',sync:'conflict',conflicts:1,retryAttempt:0,
  serviceWorkerControlled:true,localStorage:'persistent',
  usedBytes:1048576,quotaBytes:20*1048576
});
const json=JSON.stringify(raw);
for(const sensitive of [secret.email,A,secret.token,secret.notes,secret.title,secret.fullError,'TOP_SECRET']){
  assert.ok(!json.includes(sensitive),'leaked private field: '+sensitive);
}
assert.equal(raw.localGames,12);
assert.equal(raw.cloudGames,11);
assert.equal(raw.localBackups,2);
assert.equal(raw.usedMiB,1);
assert.equal(raw.quotaMiB,20);
assert.ok(Object.isFrozen(raw));
assert.ok(!Object.hasOwn(raw,'settings'));
assert.ok(!Object.hasOwn(raw,'userId'));
assert.equal(health.safeReport({network:'secret',cloud:'private',sync:'untrusted'}).cloud,'unavailable');
assert.equal(health.safeReport({localGames:-1,cloudGames:9999999999,localBackups:30}).localGames,null);
assert.equal(health.safeReport({localGames:-1,cloudGames:9999999999,localBackups:30}).localBackups,null);

const games=[
  {id:'a',title:'Private game A',notes:'SECRET_A'},
  {id:'b',title:'Private game B',notes:'SECRET_B',deletedAt:'2026-11-01'},
  {id:'c',title:'Private game C',notes:'SECRET_C'}
];
const queries=[];
function queryClient(result){
  return {
    from(table){
      queries.push(['from',table]);assert.equal(table,'games');
      return {
        select(columns,options){
          queries.push(['select',columns,options]);
          assert.equal(columns,'id');
          assert.deepEqual(options,{count:'exact',head:true});
          return {
            eq(k,value){queries.push(['eq',k,value]);assert.equal(k,'user_id');return this;},
            async is(k,value){queries.push(['is',k,value]);assert.equal(k,'deleted_at');assert.equal(value,null);return result;}
          };
        },
        insert(){throw new Error('Diagnostics must never write');},
        update(){throw new Error('Diagnostics must never write');},
        upsert(){throw new Error('Diagnostics must never write');},
        delete(){throw new Error('Diagnostics must never write');}
      };
    }
  };
}
const basic={
  state:{games,settings:{cloudOwnerUid:A,syncSecret:'CANNOT_SHARE'}},
  navigator:{
    onLine:true,
    serviceWorker:{controller:{}},
    storage:{
      async estimate(){return {usage:2.4*1048576,quota:200*1048576};},
      async persisted(){return true;},
      persist(){throw new Error('collect should never request persistence');}
    }
  },
  getSession:()=>({user:{id:A,email:'example@example.invalid',access_token:'SECRET'}}),
  getSyncState:()=>({kind:'ok',message:'RAW SECRET MESSAGE',conflicts:0,retryAttempt:0}),
  isBusy:()=>false,
  client:queryClient({count:2,error:null}),
  readBackups:async()=>[{games:[{notes:'NOTE'}]},{}]
};
(async()=>{
  const ok=await health.collect(basic);
  assert.equal(ok.account,'signed-in');
  assert.equal(ok.localGames,2);
  assert.equal(ok.cloudGames,2);
  assert.equal(ok.localBackups,2);
  assert.equal(ok.cloud,'ok');
  assert.equal(ok.network,'browser-online');
  assert.equal(ok.serviceWorkerControlled,true);
  assert.equal(ok.localStorage,'persistent');
  assert.equal(ok.usedMiB,2.4);
  assert.equal(ok.quotaMiB,200);
  assert.equal(queries.length,4);
  assert.ok(!JSON.stringify(ok).includes('SECRET'));
  assert.ok(!JSON.stringify(ok).includes('example@example.invalid'));

  const offline=await health.collect({...basic,navigator:{...basic.navigator,onLine:false},
    client:{from(){throw Error('Offline probes must not run');}}});
  assert.equal(offline.cloud,'offline');
  assert.equal(offline.cloudGames,null);

  const guest=await health.collect({...basic,
    state:{games,settings:{cloudOwnerUid:''}},
    getSession:()=>null,
    client:{from(){throw Error('Guest cannot read cloud');}}
  });
  assert.equal(guest.account,'guest');
  assert.equal(guest.cloud,'not-signed-in');
  assert.equal(guest.localGames,2);

  const busy=await health.collect({...basic,isBusy:()=>true,
    client:{from(){throw Error('Do not interrupt in-flight sync');}}});
  assert.equal(busy.cloud,'busy');

  const down=await health.collect({...basic,client:queryClient({count:null,error:{message:'AUTH SECRET'}})});
  assert.equal(down.cloud,'unavailable');
  assert.equal(down.cloudGames,null);
  assert.ok(!JSON.stringify(down).includes('AUTH SECRET'));

  await assert.rejects(health.collect({...basic,
    state:{games,settings:{cloudOwnerUid:B}},
    client:{from(){throw Error('Account mismatch must block read');}}
  }),/ACCOUNT_MISMATCH/);

  let resolveRead;let switched=false;
  const slow=health.collect({...basic,
    getSession:()=>({user:{id:switched?B:A}}),
    client:queryClient(new Promise(resolve=>{resolveRead=resolve;}))
  });
  for(let i=0;i<8;i++)await Promise.resolve();
  switched=true;resolveRead({count:2,error:null});
  await assert.rejects(slow,/ACCOUNT_CHANGED_DURING_CHECK/,
    'result must be discarded if Auth identity changes in flight');

  const formatted=health.formatReport(health.safeReport({
    account:'signed-in',network:'browser-online',cloud:'ok',localGames:2,cloudGames:3,
    sync:'error',conflicts:0,retryAttempt:1,localStorage:'best-effort'
  }));
  assert.match(formatted,/Число игр различается/);
  assert.doesNotMatch(formatted,/потер|удалены/i,'count mismatch must not claim data loss');
  const index=read('index.html'),sw=read('sw.js'),source=read('device-health-v96.js');
  assert.ok(index.indexOf('backend-v2.js?v=93')<index.indexOf('device-health-v96.js?v=96'));
  assert.match(index,/device-health-v96\.css\?v=96/);
  const release=Number(sw.match(/const VERSION=(\d+);/)?.[1]);
  assert.ok(release>=96,'future PWA versions must retain v96 diagnostics');
  assert.ok(sw.includes('"./device-health-v96.js?v=96"'));
  assert.ok(sw.includes('"./device-health-v96.css?v=96"'));
  assert.match(source,/data-settings-category="data"/);
  assert.match(source,/data-mc-diag-run/);
  assert.match(source,/data-mc-diag-export/);
  assert.match(source,/data-mc-diag-persist/);
  assert.match(source,/if\(identity\.signed!==identity\.local\)/);
  console.log('v96 PASS: sanitized report, on-demand read-only cloud count, local storage, mismatch and account-switch guards');
})().catch(error=>{console.error(error);process.exitCode=1;});
