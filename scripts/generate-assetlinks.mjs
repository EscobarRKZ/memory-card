/* v91: generate a Digital Asset Links statement only from real package/certificate values.
 * This program never creates or reads Android signing keys.
 * Usage: node scripts/generate-assetlinks.mjs --package com.example.app --fingerprint AA:BB:... [--output path]
 */
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const FINGERPRINT=/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/;
const PACKAGE=/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){2,}$/;
export function createAssetLinks(packageName,fingerprints){
  if(typeof packageName!=='string'||!PACKAGE.test(packageName))
    throw new Error('Package name must be a reverse-DNS Android application ID (3+ components)');
  if(!Array.isArray(fingerprints)||fingerprints.length===0)
    throw new Error('At least one real SHA-256 Android app signing fingerprint is required');
  const normalized=[...new Set(fingerprints.map(raw=>{
    const item=String(raw).trim();
    if(!FINGERPRINT.test(item))throw new Error('Invalid SHA-256 signing fingerprint');
    return item.toUpperCase();
  }))];
  return [{
    relation:['delegate_permission/common.handle_all_urls'],
    target:{
      namespace:'android_app',
      package_name:packageName,
      sha256_cert_fingerprints:normalized
    }
  }];
}
export function parseAssetArgs(args){
  const out={packageName:'',fingerprints:[],output:''};
  for(let i=0;i<args.length;i++){
    const key=args[i],val=args[++i];
    if(val===undefined)throw new Error('Missing argument for '+key);
    if(key==='--package')out.packageName=val;
    else if(key==='--fingerprint')out.fingerprints.push(val);
    else if(key==='--output')out.output=val;
    else throw new Error('Unknown option '+key);
  }
  return out;
}
async function main(){
  const input=parseAssetArgs(process.argv.slice(2));
  const json=JSON.stringify(createAssetLinks(input.packageName,input.fingerprints),null,2)+'\n';
  if(input.output){
    await writeFile(input.output,json,{flag:'wx'});
    console.log('Created candidate Digital Asset Links file '+input.output);
    console.log('Publish at https://YOUR-OWNED-HOST/.well-known/assetlinks.json, NEVER at /memory-card/.well-known/');
  }else{
    process.stdout.write(json);
  }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
}
