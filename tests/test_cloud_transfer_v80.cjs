/* Run with: node tests/test_cloud_transfer_v80.cjs
   Pure transport tests. No network, production DB, credentials or app data. */
'use strict';
const assert = require('node:assert/strict');
const transfer = require('../cloud-transfer-v80.js');

function makeClient(rows, options = {}) {
  const reads = [], writes = [];
  return {
    reads, writes,
    from(table) {
      assert.equal(table, 'games');
      return {
        select(cols, opts) {
          assert.equal(cols, '*');
          return {
            eq(key, id) { assert.equal(key, 'user_id'); assert.equal(id, 'mock-user'); return this; },
            order(column, config) { assert.equal(column, 'id'); assert.equal(config.ascending, true); return this; },
            async range(from, to) {
              reads.push([from, to]);
              if (options.failReadAt === reads.length) return { error: new Error('connection interrupted') };
              const page = rows.slice(from, to + 1);
              if (options.duplicatePage && reads.length === 2) page[0] = rows[0];
              return {
                data: page,
                count: from === 0 ? (options.expectedCount ?? rows.length) : null,
                error: null
              };
            }
          };
        },
        async upsert(chunk, config) {
          assert.equal(config.onConflict, 'user_id,id');
          writes.push(chunk);
          if (options.failWriteAt === writes.length) return { error: new Error('write interrupted') };
          return { error: null };
        }
      };
    }
  };
}

(async () => {
  for (const count of [0, 1, 110, 400, 401, 1000, 1150, 1200]) {
    const data = Array.from({ length: count }, (_, i) => ({
      id: 'game-' + String(i).padStart(5, '0'),
      user_id: 'mock-user'
    }));
    const client = makeClient(data);
    const read = await transfer.downloadGames(client, 'mock-user');
    assert.deepEqual(read, data);
    assert.ok(client.reads.length <= Math.ceil(count / 400) + 1);
    const saved = await transfer.uploadGames(client, read);
    assert.equal(saved, count);
    assert.deepEqual(client.writes.flat(), data);
    assert.ok(client.writes.every(batch => batch.length <= 100));
  }

  const many = Array.from({length: 1150},(_,i)=>({id:'id-'+i,user_id:'mock-user'}));
  await assert.rejects(transfer.downloadGames(makeClient(many,{failReadAt:2}),'mock-user'),/connection interrupted/);
  await assert.rejects(transfer.downloadGames(makeClient(many,{expectedCount:1151}),'mock-user'),/Incomplete cloud download/);
  await assert.rejects(transfer.downloadGames(makeClient(many,{duplicatePage:true}),'mock-user'),/Duplicate or missing/);
  const failedWrite = makeClient(many,{failWriteAt:3});
  await assert.rejects(transfer.uploadGames(failedWrite,many),/batch 3 failed/);
  assert.equal(failedWrite.writes.length,3);
  await assert.rejects(transfer.downloadGames(makeClient([]),'mock-user',999),/Invalid cloud transfer batch size/);
  await assert.rejects(transfer.uploadGames(makeClient([]),many,0),/Invalid cloud transfer batch size/);
  process.stdout.write('Cloud transfer v80: pagination, verification and bounded uploads PASS\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
