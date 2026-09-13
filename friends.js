/* Memory Card v12 — friend list and multi-user cloud sync */
(() => {
  state.social = state.social || {loading:false,loaded:false,friends:[],incoming:[],outgoing:[],profile:null,error:''};
  state.friendProfile = null;
  let bootstrapTimer = 0;

  const baseNav = navButtons;
  navButtons = function() {
    const items=[['home','Главная'],['playing','Сейчас играю'],['games','Игры'],['timeline','Лог'],['stats','Статистика'],['friends','Друзья'],['settings','Настройки']];
    return items.map(([v,label])=>`<button data-nav="${v}" class="${state.view===v?'active':''}">${label}${v==='friends'&&state.social.incoming.length?`<span class="nav-badge">${state.social.incoming.length}</span>`:''}</button>`).join('');
  };

  function stats(games=[]) {
    const live=games.filter(g=>!g.deletedAt),completed=live.filter(g=>g.status==='completed'),playing=live.filter(g=>g.status==='playing'),rated=completed.map(g=>Number(g.rating)).filter(Boolean);
    return {completed:completed.length,playing:playing.length,averageRating:rated.length?(rated.reduce((a,b)=>a+b,0)/rated.length).toFixed(1):'—',tens:completed.filter(g=>Number(g.rating)===10).length};
  }
  function avatar(name='И') { return esc((name||'И')[0].toUpperCase()); }

  function renderFriends() {
    if(!state.settings.sheetEndpoint)return `<div class="section-head"><div><h2>Друзья</h2><p>Профили Memory Card живут в закрытой облачной базе.</p></div></div><section class="panel empty-social"><h3>Сначала подключи облако</h3><p class="status-line">Укажи Apps Script endpoint в настройках. После подключения тебе автоматически присвоится Memory Card ID.</p><button class="primary" data-nav="settings">Открыть настройки</button></section>`;
    if(state.social.loading&&!state.social.loaded)return `<div class="section-head"><div><h2>Друзья</h2><p>Загружаю список друзей…</p></div></div><section class="panel"><div class="social-loader">Подключение к Memory Card Network…</div></section>`;
    if(!state.settings.userId)return `<div class="section-head"><div><h2>Друзья</h2><p>Создаю твой профиль…</p></div></div><section class="panel"><div class="social-loader">Получаю уникальный ID…</div></section>`;
    const {friends=[],incoming=[],outgoing=[]}=state.social;
    return `<div class="section-head"><div><h2>Друзья</h2><p>Смотри игровые профили друзей и их статистику.</p></div><button class="secondary" data-action="social-refresh">Обновить</button></div>
      <section class="panel social-me-card"><div class="social-avatar">${avatar(state.settings.profileName)}</div><div class="social-me-main"><div class="game-title">${esc(state.settings.profileName||'Игрок')}</div><div class="memory-id">${esc(state.settings.userId)}</div></div><button class="ghost compact" data-action="copy-user-id">Копировать ID</button></section>
      <section class="panel friend-add-panel"><h3>Добавить друга</h3><p class="status-line">Поиск работает только по точному Memory Card ID.</p><form id="friendAddForm" class="friend-search"><input name="friendId" autocomplete="off" placeholder="MC-AB12-CD34" maxlength="20"><button class="primary" type="submit">Отправить приглашение</button></form></section>
      ${incoming.length?`<section class="panel"><div class="section-head"><div><h3>Входящие приглашения</h3><p>${incoming.length}</p></div></div><div class="friend-list">${incoming.map(r=>`<article class="friend-row"><div class="social-avatar small">${avatar(r.displayName)}</div><div class="friend-main"><div class="game-title">${esc(r.displayName||'Игрок')}</div><div class="memory-id">${esc(r.userId)}</div></div><div class="friend-actions"><button class="secondary compact" data-action="friend-reject" data-request-id="${esc(r.requestId)}">Отклонить</button><button class="primary compact" data-action="friend-accept" data-request-id="${esc(r.requestId)}">Принять</button></div></article>`).join('')}</div></section>`:''}
      ${outgoing.length?`<section class="panel"><div class="section-head"><div><h3>Отправленные</h3><p>Ожидают подтверждения</p></div></div><div class="friend-list">${outgoing.map(r=>`<article class="friend-row muted-row"><div class="social-avatar small">${avatar(r.displayName)}</div><div class="friend-main"><div class="game-title">${esc(r.displayName||'Игрок')}</div><div class="memory-id">${esc(r.userId)}</div></div><span class="request-status">Ожидает</span></article>`).join('')}</div></section>`:''}
      <section class="panel"><div class="section-head"><div><h3>Мои друзья</h3><p>${friends.length?`${friends.length} в списке`:'Пока никого'}</p></div></div>${friends.length?`<div class="friend-grid">${friends.map(f=>`<button class="friend-card" data-friend-open="${esc(f.userId)}"><div class="social-avatar">${avatar(f.displayName)}</div><div><div class="game-title">${esc(f.displayName||'Игрок')}</div><div class="memory-id">${esc(f.userId)}</div><div class="friend-mini-stats"><span>${Number(f.completed||0)} пройдено</span><span>${Number(f.playing||0)} играет</span></div></div></button>`).join('')}</div>`:`<div class="empty">Добавь друга по ID. Профиль станет доступен только после принятия приглашения.</div>`}</section>`;
  }

  function friendRow(g){return `<div class="game-row static-row with-cover">${coverMarkup(g,'mini-cover')}<div><div class="game-title">${esc(g.title)}</div><div class="meta">${platform(g.platform).abbr}${g.releaseYear?` · ${esc(g.releaseYear)}`:''}${g.genre?` · ${esc(g.genre)}`:''}</div></div><div class="rating-text">${g.rating?`${ratingStars(g.rating)} <span>${g.rating}/10</span>`:''}</div></div>`;}
  function renderFriendProfile(){
    const fp=state.friendProfile;if(!fp)return renderFriends();
    if(fp.loading)return `<div class="section-head"><div><h2>Профиль друга</h2><p>Загружаю библиотеку…</p></div></div><section class="panel"><div class="social-loader">Получаю профиль…</div></section>`;
    if(fp.error)return `<div class="section-head"><div><h2>Профиль друга</h2><p>${esc(fp.error)}</p></div><button class="secondary" data-action="friend-back">← К друзьям</button></div>`;
    const p=fp.profile||{},games=(fp.games||[]).map(migrateGame),st=fp.stats||stats(games),playing=games.filter(g=>g.status==='playing'),completed=games.filter(g=>g.status==='completed').sort((a,b)=>String(b.updatedAt||b.addedAt||'').localeCompare(String(a.updatedAt||a.addedAt||''))),owned=new Set(p.ownedPlatforms||[]);
    return `<div class="section-head"><div><h2>${esc(p.displayName||'Игрок')}</h2><p class="memory-id">${esc(p.userId||'')}</p></div><button class="secondary" data-action="friend-back">← К друзьям</button></div>
      <section class="panel friend-profile-hero"><div class="social-avatar xl">${avatar(p.displayName)}</div><div class="friend-profile-title"><h3>${esc(p.displayName||'Игрок')}</h3><div class="memory-id">${esc(p.userId||'')}</div><div class="meta">Профиль только для просмотра</div></div><button class="danger compact" data-action="friend-remove" data-friend-id="${esc(p.userId||'')}">Удалить из друзей</button></section>
      <div class="stats"><div class="stat-card"><div class="stat-value">${st.completed??completed.length}</div><div class="stat-label">Игр пройдено</div></div><div class="stat-card"><div class="stat-value">${st.averageRating??'—'}</div><div class="stat-label">Средняя оценка</div></div><div class="stat-card"><div class="stat-value">${st.playing??playing.length}</div><div class="stat-label">Сейчас играет</div></div><div class="stat-card"><div class="stat-value">${st.tens??0}</div><div class="stat-label">Игр на 10/10</div></div></div>
      ${playing.length?`<section class="panel"><div class="section-head"><div><h3>Сейчас играет</h3></div></div><div class="list">${playing.map(friendRow).join('')}</div></section>`:''}
      <section class="panel"><div class="section-head"><div><h3>Приставки</h3><p>Устройства друга</p></div></div><div class="friend-platforms">${PLATFORMS.filter(x=>owned.has(x.id)).map(x=>`<div class="friend-platform-chip">${platformIcon(x.id)}<span>${esc(x.abbr)}</span></div>`).join('')||'<div class="empty">Не указаны</div>'}</div></section>
      <section class="panel"><div class="section-head"><div><h3>Последние прохождения</h3><p>${completed.length} всего</p></div></div>${completed.length?`<div class="list">${completed.slice(0,40).map(friendRow).join('')}</div>`:'<div class="empty">Пока нет завершённых игр.</div>'}</section>`;
  }

  const baseView=renderView;
  renderView=function(){return state.view==='friends'?(state.friendProfile?renderFriendProfile():renderFriends()):baseView();};
  const baseNavigate=navigate;
  navigate=function(view){state.friendProfile=null;baseNavigate(view);if(view==='friends')setTimeout(()=>refreshSocial(true),20);if(view==='settings')setTimeout(()=>ensureIdentity(true),20);};
  const baseRender=render;
  render=function(){baseRender();if(state.settings.sheetEndpoint&&!state.settings.userId&&!state.social.loading){clearTimeout(bootstrapTimer);bootstrapTimer=setTimeout(()=>ensureIdentity(true),80);}};

  async function ensureIdentity(quiet=false){
    if(state.social.loading||!state.settings.sheetEndpoint)return false;state.social.loading=true;
    try{
      if(!quiet)setTaskProgress('Профиль Memory Card',10,100,'Подключаюсь к базе');
      const data=await appsScriptBridgeRequest(state.settings.sheetEndpoint,{action:'profileBootstrap',secret:state.settings.syncSecret||'',userId:state.settings.userId||'',authToken:state.settings.authToken||'',displayName:state.settings.profileName||'Игрок'});
      if(!data?.ok)throw new Error(data?.error||'Не удалось создать профиль');
      state.settings.userId=String(data.profile?.userId||state.settings.userId||'').toUpperCase();state.settings.authToken=String(data.authToken||state.settings.authToken||'');state.settings.profileName=String(data.profile?.displayName||state.settings.profileName||'Игрок');state.settings.profileUpdatedAt=String(data.profile?.updatedAt||'');
      if(Array.isArray(data.games)&&data.games.length&&!state.games.length)state.games=data.games.map(migrateGame);if(data.settings)state.settings=mergeClientSettings(state.settings,data.settings);
      Object.assign(state.social,{profile:data.profile||null,friends:data.friends||[],incoming:data.incoming||[],outgoing:data.outgoing||[],loaded:true,error:''});await persist();if(!quiet)finishTaskProgress('Профиль готов',state.settings.userId);render();return true;
    }catch(e){console.error(e);state.social.error=e.message||String(e);if(!quiet)failTaskProgress('Не удалось подключить профиль',state.social.error);return false;}finally{state.social.loading=false;}
  }
  async function request(action,extra={},quiet=true){
    if(!state.settings.userId||!state.settings.authToken){if(!await ensureIdentity(quiet))throw new Error('Профиль не подключён');}
    const data=await appsScriptBridgeRequest(state.settings.sheetEndpoint,{action,userId:state.settings.userId,authToken:state.settings.authToken,...extra});if(!data?.ok)throw new Error(data?.error||'Ошибка Memory Card Network');return data;
  }
  async function refreshSocial(quiet=false){
    if(state.social.loading||!state.settings.sheetEndpoint)return;state.social.loading=true;
    try{if(!state.settings.userId||!state.settings.authToken){state.social.loading=false;if(!await ensureIdentity(quiet))return;state.social.loading=true;}if(!quiet)setTaskProgress('Друзья',15,100,'Обновляю список');const data=await request('socialState',{},true);Object.assign(state.social,{profile:data.profile||state.social.profile,friends:data.friends||[],incoming:data.incoming||[],outgoing:data.outgoing||[],loaded:true,error:''});if(!quiet)finishTaskProgress('Друзья обновлены',`${state.social.friends.length} друзей`);render();}catch(e){state.social.error=e.message||String(e);if(!quiet)failTaskProgress('Не удалось обновить друзей',state.social.error);render();}finally{state.social.loading=false;}
  }
  async function addFriend(e){e.preventDefault();const id=String(new FormData(e.currentTarget).get('friendId')||'').trim().toUpperCase();if(!id)return;try{setTaskProgress('Приглашение',20,100,`Ищу ${id}`);const d=await request('friendRequest',{friendId:id});finishTaskProgress('Приглашение отправлено',d.target?.displayName||id);await refreshSocial(true);setToast('Приглашение отправлено');}catch(err){failTaskProgress('Не удалось отправить',err.message||String(err));alert(err.message||String(err));}}
  async function respond(id,accept){try{await request('friendRespond',{requestId:id,accept});await refreshSocial(true);setToast(accept?'Друг добавлен':'Приглашение отклонено');}catch(e){alert(e.message||String(e));}}
  async function openFriend(id){state.friendProfile={loading:true,userId:id};render();try{const d=await request('friendProfile',{friendId:id});state.friendProfile={loading:false,profile:d.profile,games:d.games||[],stats:d.stats||{}};}catch(e){state.friendProfile={loading:false,error:e.message||String(e),userId:id};}render();}
  async function removeFriend(id){if(!confirm('Удалить этого пользователя из друзей? После этого профили снова станут недоступны друг другу.'))return;try{await request('friendRemove',{friendId:id});state.friendProfile=null;await refreshSocial(true);setToast('Удалено из друзей');}catch(e){alert(e.message||String(e));}}
  async function saveName(name){name=String(name||'').trim().slice(0,40)||'Игрок';state.settings.profileName=name;state.settings.profileUpdatedAt=nowIso();await persist();if(state.settings.userId&&state.settings.authToken&&state.settings.sheetEndpoint){try{const d=await request('profileUpdate',{displayName:name});if(d.profile?.displayName)state.settings.profileName=d.profile.displayName;await persist();}catch(e){console.warn(e);}}}

  const coreSave=saveSettings;
  saveSettings=async function(silent=false){const previous=state.settings.profileName;await coreSave(true);if(state.settings.profileName!==previous)await saveName(state.settings.profileName);if(!state.settings.userId&&state.settings.sheetEndpoint)await ensureIdentity(true);if(!silent)setToast('Настройки сохранены');};

  syncSheets=async function(options={}){
    const {silent=false,skipSaveSettings=false}=options;if(syncInFlight){if(!silent)setToast('Синхронизация уже выполняется');return;}if(!skipSaveSettings)await saveSettings(true);const url=String(state.settings.sheetEndpoint||'').trim();if(!url){if(!silent)alert('Сначала укажи Apps Script endpoint в настройках.');return;}if(!state.settings.userId||!state.settings.authToken){if(!await ensureIdentity(silent))return;}
    syncInFlight=true;const localBefore=clonePlain(state.games),settingsBefore=clonePlain(state.settings);
    try{if(!silent){setToast('Синхронизация…');setTaskProgress('Синхронизация',5,100,'Создаю локальную резервную копию');}await createLocalSnapshot('before-sync');await persist();const data=await appsScriptBridgeRequest(url,{action:'profileSync',userId:state.settings.userId,authToken:state.settings.authToken,games:localBefore,settings:syncableSettings(),profile:{displayName:state.settings.profileName||'Игрок'}});if(!data?.ok)throw new Error(data?.error||'Google Apps Script вернул ошибку');state.games=mergeClientGames(localBefore,Array.isArray(data.games)?data.games:[]);state.settings=mergeClientSettings(settingsBefore,data.settings||{});if(data.profile?.displayName)state.settings.profileName=data.profile.displayName;state.settings.lastSync=nowIso();if(data.social)Object.assign(state.social,{friends:data.social.friends||[],incoming:data.social.incoming||[],outgoing:data.social.outgoing||[],loaded:true});applyTheme();await persist();render();const count=state.games.filter(g=>!g.deletedAt).length;if(!silent){finishTaskProgress('Синхронизация завершена',`${count} игр`);setToast(`Синхронизировано: ${count} игр`);}}
    catch(e){console.error(e);state.games=localBefore.map(migrateGame);state.settings=migrateSettings({...settingsBefore,lastLocalBackupAt:state.settings.lastLocalBackupAt||settingsBefore.lastLocalBackupAt});await persist();render();if(!silent){failTaskProgress('Ошибка синхронизации',e.message||'Проверь настройки');alert(`Не удалось синхронизировать. Локальные данные не изменены.\n\n${e.message||e}`);}}finally{syncInFlight=false;}
  };

  const baseBind=bind;
  bind=function(){baseBind();
    document.querySelectorAll('[data-action="social-refresh"]').forEach(x=>x.onclick=()=>refreshSocial(false));
    document.querySelectorAll('[data-action="copy-user-id"]').forEach(x=>x.onclick=async()=>{if(!state.settings.userId)return;try{await navigator.clipboard.writeText(state.settings.userId);setToast('ID скопирован');}catch(_){prompt('Скопируй ID:',state.settings.userId);}});
    document.querySelectorAll('[data-action="friend-accept"]').forEach(x=>x.onclick=()=>respond(x.dataset.requestId,true));document.querySelectorAll('[data-action="friend-reject"]').forEach(x=>x.onclick=()=>respond(x.dataset.requestId,false));document.querySelectorAll('[data-friend-open]').forEach(x=>x.onclick=()=>openFriend(x.dataset.friendOpen));document.querySelectorAll('[data-action="friend-back"]').forEach(x=>x.onclick=()=>{state.friendProfile=null;render();});document.querySelectorAll('[data-action="friend-remove"]').forEach(x=>x.onclick=()=>removeFriend(x.dataset.friendId));
    const form=document.querySelector('#friendAddForm');if(form)form.onsubmit=addFriend;const name=document.querySelector('#profileName');if(name)name.onchange=()=>saveName(name.value);
  };
})();
