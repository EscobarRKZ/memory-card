/* v95: offline guard for manually executed, rollback-only live DB contract tests.
 * CI reads these files; CI NEVER connects to Supabase or creates users.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const names=['live_cloud_cas_v95.sql','live_social_authorization_v95.sql'];
for(const name of names){
 const source=fs.readFileSync(path.join(__dirname,name),'utf8');
 const start=source.match(/^[ \t]*BEGIN;[ \t]*$/gm)||[];
 const end=source.match(/^[ \t]*ROLLBACK;[ \t]*$/gm)||[];
 const commits=source.match(/^[ \t]*COMMIT(?:[ \t;]|$)/gm)||[];
 assert.equal(start.length,1,name+' must start one explicit transaction');
 assert.equal(end.length,1,name+' must end in one explicit ROLLBACK');
 assert.equal(commits.length,0,name+' must not contain COMMIT');
 assert.ok(source.indexOf('\nBEGIN;')<source.indexOf('\nROLLBACK;'),name+' rollback must follow begin');
 assert.match(source,/INSERT INTO auth\.users/i,name+' must insert only disposable Auth fixtures');
 assert.match(source,/mc-v95-a@example\.invalid/);
 assert.match(source,/mc-v95-b@example\.invalid/);
 assert.match(source,/SET LOCAL ROLE authenticated/i,name+' must exercise actual RLS permissions');
 assert.match(source,/set_config\('request\.jwt\.claim\.sub'/i,name+' must simulate two separate caller JWT subjects');
 assert.match(source,/RAISE EXCEPTION 'V95_/i,name+' must reject violated invariants');
 assert.ok(!/service_role|SUPABASE_SECRET|SUPABASE_DB_PASSWORD|CREATE EXTENSION/i.test(source),
   name+' must contain no service secrets or privileged infrastructure changes');
 const after=source.slice(source.lastIndexOf('\nROLLBACK;')+'\nROLLBACK;'.length).trim();
 assert.match(after,/^SELECT\s/i,name+' may only count fixture leftovers after rollback');
 assert.ok(!/;\s*(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|SET)\s/i.test(after),
   name+' must not modify database after rollback');
 assert.match(after,/remaining_users/);
 assert.match(after,/remaining_games/);
 assert.match(after,/remaining_fixture_users/);
}
const cas=fs.readFileSync(path.join(__dirname,names[0]),'utf8');
for(const anchor of ['public.save_games_if_unchanged','MC_SYNC_CONFLICT',
 'V95_A_SEES_PRIVATE_PROFILE_OR_SETTINGS','V95_B_SEES_PRIVATE_PROFILE_OR_SETTINGS',
 'V95_FORGED_REVISION_EDITED_OTHER_OWNER','V95_STALE_CAS_UPDATE_WAS_ACCEPTED'])
 assert.ok(cas.includes(anchor),'Missing live CAS invariant: '+anchor);
const social=fs.readFileSync(path.join(__dirname,names[1]),'utf8');
for(const anchor of ['public.accept_friend_request','public.send_friend_request',
 'public.block_user','public.unblock_user','public.social_state','public.get_friend_profile',
 'PRIVATE_NOTE_B','PRIVATE_BACKLOG_B','V95_REINVITATION_NOT_ACCEPTED'])
 assert.ok(social.includes(anchor),'Missing social integration invariant: '+anchor);
console.log('v95 live DB SQL harness checked: explicit rollback, two disposable JWT subjects, RLS, CAS and social permissions');
