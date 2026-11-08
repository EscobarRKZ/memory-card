/* Memory Card v86: deterministic static release checks; no network, no real accounts. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const load=name=>fs.readFileSync(path.join(root,name),'utf8');
const main=load('index.html');
const deletion=load('delete-account.html');
const staging=load('staging-v2.html');
const sw=load('sw.js');
const updater=load('pwa-updates-v66.js');
const manifest=JSON.parse(load('manifest.webmanifest'));
const version=Number(sw.match(/const VERSION=(\d+);/)?.[1]);
const build=Number(updater.match(/const BUILD\s*=\s*(\d+);/)?.[1]);
assert.ok(version>=86,'release version unexpectedly old');
assert.equal(build,version,'updater and service-worker release versions disagree');
assert.match(sw,new RegExp(`const CACHE='memory-card-v${version}-[^']+';`));
const match=sw.match(/const ASSETS=(\[.*\]);/);
assert.ok(match,'offline precache not found');
const assets=JSON.parse(match[1]);
assert.ok(assets.includes('./index.html'));
assert.ok(assets.includes('./delete-account.html'),'external deletion page must be precached');
assert.ok(assets.includes('./pwa-updates-v66.js?v=${version}'));
assert.ok(main.includes('./pwa-updates-v66.js?v=${version}'));
const allLocalAssets=(html)=>Array.from(
  html.matchAll(/\b(?:src|href)="(\.\/[^"#?]+(?:\?[^"#]*)?)"/g),
  found=>found[1]
);
for(const asset of assets){
  if(asset==='./')continue;
  const bare=asset.slice(2).split('?')[0];
  assert.ok(fs.existsSync(path.join(root,bare)),'missing offline file: '+asset);
}
for(const [name,html] of [['index.html',main],['delete-account.html',deletion],['staging-v2.html',staging]]){
  for(const asset of allLocalAssets(html)){
    const bare=asset.slice(2).split('?')[0];
    assert.ok(fs.existsSync(path.join(root,bare)),name+' references absent file: '+asset);
    if(name!=='staging-v2.html'){
      assert.ok(assets.includes(asset),name+' local asset not in offline precache: '+asset);
    }
  }
  const libraries=Array.from(html.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/g),m=>m[0]);
  assert.deepEqual(libraries,['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0'],name+' must pin the browser SDK exactly');
}
assert.ok(deletion.indexOf('account-deletion-v84.js')<deletion.indexOf('account-deletion-page-v84.js'),'deletion API must load before the page controller');
assert.ok(deletion.indexOf('local-delete-cleanup-v85.js')<deletion.indexOf('account-deletion-page-v84.js'),'local cleanup must load before the page controller');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.scope,'./');
assert.equal(manifest.start_url,'./');
for(const icon of manifest.icons){
  assert.ok(fs.existsSync(path.join(root,icon.src)),'manifest icon missing: '+icon.src);
}
console.log('Memory Card PWA integrity PASS: build, manifest, versioned cache, local assets, deletion page, pinned SDK');
