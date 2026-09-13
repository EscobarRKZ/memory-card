/* Memory Card catalog refresh helper — v0.22
   Supports refreshing selected consoles or every known console catalog.
   Existing local catalog entries are never deleted when a remote source fails.
*/
(() => {
  const DB_NAME = 'memory-card-db';
  const STORE = 'state';
  const CATALOG_KEY = 'catalog-v1';
  const SQL_BASE = 'https://raw.githubusercontent.com/bocaletto-luca/Videogames-Database/main/';
  const SQL_FILES = {
    PSP:'psp.sql', VITA:'psv.sql', DSI:'ds.sql', '3DS':'3ds.sql', GBA:'gba.sql',
    PS1:'ps.sql', PS2:'ps2.sql', PS3:'ps3.sql', PS4:'ps4.sql',
    XBOX:'xb.sql', X360:'x360.sql', XONE:'xone.sql',
    WII:'wii.sql', WIIU:'wiiu.sql', GC:'gc.sql', DREAMCAST:'dc.sql', N64:'n64.sql',
    SNES:'snes.sql', NES:'nes.sql', GENESIS:'gen.sql',
  };
  const PLATFORM_NAMES = {
    PSP:'PSP', VITA:'PS Vita', DSI:'DS / DSi', '3DS':'3DS', GBA:'GBA',
    PS1:'PlayStation', PS2:'PlayStation 2', PS3:'PlayStation 3', PS4:'PlayStation 4', PS5:'PlayStation 5',
    XBOX:'Xbox', X360:'Xbox 360', XONE:'Xbox One', XSERIES:'Xbox Series X|S',
    WII:'Wii', WIIU:'Wii U', GC:'GameCube', DREAMCAST:'Dreamcast', N64:'Nintendo 64',
    SNES:'SNES', NES:'NES', GENESIS:'Mega Drive / Genesis', SWITCH:'Switch',
  };
  const FALLBACK_ORDER = ['PSP','VITA','DSI','3DS','GBA','PS3','WIIU','SWITCH'];
  const ALL_FALLBACK = ['PSP','VITA','DSI','3DS','GBA','PS1','PS2','PS3','PS4','PS5','XBOX','X360','XONE','XSERIES','WII','WIIU','GC','DREAMCAST','N64','SNES','NES','GENESIS','SWITCH'];
  let running = false;

  const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9а-яё]+/gi,' ').replace(/\s+/g,' ').trim();
  const keyOf = entry => `${entry.platform}|${normalize(entry.title)}`;

  function selectedPlatforms() {
    try {
      if (typeof mcOwnedPlatforms === 'function') {
        const ids = mcOwnedPlatforms();
        if (Array.isArray(ids) && ids.length) return [...new Set(ids)];
      }
      if (typeof state !== 'undefined' && Array.isArray(state?.settings?.ownedPlatforms) && state.settings.ownedPlatforms.length) return [...new Set(state.settings.ownedPlatforms)];
    } catch (_) {}
    return [...FALLBACK_ORDER];
  }

  function allPlatforms() {
    try {
      if (typeof PLATFORMS !== 'undefined' && Array.isArray(PLATFORMS) && PLATFORMS.length) return [...new Set(PLATFORMS.map(p => p.id).filter(Boolean))];
    } catch (_) {}
    return [...ALL_FALLBACK];
  }

  function hasSource(platform) { return platform === 'SWITCH' || !!SQL_FILES[platform]; }

  function openDb() {
    return new Promise((resolve,reject) => {
      const req = indexedDB.open(DB_NAME,1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB недоступен'));
    });
  }
  async function readCatalog() {
    const db = await openDb();
    try { return await new Promise(resolve => { const tx=db.transaction(STORE,'readonly'), req=tx.objectStore(STORE).get(CATALOG_KEY); req.onsuccess=()=>resolve(req.result||{catalog:[],catalogMeta:{}}); req.onerror=()=>resolve({catalog:[],catalogMeta:{}}); }); }
    finally { db.close(); }
  }
  async function writeCatalog(value) {
    const db = await openDb();
    try { await new Promise((resolve,reject) => { const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(value,CATALOG_KEY); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error||new Error('Не удалось сохранить каталог')); tx.onabort=()=>reject(tx.error||new Error('Сохранение каталога прервано')); }); }
    finally { db.close(); }
  }
  async function fetchText(url,timeoutMs=10000) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeoutMs);
    try { const response=await fetch(url,{cache:'no-store',signal:controller.signal}); if(!response.ok) throw new Error(`HTTP ${response.status}`); return await response.text(); }
    finally { clearTimeout(timer); }
  }
  function unescapeSql(value='') { return String(value).replace(/\\'/g,"'").replace(/\\"/g,'"').replace(/\\\\/g,'\\'); }
  function parseSql(platform,text) {
    const out=[];
    const row=/\(\s*\d+\s*,\s*'((?:\\.|[^'])*)'\s*,\s*(?:'((?:\\.|[^'])*)'|NULL)\s*,\s*(?:'((?:\\.|[^'])*)'|NULL)\s*,\s*(NULL|\d+)\s*,\s*(?:'((?:\\.|[^'])*)'|NULL)\s*\)/g;
    let match;
    while((match=row.exec(text))){
      const title=unescapeSql(match[1]).trim(); if(!title) continue;
      out.push({key:`stable-${platform}-${normalize(title)}`,platform,title,releaseYear:match[4]==='NULL'?'':String(match[4]||''),genre:unescapeSql(match[2]||'').trim(),franchise:'',coverUrl:'',source:'Videogames-Database'});
    }
    if(!out.length) throw new Error('Не удалось разобрать SQL-каталог');
    return out;
  }
  async function fetchSql(platform){ const file=SQL_FILES[platform]; if(!file)return[]; return parseSql(platform,await fetchText(`${SQL_BASE}${file}`,12000)); }
  async function fetchSwitch(){
    const direct='https://www.gametdb.com/switchtdb.txt?LANG=EN', urls=[direct,`https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`];
    let text='',lastError=null;
    for(const url of urls){try{text=await fetchText(url,7000);if(text.includes(' = '))break;}catch(error){lastError=error;}}
    if(!text.includes(' = '))throw lastError||new Error('GameTDB недоступен');
    const out=[]; for(const line of text.split(/\r?\n/)){const pos=line.indexOf(' = ');if(pos<=0)continue;const title=line.slice(pos+3).trim();if(title)out.push({key:`stable-SWITCH-${normalize(title)}`,platform:'SWITCH',title,releaseYear:'',genre:'',franchise:'',coverUrl:'',source:'GameTDB'});}
    if(!out.length)throw new Error('Пустой Switch-каталог'); return out;
  }
  function mergePlatform(existing,incoming,platform){
    const map=new Map(); for(const item of existing.filter(x=>x?.platform===platform))map.set(keyOf(item),{...item});
    for(const item of incoming){const key=keyOf(item),old=map.get(key)||{};map.set(key,{...old,...item,releaseYear:item.releaseYear||old.releaseYear||'',genre:item.genre||old.genre||'',franchise:old.franchise||item.franchise||'',coverUrl:old.coverUrl||item.coverUrl||'',key:old.key||item.key});}
    return [...map.values()];
  }
  function ensureProgress(){let el=document.querySelector('#stableCatalogProgress');if(el)return el;el=document.createElement('div');el.id='stableCatalogProgress';el.className='task-progress visible';el.innerHTML='<div class="task-progress-head"><span>Обновляю каталог</span><b>0%</b></div><div class="task-progress-track"><i></i></div><div class="task-progress-detail">Подготовка…</div>';document.body.appendChild(el);return el;}
  function progress(done,total,detail,error=false){const el=ensureProgress(),pct=Math.round((Math.max(0,done)/Math.max(1,total))*100);el.classList.toggle('error',error);el.querySelector('.task-progress-head b').textContent=`${pct}%`;el.querySelector('.task-progress-track i').style.width=`${pct}%`;el.querySelector('.task-progress-detail').textContent=detail||'';}
  function finish(message,error=false){const el=ensureProgress();el.classList.toggle('error',error);el.querySelector('.task-progress-head span').textContent=error?'Каталог не обновлён':'Каталог обновлён';el.querySelector('.task-progress-head b').textContent=error?'Ошибка':'100%';el.querySelector('.task-progress-track i').style.width='100%';el.querySelector('.task-progress-detail').textContent=message;if(error)setTimeout(()=>el.remove(),6500);}

  async function refreshStableCatalog(mode='selected') {
    if(running)return;
    running=true;
    const targets=mode==='all'?allPlatforms():selectedPlatforms();
    const failures=[],unsupported=[];let successes=0;
    try{
      const stored=await readCatalog();let catalog=Array.isArray(stored.catalog)?stored.catalog:[];const meta=stored.catalogMeta&&typeof stored.catalogMeta==='object'?{...stored.catalogMeta}:{};
      if(!targets.length){finish(mode==='all'?'Список платформ пуст':'Сначала выбери приставки в настройках',true);return;}
      for(let i=0;i<targets.length;i++){
        const platform=targets[i],name=PLATFORM_NAMES[platform]||platform;
        progress(i,targets.length,`${name} · ${i+1} из ${targets.length}`);
        if(!hasSource(platform)){unsupported.push(name);progress(i+1,targets.length,`${name} · источник пока не подключён`);continue;}
        try{
          const incoming=platform==='SWITCH'?await fetchSwitch():await fetchSql(platform),mergedPlatform=mergePlatform(catalog,incoming,platform);
          catalog=catalog.filter(x=>x?.platform!==platform).concat(mergedPlatform);
          meta[platform]={updatedAt:new Date().toISOString(),count:mergedPlatform.length,source:platform==='SWITCH'?'GameTDB':'Videogames-Database'};successes++;
        }catch(error){console.warn(`Stable catalog refresh ${platform}:`,error);failures.push(`${name}: ${error?.message||'ошибка'}`);}
        progress(i+1,targets.length,`${name} · готово`);await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(!successes&&failures.length){finish(failures[0]||'Источники каталога временно недоступны',true);return;}
      await writeCatalog({catalog,catalogMeta:meta});
      const details=[`${successes} из ${targets.length} платформ обновлено`];if(unsupported.length)details.push(`без источника: ${unsupported.join(', ')}`);if(failures.length)details.push(`ошибка: ${failures.map(x=>x.split(':')[0]).join(', ')}`);finish(details.join(' · '));
      try{sessionStorage.setItem('memory-card-catalog-refresh-result',`${successes}/${targets.length}|${mode}`);}catch(_){}
      setTimeout(()=>location.reload(),900);
    }catch(error){console.error('Stable catalog refresh:',error);finish(error?.message||'Неизвестная ошибка',true);}
    finally{running=false;}
  }

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target.closest('[data-action="catalog-refresh-all"],[data-action="catalog-refresh-everything"]'):null;
    if(!target)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    refreshStableCatalog(target.dataset.action==='catalog-refresh-everything'?'all':'selected');
  },true);

  window.addEventListener('load',()=>{
    try{
      const result=sessionStorage.getItem('memory-card-catalog-refresh-result');if(!result)return;sessionStorage.removeItem('memory-card-catalog-refresh-result');
      const [count,mode]=result.split('|');setTimeout(()=>{const toast=document.createElement('div');toast.className='toast';toast.textContent=mode==='all'?`Каталоги обновлены: ${count} всех платформ`:`Каталог обновлён: ${count} выбранных платформ`;document.body.appendChild(toast);setTimeout(()=>toast.remove(),2800);},350);
    }catch(_){}
  });
})();
