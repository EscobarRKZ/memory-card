/* Memory Card v84 — non-destructive account deletion request page.
 * This sends an authenticated request; it NEVER deletes a user or their data.
 * Email/password are submitted only to the configured Supabase Auth endpoint.
 */
(() => {
  'use strict';
  const page=document.getElementById('mc-deletion-page');
  if(!page)return;
  const cfg=window.MC_BACKEND_V2||{};
  const status=page.querySelector('[data-request-status]');
  const signInForm=page.querySelector('[data-request-login]');
  const accountPanel=page.querySelector('[data-request-account]');
  const currentEmail=page.querySelector('[data-request-email]');
  const requestForm=page.querySelector('[data-request-form]');
  const requestPending=page.querySelector('[data-request-pending]');
  const requestButton=requestForm.querySelector('button[type="submit"]');
  const signOutButton=page.querySelector('[data-request-logout]');
  const validConfig=cfg.enabled!==false&&typeof cfg.supabaseUrl==='string'&&
    cfg.supabaseUrl.startsWith('https://')&&!!cfg.supabaseAnonKey&&
    typeof window.supabase?.createClient==='function';
  if(!validConfig){
    status.textContent='Не удалось подключить Memory Card Network.';
    signInForm.hidden=true;
    return;
  }
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  let activeUser=null,working=false;
  let captchaWidget=null,captchaToken='';
  function initCaptcha(attempt=0){
    if(!cfg.turnstileSiteKey)return;
    if(!window.turnstile){
      if(attempt<30)setTimeout(()=>initCaptcha(attempt+1),200);
      return;
    }
    const host=page.querySelector('[data-request-turnstile]');
    if(!host||captchaWidget!==null)return;
    captchaWidget=window.turnstile.render(host,{
      sitekey:cfg.turnstileSiteKey,theme:'dark',
      callback:token=>{captchaToken=token;},
      'expired-callback':()=>{captchaToken='';},
      'error-callback':()=>{captchaToken='';}
    });
  }
  function resetCaptcha(){
    captchaToken='';
    if(captchaWidget!==null&&window.turnstile){
      try{window.turnstile.reset(captchaWidget);}catch(_){}
    }
  }
  initCaptcha();
  const setStatus=(message,kind='')=>{
    status.textContent=message;
    status.dataset.kind=kind;
  };
  const requestMessage=code=>({
    '23505':'Запрос уже зарегистрирован. Обнови страницу.',
    '42501':'Доступ запрещён. Войди в свой аккаунт.',
    'PGRST116':'Не удалось определить статус запроса.'
  })[String(code||'')]||'Не удалось отправить запрос. Попробуй снова.';
  async function refreshRequest(){
    if(!activeUser)return;
    const {data,error}=await client.from('account_deletion_requests')
      .select('status,requested_at').eq('user_id',activeUser.id).maybeSingle();
    if(error){
      requestForm.hidden=true;
      requestPending.hidden=false;
      requestPending.textContent='Не удалось проверить статус запроса. Обнови страницу.';
      setStatus('Облачный сервис временно недоступен.','error');
      return;
    }
    if(data){
      requestForm.hidden=true;
      requestPending.hidden=false;
      const labels={
        pending:'Ожидает обработки',
        processing:'Обрабатывается',
        needs_verification:'Нужна дополнительная проверка личности'
      };
      const stamp=data.requested_at?new Date(data.requested_at).toLocaleDateString('ru-RU'):'';
      requestPending.textContent='Запрос уже получен. Статус: '+
        (labels[data.status]||'На рассмотрении')+(stamp?' · '+stamp:'')+
        '. Повторно отправлять его не нужно.';
    }else{
      requestPending.hidden=true;
      requestForm.hidden=false;
    }
  }
  async function refresh(){
    const {data:{user}={},error}=await client.auth.getUser();
    activeUser=error?null:user||null;
    if(!activeUser?.id){
      signInForm.hidden=false;
      accountPanel.hidden=true;
      setStatus('');
      return;
    }
    currentEmail.textContent=String(activeUser.email||'');
    signInForm.hidden=true;
    accountPanel.hidden=false;
    setStatus('');
    await refreshRequest();
  }
  signInForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(working)return;
    if(cfg.turnstileSiteKey&&!captchaToken){
      setStatus('Подтверди проверку безопасности.','error');
      return;
    }
    working=true;
    const btn=signInForm.querySelector('button[type="submit"]');
    btn.disabled=true;
    setStatus('Проверяю данные для входа…');
    const email=signInForm.elements.email.value.trim();
    const password=signInForm.elements.password.value;
    signInForm.elements.password.value='';
    try{
      const {error}=await client.auth.signInWithPassword({
        email,password,options:{captchaToken:captchaToken||undefined}
      });
      if(error)throw error;
      await refresh();
    }catch(_){
      setStatus('Не удалось войти. Проверь email и пароль.','error');
    }finally{resetCaptcha();btn.disabled=false;working=false;}
  });
  requestForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(working||!activeUser)return;
    const phrase=requestForm.elements.confirmation.value.trim();
    if(phrase!=='УДАЛИТЬ'){
      setStatus('Для отправки запроса введи УДАЛИТЬ.','error');
      return;
    }
    working=true;requestButton.disabled=true;
    setStatus('Отправляю запрос…');
    try{
      const {data:{user}={},error:authError}=await client.auth.getUser();
      if(authError||user?.id!==activeUser.id)throw new Error('SESSION_CHANGED');
      // The database policy requires auth.uid() = user_id and
      // pending status. An authenticated user cannot change request status.
      const {error}=await client.from('account_deletion_requests').insert({
        user_id:user.id,status:'pending'
      });
      if(error){
        if(error.code==='23505'){await refreshRequest();setStatus('Запрос уже зарегистрирован.');return;}
        throw error;
      }
      requestForm.elements.confirmation.value='';
      await refreshRequest();
      setStatus('Запрос получен. Он не удаляет аккаунт автоматически.','ok');
    }catch(error){
      setStatus(requestMessage(error?.code),'error');
    }finally{working=false;requestButton.disabled=false;}
  });
  signOutButton.addEventListener('click',async()=>{
    if(working)return;
    working=true;signOutButton.disabled=true;
    try{
      const {error}=await client.auth.signOut();
      if(error)throw error;
      activeUser=null;
      requestForm.elements.confirmation.value='';
      await refresh();
    }catch(_){setStatus('Не удалось выйти. Попробуй ещё раз.','error');}
    finally{working=false;signOutButton.disabled=false;}
  });
  void refresh();
})();
