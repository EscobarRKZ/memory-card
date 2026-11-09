/* v94: server pair-lock/block-read guards + stale invitation UI (offline only).
 * No real Supabase accounts, friendships or games are created or modified.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const sql=read('supabase/migrations/20261109065016_social_pair_lock_and_block_read_guard_v94.sql');
const source=read('friends-supabase-v2.js');
const after=(anchor,next)=>{
  const start=sql.toLowerCase().indexOf(anchor.toLowerCase());
  const end=sql.toLowerCase().indexOf(next.toLowerCase(),start+anchor.length);
  assert.ok(start>=0&&end>start,'missing SQL section: '+anchor);
  return sql.slice(start,end);
};
const accept=after('create or replace function public.accept_friend_request','CREATE OR REPLACE FUNCTION public.get_friend_profile');
const profile=after('CREATE OR REPLACE FUNCTION public.get_friend_profile','CREATE OR REPLACE FUNCTION public.social_state');
const social=after('CREATE OR REPLACE FUNCTION public.social_state','revoke execute on function public.accept_friend_request');
for(const [name,fn] of [['accept',accept],['profile',profile],['social',social]]){
  assert.match(fn,/SECURITY DEFINER/i,name+' must declare definer rights explicitly');
  assert.match(fn,/set search_path (?:=|TO) ''/i,name+' must pin empty search_path');
  assert.match(fn,/auth\.uid\(\)/i,name+' must derive caller identity from JWT');
}
assert.match(accept,/where f\.id=friendship_id and f\.addressee_id=v_me and f\.status='pending'/);
assert.match(accept,/pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(/);
assert.match(accept,/mc_pair:/);
assert.match(accept,/mc_private\.user_blocks/);
assert.match(accept,/b\.blocker_id=v_me and b\.blocked_id=v_sender/);
assert.match(accept,/b\.blocker_id=v_sender and b\.blocked_id=v_me/);
assert.ok(accept.indexOf('mc_private.user_blocks')<accept.indexOf('update public.friendships'),
 'block guard must run before accepting request');
assert.match(accept,/and addressee_id=v_me and requester_id=v_sender and status='pending'/);
assert.match(profile,/pg_catalog\.pg_advisory_xact_lock/);
assert.match(profile,/mc_pair:/);
assert.match(profile,/mc_private\.user_blocks/);
assert.match(profile,/then raise exception 'NOT_FRIENDS'/);
assert.ok(profile.indexOf('mc_private.user_blocks')<profile.indexOf("'games',"),
 'block check must happen before reading the target game library');
assert.ok(!/'notes',g\.notes/i.test(profile),'friend profiles must not disclose private game notes');
const blocks=social.match(/from mc_private\.user_blocks/g)||[];
assert.equal(blocks.length,3,'social_state must filter friends, incoming and outgoing');
assert.match(social,/where f\.status='accepted'/);
assert.match(social,/where f\.status='pending' and f\.addressee_id=me/);
assert.match(social,/where f\.status='pending' and f\.requester_id=me/);
for(const name of ['public.accept_friend_request(uuid)','public.get_friend_profile(text)','public.social_state()']){
  assert.ok(sql.includes('revoke execute on function '+name+' from public, anon;'));
  assert.ok(sql.includes('grant execute on function '+name+' to authenticated;'));
}
assert.ok(!/\.from\(\s*['"]friendships['"]\s*\)\.(?:insert|update|delete)/.test(source),
 'social UI must use authorized RPCs, not write the friendships table directly');

// Simulate a stale incoming invite: a different tab blocks/deletes it on the
// server just before the recipient taps Accept. Denial refreshes the list.
const state={
  view:'friends',friendProfile:null,
  settings:{profileName:'Player',userId:'MC-ME00-1234'},
  social:{loaded:true,loading:false,incoming:[{requestId:'req-1',userId:'MC-AA11-BB22',displayName:'Old request'}],
    friends:[],outgoing:[],blocked:[],profile:{userId:'MC-ME00-1234',displayName:'Player'},error:''}
};
const rpcCalls=[],alerts=[],toasts=[];
const button={dataset:{requestId:'req-1'},onclick:null};
const doc={
  querySelectorAll(selector){return selector==='[data-action="friend-accept"]'?[button]:[];},
  querySelector(){return null}
};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let renders=0;
const ctx={
  state,document:doc,esc,
  window:{MemoryCardBackendV2:{
    configured:true,
    getSession:()=>({user:{id:'test-session'}}),
    getProfile:()=>({memory_id:'MC-ME00-1234',display_name:'Player'}),
    client:{rpc:async(name,args)=>{
      rpcCalls.push({name,args});
      if(name==='accept_friend_request')return {data:false,error:null};
      if(name==='social_state')return {data:{
        profile:{userId:'MC-ME00-1234',displayName:'Player'},
        friends:[],incoming:[],outgoing:[]
      },error:null};
      if(name==='list_blocked_users')return {data:[],error:null};
      throw Error('Unexpected social RPC '+name);
    }}
  }},
  navButtons:()=>'',renderView:()=>'',navigate:()=>{},bind:()=>{},
  render:()=>{renders++;},platform:()=>({abbr:'PC'}),PLATFORMS:[],
  migrateGame:x=>x,setTimeout:()=>{},console,confirm:()=>false,
  alert:v=>alerts.push(v),setToast:v=>toasts.push(v),navigator:{}
};
vm.createContext(ctx);
vm.runInContext(source,ctx,{filename:'friends-supabase-v2.js'});
assert.match(ctx.renderView(),/data-action="friend-accept" data-request-id="req-1"/);
ctx.bind();
assert.equal(typeof button.onclick,'function');
(async()=>{
  await button.onclick();
  assert.deepEqual(rpcCalls.map(x=>x.name),[
    'accept_friend_request','social_state','list_blocked_users'
  ]);
  assert.equal(state.social.incoming.length,0);
  assert.ok(!ctx.renderView().includes('data-action="friend-accept" data-request-id="req-1"'));
  assert.equal(renders,1);
  assert.equal(toasts.length,0,'denied request must not show success toast');
  assert.equal(alerts.length,1);
  assert.match(alerts[0],/больше недоступно.*отменено.*заблокирован/);
  console.log('v94 PASS: pair-lock ordering, reciprocal block filters, RPC grants, no leaked notes and stale invitation refresh');
})().catch(e=>{console.error(e);process.exitCode=1;});
