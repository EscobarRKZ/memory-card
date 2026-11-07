/* Memory Card account deletion — staged for pre-release security review.
 * Server-side service role key must NEVER be exposed to the web app.
 * Deletion is intentionally DISABLED unless MC_ACCOUNT_DELETION_ENABLED=true.
 */
const headers={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store"
};
function reply(status,body){
  return new Response(JSON.stringify(body),{status,headers});
}
function configuration(){
  const get=key=>Deno.env.get(key)||"";
  return {
    enabled:get("MC_ACCOUNT_DELETION_ENABLED")==="true",
    url:get("SUPABASE_URL").replace(/\/+$/,""),
    anon:get("SUPABASE_ANON_KEY"),
    service:get("SUPABASE_SERVICE_ROLE_KEY")
  };
}
async function requestJson(url,init){
  const response=await fetch(url,init);
  let data=null;
  try{data=await response.json();}catch(_){}
  return {ok:response.ok,status:response.status,data};
}
async function handle(req){
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return reply(405,{error:"METHOD_NOT_ALLOWED"});
  const cfg=configuration();

  // This safety switch remains OFF during initial rollout. It is unlocked
  // only after disposable-account end-to-end tests and an operator review.
  if(!cfg.enabled)return reply(503,{error:"DELETION_NOT_YET_ENABLED"});
  if(!cfg.url||!cfg.anon||!cfg.service)return reply(503,{error:"SERVER_NOT_CONFIGURED"});
  if(!/^https:\/\//i.test(cfg.url))return reply(503,{error:"SERVER_NOT_CONFIGURED"});

  const auth=req.headers.get("Authorization")||"";
  const match=/^Bearer ([a-zA-Z0-9._-]+)$/.exec(auth);
  if(!match)return reply(401,{error:"LOGIN_REQUIRED"});
  const size=Number(req.headers.get("Content-Length")||"0");
  if(size>8192)return reply(413,{error:"REQUEST_TOO_LARGE"});

  let data=null;
  try{
    const raw=await req.text();
    if(raw.length>8192)return reply(413,{error:"REQUEST_TOO_LARGE"});
    data=JSON.parse(raw);
  }catch(_){return reply(400,{error:"INVALID_REQUEST"});}
  if(!data||typeof data!=="object"||Array.isArray(data)){
    return reply(400,{error:"INVALID_REQUEST"});
  }
  if(data.confirmation!=="УДАЛИТЬ"&&data.confirmation!=="DELETE"){
    return reply(400,{error:"CONFIRMATION_REQUIRED"});
  }
  const email=typeof data.email==="string"?data.email.trim().toLowerCase():"";
  const password=data.password;
  if(!email||email.length>320||typeof password!=="string"||
    password.length<1||password.length>1024){
    return reply(400,{error:"INVALID_REQUEST"});
  }

  const common={"apikey":cfg.anon,"Content-Type":"application/json"};
  try{
    // Always authenticate the *caller* using Supabase Auth's live user
    // endpoint. Never accept a user ID from the submitted JSON.
    const profile=await requestJson(cfg.url+"/auth/v1/user",{
      method:"GET",
      headers:{...common,Authorization:"Bearer "+match[1]}
    });
    if(!profile.ok||!profile.data?.id||!profile.data?.email){
      return reply(401,{error:"LOGIN_REQUIRED"});
    }
    const user=profile.data;
    if(email!==String(user.email).trim().toLowerCase()){
      return reply(401,{error:"ACCOUNT_EMAIL_MISMATCH"});
    }

    // Require a fresh password check *at the server* rather than accepting
    // possession of an existing JWT as authorization to erase an account.
    // This creates no persistent session in the Edge Function.
    const proof=await requestJson(cfg.url+"/auth/v1/token?grant_type=password",{
      method:"POST",
      headers:common,
      body:JSON.stringify({email:user.email,password})
    });
    if(!proof.ok||proof.data?.user?.id!==user.id){
      return reply(401,{error:"REAUTHENTICATION_FAILED"});
    }

    const id=String(user.id);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){
      return reply(503,{error:"INVALID_AUTH_ID"});
    }
    // Hard-delete Auth user. The current schema's games, profile, settings,
    // collections and friendships all reference auth.users ON DELETE CASCADE.
    // If Storage ownership blocks deletion, Supabase returns an error; never
    // pretend that the account was removed in that case.
    const deleted=await requestJson(
      cfg.url+"/auth/v1/admin/users/"+encodeURIComponent(id),
      {
        method:"DELETE",
        headers:{
          "apikey":cfg.service,
          "Authorization":"Bearer "+cfg.service,
          "Content-Type":"application/json"
        }
      }
    );
    if(!deleted.ok)return reply(503,{error:"DELETION_FAILED_CONTACT_SUPPORT"});
    return reply(200,{deleted:true});
  }catch(_){
    // No sensitive error details, access tokens, or passwords in responses.
    return reply(503,{error:"TEMPORARILY_UNAVAILABLE"});
  }
}
Deno.serve(handle);
