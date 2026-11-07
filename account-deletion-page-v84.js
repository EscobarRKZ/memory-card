/* Standalone Memory Card deletion request page. Runs on same origin as PWA,
   so an existing account session can be reused without installing the app. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const login=$('login'),account=$('account'),requestForm=$('request');
  const state=$('request-state'),notice=$('notice'),loading=$('loading');
  const cfg=window.MC_BACKEND_V2||{};
  const requests=window.MemoryCardDeletionRequestV84;
  let busy=false,client=null,widgetId=null,token='',signedIn=null;

  function tell(message,problem=false){
    notice.textContent=message;
    notice.dataset.error=problem?'true':'false';
  }
  function showLogin(){
    login.hidden=false;account.hidden=true;requestForm.hidden=true;
    signedIn=null;
  }
  function showAccount(){
    login.hidden=true;account.hidden=false;
  }
  function errorMessage(error){
    const message=String(error?.message||'Ошибка соединения');
    if(error?.code==='NOT_AUTHENTICATED')return 'Сессия истекла. Войди в аккаунт снова.';
    if(/captcha/i.test(message))return 'Проверка безопасности не пройдена. Повтори попытку.';
    if(/invalid login credentials/i.test(message.toLowerCase()))return 'Неверный email или пароль.';
    return 'Запрос не удалось выполнить. Проверь соединение и повтори попытку.';
  }
  async function refresh(){
    const user=await requests.currentUser(client);
    signedIn=user;
    $('signed-in-as').textContent='Аккаунт: '+String(user.email||'');
    showAccount();
    const info=await requests.status(client);
    if(info.requested){
      state.textContent='Заявка уже существует. Статус: '+
        (info.status==='pending'?'ожидает обработки':String(info.status))+
        '. Отправка новой заявки не требуется.';
      requestForm.hidden=true;
    }else{
      state.textContent='Заявок на удаление пока нет.';
      requestForm.hidden=false;
    }
  }

  function initCaptcha(){
    if(!cfg.turnstileSiteKey)return;
    if(!window.turnstile){
      const host=$('turnstile');
      host.textContent='Загружаю проверку безопасности…';
      window.addEventListener('load',initCaptcha,{once:true});
      return;
    }
    const host=$('turnstile');
    host.textContent='';
    if(widgetId!==null){try{window.turnstile.remove(widgetId);}catch(_){}widgetId=null;}
    widgetId=window.turnstile.render(host,{
      sitekey:cfg.turnstileSiteKey,theme:'auto',
      callback:value=>{token=value;},
      'expired-callback':()=>{token='';},
      'error-callback':()=>{token='';}
    });
  }
  function resetCaptcha(){
    token='';
    if(widgetId!==null&&window.turnstile){try{window.turnstile.reset(widgetId);}catch(_){}}
  }

  login.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy)return;
    busy=true;tell('');
    const button=login.querySelector('button[type="submit"]');button.disabled=true;
    try{
      if(cfg.turnstileSiteKey&&!token)throw new Error('Captcha required');
      const email=String(login.elements.namedItem('email')?.value||'').trim();
      const password=String(login.elements.namedItem('password')?.value||'');
      const result=await client.auth.signInWithPassword({
        email,password,options:{captchaToken:token||undefined}
      });
      login.elements.namedItem('password').value='';
      if(result.error)throw result.error;
      await refresh();
    }catch(error){tell(errorMessage(error),true);resetCaptcha();}
    finally{busy=false;button.disabled=false;}
  });

  requestForm.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    if(String(requestForm.elements.namedItem('confirmation')?.value||'').trim()!=='УДАЛИТЬ'){
      tell('Напиши УДАЛИТЬ заглавными буквами для подтверждения.',true);return;
    }
    if(!signedIn){tell('Сначала войди в аккаунт.',true);return;}
    busy=true;const button=requestForm.querySelector('button[type="submit"]');
    button.disabled=true;tell('');
    try{
      const result=await requests.request(client);
      if(result.requested){
        await refresh();
        tell(result.alreadyRequested
          ?'Заявка уже была отправлена.'
          :'Заявка успешно зарегистрирована. Аккаунт пока не удалён.');
      }else throw new Error('Request not confirmed');
    }catch(error){tell(errorMessage(error),true);}
    finally{busy=false;button.disabled=false;}
  });

  $('sign-out').addEventListener('click',async()=>{
    if(busy)return;
    busy=true;
    try{
      const {error}=await client.auth.signOut();
      if(error)throw error;
      requestForm.reset();
      showLogin();
      tell('Ты вышел из аккаунта.');
      resetCaptcha();
    }catch(error){tell(errorMessage(error),true);}
    finally{busy=false;}
  });

  (async()=>{
    try{
      if(!cfg.enabled||!cfg.supabaseUrl||!cfg.supabaseAnonKey||
         !window.supabase?.createClient||!requests){
        throw new Error('Service unavailable');
      }
      client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      if(data?.session){
        await refresh();
      }else{showLogin();initCaptcha();}
    }catch(error){
      showLogin();
      tell('Сервис запроса сейчас недоступен. Попробуй позднее.',true);
      login.querySelector('button[type="submit"]').disabled=true;
    }finally{loading.hidden=true;}
  })();
})();
