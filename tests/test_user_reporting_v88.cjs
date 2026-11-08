/* v88: offline user-reporting security and UI tests. No real accounts or network. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/20261108052249_private_user_reporting_v88.sql');
const js=read('friends-supabase-v2.js');
for(const part of [
 'mc_private.user_reports','enable row level security',
 'revoke all on table mc_private.user_reports from public, anon, authenticated',
 'create or replace function public.report_user',
 'v_me uuid := auth.uid()', 'reporter_id = v_me',
 "interval '24 hours'", 'REPORT_RATE_LIMIT','REPORT_INVALID_REASON','REPORT_TOO_LONG',
 'SELF_REPORT','limit 1','on delete cascade',
 'grant execute on function public.report_user(text,text,text)'
])assert.ok(sql.includes(part),'Missing report security guard: '+part);
assert.match(sql,/\)\s*>= 3 then[\s\S]*REPORT_RATE_LIMIT/);
assert.match(sql,/revoke execute on function public.report_user\(text,text,text\)\s+from public, anon/);
assert.ok(!/\.from\(\s*['"](?:user_reports|mc_private\.user_reports)['"]\s*\)/.test(js),
 'frontend must not read/write the private moderation table');
const calls=[],toasts=[],alerts=[];
const state={view:'friends',settings:{userId:'MC-ABCD-EFGH',profileName:'Owner'},
 social:{loading:false,loaded:true,friends:[],outgoing:[],incoming:[
  {requestId:'req-1',displayName:'<script>alert(1)</script>',userId:'MC-AA11-BB22'}],
 blocked:[]},friendProfile:null};
const field={value:'',focused:false,focus(){this.focused=true}};
const button={disabled:false,isConnected:true};
const form={dataset:{},fields:{userId:'mc-aa11-bb22',reason:'spam',details:'Repeated unwanted invitations'},
 elements:{namedItem:name=>name==='userId'?field:null},
 querySelector:()=>button,reset(){this.didReset=true},scrollIntoView(){}};
const action={dataset:{friendId:'MC-AA11-BB22'},onclick:null};
const doc={querySelectorAll:s=>s==='[data-action="friend-report"]'?[action]:[],
 querySelector:s=>s==='#friendReportForm'?form:null};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ctx={state,document:doc,esc,window:{MemoryCardBackendV2:{configured:true,client:{rpc:async(name,args)=>{
 calls.push({name,args});return {data:'11111111-1111-4111-8111-111111111111',error:null};
 }}}},navButtons:()=>'',renderView:()=>'',navigate:()=>{},bind:()=>{},render:()=>{},
 FormData:class{constructor(target){this.target=target}get(name){return this.target.fields[name]}},
 platform:()=>({abbr:'PC'}),PLATFORMS:[],migrateGame:x=>x,
 setTimeout:()=>{},console,confirm:()=>false,alert:v=>alerts.push(v),setToast:v=>toasts.push(v)};
vm.createContext(ctx);vm.runInContext(js,ctx,{filename:'friends-supabase-v2.js'});
const html=ctx.renderView();
assert.match(html,/id="friendReportForm"/);
assert.match(html,/name="reason"/);
assert.match(html,/name="details"/);
assert.match(html,/maxlength="1000"/);
assert.match(html,/data-action="friend-report" data-friend-id="MC-AA11-BB22"/);
assert.ok(!html.includes('<script>alert(1)</script>'),'untrusted display name must be escaped');
ctx.bind();
assert.equal(typeof form.onsubmit,'function');
assert.equal(typeof action.onclick,'function');
(async()=>{
 await form.onsubmit({currentTarget:form,preventDefault(){}});
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'report_user');
 assert.equal(calls[0].args.target_memory_id,'MC-AA11-BB22');
 assert.equal(calls[0].args.report_reason,'spam');
 assert.equal(calls[0].args.report_details,'Repeated unwanted invitations');
 assert.equal(calls[0].args.reporter_id,undefined);
 assert.equal(form.didReset,true);
 assert.ok(toasts.some(v=>/Жалоба сохранена/.test(v)));
 form.fields.reason='invalid';
 form.didReset=false;
 await form.onsubmit({currentTarget:form,preventDefault(){}});
 assert.equal(calls.length,1,'invalid reason must not call RPC');
 assert.equal(form.didReset,false);
 form.fields.reason='spam';
 state.friendProfile={loading:false,profile:{userId:'MC-EE55-FF66',displayName:'Friend',ownedPlatforms:[]},games:[],stats:{}};
 const profile=ctx.renderView();
 assert.match(profile,/data-action="friend-report" data-friend-id="MC-EE55-FF66"/);
 action.onclick();
 assert.equal(state.friendProfile,null);
 assert.equal(field.value,'MC-AA11-BB22');
 assert.equal(field.focused,true);
 assert.deepEqual(alerts,[]);
 console.log('v88 reports PASS: private SQL guards, sanitized UI, valid RPC, invalid-input rejection and report shortcut');
})().catch(e=>{console.error(e);process.exitCode=1});
