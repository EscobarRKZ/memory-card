/* Memory Card account deletion — security-critical, testable Edge Function core.
 * No service-role key, email, password or JWT may appear in logs or responses.
 * A posted user ID is never accepted: the sole target is auth.getUser(token). */
const MAX_BODY_LENGTH=5000;
const PHRASE='УДАЛИТЬ НАВСЕГДА';
function safeKey(env,legacy,modern){
  const value=String(env(legacy)||'').trim();
  if(value)return value;
  try{
    const keys=JSON.parse(String(env(modern)||'{}'));
    return String(keys?.default||'').trim();
  }catch(_){return '';}
}
function json(status,code,origin,allow,extras={}){
  const headers={
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Vary':'Origin'
  };
  if(origin && allow){
    headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Methods']='POST, OPTIONS';
    headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Max-Age']='600';
  }
  return new Response(JSON.stringify({code,...extras}),{status,headers});
}
function cleanRequestBody(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  // The target account is always derived from the JWT, never request JSON.
  if(value.userId!==undefined || value.user_id!==undefined || value.email!==undefined)return null;
  if(value.confirmation!==PHRASE || typeof value.password!=='string' ||
     value.password.length<8 || value.password.length>256)return null;
  if(value.captchaToken!==undefined &&
     (typeof value.captchaToken!=='string'||value.captchaToken.length>4000))return null;
  return {password:value.password,captchaToken:value.captchaToken||undefined};
}

export function createDeleteOwnAccountHandler({createClient,env,allowedOrigins}){
  if(typeof createClient!=='function'||typeof env!=='function')
    throw new Error('Missing secure Edge Function dependencies');
  return async function handler(request){
    const origin=String(request.headers.get('origin')||'');
    const list=allowedOrigins||String(env('MEMORY_CARD_ALLOWED_ORIGINS')||
      'https://escobarrkz.github.io').split(',').map(s=>s.trim()).filter(Boolean);
    const allowed=!origin||list.includes(origin);
    if(!allowed)return json(403,'ORIGIN_DENIED',origin,false);
    if(request.method==='OPTIONS'){
      const headers={
        'Cache-Control':'no-store',
        'Access-Control-Allow-Origin':origin||list[0]||'https://escobarrkz.github.io',
        'Access-Control-Allow-Methods':'POST, OPTIONS',
        'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
        'Access-Control-Max-Age':'600',
        'Vary':'Origin'
      };
      return new Response(null,{status:204,headers});
    }
    if(request.method!=='POST')return json(405,'METHOD_NOT_ALLOWED',origin,allowed);
    const header=String(request.headers.get('Authorization')||'');
    const match=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
    if(!match)return json(401,'AUTH_REQUIRED',origin,allowed);
    const bytes=Number(request.headers.get('content-length'));
    if(Number.isFinite(bytes)&&bytes>MAX_BODY_LENGTH){
      return json(413,'REQUEST_TOO_LARGE',origin,allowed);
    }
    if(!String(request.headers.get('content-type')||'').toLowerCase().includes('application/json')){
      return json(415,'JSON_REQUIRED',origin,allowed);
    }
    let raw='';
    try{raw=await request.text();}catch(_){return json(400,'INVALID_BODY',origin,allowed)}
    if(raw.length>MAX_BODY_LENGTH)return json(413,'REQUEST_TOO_LARGE',origin,allowed);
    let input;
    try{input=cleanRequestBody(JSON.parse(raw));}catch(_){}
    if(!input)return json(400,'CONFIRMATION_REQUIRED',origin,allowed);

    const url=String(env('SUPABASE_URL')||'');
    const anon=safeKey(env,'SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEYS');
    const adminKey=safeKey(env,'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS');
    if(!url||!anon||!adminKey||anon===adminKey){
      return json(503,'SERVICE_NOT_CONFIGURED',origin,allowed);
    }

    try{
      const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
      const verifier=createClient(url,anon,opts);
      // This remote Auth call validates the JWT against the current account.
      const {data:identity,error:userError}=await verifier.auth.getUser(match[1]);
      const user=identity?.user;
      if(userError||!user?.id||!user?.email||user.is_anonymous){
        return json(401,'AUTH_REQUIRED',origin,allowed);
      }

      const admin=createClient(url,adminKey,opts);
      const {data:requestRow,error:requestError}=await admin
        .from('account_deletion_requests')
        .select('status')
        .eq('user_id',user.id)
        .maybeSingle();
      if(requestError)return json(503,'REQUEST_CHECK_FAILED',origin,allowed);
      if(!requestRow)return json(409,'REQUEST_REQUIRED',origin,allowed);
      if(requestRow.status!=='pending'){
        return json(409,'REQUEST_NOT_PENDING',origin,allowed);
      }

      // A valid session alone is not enough for irreversible deletion.
      // Verify the password again against Auth without logging it.
      const {data:reauth,error:reauthError}=await verifier.auth.signInWithPassword({
        email:user.email,
        password:input.password,
        options:input.captchaToken?{captchaToken:input.captchaToken}:{}
      });
      if(reauthError || !reauth?.user?.id || reauth.user.id!==user.id){
        return json(403,'REAUTH_FAILED',origin,allowed);
      }

      // Storage objects can prevent Auth deletion and need their own removal
      // policy. Until this is implemented, fail closed if any bucket exists.
      const {data:buckets,error:storageError}=await admin.storage.listBuckets();
      if(storageError||!Array.isArray(buckets)){
        return json(503,'STORAGE_CHECK_FAILED',origin,allowed);
      }
      if(buckets.length){
        return json(409,'STORAGE_REVIEW_REQUIRED',origin,allowed);
      }

      // Auth rows and all Memory Card related public tables use ON DELETE
      // CASCADE. This is a permanent hard deletion, never shouldSoftDelete.
      const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
      if(deleteError)return json(503,'DELETE_FAILED',origin,allowed);

      return json(200,'DELETED',origin,allowed,{deleted:true,localCleanupRequired:true});
    }catch(_){
      return json(503,'TEMPORARY_FAILURE',origin,allowed);
    }
  };
}
