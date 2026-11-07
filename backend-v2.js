(() => {
  const cfg=window.MC_BACKEND_V2||{};
  if(!cfg.enabled||!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase?.createClient){
    window.MemoryCardBackendV2={configured:false};
    return;
  }

  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  let session=null;
  let profile=null;
  let syncing=false;
  let pushTimer=0;
  let pushQueuedDuringSync=false;
  let cloudReady=false;
  let syncKind='',syncMessage='',authWarning='';
  let lastCloudErrorToast=0;
  let activeAuthUserId=null;
  let localEpoch=0,conflictItems=[],resolvingConflict=false;
  const conflictsApi=window.MemoryCardConflictV81;
  const transfer=window.MemoryCardCloudTransferV80;
  if(!transfer?.downloadGames||!conflictsApi?.plan||!conflictsApi?.sendChanges){
    console.error('Memory Card cloud transfer module is missing');
    window.MemoryCardBackendV2={configured:false};
    return;
  }
  let authMode='login';
  let turnstileWidget=null;
  let lastCaptchaToken='';
  const localPersist=persist;
  const baseRender=render;

  function setSyncNotice(kind,message){
    syncKind=kind;syncMessage=message;
    document.querySelectorAll('[data-v2-sync-state]').forEach(el=>{
      el.textContent=message;
      el.dataset.syncKind=kind;
    });
    if(kind==='error' && typeof setToast==='function' && Date.now()-lastCloudErrorToast>60000){
      lastCloudErrorToast=Date.now();
      setToast('Облачная синхронизация не завершена. Локальная библиотека сохранена.');
    }
  }

  function escHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function newer(a,b){return String(a||'').localeCompare(String(b||''))>=0?a:b;}
  function appUrl(){return `${location.origin}${location.pathname}`;}
  function disableLegacySync(){
    if(!state?.settings) return;
    state.settings.autoSync=false;
  }
  function omitLocalSettings(source={}){
    const out={...source};
    for(const key of ['sheetEndpoint','syncSecret','authToken','userId','cloudOwnerUid','cloudSyncBaselineV81','cloudConflictArchiveV81','profileUpdatedAt','lastSync','autoSync','accentTheme']) delete out[key];
    return out;
  }
  function gameToRow(g){
    const rating=g.rating===''||g.rating==null?null:Number(g.rating);
    return {user_id:session.user.id,id:String(g.id),title:String(g.title||''),platform:String(g.platform||''),status:String(g.status||'completed'),release_year:String(g.releaseYear||''),genre:String(g.genre||''),franchise:String(g.franchise||''),cover_url:String(g.coverUrl||''),cover_source:String(g.coverSource||''),rating:Number.isFinite(rating)?Math.max(1,Math.min(10,Math.round(rating))):null,replay:Math.max(0,Number(g.replay||0)),notes:String(g.notes||''),added_at:g.addedAt||new Date().toISOString(),updated_at:g.updatedAt||g.addedAt||new Date().toISOString(),deleted_at:g.deletedAt||null};
  }
  function rowToGame(r){
    return {id:r.id,title:r.title,platform:r.platform,status:r.status,releaseYear:r.release_year||'',genre:r.genre||'',franchise:r.franchise||'',coverUrl:r.cover_url||'',coverSource:r.cover_source||'',rating:r.rating==null?'':String(r.rating),replay:Number(r.replay||0),notes:r.notes||'',addedAt:r.added_at,updatedAt:r.updated_at,deletedAt:r.deleted_at||undefined};
  }
  function mergeGames(local=[],remote=[]){
    const map=new Map();
    for(const g of [...local,...remote]){
      if(!g?.id) continue;
      const old=map.get(g.id);
      if(!old||String(g.updatedAt||g.addedAt||'')>String(old.updatedAt||old.addedAt||'')) map.set(g.id,g);
    }
    return [...map.values()];
  }

  async function loadCloud(){
    if(!session) return null;
    const userId=session.user.id;
    // Each page is sorted and validated. A failed/truncated read never reaches mergeGames().
    const [p,s,games]=await Promise.all([
      client.from('profiles').select('user_id,memory_id,display_name,created_at,updated_at').eq('user_id',userId).single(),
      client.from('user_settings').select('payload,updated_at').eq('user_id',userId).maybeSingle(),
      transfer.downloadGames(client,userId)
    ]);
    if(p.error) throw p.error;
    if(s.error) throw s.error;
    return {profile:p.data,settings:s.data,games};
  }

  function localBaseline(uid){
    const data=state.settings?.[conflictsApi.KEY];
    if(data?.owner===uid && data.records && typeof data.records==='object')return data;
    return {owner:uid,records:{}};
  }

  function localAccountMismatch(cloud,uid){
    const owner=String(state.settings?.cloudOwnerUid||'');
    const localId=String(state.settings?.userId||'').trim().toUpperCase();
    const remoteId=String(cloud.profile?.memory_id||'').trim().toUpperCase();
    return (owner && owner!==uid) ||
      (!owner && /^MC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(localId) &&
        remoteId && remoteId!==localId && (state.games||[]).length>0);
  }

  function renderConflictPanel(card){
    if(!card)return;
    let area=card.querySelector('[data-v81-conflicts]');
    if(!area){
      area=document.createElement('div');
      area.dataset.v81Conflicts='1';
      area.className='mc-cloud-conflicts';
      card.appendChild(area);
    }
    if(!conflictItems.length){area.replaceChildren();area.hidden=true;return;}
    area.hidden=false;
    const info=g=>escHtml(String(g?.platform||'—'))+' · '+
      escHtml(String(g?.status||'—'))+' · '+
      escHtml(g?.rating?String(g.rating)+'/10':'без оценки');
    const note=g=>escHtml(String(g?.notes||'').slice(0,360)||'—');
    area.innerHTML='<h4>Конфликты игр: '+conflictItems.length+'</h4>'+
      '<p>Эти записи различаются на устройствах. Автоматическая отправка остановлена. '+
      'При выборе обе версии сохраняются в локальном архиве, который входит в экспорт JSON.</p>'+
      conflictItems.slice(0,30).map(c=>{
        const title=escHtml(String(c.local?.title||c.remote?.title||c.id));
        return '<div class="mc-cloud-conflict"><strong>'+title+'</strong>'+
          '<details><summary>Сравнить варианты</summary>'+
          '<div><b>Этот телефон</b><small>'+info(c.local)+'</small><p>'+note(c.local)+'</p></div>'+
          '<div><b>Облако</b><small>'+info(c.remote)+'</small><p>'+note(c.remote)+'</p></div></details>'+
          '<div class="mc-cloud-conflict-actions">'+
          '<button class="secondary compact" type="button" data-v81-id="'+escHtml(c.id)+'" data-v81-resolve="local">Оставить мою</button>'+
          '<button class="ghost compact" type="button" data-v81-id="'+escHtml(c.id)+'" data-v81-resolve="cloud"'+(!c.remote?' disabled':'')+'>Взять из облака</button>'+
          '</div></div>';
      }).join('')+
      (conflictItems.length>30?'<p>Показаны первые 30 конфликтов.</p>':'');
  }

  async function resolveConflict(id,choice){
    if(syncing||resolvingConflict||!session)return;
    const item=conflictItems.find(c=>c.id===id);
    if(!item||!['local','cloud'].includes(choice))return;
    if(choice==='cloud'&&!item.remote)return;
    if(!window.confirm(choice==='cloud'
      ? 'Взять облачный вариант? Обе версии сохранятся в локальном архиве.'
      : 'Оставить локальный вариант? Обе версии сохранятся в локальном архиве. При изменении облака операция будет остановлена.'))return;
    resolvingConflict=true;
    const oldSettings=state.settings,oldGames=state.games;
    try{
      const uid=session.user.id,base=localBaseline(uid);
      const records={...base.records};
      if(item.remote)records[id]={signature:conflictsApi.signature(item.remote),revision:String(item.remote.updatedAt)};
      else delete records[id];
      const previous=Array.isArray(state.settings?.[conflictsApi.ARCHIVE_KEY])
        ?state.settings[conflictsApi.ARCHIVE_KEY]:[];
      const archive=[...previous,{
        at:new Date().toISOString(),id,choice,
        local:item.local?JSON.parse(JSON.stringify(item.local)):null,
        remote:item.remote?JSON.parse(JSON.stringify(item.remote)):null
      }];
      const games=[...state.games];
      if(choice==='cloud'){
        const index=games.findIndex(g=>String(g.id)===id);
        if(index<0)throw new Error('Local game to replace not found');
        games[index]=item.remote;
      }
      state.settings={...state.settings,
        [conflictsApi.KEY]:{owner:uid,records},
        [conflictsApi.ARCHIVE_KEY]:archive};
      state.games=games;
      await localPersist();
      conflictItems=conflictItems.filter(c=>c.id!==id);
      cloudReady=false;
      setSyncNotice('busy','Повторно сверяю выбранный вариант с облаком…');
    }catch(error){
      state.settings=oldSettings;state.games=oldGames;
      console.error('Conflict resolution failed',error);
      setSyncNotice('error','Не удалось сохранить выбранный вариант. Записи оставлены без изменений.');
      return;
    }finally{resolvingConflict=false;}
    queueMicrotask(injectAccount);
    await reconcile();
  }

  async function pushCloud(){
    clearTimeout(pushTimer);
    if(!session||syncing||!cloudReady) return;
    syncing=true;
    setSyncNotice('busy','Отправляю изменения в облако…');
    try{
      disableLegacySync();
      if(state.settings?.cloudOwnerUid && state.settings.cloudOwnerUid!==session.user.id){
        throw new Error('LOCAL_ACCOUNT_MISMATCH');
      }
      const payload=omitLocalSettings(state.settings||{});
      const settingsUpdatedAt=state.settings?.settingsUpdatedAt||new Date().toISOString();
      const profileName=String(state.settings?.profileName||profile?.display_name||'Игрок').trim().slice(0,40)||'Игрок';
      const rows=(state.games||[]).map(gameToRow);
      // Upload idempotent batches. Never report success if even one batch failed.
      await transfer.uploadGames(client,rows);
      const results=await Promise.all([
        client.from('profiles').update({display_name:profileName,updated_at:new Date().toISOString()}).eq('user_id',session.user.id),
        client.from('user_settings').upsert({user_id:session.user.id,payload,updated_at:settingsUpdatedAt},{onConflict:'user_id'})
      ]);
      const failed=results.find(x=>x.error);
      if(failed?.error) throw failed.error;
      setSyncNotice('ok','Синхронизировано: '+rows.length+' игровых записей');
    }catch(error){
      console.error('Memory Card cloud push failed',error);
      setSyncNotice('error','Не удалось отправить изменения. Они сохранены на устройстве; повтори синхронизацию.');
    }finally{
      syncing=false;
      if(pushQueuedDuringSync){
        pushQueuedDuringSync=false;
        schedulePush(150);
      }
    }
  }

  function schedulePush(delay=900){
    if(!session) return;
    if(syncing||!cloudReady){pushQueuedDuringSync=true;return;}
    clearTimeout(pushTimer);
    pushTimer=setTimeout(pushCloud,delay);
  }

  async function reconcile(){
    if(!session||syncing) return;
    syncing=true;
    let completed=false;
    setSyncNotice('busy','Проверяю облачную библиотеку…');
    try{
      disableLegacySync();
      const cloud=await loadCloud();
      // Never mix one account's local library into another user's cloud account.
      const boundOwner=String(state.settings?.cloudOwnerUid||'');
      const localMemoryId=String(state.settings?.userId||'').trim().toUpperCase();
      const remoteMemoryId=String(cloud.profile?.memory_id||'').trim().toUpperCase();
      const otherProfile=boundOwner && boundOwner!==session.user.id;
      const legacyOtherProfile=!boundOwner && /^MC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(localMemoryId) &&
        remoteMemoryId && localMemoryId!==remoteMemoryId && (state.games||[]).length>0;
      if(otherProfile||legacyOtherProfile){
        const error=new Error('LOCAL_ACCOUNT_MISMATCH');
        error.code='LOCAL_ACCOUNT_MISMATCH';
        throw error;
      }
      profile=cloud.profile;
      const localSettings={...(state.settings||{})};
      const remoteSettings=cloud.settings?.payload&&typeof cloud.settings.payload==='object'?cloud.settings.payload:{};
      const localAccent=localSettings.accentTheme;
      const localStamp=String(localSettings.settingsUpdatedAt||'');
      const remoteStamp=String(cloud.settings?.updated_at||remoteSettings.settingsUpdatedAt||'');
      const chosen=remoteStamp>localStamp?{...localSettings,...remoteSettings}:{...remoteSettings,...localSettings};
      chosen.profileName=profile.display_name||chosen.profileName||'Игрок';
      chosen.userId=profile.memory_id;
      chosen.cloudOwnerUid=session.user.id;
      chosen.autoSync=false;
      if(localAccent) chosen.accentTheme=localAccent;
      chosen.settingsUpdatedAt=newer(localStamp,remoteStamp)||new Date().toISOString();
      // No state mutation until every cloud page has been loaded and verified.
      const updatedSettings=migrateSettings(chosen);
      const updatedGames=mergeGames(state.games||[],cloud.games.map(rowToGame)).map(migrateGame);
      const previousSettings=state.settings,previousGames=state.games;
      state.settings=updatedSettings;
      state.settings.autoSync=false;
      state.games=updatedGames;
      try{
        await localPersist();
      }catch(error){
        state.settings=previousSettings;
        state.games=previousGames;
        throw error;
      }
      cloudReady=true;
      completed=true;
      authWarning='';
      setSyncNotice('busy','Облачная библиотека сверена. Сохраняю изменения…');
      baseRender();
      queueMicrotask(injectAccount);
    }catch(error){
      console.error('Memory Card cloud sync failed',error);
      cloudReady=false;
      if(error?.code==='LOCAL_ACCOUNT_MISMATCH'){
        setSyncNotice('error','Синхронизация заблокирована: данные другого аккаунта на устройстве.');
        authWarning='На этом устройстве сохранена библиотека другого аккаунта. Чтобы не смешивать данные, вход отменён. Для смены аккаунта пока используй отдельный профиль браузера.';
        clearTimeout(pushTimer);
        try{await client.auth.signOut();}catch(_){}
        session=null;profile=null;
        showAuth();
      }else{
        setSyncNotice('error','Не удалось получить полную облачную библиотеку. Локальные записи не изменены; попробуй ещё раз.');
      }
    }finally{
      syncing=false;
      if(completed){
        pushQueuedDuringSync=false;
        schedulePush(250);
      }
    }
  }

  persist=async function(){
    disableLegacySync();
    localEpoch++;
    await localPersist();
    schedulePush();
  };

  function authStatus(text='',kind=''){
    const el=document.querySelector('.mc-auth-form:not([hidden]) .mc-auth-status');
    if(!el) return;
    el.textContent=text;
    el.className=`mc-auth-status${kind?` ${kind}`:''}`;
  }
  function captchaToken(){return lastCaptchaToken||'';}
  function resetCaptcha(){
    lastCaptchaToken='';
    if(window.turnstile&&turnstileWidget!=null){try{window.turnstile.reset(turnstileWidget);}catch(_){}}
  }
  function mountCaptcha(attempt=0){
    if(!cfg.turnstileSiteKey) return;
    if(!window.turnstile){if(attempt<30)setTimeout(()=>mountCaptcha(attempt+1),200);return;}
    const host=document.querySelector('.mc-auth-form:not([hidden]) .mc-auth-turnstile');
    if(!host||host.dataset.ready==='1') return;
    host.dataset.ready='1';
    turnstileWidget=window.turnstile.render(host,{sitekey:cfg.turnstileSiteKey,theme:'auto',callback:token=>{lastCaptchaToken=token;},'expired-callback':()=>{lastCaptchaToken='';},'error-callback':()=>{lastCaptchaToken='';}});
  }
  function authShell(){
    return `<div class="mc-auth-shell"><section class="mc-auth-card">${authWarning?`<p class="mc-auth-warning" role="alert">${escHtml(authWarning)}</p>`:''}<div class="mc-auth-brand"><div class="mc-auth-logo">MC</div><div><h1>Memory Card</h1><p>Твоя игровая библиотека на всех устройствах</p></div></div><div class="mc-auth-tabs"><button class="mc-auth-tab ${authMode==='login'?'active':''}" data-auth-mode="login">Войти</button><button class="mc-auth-tab ${authMode==='signup'?'active':''}" data-auth-mode="signup">Регистрация</button></div><form class="mc-auth-form" data-auth-form="login" ${authMode==='login'?'':'hidden'}><label class="mc-auth-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><label class="mc-auth-field"><span>Пароль</span><input type="password" name="password" autocomplete="current-password" minlength="8" required></label><div class="mc-auth-turnstile"></div><div class="mc-auth-status"></div><button class="primary mc-auth-submit" type="submit">Войти</button><p class="mc-auth-note"><button class="mc-auth-link" type="button" data-auth-reset>Забыли пароль?</button></p></form><form class="mc-auth-form" data-auth-form="signup" ${authMode==='signup'?'':'hidden'}><label class="mc-auth-field"><span>Имя</span><input type="text" name="name" maxlength="40" required></label><label class="mc-auth-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><label class="mc-auth-field"><span>Пароль</span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label><div class="mc-auth-turnstile"></div><div class="mc-auth-status"></div><button class="primary mc-auth-submit" type="submit">Создать аккаунт</button><p class="mc-auth-note">После регистрации нужно подтвердить email. Этот же аккаунт работает на телефоне, компьютере и других устройствах.</p></form></section></div>`;
  }
  function showAuth(){
    document.querySelector('.mc-auth-shell')?.remove();
    turnstileWidget=null;
    lastCaptchaToken='';
    document.body.insertAdjacentHTML('beforeend',authShell());
    queueMicrotask(()=>mountCaptcha());
  }
  function showConfirmation(email){
    document.querySelector('.mc-auth-shell')?.remove();
    document.body.insertAdjacentHTML('beforeend',`<div class="mc-auth-shell"><section class="mc-auth-card mc-auth-confirm"><div class="mc-auth-logo" style="margin:0 auto">✓</div><h2>Подтверди email</h2><p>Мы отправили письмо на <b>${escHtml(email)}</b>. Перейди по ссылке в письме, затем вернись в Memory Card.</p><button class="primary" type="button" data-auth-back>Вернуться ко входу</button></section></div>`);
  }
  function showPasswordRecovery(){
    document.querySelector('.mc-auth-shell')?.remove();
    document.body.insertAdjacentHTML('beforeend',`<div class="mc-auth-shell"><section class="mc-auth-card"><div class="mc-auth-brand"><div class="mc-auth-logo">MC</div><div><h1>Новый пароль</h1><p>Придумай новый пароль для аккаунта Memory Card</p></div></div><form class="mc-auth-form" data-auth-recovery><label class="mc-auth-field"><span>Новый пароль</span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label><label class="mc-auth-field"><span>Повтори пароль</span><input type="password" name="repeat" autocomplete="new-password" minlength="8" required></label><div class="mc-auth-status"></div><button class="primary mc-auth-submit" type="submit">Сохранить новый пароль</button></form></section></div>`);
  }
  function hideAuth(){document.querySelector('.mc-auth-shell')?.remove();}

  async function signUp(form){
    const email=form.email.value.trim();
    const password=form.password.value;
    const displayName=form.name.value.trim();
    if(cfg.turnstileSiteKey&&!captchaToken()){authStatus('Подтверди проверку','error');return;}
    authStatus('Создаю аккаунт…');
    const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name:displayName},captchaToken:captchaToken(),emailRedirectTo:appUrl()}});
    if(error){authStatus(error.message,'error');resetCaptcha();return;}
    resetCaptcha();
    if(data.session){session=data.session;hideAuth();await reconcile();}
    else showConfirmation(email);
  }
  async function signIn(form){
    const email=form.email.value.trim();
    const password=form.password.value;
    if(cfg.turnstileSiteKey&&!captchaToken()){authStatus('Подтверди проверку','error');return;}
    authStatus('Вхожу…');
    const {data,error}=await client.auth.signInWithPassword({email,password,options:{captchaToken:captchaToken()}});
    if(error){authStatus(error.message,'error');resetCaptcha();return;}
    resetCaptcha();
    session=data.session;hideAuth();await reconcile();
  }
  async function resetPassword(){
    const email=document.querySelector('[data-auth-form="login"] input[name="email"]')?.value.trim();
    if(!email){authStatus('Сначала введи email','error');return;}
    if(cfg.turnstileSiteKey&&!captchaToken()){authStatus('Подтверди проверку','error');return;}
    authStatus('Отправляю письмо…');
    try{
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:appUrl(),captchaToken:captchaToken()});
      authStatus(error?error.message:'Письмо для восстановления отправлено',error?'error':'ok');
    }catch(error){
      authStatus(error?.message||'Не удалось отправить письмо','error');
    }finally{
      resetCaptcha();
    }
  }
  async function updatePassword(form){
    const password=form.password.value;
    const repeat=form.repeat.value;
    if(password.length<8){authStatus('Пароль должен быть не короче 8 символов','error');return;}
    if(password!==repeat){authStatus('Пароли не совпадают','error');return;}
    authStatus('Сохраняю пароль…');
    const {error}=await client.auth.updateUser({password});
    if(error){authStatus(error.message,'error');return;}
    hideAuth();
    await reconcile();
    setToast('Пароль изменён');
  }
  async function logout(){clearTimeout(pushTimer);cloudReady=false;pushQueuedDuringSync=false;authWarning='';await client.auth.signOut();session=null;profile=null;showAuth();}

  function hideLegacySyncUi(){
    document.querySelectorAll('.panel').forEach(panel=>{
      const title=panel.querySelector('h3')?.textContent||'';
      if(title.includes('Google Sheets')) panel.hidden=true;
    });
  }
  function injectAccount(){
    hideLegacySyncUi();
    if(state.view!=='settings'||!session) return;
    const root=document.querySelector('.settings-grid')||document.querySelector('.content');
    if(!root||root.querySelector('[data-v2-account]')) return;
    const card=document.createElement('section');
    card.className='panel';
    card.dataset.v2Account='1';
    card.innerHTML=`<div class="settings-panel-head"><div><h3>Аккаунт</h3><p class="status-line">${escHtml(session.user.email||'')} · ${escHtml(profile?.memory_id||state.settings.userId||'')}</p></div><div class="mc-account-chip"><button class="secondary compact" type="button" data-v2-sync>Синхронизировать</button><button class="ghost compact" type="button" data-v2-logout>Выйти</button></div></div><p data-v2-sync-state data-sync-kind="${escHtml(syncKind)}" class="mc-cloud-sync-state" role="status">${escHtml(syncMessage)}</p>`;
    root.prepend(card);
  }

  render=function(){baseRender();queueMicrotask(injectAccount);};

  document.addEventListener('click',event=>{
    const mode=event.target instanceof Element?event.target.closest('[data-auth-mode]'):null;
    if(mode){authMode=mode.dataset.authMode;resetCaptcha();showAuth();return;}
    if(event.target instanceof Element&&event.target.closest('[data-auth-back]')){authMode='login';showAuth();return;}
    if(event.target instanceof Element&&event.target.closest('[data-auth-reset]')){resetPassword();return;}
    if(event.target instanceof Element&&event.target.closest('[data-v2-logout]')){logout();return;}
    if(event.target instanceof Element&&event.target.closest('[data-v2-sync]')){reconcile();return;}
  },true);
  document.addEventListener('submit',event=>{
    const form=event.target instanceof HTMLFormElement?event.target:null;
    if(!form) return;
    if(form.hasAttribute('data-auth-recovery')){
      event.preventDefault();
      updatePassword(form);
      return;
    }
    if(!form.dataset.authForm) return;
    event.preventDefault();
    form.dataset.authForm==='signup'?signUp(form):signIn(form);
  },true);

  window.addEventListener('online',()=>{
    if(!session||syncing)return;
    if(!cloudReady)reconcile();
    else if(syncKind==='error'||pushQueuedDuringSync)schedulePush(250);
  });

  client.auth.onAuthStateChange((event,next)=>{
    const newId=next?.user?.id||null;
    if(newId!==activeAuthUserId){
      activeAuthUserId=newId;
      cloudReady=false;
      clearTimeout(pushTimer);
    }
    session=next;
    setTimeout(()=>{
      if(event==='PASSWORD_RECOVERY'){
        showPasswordRecovery();
        return;
      }
      if(session){
        hideAuth();
        // Token refresh alone must not wipe a currently edited form.
        if(!cloudReady)reconcile();
      }else showAuth();
    },0);
  });

  async function init(){
    disableLegacySync();
    await localPersist();
    const {data}=await client.auth.getSession();
    session=data.session||null;
    if(session){hideAuth();await reconcile();}
    else showAuth();
  }

  window.MemoryCardBackendV2={configured:true,client,sync:reconcile,push:pushCloud,logout,isBusy:()=>syncing,getSyncState:()=>({kind:syncKind,message:syncMessage}),getSession:()=>session,getProfile:()=>profile,sendFriendRequest:async memoryId=>client.rpc('send_friend_request',{target_memory_id:memoryId}),acceptFriendRequest:async id=>client.rpc('accept_friend_request',{friendship_id:id}),getFriendProfile:async memoryId=>client.rpc('get_friend_profile',{target_memory_id:memoryId})};
  init();
})();
