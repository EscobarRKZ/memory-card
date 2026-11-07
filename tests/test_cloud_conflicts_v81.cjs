/* Run: node tests/test_cloud_conflicts_v81.cjs
 * Deterministic planning tests. No network, browser, or production database. */
'use strict';
const assert=require('node:assert/strict');
const v=require('../cloud-conflicts-v81.js');
const game=(id,notes,updatedAt='2026-10-01T00:00:00Z')=>({
  id,title:'Title '+id,platform:'PS5',status:'completed',
  rating:8,notes,addedAt:'2026-01-01T00:00:00Z',updatedAt
});
const a=game('1','Original');
const b=game('2','Other');
const first=v.plan([a,b],[a,b],{});
assert.equal(first.conflicts.length,0);
assert.equal(first.writes.length,0);
const base=first.baseline;
const same=v.plan([a,b],[a,b],base);
assert.equal(same.writes.length,0);

const local=v.plan([game('1','Offline'),b],[a,b],base);
assert.equal(local.writes.length,1);
assert.equal(local.writes[0].kind,'update');
assert.equal(local.writes[0].id,'1');
const remote=v.plan([a,b],[game('1','Desktop', '2026-11-01'),b],base);
assert.equal(remote.writes.length,0);
assert.equal(remote.merged.find(x=>x.id==='1').notes,'Desktop');
const both=v.plan([game('1','Offline'),b],[game('1','Desktop','2026-11-01'),b],base);
assert.equal(both.conflicts.length,1);
assert.equal(both.conflicts[0].reason,'both-changed');
// Without a trusted baseline neither clock wins silently.
const legacy=v.plan([game('1','Offline')],[game('1','Desktop','2026-11-01')],{});
assert.equal(legacy.conflicts.length,1);
assert.equal(legacy.conflicts[0].reason,'unknown-base');
// Tombstones are real edits, so cross-device delete-vs-edit conflicts.
const deleted={...a,deletedAt:'2026-11-01T12:00:00Z'};
const deleteConflict=v.plan([deleted],[game('1','Desktop','2026-11-01')],base);
assert.equal(deleteConflict.conflicts.length,1);
const newGame=v.plan([game('3','New')],[],base);
assert.equal(newGame.writes.length,1);
assert.equal(newGame.writes[0].kind,'insert');
const missing=v.plan([game('1','Original')],[],base);
assert.equal(missing.conflicts.length,1);
assert.equal(missing.conflicts[0].reason,'remote-missing');
// Equivalent timestamps in different ISO time zones do not cause false edits.
assert.equal(v.signature({...a,addedAt:'2026-01-01T05:00:00+05:00'}),v.signature(a));
assert.deepEqual(base.records['1'].signature,v.signature(a));
console.log('v81: 3-way merge, offline edits, conflict and tombstone planning PASS');
