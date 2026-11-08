/* v87 social safety regression: no network / no production account mutations */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261108045954_social_block_and_invitation_limits_v87.sql'),'utf8');
const source=fs.readFileSync(path.join(root,'friends-supabase-v2.js'),'utf8');
for(const marker of [
  'mc_private.user_blocks','mc_private.friend_request_events',
  'public.send_friend_request','public.block_user','public.unblock_user',
  'public.list_blocked_users','FRIEND_RATE_LIMIT','FRIEND_UNAVAILABLE',
  "revoke insert, update, delete on table public.friendships",
  "on delete cascade"
])assert.ok(migration.includes(marker),'missing server security condition '+marker);
assert.match(migration,/count\(\*\)[\s\S]*interval '1 hour'\)\s*>= 10/);
assert.match(migration,/count\(\*\)[\s\S]*interval '1 day'\)\s*>= 30/);
assert.match(migration,/revoke execute on function public\.block_user\(text\) from public, anon/);
assert.match(migration,/grant execute on function public\.block_user\(text\) to authenticated/);
assert.ok(!/\.from\(\s*['"]friendships['"]\s*\)\.(?:insert|delete|update)/.test(source),
  'client must only use authorized social RPCs');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const state={
 view:'friends',
 social:{loading:false,loaded:true,friends:[],incoming:[
  {displayName:'Нежелательный контакт',userId:'MC-AA11-BB22',requestId:'request-1'}],
 outgoing:[],blocked:[{displayName:'<script>alert(1)</script>',userId:'MC-CC33-DD44'}]},
 settings:{userId:'MC-ME00-AA00',profileName:'Я'}
};
const context={state,window:{MemoryCardBackendV2:{configured:true}},esc,
 navButtons:()=>'',renderView:()=>'',navigate:()=>{},bind:()=>{},render:()=>{},
 platform:()=>({abbr:'PC'}),PLATFORMS:[],migrateGame:x=>x,
 setTimeout:()=>{},console,confirm:()=>false,alert:()=>{},navigator:{},
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'friends-supabase-v2.js'});
const html=context.renderView();
assert.match(html,/Заблокированные/);
assert.match(html,/data-action="friend-block" data-friend-id="MC-AA11-BB22"/);
assert.match(html,/data-action="friend-unblock" data-friend-id="MC-CC33-DD44"/);
assert.ok(!html.includes('<script>alert(1)</script>'),'blocked name must escape HTML');
state.friendProfile={loading:false,profile:{userId:'MC-EE55-FF66',displayName:'Друг',ownedPlatforms:[]},games:[],stats:{}};
const profile=context.renderView();
assert.match(profile,/data-action="friend-remove"/);
assert.match(profile,/data-action="friend-block" data-friend-id="MC-EE55-FF66"/);
console.log('Memory Card v87 social safety PASS: private persistence, quotas, RPC grants, invitation and profile blocking, safe rendering');
