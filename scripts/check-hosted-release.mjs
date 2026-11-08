/* Memory Card v91: read-only hosted release smoke.
 * Never creates Auth users, reads personal content or sends account requests.
 * Usage: node scripts/check-hosted-release.mjs [--base URL] [--attempts 8] [--delay-ms 12000]
 */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const DEFAULT_BASE='https://escobarrkz.github.io/memory-card/';
const REQUIRED=['','delete-account.html','privacy.html','manifest.webmanifest','sw.js'];
function ensure(ok,message){if(!ok)throw new Error(message);}
function validBase(base){
  const url=new URL(base);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))
    throw new Error('Only HTTPS origins (or local test HTTP) are allowed');
  if(url.search||url.hash)throw new Error('Base URL must not contain query/fragment');
  if(!url.pathname.endsWith('/'))url.pathname+='/';
  return url;
}
async function getOne(url,fetchImpl,timeoutMs){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const res=await fetchImpl(url.href,{method:'GET',redirect:'follow',cache:'no-store',
      signal:ctrl.signal,headers:{Accept:'text/html,application/json,text/javascript,*/*'}});
    ensure(res?.ok,'GET '+url.href+' returned HTTP '+(res?.status||'unknown'));
    const finalUrl=new URL(res.url||url.href);
    ensure(finalUrl.origin===url.origin,'Unsafe redirect outside '+url.origin);
    const body=await res.text();
    ensure(body.trim().length>0,'Empty response: '+url.pathname);
    return body;
  }finally{clearTimeout(timer);}
}
export function inspectSnapshot(parts,expectedVersion){
  const html=parts[''],del=parts['delete-account.html'],
        privacy=parts['privacy.html'],manifestSource=parts['manifest.webmanifest'],
        worker=parts['sw.js'];
  ensure(/<title>\s*Memory Card\s*<\/title>/.test(html),'Live homepage lacks Memory Card title');
  ensure(/id="app"/.test(html),'Live homepage lacks app root');
  ensure(html.includes('./delete-account.html')&&html.includes('./privacy.html'),
    'Live homepage must link deletion and privacy');
  ensure(html.includes('pwa-updates-v66.js?v='+expectedVersion),
    'Live homepage updater is stale or missing');
  ensure(/id="login"/.test(del)&&/account-deletion-page-v84\.js/.test(del),
    'Account deletion page is incomplete');
  ensure(del.includes('./privacy.html'),'Account deletion page must link privacy');
  ensure(privacy.includes('Конфиденциальность Memory Card')&&privacy.includes('href="./delete-account.html"'),
    'Privacy page must identify Memory Card and link deletion');
  let manifest;
  try{manifest=JSON.parse(manifestSource);}catch{throw new Error('Live web manifest is invalid JSON');}
  ensure(manifest.name?.includes('Memory Card'),'Wrong live PWA manifest');
  ensure(manifest.display==='standalone','PWA display must be standalone');
  ensure(manifest.scope==='./'&&manifest.start_url==='./','PWA must remain scoped to project path');
  const deployed=Number(worker.match(/const VERSION\s*=\s*(\d+)\s*;/)?.[1]);
  ensure(Number.isInteger(deployed),'Live service worker has no VERSION');
  ensure(deployed===expectedVersion,
    'Live Service Worker v'+deployed+' != expected v'+expectedVersion);
  ensure(!worker.includes("event.request.destination==='image'"),
    'Legacy cross-origin image caching is still deployed');
  return {version:deployed,hasPrivacy:true,hasExternalDeletion:true,projectScoped:true};
}
export async function checkHosted({base=DEFAULT_BASE,expectedVersion,fetchImpl=fetch,timeoutMs=12000}={}){
  const baseURL=validBase(base);
  ensure(Number.isInteger(expectedVersion)&&expectedVersion>=90,'Expected version must be >= 90');
  const parts={};
  for(const relative of REQUIRED){
    const route=new URL(relative,baseURL);
    parts[relative]=await getOne(route,fetchImpl,timeoutMs);
  }
  const summary=inspectSnapshot(parts,expectedVersion);
  return {base:baseURL.href,checkedRoutes:REQUIRED.map(x=>new URL(x,baseURL).href),...summary};
}
export function parseArgs(args){
  const out={base:DEFAULT_BASE,attempts:8,delayMs:12000,timeoutMs:12000};
  for(let i=0;i<args.length;i++){
    const key=args[i],value=args[++i];
    if(value===undefined)throw new Error('Missing value for '+key);
    if(key==='--base')out.base=value;
    else if(key==='--attempts')out.attempts=Number(value);
    else if(key==='--delay-ms')out.delayMs=Number(value);
    else if(key==='--timeout-ms')out.timeoutMs=Number(value);
    else throw new Error('Unknown argument: '+key);
  }
  ensure(Number.isInteger(out.attempts)&&out.attempts>=1&&out.attempts<=20,'Invalid attempts');
  ensure(Number.isInteger(out.delayMs)&&out.delayMs>=0&&out.delayMs<=60000,'Invalid delay');
  ensure(Number.isInteger(out.timeoutMs)&&out.timeoutMs>=1000&&out.timeoutMs<=60000,'Invalid timeout');
  return out;
}
async function main(){
  const opts=parseArgs(process.argv.slice(2));
  const local=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  const version=Number(local.match(/const VERSION\s*=\s*(\d+)\s*;/)?.[1]);
  ensure(Number.isInteger(version),'Local service worker has no build number');
  for(let attempt=1;attempt<=opts.attempts;attempt++){
    try{
      const summary=await checkHosted({base:opts.base,expectedVersion:version,timeoutMs:opts.timeoutMs});
      console.log(JSON.stringify({ok:true,attempt,checkedAt:new Date().toISOString(),...summary},null,2));
      return;
    }catch(error){
      console.error('Hosted release check '+attempt+'/'+opts.attempts+': '+(error?.message||error));
      if(attempt===opts.attempts)throw error;
      await new Promise(done=>setTimeout(done,opts.delayMs));
    }
  }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{console.error('Release smoke FAILED:',error.message);process.exitCode=1;});
}
