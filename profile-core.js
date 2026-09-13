/* Memory Card v12 — profiles, consoles and optional rotations */
(() => {
  const originalIds = new Set(PLATFORMS.map(p => p.id));
  const extras = [
    ['PS1','PlayStation','PS1'],['PS2','PlayStation 2','PS2'],['PS4','PlayStation 4','PS4'],['PS5','PlayStation 5','PS5'],
    ['XBOX','Xbox Original','Xbox'],['X360','Xbox 360','360'],['XONE','Xbox One','One'],['XSERIES','Xbox Series X|S','Series'],
    ['WII','Nintendo Wii','Wii'],['GC','Nintendo GameCube','GC'],['DREAMCAST','Sega Dreamcast','DC'],['N64','Nintendo 64','N64'],
    ['SNES','Super Nintendo / SNES','SNES'],['NES','Nintendo Entertainment System','NES'],['GENESIS','Sega Mega Drive / Genesis','Sega'],
  ].map(([id,name,abbr]) => ({id,name,abbr,group:'desktop',wikidata:[]}));
  extras.forEach(p => { if (!PLATFORMS.some(x => x.id === p.id)) PLATFORMS.push(p); });
  Object.assign(LIBRETRO_COVER_REPOS, {
    PS1:['Sony_-_PlayStation'], PS2:['Sony_-_PlayStation_2'], XBOX:['Microsoft_-_Xbox'], X360:['Microsoft_-_Xbox_360'],
    WII:['Nintendo_-_Wii'], GC:['Nintendo_-_GameCube'], DREAMCAST:['Sega_-_Dreamcast'], N64:['Nintendo_-_Nintendo_64'],
    SNES:['Nintendo_-_Super_Nintendo_Entertainment_System'], NES:['Nintendo_-_Nintendo_Entertainment_System'], GENESIS:['Sega_-_Mega_Drive_-_Genesis'],
  });

  const legacyOwned = [...originalIds];
  Object.assign(DEFAULT_SETTINGS, {
    profileName:'Игрок', userId:'', authToken:'', ownedPlatforms:legacyOwned,
    rotationHandheldEnabled:true, rotationDesktopEnabled:true, profileUpdatedAt:'',
  });

  normalizeRotation = function(ids, group) {
    const allowed = new Set(PLATFORMS.filter(p => p.group === group).map(p => p.id));
    const out = [];
    (Array.isArray(ids) ? ids : []).forEach(id => { if (allowed.has(id) && !out.includes(id)) out.push(id); });
    if (!out.length) (group === 'desktop' ? ['PS3','WIIU','SWITCH'] : ['DSI','VITA','3DS','PSP','GBA']).forEach(id => { if (allowed.has(id)) out.push(id); });
    return out;
  };

  const baseMigrate = migrateSettings;
  migrateSettings = function(raw={}) {
    const out = baseMigrate(raw);
    const known = new Set(PLATFORMS.map(p => p.id));
    out.ownedPlatforms = [...new Set((Array.isArray(raw.ownedPlatforms) ? raw.ownedPlatforms : legacyOwned).filter(id => known.has(id)))];
    if (!out.ownedPlatforms.length) out.ownedPlatforms = [...legacyOwned];
    out.rotationHandheldEnabled = raw.rotationHandheldEnabled !== false;
    out.rotationDesktopEnabled = raw.rotationDesktopEnabled !== false;
    out.profileName = String(raw.profileName || raw.displayName || 'Игрок').trim().slice(0,40) || 'Игрок';
    out.userId = String(raw.userId || '').trim().toUpperCase();
    out.authToken = String(raw.authToken || '');
    out.profileUpdatedAt = String(raw.profileUpdatedAt || '');
    out.handheldRotation = normalizeRotation(out.handheldRotation,'handheld').filter(id => out.ownedPlatforms.includes(id));
    out.desktopRotation = normalizeRotation(out.desktopRotation,'desktop').filter(id => out.ownedPlatforms.includes(id));
    if (!out.handheldRotation.length) out.handheldRotation = out.ownedPlatforms.filter(id => platform(id).group === 'handheld').slice(0,1);
    if (!out.desktopRotation.length) out.desktopRotation = out.ownedPlatforms.filter(id => platform(id).group === 'desktop').slice(0,1);
    if (out.handheldRotation.length && !out.handheldRotation.includes(out.currentHandheld)) out.currentHandheld = out.handheldRotation[0];
    if (out.desktopRotation.length && !out.desktopRotation.includes(out.currentDesktop)) out.currentDesktop = out.desktopRotation[0];
    return out;
  };

  window.mcOwnedPlatforms = function(group='') {
    const owned = new Set(state.settings.ownedPlatforms || legacyOwned);
    return PLATFORMS.filter(p => owned.has(p.id) && (!group || p.group === group)).map(p => p.id);
  };
  window.mcRotationEnabled = group => group === 'desktop' ? state.settings.rotationDesktopEnabled !== false : state.settings.rotationHandheldEnabled !== false;

  rotationFor = function(group) {
    const key = group === 'desktop' ? 'desktopRotation' : 'handheldRotation';
    const owned = new Set(mcOwnedPlatforms(group));
    const arr = (state.settings[key] || []).filter(id => owned.has(id));
    return arr.length ? arr : [...owned].slice(0,1);
  };
  currentPlatformFor = function(group) {
    const r = rotationFor(group), current = state.settings[currentSettingKey(group)];
    return r.includes(current) ? current : (r[0] || mcOwnedPlatforms(group)[0] || '');
  };
  nextPlatformAfter = function(id, group) {
    const r = rotationFor(group); if (!r.length) return id || '';
    const i = r.indexOf(id); return r[(i >= 0 ? i + 1 : 0) % r.length];
  };
  recommendedPlatform = function(group='') {
    if (group === 'handheld' || group === 'desktop') return currentPlatformFor(group) || mcOwnedPlatforms(group)[0] || '';
    const owned = mcOwnedPlatforms();
    return currentPlatformFor('handheld') || currentPlatformFor('desktop') || owned[0] || 'PSP';
  };

  const baseIcon = platformIcon;
  platformIcon = function(id) {
    if (originalIds.has(id)) return baseIcon(id);
    const p = platform(id), tower = ['PS2','PS5','X360','XSERIES','WII'].includes(id), cube = ['GC','DREAMCAST','N64'].includes(id);
    const body = tower
      ? '<rect x="24" y="3" width="24" height="38" rx="6"/><rect class="screen" x="29" y="9" width="14" height="5" rx="2"/><circle class="detail" cx="36" cy="33" r="2"/>'
      : cube
        ? '<rect x="9" y="8" width="54" height="29" rx="7"/><circle class="screen" cx="36" cy="22" r="9"/><circle class="detail" cx="56" cy="16" r="2"/>'
        : '<rect x="7" y="9" width="58" height="27" rx="5"/><rect class="screen" x="13" y="14" width="34" height="13" rx="2"/><circle class="detail" cx="56" cy="22" r="4"/>';
    return `<span class="device-icon"><svg viewBox="0 0 72 44" aria-hidden="true">${body}</svg><small class="device-mini-label">${esc(p.abbr)}</small></span>`;
  };

  const baseRotationCard = renderRotationCard;
  renderRotationCard = function(group) {
    const label = group === 'handheld' ? 'Портативная ротация' : 'Desktop-ротация';
    if (!mcRotationEnabled(group)) return `<section class="rotation-card rotation-disabled"><div class="rotation-title">${label}</div><div class="rotation-playing muted">Ротация выключена</div><div class="meta">Играй на любых выбранных устройствах без очереди.</div><div class="status-line"><button class="next-inline" data-nav="settings">Настроить</button></div></section>`;
    if (!rotationFor(group).length) return `<section class="rotation-card rotation-disabled"><div class="rotation-title">${label}</div><div class="empty">Добавь устройство этой группы в настройках.</div></section>`;
    return baseRotationCard(group);
  };
  const baseFinishRotation = openFinishRotation;
  openFinishRotation = function(group) {
    if (!mcRotationEnabled(group)) return setToast('Эта ротация выключена');
    if (rotationFor(group).length < 2) return setToast('Для ротации нужно хотя бы два устройства');
    baseFinishRotation(group);
  };

  rotationEditor = function(group) {
    const key = group === 'desktop' ? 'desktopRotation' : 'handheldRotation';
    const title = group === 'handheld' ? 'Портативная ротация' : 'Desktop-ротация';
    const enabled = mcRotationEnabled(group), rotation = rotationFor(group), candidates = mcOwnedPlatforms(group);
    return `<section class="panel"><div class="settings-panel-head"><div><h3>${title}</h3><p class="status-line">${enabled ? 'Включена. Настрой порядок и состав очереди.' : 'Выключена. Очерёдность не используется.'}</p></div><label class="mini-switch"><input type="checkbox" data-rotation-enabled="${group}" ${enabled?'checked':''}><span>${enabled?'Вкл':'Выкл'}</span></label></div>${enabled ? `<div class="field current-select"><label>Текущее устройство</label><select data-current-group="${group}">${rotation.map(id => `<option value="${id}" ${state.settings[currentSettingKey(group)]===id?'selected':''}>${esc(platform(id).name)}</option>`).join('')}</select></div><div class="rotation-editor">${rotation.map((id,i) => `<div class="rotation-edit-row"><div class="platform-inline">${platformIcon(id)}<div><div class="game-title">${esc(platform(id).name)}</div><div class="meta">${i+1} в очереди</div></div></div><div class="order-actions"><button class="ghost icon-small" data-action="rotation-move" data-group="${group}" data-id="${id}" data-direction="up" ${i===0?'disabled':''}>↑</button><button class="ghost icon-small" data-action="rotation-move" data-group="${group}" data-id="${id}" data-direction="down" ${i===rotation.length-1?'disabled':''}>↓</button><button class="ghost compact" data-action="rotation-remove" data-group="${group}" data-id="${id}" ${rotation.length<=1?'disabled':''}>Убрать</button></div></div>`).join('')}</div><div class="rotation-add-list">${candidates.filter(id => !rotation.includes(id)).map(id => `<button class="secondary compact" data-action="rotation-add" data-group="${group}" data-id="${id}">+ ${esc(platform(id).abbr)}</button>`).join('')}</div>` : ''}</section>`;
  };

  function profileCard() {
    return `<section class="panel profile-settings-card"><div class="settings-panel-head"><div><h3>Профиль Memory Card</h3><p class="status-line">Имя можно менять. ID постоянный и нужен для друзей.</p></div></div><div class="form-grid"><div class="field"><label>Имя</label><input id="profileName" maxlength="40" value="${esc(state.settings.profileName || 'Игрок')}"></div><div class="field"><label>Memory Card ID</label><div class="id-field"><input readonly value="${esc(state.settings.userId || 'Присвоится автоматически после подключения')}"><button class="secondary compact" data-action="copy-user-id" ${state.settings.userId?'':'disabled'}>Копировать</button></div></div></div><div class="footer-note">Публичный ID можно отправлять друзьям. Приватный ключ профиля остаётся только на устройстве и не экспортируется.</div></section>`;
  }
  function consolesCard() {
    const owned = new Set(state.settings.ownedPlatforms || legacyOwned);
    return `<section class="panel consoles-settings"><div class="settings-panel-head"><div><h3>Мои приставки</h3><p class="status-line">Отметь устройства, которые используешь. Остальные исчезнут из основной работы с библиотекой.</p></div></div><div class="console-picker">${PLATFORMS.map(p => `<label class="console-choice ${owned.has(p.id)?'selected':''}"><input type="checkbox" data-owned-platform="${p.id}" ${owned.has(p.id)?'checked':''}><span class="console-choice-icon">${platformIcon(p.id)}</span><span><b>${esc(p.abbr)}</b><small>${esc(p.name)}</small></span></label>`).join('')}</div></section>`;
  }
  const baseSettingsView = renderSettings;
  renderSettings = function() {
    return baseSettingsView().replace('<div class="settings-grid">', `<div class="settings-grid">${profileCard()}${consolesCard()}`).replace('Экспорт содержит игры и настройки приложения.','Экспорт содержит профиль, настройки, приставки и игры. Серверная авторизация и список друзей не экспортируются.');
  };

  function applyOwnedVisibility() {
    const owned = new Set(state.settings.ownedPlatforms || legacyOwned);
    document.querySelectorAll('.platform-card[data-platform]').forEach(el => el.hidden = !owned.has(el.dataset.platform));
    document.querySelectorAll('select option').forEach(opt => {
      if (PLATFORMS.some(p => p.id === opt.value)) { opt.hidden = !owned.has(opt.value); opt.disabled = !owned.has(opt.value); }
    });
  }
  const baseRender = render;
  render = function() { baseRender(); applyOwnedVisibility(); };

  window.mcSaveCoreSettings = async function(silent=false) {
    const endpoint=document.querySelector('#sheetEndpoint'), secret=document.querySelector('#syncSecret'), theme=document.querySelector('#themeMode'), auto=document.querySelector('#autoSync'), name=document.querySelector('#profileName');
    if (endpoint) state.settings.sheetEndpoint=endpoint.value.trim();
    if (secret) state.settings.syncSecret=secret.value;
    if (theme) state.settings.theme=theme.value;
    if (auto) state.settings.autoSync=auto.checked;
    if (name) state.settings.profileName=String(name.value||'').trim().slice(0,40)||'Игрок';
    const boxes=[...document.querySelectorAll('[data-owned-platform]')];
    if (boxes.length) state.settings.ownedPlatforms=boxes.filter(x=>x.checked).map(x=>x.dataset.ownedPlatform);
    document.querySelectorAll('[data-rotation-enabled]').forEach(x => x.dataset.rotationEnabled==='desktop' ? state.settings.rotationDesktopEnabled=x.checked : state.settings.rotationHandheldEnabled=x.checked);
    const hh=new Set(mcOwnedPlatforms('handheld')), desk=new Set(mcOwnedPlatforms('desktop'));
    state.settings.handheldRotation=(state.settings.handheldRotation||[]).filter(id=>hh.has(id));
    state.settings.desktopRotation=(state.settings.desktopRotation||[]).filter(id=>desk.has(id));
    state.settings.settingsUpdatedAt=nowIso();
    state.settings=migrateSettings(state.settings); applyTheme(); await persist();
    if (!silent) setToast('Настройки сохранены');
  };
  saveSettings = mcSaveCoreSettings;

  async function addRotation(group,id) {
    const key=group==='desktop'?'desktopRotation':'handheldRotation', arr=[...(state.settings[key]||[])];
    if (!arr.includes(id) && (state.settings.ownedPlatforms||[]).includes(id)) arr.push(id);
    state.settings[key]=arr; state.settings.settingsUpdatedAt=nowIso(); await persist(); render(); scheduleAutoSync();
  }
  async function removeRotation(group,id) {
    const key=group==='desktop'?'desktopRotation':'handheldRotation', arr=[...(state.settings[key]||[])];
    if (arr.length<=1) return;
    state.settings[key]=arr.filter(x=>x!==id);
    if (state.settings[currentSettingKey(group)]===id) state.settings[currentSettingKey(group)]=state.settings[key][0]||'';
    state.settings.settingsUpdatedAt=nowIso(); await persist(); render(); scheduleAutoSync();
  }

  syncableSettings = function() { return {
    theme:state.settings.theme, handheldRotation:[...(state.settings.handheldRotation||[])], desktopRotation:[...(state.settings.desktopRotation||[])],
    currentHandheld:state.settings.currentHandheld, currentDesktop:state.settings.currentDesktop, ownedPlatforms:[...(state.settings.ownedPlatforms||[])],
    rotationHandheldEnabled:state.settings.rotationHandheldEnabled!==false, rotationDesktopEnabled:state.settings.rotationDesktopEnabled!==false,
    settingsUpdatedAt:state.settings.settingsUpdatedAt||nowIso(),
  }; };
  mergeClientSettings = function(local,remote) {
    const l=migrateSettings(local||{}), r=migrateSettings(remote||{}), chosen=String(r.settingsUpdatedAt||'')>String(l.settingsUpdatedAt||'')?r:l;
    return migrateSettings({...chosen,sheetEndpoint:l.sheetEndpoint,syncSecret:l.syncSecret,autoSync:l.autoSync,lastSync:l.lastSync,lastLocalBackupAt:l.lastLocalBackupAt,coverResolverVersion:l.coverResolverVersion,syncSafetyVersion:1,userId:l.userId,authToken:l.authToken,profileName:l.profileName,profileUpdatedAt:l.profileUpdatedAt});
  };

  exportData = function() {
    const settings=clonePlain(state.settings); ['authToken','syncSecret','sheetEndpoint','lastSync'].forEach(k=>delete settings[k]);
    const payload={version:12,exportedAt:nowIso(),profile:{userId:state.settings.userId||'',displayName:state.settings.profileName||'Игрок'},settings,games:state.games,socialSnapshot:{friends:(state.social?.friends||[]).map(f=>({userId:f.userId,displayName:f.displayName}))}};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`memory-card-profile-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  importData = async function(e) {
    const file=e.target.files?.[0]; if(!file)return;
    try { const obj=JSON.parse(await file.text()); if(!Array.isArray(obj.games))throw new Error('Нет массива games');
      if(!confirm(`Импортировать профиль с ${obj.games.length} записями? Серверный ID и друзья останутся текущими.`))return;
      const identity={userId:state.settings.userId,authToken:state.settings.authToken,sheetEndpoint:state.settings.sheetEndpoint,syncSecret:state.settings.syncSecret,autoSync:state.settings.autoSync};
      const map=new Map(state.games.map(g=>[g.id,g])); obj.games.forEach(raw=>{const g=migrateGame(raw),old=map.get(g.id);if(!old||String(g.updatedAt||'')>String(old.updatedAt||''))map.set(g.id,g);}); state.games=[...map.values()];
      if(obj.settings)state.settings=migrateSettings({...state.settings,...obj.settings,...identity}); if(obj.profile?.displayName&&!obj.settings?.profileName)state.settings.profileName=String(obj.profile.displayName).slice(0,40);
      state.settings.settingsUpdatedAt=nowIso(); applyTheme(); await persist(); setToast('Профиль импортирован');
    } catch(err){alert(`Не удалось импортировать файл: ${err.message}`);} e.target.value='';
  };

  const baseSaveGame=saveGame;
  saveGame=async function(e){
    const old=state.modal?.game?.id?state.games.find(x=>x.id===state.modal.game.id):null,fd=e?.currentTarget?new FormData(e.currentTarget):null,status=String(fd?.get('status')||old?.status||''),group=old?platform(old.platform).group:'';
    const preserve=old?.status==='playing'&&status==='completed'&&group&&!mcRotationEnabled(group),before=preserve?state.settings[currentSettingKey(group)]:'';
    await baseSaveGame(e); if(preserve){state.settings[currentSettingKey(group)]=before;state.settings.settingsUpdatedAt=nowIso();await persist();render();}
  };

  const baseBind=bind;
  bind=function(){
    baseBind();
    document.querySelectorAll('[data-action="rotation-add"]').forEach(x=>x.onclick=()=>addRotation(x.dataset.group,x.dataset.id));
    document.querySelectorAll('[data-action="rotation-remove"]').forEach(x=>x.onclick=()=>removeRotation(x.dataset.group,x.dataset.id));
    document.querySelectorAll('[data-rotation-enabled]').forEach(x=>x.onchange=async()=>{x.dataset.rotationEnabled==='desktop'?state.settings.rotationDesktopEnabled=x.checked:state.settings.rotationHandheldEnabled=x.checked;state.settings.settingsUpdatedAt=nowIso();await persist();render();scheduleAutoSync();});
    document.querySelectorAll('[data-owned-platform]').forEach(x=>x.onchange=async()=>{const owned=new Set(state.settings.ownedPlatforms||[]);x.checked?owned.add(x.dataset.ownedPlatform):owned.delete(x.dataset.ownedPlatform);state.settings.ownedPlatforms=[...owned];const p=platform(x.dataset.ownedPlatform),key=p.group==='desktop'?'desktopRotation':'handheldRotation';if(!x.checked)state.settings[key]=(state.settings[key]||[]).filter(id=>id!==p.id);state.settings.settingsUpdatedAt=nowIso();state.settings=migrateSettings(state.settings);await persist();render();scheduleAutoSync();});
  };
})();
