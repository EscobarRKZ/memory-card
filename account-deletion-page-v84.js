/* Memory Card v85: external account request + verified permanent deletion.
 * No admin key on the client, no password persistence, no automatic deletion. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const login=$('login'),account=$('account'),requestForm=$('request');
  const finalForm=$('delete-final'),finalSection=$('final-section');
  const status=$('request-state'),notice=$('notice'),loading=$('loading');
  const cfg=window.MC_BACKEND_V2||{};
  const requests=window.MemoryCardDeletionRequestV84;
  const cleanup=window.MemoryCardLocalDeleteV85;
  let busy=false,client=null,loginWidget=null,finalWidget=null;
  let loginToken='',finalToken='',signedIn=null,deleted=false;

  function tell(message,problem=false){
    notice.textContent=message;
    notice.dataset.error=problem?'true':'false';
  }
  function errorMessage(error){
    const code=String(error?.code||'');
    if(code==='NOT_AUTHENTICATED'||code==='AUTH_REQUIRED')
      return 'Сессия истекла. Войди в аккаунт снова.';
    if(code==='REQUEST_REQUIRED')return 'Сначала отправь заявку на удаление.';
    if(code==='REQUEST_NOT_PENDING')return 'Заявка уже находится на обработке. Попробуй позднее.';
    if(code==='REAUTH_FAILED')return 'Пароль или проверка безопасности неверны. Попробуй снова.';
    if(code==='STORAGE_REVIEW_REQUIRED')
      return 'Нужна ручная проверка файлов в облаке. Заявка сохранена.';
    if(/captcha/i.test(String(error?.message||'')))
      return 'Проверка безопасности не пройдена. Повтори попытку.';
    if(/invalid login credentials/i.test(String(error?.message||'').toLowerCase()))
      return 'Неверный email или пароль.';
    return 'Операция не завершена или подтверждение сервера не получено. Проверь состояние аккаунта.';
  }

  function mountCaptcha(kind,attempt=0){
    if(!cfg.turnstileSiteKey)return;
    const isFinal=kind==='final',host=$(isFinal?'final-turnstile':'turnstile');
    if(!host?.isConnected||deleted||(isFinal&&finalForm.hidden))return;
    if(isFinal&&finalWidget!==null)return;
    if(!isFinal&&loginWidget!==null)return;
    if(!window.turnstile){
      if(attempt<25)setTimeout(()=>mountCaptcha(kind,attempt+1),200);
      else tell('Проверка безопасности недоступна. Обнови страницу.',true);
      return;
    }
    const id=window.turnstile.render(host,{
      sitekey:cfg.turnstileSiteKey,theme:'auto',
      callback:value=>{if(isFinal)finalToken=value;else loginToken=value;},
      'expired-callback':()=>{if(isFinal)finalToken='';else loginToken='';},
      'error-callback':()=>{if(isFinal)finalToken='';else loginToken='';}
    });
    if(isFinal)finalWidget=id;else loginWidget=id;
  }
  function resetCaptcha(kind){
    const isFinal=kind==='final';
    if(isFinal)finalToken='';else loginToken='';
    const id=isFinal?finalWidget:loginWidget;
    if(id!==null&&window.turnstile){
      try{window.turnstile.reset(id);}catch(_){}
    }
  }

  function showLogin(){
    login.hidden=false;
    account.hidden=true;
    requestForm.hidden=true;
    finalForm.hidden=true;
    finalSection.hidden=true;
    signedIn=null;
    if(!deleted)mountCaptcha('login');
  }
  function showAccount(){
    login.hidden=true;
    account.hidden=false;
  }

  async function refresh(){
    const user=await requests.currentUser(client);
    signedIn=user;
    $('signed-in-as').textContent='Аккаунт: '+String(user.email||'');
    showAccount();
    const info=await requests.status(client);
    if(info.requested){
      status.textContent='Заявка уже зарегистрирована. Статус: '+
        (info.status==='pending'?'ожидает обработки':String(info.status))+'.';
      requestForm.hidden=true;
      finalSection.hidden=info.status!=='pending';
      finalForm.hidden=info.status!=='pending';
      if(!finalForm.hidden)mountCaptcha('final');
    }else{
      status.textContent='Заявок на удаление пока нет.';
      requestForm.hidden=false;
      finalForm.hidden=true;
      finalSection.hidden=true;
    }
  }

  login.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||deleted)return;
    busy=true;tell('');
    const button=login.querySelector('button[type="submit"]');
    button.disabled=true;
    try{
      if(cfg.turnstileSiteKey&&!loginToken)throw new Error('Captcha required');
      const email=String(login.elements.namedItem('email')?.value||'').trim();
      const password=String(login.elements.namedItem('password')?.value||'');
      const result=await client.auth.signInWithPassword({
        email,password,options:{captchaToken:loginToken||undefined}
      });
      login.elements.namedItem('password').value='';
      if(result.error)throw result.error;
      await refresh();
    }catch(error){tell(errorMessage(error),true);resetCaptcha('login');}
    finally{busy=false;button.disabled=false;}
  });

  requestForm.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||deleted)return;
    if(String(requestForm.elements.namedItem('confirmation')?.value||'').trim()!=='УДАЛИТЬ'){
      tell('Напиши УДАЛИТЬ заглавными буквами для подтверждения.',true);
      return;
    }
    if(!signedIn){tell('Сначала войди в аккаунт.',true);return;}
    busy=true;tell('');
    const button=requestForm.querySelector('button[type="submit"]');
    button.disabled=true;
    try{
      const result=await requests.request(client);
      if(!result.requested)throw new Error('Request not confirmed');
      await refresh();
      tell(result.alreadyRequested?'Заявка уже была зарегистрирована.':
        'Заявка зарегистрирована. Аккаунт пока не удалён.');
    }catch(error){tell(errorMessage(error),true);}
    finally{busy=false;button.disabled=false;}
  });

  finalForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||deleted||!signedIn)return;
    const confirmation=String(finalForm.elements.namedItem('confirmation')?.value||'').trim();
    const passwordField=finalForm.elements.namedItem('password');
    const password=String(passwordField?.value||'');
    if(confirmation!=='УДАЛИТЬ НАВСЕГДА'){
      tell('Для окончательного удаления введи УДАЛИТЬ НАВСЕГДА.',true);
      return;
    }
    if(password.length<8){tell('Введи текущий пароль.',true);return;}
    if(cfg.turnstileSiteKey&&!finalToken){
      tell('Пройди проверку безопасности перед удалением.',true);
      return;
    }
    if(!window.confirm('Безвозвратно удалить аккаунт Memory Card и все связанные облачные данные? Отменить операцию будет невозможно.'))return;
    busy=true;tell('');
    const button=finalForm.querySelector('button[type="submit"]');
    button.disabled=true;
    try{
      const result=await requests.deletePermanently(client,{
        confirmation,password,captchaToken:finalToken||undefined
      });
      if(result.deleted!==true)throw new Error('Unconfirmed deletion');
      deleted=true;
      let localNotice='';
      try{
        const cleaned=await cleanup?.purgeOwner(result.owner);
        if(!cleaned?.purged)localNotice=' Очисти данные сайта вручную в настройках браузера.';
      }catch(_){
        localNotice=' Локальную копию не удалось очистить автоматически: удали данные сайта в настройках браузера.';
      }
      try{await client.auth.signOut({scope:'local'});}catch(_){}
      account.hidden=true;
      login.hidden=true;
      finalForm.hidden=true;
      finalSection.hidden=true;
      tell('Аккаунт и связанные облачные данные удалены. '+localNotice+
        ' Копии на других устройствах необходимо удалить отдельно.',false);
    }catch(error){
      tell(errorMessage(error)+' Если соединение оборвалось после подтверждения, проверь возможность входа прежде, чем отправлять запрос повторно.',true);
      resetCaptcha('final');
    }finally{
      if(passwordField)passwordField.value='';
      busy=false;
      if(button?.isConnected)button.disabled=false;
    }
  });

  $('sign-out').addEventListener('click',async()=>{
    if(busy||deleted)return;
    busy=true;
    try{
      const {error}=await client.auth.signOut({scope:'local'});
      if(error)throw error;
      requestForm.reset();finalForm.reset();
      showLogin();
      resetCaptcha('login');
      resetCaptcha('final');
      tell('Ты вышел из аккаунта.');
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
      if(data?.session){await refresh();}
      else showLogin();
    }catch(_){
      showLogin();
      tell('Сервис запросов сейчас недоступен. Попробуй позже.',true);
      login.querySelector('button[type="submit"]').disabled=true;
    }finally{loading.hidden=true;}
  })();
})();
