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
  const retryApi=window.MemoryCardCloudRetryV93;
  let retryTimer=0,retryAttempts=0,retryOwner='',retryAt=0;
  const conflictsApi=window.MemoryCardConflictV81;
  const transfer=window.MemoryCardCloudTransferV80;
  const vault=window.MemoryCardAccountVaultV83;
  const deletionRequests=window.MemoryCardDeletionRequestV84;
  const authMessages=window.MemoryCardAuthMessagesV89;
  const friendlyAuthError=(error,operation)=>
    authMessages?.describe?.(error,operation)||'Ошибка авторизации. Попробуй позже.';
  let deletionState={owner:'',loading:false,requested:null,error:''};
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
    if((kind==='error'||kind==='conflict') && typeof setToast==='function' && Date.now()-lastCloudErrorToast>60000){
      lastCloudErrorToast=Date.now();
      setToast(kind==='conflict'
        ? 'Обнаружены разные версии игры. Открой Настройки → Аккаунт.'
        : 'Облачная синхронизация не завершена. Локальная библиотека сохранена.');
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
          '<div><b>Этот телефон</b><small>'+escHtml(String(c.local?.title||'—'))+' · '+info(c.local)+'</small><p>'+note(c.local)+'</p></div>'+
          '<div><b>Облако</b><small>'+escHtml(String(c.remote?.title||'—'))+' · '+info(c.remote)+'</small><p>'+note(c.remote)+'</p></div></details>'+
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
    const current=state.games.find(g=>String(g.id)===id);
    if(current && item.local && conflictsApi.signature(current)!==conflictsApi.signature(item.local)){
      setSyncNotice('conflict','Игра менялась после появления конфликта. Сначала повтори синхронизацию.');
      return;
    }
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

  function cancelCloudRetry(resetAttempts=true){
    clearTimeout(retryTimer);
    retryTimer=0;retryAt=0;
    if(resetAttempts){retryAttempts=0;retryOwner='';}
  }

  function scheduleCloudRetry(error,uid){
    if(!retryApi?.shouldRetry?.(error)||!session||session.user.id!==uid||
       conflictItems.length)return false;
    if(retryOwner!==uid){retryOwner=uid;retryAttempts=0;}
    if(typeof navigator!=='undefined'&&navigator.onLine===false){
      setSyncNotice('error','Нет сети. Локальные игры сохранены; синхронизация повторится при подключении.');
      return true;
    }
    if(retryAttempts>=retryApi.MAX_ATTEMPTS){
      setSyncNotice('error','Сервер временно недоступен. Локальные игры сохранены. Лимит повторов исчерпан; нажми «Синхронизировать» позже.');
      return true;
    }
    const attempt=++retryAttempts;
    const delay=retryApi.nextDelay(attempt);
    cancelCloudRetry(false);
    retryAt=Date.now()+delay;
    retryTimer=setTimeout(()=>{
      retryTimer=0;retryAt=0;
      if(!session||session.user.id!==uid||conflictItems.length)return;
      if(typeof navigator!=='undefined'&&navigator.onLine===false){
        setSyncNotice('error','Нет сети. Локальные игры сохранены; повторю синхронизацию после подключения.');
        return;
      }
      // Never resend the previous RPC batch. Reconcile performs a new full
      // cloud download and version comparison before every write.
      void reconcile();
    },delay);
    setSyncNotice('error','Временный сбой облака. Локальные игры сохранены. Повтор через '+
      Math.ceil(delay/1000)+' с (попытка '+attempt+'/'+retryApi.MAX_ATTEMPTS+').');
    return true;
  }

  function manualSync(){
    cancelCloudRetry();
    return reconcile();
  }

  function pushCloud(){
    clearTimeout(pushTimer);
    return reconcile();
  }

  function schedulePush(delay=900){
    if(!session)return;
    if(syncing){pushQueuedDuringSync=true;return;}
    if(!cloudReady)return;
    clearTimeout(pushTimer);
    pushTimer=setTimeout(pushCloud,delay);
  }

  async function reconcile(){
    if(!session)return false;
    if(syncing){pushQueuedDuringSync=true;return false;}
    cancelCloudRetry(false);
    syncing=true;
    const uid=session.user.id;
    let epoch=localEpoch;
    let rerun=false,success=false;
    setSyncNotice('busy','Сверяю изменения между устройствами…');
    try{
      disableLegacySync();
      // Select an isolated local workspace BEFORE reading cloud data.
      // Never merge the prior user's "main" IndexedDB entry into this UID.
      if(vault?.activate){
        const activated=await vault.activate(uid);
        if(activated.changed){
          localEpoch++;
          epoch=localEpoch;
          conflictItems=[];
          cloudReady=false;
          applyTheme();
          if(!state.modal)baseRender();
        }
      }
      const cloud=await loadCloud();
      if(!session||session.user.id!==uid)throw new Error('Cloud session changed during synchronization');
      if(localAccountMismatch(cloud,uid)){
        const error=new Error('LOCAL_ACCOUNT_MISMATCH');
        error.code='LOCAL_ACCOUNT_MISMATCH';
        throw error;
      }
      if(epoch!==localEpoch){rerun=true;return false;}
      profile=cloud.profile;
      const remote=(cloud.games||[]).map(rowToGame).map(migrateGame);
      const plan=conflictsApi.plan(state.games||[],remote,localBaseline(uid));

      if(plan.conflicts.length){
        cancelCloudRetry();
        conflictItems=plan.conflicts;
        cloudReady=false;
        setSyncNotice('conflict','Есть конфликтующие изменения ('+conflictItems.length+
          '). Выбери вариант в Настройки → Аккаунт.');
        queueMicrotask(injectAccount);
        return false;
      }

      conflictItems=[];
      const oldSettings=state.settings,oldGames=state.games;
      const remoteSettings=cloud.settings?.payload&&typeof cloud.settings.payload==='object'
        ?cloud.settings.payload:{};
      const localStamp=String(oldSettings?.settingsUpdatedAt||'');
      const remoteStamp=String(cloud.settings?.updated_at||remoteSettings.settingsUpdatedAt||'');
      const chosen=remoteStamp>localStamp
        ?{...oldSettings,...remoteSettings}:{...remoteSettings,...oldSettings};
      chosen.profileName=cloud.profile.display_name||chosen.profileName||'Игрок';
      chosen.userId=cloud.profile.memory_id;
      chosen.cloudOwnerUid=uid;
      chosen.autoSync=false;
      if(oldSettings?.accentTheme)chosen.accentTheme=oldSettings.accentTheme;
      chosen[conflictsApi.KEY]={owner:uid,records:plan.baseline.records};
      chosen[conflictsApi.ARCHIVE_KEY]=oldSettings?.[conflictsApi.ARCHIVE_KEY]||[];
      chosen.settingsUpdatedAt=newer(localStamp,remoteStamp)||new Date().toISOString();

      state.settings=migrateSettings(chosen);
      state.games=plan.merged.map(migrateGame);
      try{await localPersist();}
      catch(error){
        state.settings=oldSettings;
        state.games=oldGames;
        throw error;
      }
      cloudReady=true;

      // The user may have saved while localPersistence was running.
      // The next pass must reconsider their newer edit.
      if(epoch!==localEpoch){rerun=true;return false;}

      // Every changed game uses the exact revision seen in the cloud pull.
      // A concurrent update produces zero affected rows and stops the sync.
      const applied=await conflictsApi.sendChanges(client,uid,plan.writes,gameToRow);
      if(applied.length){
        const records={...localBaseline(uid).records};
        for(const item of applied)records[item.id]={
          signature:item.signature,revision:item.revision
        };
        state.settings[conflictsApi.KEY]={owner:uid,records};
        await localPersist();
      }
      const payload=omitLocalSettings(state.settings||{});
      const settingsUpdatedAt=state.settings?.settingsUpdatedAt||new Date().toISOString();
      const name=String(state.settings?.profileName||profile?.display_name||'Игрок')
        .trim().slice(0,40)||'Игрок';
      const results=await Promise.all([
        client.from('profiles').update({
          display_name:name,updated_at:new Date().toISOString()
        }).eq('user_id',uid),
        client.from('user_settings').upsert({
          user_id:uid,payload,updated_at:settingsUpdatedAt
        },{onConflict:'user_id'})
      ]);
      const failed=results.find(x=>x.error);
      if(failed?.error)throw failed.error;

      authWarning='';
      success=true;
      cancelCloudRetry();
      setSyncNotice('ok','Синхронизировано: '+state.games.length+
        ' игр. Отправлено изменений: '+applied.length);
      if(!state.modal&&!document.querySelector('.modal-backdrop'))baseRender();
      queueMicrotask(injectAccount);
      return true;
    }catch(error){
      console.error('Memory Card cloud sync failed',error);
      cloudReady=false;
      if(error?.code==='LOCAL_ACCOUNT_MISMATCH'){
        cancelCloudRetry();
        conflictItems=[];
        setSyncNotice('error','Синхронизация заблокирована: данные другого аккаунта.');
        authWarning='На устройстве есть библиотека другого аккаунта. Чтобы не смешать записи, вход отменён. Используй отдельный профиль браузера.';
        clearTimeout(pushTimer);
        try{await client.auth.signOut();}catch(_){}
        session=null;profile=null;showAuth();
      }else if(error?.code==='SYNC_CONFLICT'){
        cancelCloudRetry();
        setSyncNotice('conflict','Облачная версия изменилась во время записи. Нажми «Синхронизировать» для повторной сверки.');
      }else{
        // A wrong local account is not a network problem. Never auto-retry it.
        const vaultMismatch=!!vault && String(state.settings?.cloudOwnerUid||'')!==uid;
        if(vaultMismatch){
          cancelCloudRetry();
          setSyncNotice('error','Не удалось безопасно открыть библиотеку аккаунта.');
          authWarning='Не удалось открыть локальное хранилище аккаунта. Вход отменён без изменения сохранённых записей.';
          try{await client.auth.signOut();}catch(_){}
          session=null;profile=null;showAuth();
        }else if(!scheduleCloudRetry(error,uid)){
          cancelCloudRetry();
          setSyncNotice('error','Синхронизация не завершена. Локальные записи сохранены; попробуй ещё раз.');
        }
      }
      return false;
    }finally{
      syncing=false;
      const queued=pushQueuedDuringSync||rerun;
      pushQueuedDuringSync=false;
      // An auth change while the old user's sync was running must retry
      // for the new account rather than leaving cloud sync stalled.
      const accountChanged=!!session && session.user.id!==uid;
      if(queued&&session&&!conflictItems.length&&(success||rerun||accountChanged)){
        setTimeout(()=>reconcile(),250);
      }
      queueMicrotask(injectAccount);
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
    return `<div class="mc-auth-shell"><section class="mc-auth-card">${authWarning?`<p class="mc-auth-warning" role="alert">${escHtml(authWarning)}</p>`:''}<div class="mc-auth-brand"><div class="mc-auth-logo">MC</div><div><h1>Memory Card</h1><p>Твоя игровая библиотека на всех устройствах</p></div></div><div class="mc-auth-tabs"><button class="mc-auth-tab ${authMode==='login'?'active':''}" data-auth-mode="login">Войти</button><button class="mc-auth-tab ${authMode==='signup'?'active':''}" data-auth-mode="signup">Регистрация</button></div><form class="mc-auth-form" data-auth-form="login" ${authMode==='login'?'':'hidden'}><label class="mc-auth-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><label class="mc-auth-field"><span>Пароль</span><input type="password" name="password" autocomplete="current-password" minlength="8" required></label><div class="mc-auth-turnstile"></div><div class="mc-auth-status"></div><button class="primary mc-auth-submit" type="submit">Войти</button><p class="mc-auth-note"><button class="mc-auth-link" type="button" data-auth-reset>Забыли пароль?</button></p></form><form class="mc-auth-form" data-auth-form="signup" ${authMode==='signup'?'':'hidden'}><label class="mc-auth-field"><span>Имя</span><input type="text" name="name" maxlength="40" required></label><label class="mc-auth-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><label class="mc-auth-field"><span>Пароль</span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label><div class="mc-auth-turnstile"></div><div class="mc-auth-status"></div><button class="primary mc-auth-submit" type="submit">Создать аккаунт</button><p class="mc-auth-note">После регистрации нужно подтвердить email. Этот же аккаунт работает на телефоне, компьютере и других устройствах.</p></form><p class="mc-auth-note"><a href="./privacy.html">Конфиденциальность</a> · <a href="./delete-account.html">Удаление аккаунта</a></p></section></div>`;
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
    document.body.insertAdjacentHTML('beforeend',`<div class="mc-auth-shell"><section class="mc-auth-card mc-auth-confirm"><div class="mc-auth-logo" style="margin:0 auto">✓</div><h2>Подтверди email</h2><p>Мы отправили письмо на <b>${escHtml(email)}</b>. Перейди по ссылке в письме, затем вернись в Memory Card.</p><p class="mc-auth-note">Если письмо не пришло, проверь «Спам». Не отправляй повторные запросы подряд: у почтового сервиса есть лимиты.</p><button class="primary" type="button" data-auth-back>Вернуться ко входу</button></section></div>`);
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
    try{
      const {data,error}=await client.auth.signUp({email,password,options:{
        data:{display_name:displayName},captchaToken:captchaToken(),emailRedirectTo:appUrl()
      }});
      if(error){authStatus(friendlyAuthError(error,'signup'),'error');resetCaptcha();return;}
      resetCaptcha();
      if(data?.session){session=data.session;hideAuth();await reconcile();}
      else showConfirmation(email);
    }catch(error){
      authStatus(friendlyAuthError(error,'signup'),'error');
      resetCaptcha();
    }
  }
  async function signIn(form){
    const email=form.email.value.trim();
    const password=form.password.value;
    if(cfg.turnstileSiteKey&&!captchaToken()){authStatus('Подтверди проверку','error');return;}
    authStatus('Вхожу…');
    try{
      const {data,error}=await client.auth.signInWithPassword({
        email,password,options:{captchaToken:captchaToken()}
      });
      if(error){authStatus(friendlyAuthError(error,'login'),'error');resetCaptcha();return;}
      resetCaptcha();
      if(!data?.session){authStatus('Сервер не подтвердил вход. Попробуй позже.','error');return;}
      session=data.session;hideAuth();await reconcile();
    }catch(error){
      authStatus(friendlyAuthError(error,'login'),'error');
      resetCaptcha();
    }
  }
  async function resetPassword(){
    const email=document.querySelector('[data-auth-form="login"] input[name="email"]')?.value.trim();
    if(!email){authStatus('Сначала введи email','error');return;}
    if(cfg.turnstileSiteKey&&!captchaToken()){authStatus('Подтверди проверку','error');return;}
    authStatus('Отправляю письмо…');
    try{
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:appUrl(),captchaToken:captchaToken()});
      authStatus(error?friendlyAuthError(error,'reset'):'Если этот адрес зарегистрирован, письмо для восстановления отправлено.',error?'error':'ok');
    }catch(error){
      authStatus(friendlyAuthError(error,'reset'),'error');
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
    if(error){authStatus(friendlyAuthError(error,'password'),'error');return;}
    hideAuth();
    await reconcile();
    setToast('Пароль изменён');
  }
  async function logout(){
    if(syncing||resolvingConflict){
      setToast('Дождись завершения синхронизации перед выходом.');
      return;
    }
    const previous=session;
    cancelCloudRetry();
    try{
      // This transaction keeps a named local copy before it clears "main".
      if(vault?.deactivate)await vault.deactivate();
      clearTimeout(pushTimer);
      cloudReady=false;
      conflictItems=[];
      pushQueuedDuringSync=false;
      authWarning='';
      const {error}=await client.auth.signOut();
      if(error)throw error;
      session=null;
      profile=null;
      baseRender();
      showAuth();
    }catch(error){
      console.error('Memory Card sign-out failed',error);
      // Failed remote logout must not strand the user with an empty workspace.
      if(previous?.user?.id && vault?.activate){
        try{await vault.activate(previous.user.id);applyTheme();baseRender();}catch(_){}
      }
      setToast('Не удалось выйти безопасно. Повтори попытку.');
    }
  }

  function hideLegacySyncUi(){
    document.querySelectorAll('.panel').forEach(panel=>{
      const title=panel.querySelector('h3')?.textContent||'';
      if(title.includes('Google Sheets')) panel.hidden=true;
    });
  }
  async function injectGuestImport(card){
    if(!vault?.guestInfo||!card?.isConnected)return;
    try{
      const info=await vault.guestInfo();
      if(!card.isConnected||state.view!=='settings'||!session)return;
      let area=card.querySelector('[data-v83-guest-import-area]');
      if(!info.remaining){area?.remove();return;}
      if(!area){
        area=document.createElement('div');
        area.dataset.v83GuestImportArea='1';
        area.className='mc-guest-import';
        card.appendChild(area);
      }
      area.innerHTML='<p>Из гостевой библиотеки можно перенести '+info.remaining+
        ' игр (в архиве '+info.games+'). Ничего не перенесено автоматически.</p>'+
        '<button class="secondary compact" type="button" data-v83-import-guest>'+
        'Перенести недостающие игры</button>';
    }catch(error){
      console.warn('Guest library lookup failed',error);
    }
  }

  async function importGuest(){
    if(!vault?.importGuest||!session||syncing)return;
    try{
      const info=await vault.guestInfo();
      if(!info.remaining){setToast('Все гостевые игры уже есть в библиотеке.');return;}
      if(!window.confirm('Добавить '+info.remaining+
        ' гостевых игр в этот аккаунт? Совпадающие ID останутся без изменений. '+
        'Гостевой архив будет сохранён отдельно.'))return;
      const result=await vault.importGuest();
      if(result.imported){
        localEpoch++;
        await persist();
        applyTheme();
        baseRender();
        queueMicrotask(injectAccount);
      }
      setToast('Перенесено игр: '+result.imported+'. Пропущено совпадений: '+result.skipped+'.');
    }catch(error){
      console.error('Guest import failed',error);
      setToast('Не удалось безопасно перенести гостевую библиотеку.');
    }
  }

  function renderDeletionArea(card){
    if(!card?.isConnected||!session||state.view!=='settings')return;
    let area=card.querySelector('[data-v84-delete-area]');
    if(!area){
      area=document.createElement('div');
      area.dataset.v84DeleteArea='1';
      area.className='mc-account-deletion';
      card.appendChild(area);
    }
    const owner=String(session.user?.id||'');
    if(deletionState.owner!==owner){
      deletionState={owner,loading:false,requested:null,error:''};
    }
    let details='';
    if(!deletionRequests){
      details='<p role="alert">Запрос сейчас недоступен. Попробуй позже.</p>';
    }else if(deletionState.loading){
      details='<p role="status">Проверяю заявки на удаление…</p>';
    }else if(deletionState.error){
      details='<p role="alert">Не удалось проверить запрос. Проверь соединение.</p>'+
        '<button type="button" class="ghost compact" data-v84-retry-deletion>Проверить ещё раз</button>';
    }else if(deletionState.requested){
      details='<p role="status">Заявка на удаление уже зарегистрирована. '+
        'Аккаунт и данные пока не удалены.</p>'+
        '<p><a href="./delete-account.html">Окончательно удалить аккаунт</a> '+
        'можно после повторного ввода пароля и проверки безопасности. '+
        'Это необратимое действие.</p>';
    }else if(deletionState.requested===false){
      details='<form data-v84-delete-request>'+
        '<label>Для отправки заявки введи <strong>УДАЛИТЬ</strong>'+
        '<input type="text" name="confirmation" required autocomplete="off" spellcheck="false" /></label>'+
        '<button class="danger compact" type="submit">Запросить удаление аккаунта</button>'+
        '</form>';
    }else{
      details='<p>Чтобы отправить запрос, сначала проверь состояние заявок.</p>';
    }
    area.innerHTML='<h4>Удаление аккаунта</h4>'+
      '<p>Можно запросить удаление учётной записи и связанных облачных данных: '+
      'игр, заметок, настроек и друзей. Запрос не удаляет ничего немедленно.</p>'+
      '<p>Сначала рекомендуем экспортировать библиотеку в JSON. '+
      '<a href="./delete-account.html">Страница удаления аккаунта</a> работает и без установленного приложения. '+
      'На ней можно завершить удаление самостоятельно после подтверждения личности.</p>'+
      details;
    if(deletionState.requested===null&&!deletionState.loading&&!deletionState.error){
      void fetchDeletionStatus(owner,card);
    }
  }

  async function fetchDeletionStatus(owner,card){
    if(!deletionRequests||deletionState.owner!==owner||deletionState.loading)return;
    deletionState.loading=true;
    try{
      const result=await deletionRequests.status(client);
      if(session?.user?.id!==owner)return;
      deletionState.requested=result.requested;
      deletionState.error='';
    }catch(error){
      if(session?.user?.id!==owner)return;
      console.warn('Account deletion status unavailable',error?.code||error?.message||'error');
      deletionState.error='unavailable';
    }finally{
      if(session?.user?.id===owner){
        deletionState.loading=false;
        if(card?.isConnected)renderDeletionArea(card);
      }
    }
  }

  async function submitDeletionRequest(form){
    if(!deletionRequests||!session||deletionState.loading)return;
    const typed=String(new FormData(form).get('confirmation')||'').trim();
    if(typed!=='УДАЛИТЬ'){
      setToast('Введи УДАЛИТЬ заглавными буквами для подтверждения.');
      return;
    }
    const owner=session.user.id;
    deletionState.loading=true;
    const button=form.querySelector('button[type="submit"]');
    if(button)button.disabled=true;
    try{
      const result=await deletionRequests.request(client);
      if(session?.user?.id!==owner)return;
      deletionState.requested=result.requested;
      deletionState.error='';
      setToast('Заявка зарегистрирована. Для окончательного удаления открой страницу удаления аккаунта.');
    }catch(error){
      if(session?.user?.id!==owner)return;
      deletionState.error='submission';
      console.warn('Account deletion request failed',error?.code||error?.message||'error');
      setToast('Заявку не удалось отправить. Проверь соединение.');
    }finally{
      if(session?.user?.id===owner){
        deletionState.loading=false;
        const card=document.querySelector('[data-v2-account]');
        if(card)renderDeletionArea(card);
      }
      if(button?.isConnected)button.disabled=false;
    }
  }

  function injectAccount(){
    hideLegacySyncUi();
    if(state.view!=='settings'||!session) return;
    const root=document.querySelector('.settings-grid')||document.querySelector('.content');
    if(!root)return;
    const existing=root.querySelector('[data-v2-account]');
    if(existing){renderConflictPanel(existing);void injectGuestImport(existing);renderDeletionArea(existing);return;}
    const card=document.createElement('section');
    card.className='panel';
    card.dataset.v2Account='1';
    card.innerHTML=`<div class="settings-panel-head"><div><h3>Аккаунт</h3><p class="status-line">${escHtml(session.user.email||'')} · ${escHtml(profile?.memory_id||state.settings.userId||'')}</p></div><div class="mc-account-chip"><button class="secondary compact" type="button" data-v2-sync>Синхронизировать</button><button class="ghost compact" type="button" data-v2-logout>Выйти</button></div></div><p data-v2-sync-state data-sync-kind="${escHtml(syncKind)}" class="mc-cloud-sync-state" role="status">${escHtml(syncMessage)}</p>`;
    root.prepend(card);
    renderConflictPanel(card);
    void injectGuestImport(card);
    renderDeletionArea(card);
  }

  render=function(){baseRender();queueMicrotask(injectAccount);};

  document.addEventListener('click',event=>{
    const mode=event.target instanceof Element?event.target.closest('[data-auth-mode]'):null;
    if(mode){authMode=mode.dataset.authMode;resetCaptcha();showAuth();return;}
    if(event.target instanceof Element&&event.target.closest('[data-auth-back]')){authMode='login';showAuth();return;}
    if(event.target instanceof Element&&event.target.closest('[data-auth-reset]')){resetPassword();return;}
    if(event.target instanceof Element&&event.target.closest('[data-v2-logout]')){logout();return;}
    if(event.target instanceof Element&&event.target.closest('[data-v2-sync]')){manualSync();return;}
    if(event.target instanceof Element&&event.target.closest('[data-v84-retry-deletion]')){
      deletionState.requested=null;deletionState.error='';
      const card=document.querySelector('[data-v2-account]');
      if(card)renderDeletionArea(card);
      return;
    }
    if(event.target instanceof Element&&event.target.closest('[data-v83-import-guest]')){
      event.preventDefault();
      void importGuest();
      return;
    }
    const resolve=event.target instanceof Element?event.target.closest('[data-v81-resolve]'):null;
    if(resolve){event.preventDefault();resolveConflict(resolve.dataset.v81Id,resolve.dataset.v81Resolve);return;}
  },true);
  document.addEventListener('submit',event=>{
    const form=event.target instanceof HTMLFormElement?event.target:null;
    if(!form) return;
    if(form.hasAttribute('data-v84-delete-request')){
      event.preventDefault();
      void submitDeletionRequest(form);
      return;
    }
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
    if(!session||syncing||conflictItems.length)return;
    if(!cloudReady)manualSync();
    else if(syncKind==='error'||pushQueuedDuringSync)schedulePush(250);
  });

  client.auth.onAuthStateChange((event,next)=>{
    const newId=next?.user?.id||null;
    if(newId!==activeAuthUserId||!newId){
      cancelCloudRetry();
      activeAuthUserId=newId;
      deletionState={owner:newId||'',loading:false,requested:null,error:''};
      cloudReady=false;
      conflictItems=[];
      clearTimeout(pushTimer);
    }
    session=next;
    setTimeout(async()=>{
      if(event==='PASSWORD_RECOVERY'){
        showPasswordRecovery();
        return;
      }
      if(session){
        hideAuth();
        // Token refresh alone must not wipe a currently edited form.
        if(!cloudReady)await reconcile();
      }else{
        try{
          if(vault?.deactivate)await vault.deactivate();
          baseRender();
        }catch(error){
          console.error('Could not clear signed-out account view',error);
        }
        showAuth();
      }
    },0);
  });

  async function init(){
    // Core IndexedDB loading must finish before session-based workspace
    // activation, otherwise its late "main" write could restore old data.
    if(window.MemoryCardInitialLoad)await window.MemoryCardInitialLoad;
    disableLegacySync();
    await localPersist();
    const {data}=await client.auth.getSession();
    session=data.session||null;
    if(session){hideAuth();await reconcile();}
    else{
      if(vault?.deactivate)await vault.deactivate();
      baseRender();
      showAuth();
    }
  }

  window.MemoryCardBackendV2={configured:true,client,sync:manualSync,push:pushCloud,logout,isBusy:()=>syncing||!!vault?.isSwitching?.(),getSyncState:()=>({kind:syncKind,message:syncMessage,conflicts:conflictItems.length,retryAttempt:retryAttempts,retryScheduled:!!retryTimer,retryAfterMs:Math.max(0,retryAt-Date.now())}),getSession:()=>session,getProfile:()=>profile,sendFriendRequest:async memoryId=>client.rpc('send_friend_request',{target_memory_id:memoryId}),acceptFriendRequest:async id=>client.rpc('accept_friend_request',{friendship_id:id}),getFriendProfile:async memoryId=>client.rpc('get_friend_profile',{target_memory_id:memoryId})};
  init();
})();
