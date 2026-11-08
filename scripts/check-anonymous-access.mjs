/* Memory Card v91 security release audit: read-only anonymous API isolation.
 * No login, cookies, Authorization header, writes, personal data output or secrets.
 * Uses the already-public Supabase publishable key from backend-config.js.
 */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const TABLES=['games','profiles','user_settings','collections','collection_games',
  'friendships','account_deletion_requests'];
function ensure(condition,msg){if(!condition)throw new Error(msg);}
export function parsePublicConfig(source){
  const url=String(source).match(/supabaseUrl\s*:\s*['"]([^'"]+)['"]/);
  const token=String(source).match(/supabaseAnonKey\s*:\s*['"]([^'"]+)['"]/);
  ensure(url&&token,'Missing published Supabase configuration');
  const origin=new URL(url[1]);
  ensure(origin.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(origin.hostname),
    'Supabase HTTPS host is not approved');
  ensure(/^sb_publishable_[A-Za-z0-9_-]+$/.test(token[1])||
    /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token[1]),
    'Only publishable/legacy anon project keys are permitted');
  return {origin:origin.origin,publicKey:token[1]};
}
async function request(url,publicKey,fetchImpl,headers={}){
  const res=await fetchImpl(url,{method:'GET',cache:'no-store',redirect:'error',
    credentials:'omit',signal:AbortSignal.timeout(15000),
    headers:{apikey:publicKey,accept:'application/json',...headers}});
  ensure(res&&Number.isInteger(res.status),'Network request did not return an HTTP response');
  return res;
}
export async function checkAnonymousIsolation({origin,publicKey,fetchImpl=fetch}){
  const base=new URL(origin);
  ensure(base.protocol==='https:'&&base.hostname.endsWith('.supabase.co'),
    'Unsafe Supabase origin');
  ensure(publicKey&&!publicKey.startsWith('sb_secret_'),'Secret API keys prohibited');
  const checked=[];
  for(const table of TABLES){
    const target=new URL('/rest/v1/'+table,base);
    target.searchParams.set('select','*');
    target.searchParams.set('limit','1');
    const res=await request(target.href,publicKey,fetchImpl);
    if(res.status===200||res.status===206){
      const content=await res.json();
      ensure(Array.isArray(content)&&content.length===0,
        'ANONYMOUS_DATA_EXPOSURE: '+table+' returned a row or unexpected response');
      checked.push({table,result:'empty'});
    }else if([401,403,404,406].includes(res.status)){
      checked.push({table,result:'denied'});
    }else{
      throw new Error('Unexpected public API response for '+table+': HTTP '+res.status);
    }
  }
  // Private moderation schema must never be exposed through the REST API.
  const privateUrl=new URL('/rest/v1/user_reports?select=*&limit=1',base);
  const privateResponse=await request(privateUrl.href,publicKey,fetchImpl,{'Accept-Profile':'mc_private'});
  ensure([400,401,403,404,406].includes(privateResponse.status),
    'PRIVATE_SCHEMA_EXPOSED or unexpected response: HTTP '+privateResponse.status);
  return {ok:true,readOnly:true,tablesChecked:checked,privateModerationSchema:'not exposed'};
}
async function main(){
  const source=await readFile(new URL('../backend-config.js',import.meta.url),'utf8');
  const config=parsePublicConfig(source);
  const result=await checkAnonymousIsolation(config);
  // Never print the key or any record contents, even in an error.
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),...result},null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{console.error('Anonymous access audit FAILED: '+error.message);process.exitCode=1;});
}
