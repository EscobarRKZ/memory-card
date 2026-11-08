/* v91: prevent invalid/fake Android association values. No app keys generated. */
import assert from 'node:assert/strict';
import {createAssetLinks,parseAssetArgs} from '../scripts/generate-assetlinks.mjs';

const fp='AB:'.repeat(31)+'CD';
const second='12:'.repeat(31)+'34';
const rows=createAssetLinks('com.sample.memorycard',[fp,fp.toLowerCase(),second]);
assert.equal(rows.length,1);
assert.deepEqual(rows[0].relation,['delegate_permission/common.handle_all_urls']);
assert.equal(rows[0].target.namespace,'android_app');
assert.equal(rows[0].target.package_name,'com.sample.memorycard');
assert.deepEqual(rows[0].target.sha256_cert_fingerprints,[fp,second]);
assert.equal(parseAssetArgs(['--package','com.sample.memorycard','--fingerprint',fp]).fingerprints.length,1);
assert.throws(()=>createAssetLinks('example',[fp]),/Package/);
assert.throws(()=>createAssetLinks('com.example.app',[]),/At least one/);
assert.throws(()=>createAssetLinks('com.example.app',['AAAAAAAA']),/Invalid SHA/);
assert.throws(()=>createAssetLinks('com.example.app',['00:00:00']),/Invalid SHA/);
assert.throws(()=>createAssetLinks('com.example.app',['not-a-real-hash']),/Invalid SHA/);
console.log('v91 Digital Asset Links generator PASS: schema, real fingerprint requirement, duplicates and invalid input');
