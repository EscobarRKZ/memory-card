(() => {
  const KEY='memory-card-theme-v3';
  const LEGACY_KEY='memory-card-theme-v2';
  const THEMES=['memory','ps2','gameboy','dreamcast','xbox','famicom','vita','oled','sunset','arcade','glacier','mono','ps1','psp','ps3','switch','gamecube','wii','n64','snes','genesis','x360','dsi','3ds'];
  const VALID=new Set(THEMES);

  function stored(){
    try{
      const current=localStorage.getItem(KEY);
      if(VALID.has(current)) return current;
      const legacy=localStorage.getItem(LEGACY_KEY);
      if(VALID.has(legacy)) return legacy;
    }catch(_){}
    return '';
  }

  function resolve(fallback='memory'){
    const local=stored();
    if(local) return local;
    return VALID.has(String(fallback||''))?String(fallback):'memory';
  }

  function remember(id){
    if(!VALID.has(id)) return;
    try{
      localStorage.setItem(KEY,id);
      localStorage.removeItem(LEGACY_KEY);
    }catch(_){}
  }

  function updateControls(id){
    const select=document.querySelector('#accentTheme');
    if(select&&select.value!==id&&[...select.options].some(o=>o.value===id)) select.value=id;
    document.querySelectorAll('[data-v16-accent]').forEach(button=>button.classList.toggle('active',button.dataset.v16Accent===id));
  }

  function apply(id=resolve(state?.settings?.accentTheme)){
    if(!VALID.has(id)) id='memory';
    const root=document.documentElement;
    root.dataset.mcThemeRuntime=id;
    root.dataset.mcAccent=id;
    root.classList.toggle('mc-oled-accent',id==='oled');
    updateControls(id);
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta){
      const value=getComputedStyle(root).getPropertyValue('--mc-t1').trim();
      if(value) meta.setAttribute('content',value);
    }
    return id;
  }

  function selectTheme(id,{persistState=true}={}){
    if(!VALID.has(id)) return;
    remember(id);
    if(state?.settings) state.settings.accentTheme=id;
    apply(id);
    if(persistState&&typeof persist==='function') Promise.resolve(persist()).catch(()=>{});
  }

  const baseMigrate=migrateSettings;
  migrateSettings=function(raw={}){
    const out=baseMigrate(raw);
    const local=stored();
    const candidate=local||resolve(raw?.accentTheme||out?.accentTheme||'memory');
    out.accentTheme=candidate;
    if(!local&&VALID.has(String(raw?.accentTheme||''))) remember(candidate);
    return out;
  };

  const baseMerge=mergeClientSettings;
  mergeClientSettings=function(local,remote){
    const out=baseMerge(local,remote);
    out.accentTheme=resolve(local?.accentTheme||out?.accentTheme||'memory');
    return out;
  };

  const baseSyncable=syncableSettings;
  syncableSettings=function(){
    const out={...baseSyncable()};
    delete out.accentTheme;
    return out;
  };

  const baseRender=render;
  render=function(){
    const id=resolve(state?.settings?.accentTheme);
    if(state?.settings) state.settings.accentTheme=id;
    apply(id);
    baseRender();
    apply(id);
  };

  const baseSaveSettings=saveSettings;
  saveSettings=async function(silent=false){
    const selected=document.querySelector('#accentTheme')?.value;
    const id=VALID.has(selected)?selected:resolve(state?.settings?.accentTheme);
    if(state?.settings) state.settings.accentTheme=id;
    apply(id);
    await baseSaveSettings(silent);
    if(state?.settings) state.settings.accentTheme=id;
    remember(id);
    apply(id);
    if(typeof persist==='function') await persist();
  };

  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('[data-v16-accent]'):null;
    if(!button) return;
    const id=button.dataset.v16Accent||'';
    if(!VALID.has(id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectTheme(id);
  },true);

  document.addEventListener('change',event=>{
    const select=event.target;
    if(!(select instanceof HTMLSelectElement)||select.id!=='accentTheme'||!VALID.has(select.value)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectTheme(select.value);
  },true);

  window.addEventListener('storage',event=>{
    if(event.key===KEY||event.key===LEGACY_KEY){
      const id=resolve(state?.settings?.accentTheme);
      if(state?.settings) state.settings.accentTheme=id;
      apply(id);
    }
  });
  window.addEventListener('pageshow',()=>apply(resolve(state?.settings?.accentTheme)));
  window.addEventListener('focus',()=>apply(resolve(state?.settings?.accentTheme)));

  const initial=resolve(state?.settings?.accentTheme);
  if(state?.settings) state.settings.accentTheme=initial;
  apply(initial);
  window.MemoryCardThemes={themes:[...THEMES],apply,save:id=>selectTheme(id),current:()=>resolve(state?.settings?.accentTheme)};
})();
