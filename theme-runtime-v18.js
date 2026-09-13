/* Memory Card v0.17.2 — atomic theme runtime
 * Loaded after v16 and before v17. It owns theme interaction and a separate
 * data-mc-theme-runtime attribute that older enhancers never overwrite.
 */
(() => {
  const THEMES=['memory','ps2','gameboy','dreamcast','xbox','famicom','vita','oled','sunset','arcade','glacier','mono','ps1','psp','ps3','switch','gamecube','wii','n64','snes','genesis','x360','dsi','3ds'];
  const VALID=new Set(THEMES);

  function current(){
    const id=String(state?.settings?.accentTheme||'memory');
    return VALID.has(id)?id:'memory';
  }

  function updateControls(id){
    const select=document.querySelector('#accentTheme');
    if(select&&select.value!==id&&[...select.options].some(o=>o.value===id))select.value=id;
    document.querySelectorAll('[data-v16-accent]').forEach(btn=>btn.classList.toggle('active',btn.dataset.v16Accent===id));
  }

  function apply(id=current()){
    if(!VALID.has(id))id='memory';
    const root=document.documentElement;
    root.dataset.mcThemeRuntime=id;
    // Keep the legacy attribute aligned where possible. Old v16 may still
    // rewrite this one, but visual CSS no longer depends on it.
    root.dataset.mcAccent=id;
    root.classList.toggle('mc-oled-accent',id==='oled');
    updateControls(id);
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta){
      const primary=getComputedStyle(root).getPropertyValue('--mc-t1').trim();
      if(primary)meta.setAttribute('content',primary);
    }
  }

  function save(id){
    if(!VALID.has(id))return;
    state.settings.accentTheme=id;
    state.settings.settingsUpdatedAt=nowIso();
    apply(id); // synchronous: every visible screen changes before storage/sync.
    Promise.resolve(persist()).then(()=>scheduleAutoSync()).catch(err=>console.warn('Theme persist failed',err));
  }

  // Apply the active palette after every app render without requiring a DOM observer.
  const baseRender=render;
  render=function(){
    baseRender();
    apply(current());
  };

  // Own clicks before v17's capture handler and v16's bubble handler can race.
  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('[data-v16-accent]'):null;
    if(!button)return;
    const id=button.dataset.v16Accent;
    if(!VALID.has(id))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    save(id);
  },true);

  // The select is a compatibility control; make it instant as well.
  document.addEventListener('change',event=>{
    const select=event.target;
    if(!(select instanceof HTMLSelectElement)||select.id!=='accentTheme')return;
    if(!VALID.has(select.value))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    save(select.value);
  },true);

  // Sync/import may change settings without a click. The next render normally
  // handles this; these lifecycle hooks cover restored pages as well.
  window.addEventListener('pageshow',()=>apply(current()));
  window.addEventListener('focus',()=>apply(current()));
  queueMicrotask(()=>apply(current()));

  window.MemoryCardThemes={themes:[...THEMES],apply,save};
})();
