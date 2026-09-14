(()=>{
  const ADD_KEY='memory-card-backlog-add-platform-v23';
  const FILTER_KEY='memory-card-backlog-filter-platform-v23';
  const baseView=renderView;
  let addPlatform='';
  let filterPlatform='';
  let searchQuery='';
  let draftTitle='';

  const norm=value=>String(value||'').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9а-яё]+/gi,' ').replace(/\s+/g,' ').trim();

  function owned(){return [...new Set((mcOwnedPlatforms?.()||[]).map(String).filter(Boolean))];}
  function allBacklog(){return (state.games||[]).filter(g=>g&&!g.deletedAt&&g.status==='backlog').map(migrateGame);}
  function ensureSelection(){
    const ids=owned();
    const storedAdd=localStorage.getItem(ADD_KEY)||'';
    const storedFilter=localStorage.getItem(FILTER_KEY)||'';
    if(!ids.includes(addPlatform)) addPlatform=ids.includes(storedAdd)?storedAdd:(ids[0]||'');
    if(!filterPlatform) filterPlatform=storedFilter==='ALL'||ids.includes(storedFilter)?storedFilter:(addPlatform||'ALL');
    if(filterPlatform!=='ALL'&&!ids.includes(filterPlatform)) filterPlatform=addPlatform||'ALL';
    if(addPlatform) localStorage.setItem(ADD_KEY,addPlatform);
    localStorage.setItem(FILTER_KEY,filterPlatform||'ALL');
    return ids;
  }
  function countFor(pid){return pid==='ALL'?allBacklog().length:allBacklog().filter(g=>g.platform===pid).length;}
  function matchesSearch(g){
    const q=norm(searchQuery);
    if(!q)return true;
    return norm([g.title,g.genre,g.franchise,g.notes,platform(g.platform).name,platform(g.platform).abbr].filter(Boolean).join(' ')).includes(q);
  }
  function visibleGames(){
    return allBacklog().filter(g=>(filterPlatform==='ALL'||g.platform===filterPlatform)&&matchesSearch(g));
  }
  function platformIconSafe(id){try{return typeof platformIcon==='function'?platformIcon(id):'';}catch(_){return '';}}
  function exactCatalogMatch(pid,title){
    const wanted=norm(title);
    if(!wanted||!pid)return null;
    try{return (catalogSearch(pid,title)||[]).find(x=>norm(x.title)===wanted)||null;}catch(_){return null;}
  }
  function platformPicker(ids){
    return `<div class="v23-platform-grid">${ids.map(id=>`<button type="button" class="v23-platform-button ${id===addPlatform?'active':''}" data-v23-add-platform="${esc(id)}" aria-pressed="${id===addPlatform?'true':'false'}">${platformIconSafe(id)}<span><b>${esc(platform(id).abbr)}</b><small>${esc(platform(id).name)}</small></span></button>`).join('')}</div>`;
  }
  function filterBar(ids){
    return `<div class="v23-filter-row"><button type="button" class="v23-filter-chip ${filterPlatform==='ALL'?'active':''}" data-v23-filter="ALL">Все платформы <span>${countFor('ALL')}</span></button>${ids.map(id=>`<button type="button" class="v23-filter-chip ${filterPlatform===id?'active':''}" data-v23-filter="${esc(id)}">${esc(platform(id).abbr)} <span>${countFor(id)}</span></button>`).join('')}</div>`;
  }
  function cardMarkup(g){
    const meta=[g.releaseYear,g.genre,g.franchise].filter(Boolean).map(esc).join(' · ');
    return `<article class="v16-backlog-card v23-backlog-card" data-v23-backlog-card="${esc(g.id)}">${coverMarkup(g,'v16-backlog-cover')}<div class="v23-backlog-card-copy"><div class="v23-card-top"><span class="v16-platform-pill">${esc(platform(g.platform).abbr)}</span>${g.releaseYear?`<span class="v23-year">${esc(g.releaseYear)}</span>`:''}</div><h3>${esc(g.title)}</h3>${meta?`<p class="v23-card-meta">${meta}</p>`:(g.notes?`<p class="v23-card-meta">${esc(g.notes)}</p>`:'')}<div class="v16-card-actions v23-card-actions"><button class="primary compact" data-v16-backlog-start="${esc(g.id)}">Начинаю проходить</button><button class="ghost compact" data-v16-backlog-remove="${esc(g.id)}">Удалить</button></div></div></article>`;
  }
  function resultsMarkup(){
    const games=visibleGames();
    if(!games.length){
      const text=searchQuery?'Ничего не найдено по этому запросу.':(filterPlatform==='ALL'?'Backlog пуст. Добавь сюда игры, которые хочешь когда-нибудь начать.':`На ${esc(platform(filterPlatform).abbr)} пока ничего нет.`);
      return `<div class="empty v23-backlog-empty">${text}</div>`;
    }
    return `<div class="v16-backlog-grid v23-backlog-grid">${games.map(cardMarkup).join('')}</div>`;
  }
  function countText(){
    const shown=visibleGames().length,total=allBacklog().length;
    if(filterPlatform==='ALL'&&!searchQuery)return `${total} ${total===1?'игра':'игр'}`;
    return `Показано ${shown} из ${total}`;
  }
  function suggestionsMarkup(){
    if(!draftTitle.trim()||!addPlatform)return '';
    let items=[];
    try{items=(catalogSearch(addPlatform,draftTitle)||[]).slice(0,8);}catch(_){items=[];}
    if(!items.length)return '';
    return `<div class="v23-suggestions" data-v23-suggestions>${items.map(item=>`<button type="button" data-v23-suggestion data-title="${esc(item.title)}"><b>${esc(item.title)}</b><span>${esc(item.releaseYear||'Год не указан')} · ${esc(platform(addPlatform).abbr)}${item.genre?` · ${esc(item.genre)}`:''}</span></button>`).join('')}</div>`;
  }
  function renderBacklogV23(){
    const ids=ensureSelection();
    return `<div class="section-head v23-backlog-title"><div><h2>Backlog</h2><p>Игры на потом. Выбери платформу и просто введи название — остальные данные Memory Card подтянет сам, если найдёт игру в каталоге.</p></div></div>
      <section class="panel v23-backlog-add">
        <div class="v23-panel-head"><div><span class="v23-kicker">Новая игра</span><h3>Добавить в Backlog</h3><p>Платформа останется выбранной и после добавления следующей игры.</p></div></div>
        <div class="v23-platform-label">Платформа</div>
        ${ids.length?platformPicker(ids):'<div class="empty">Сначала выбери свои платформы в настройках.</div>'}
        <form id="v23BacklogForm" class="v23-backlog-form" autocomplete="off">
          <div class="v23-title-field"><input name="title" maxlength="160" required placeholder="Название игры" value="${esc(draftTitle)}" data-v23-title>${suggestionsMarkup()}</div>
          <button class="primary v23-add-button" type="submit" ${addPlatform?'':'disabled'}>+ В Backlog</button>
        </form>
      </section>
      <section class="panel v23-backlog-list">
        <div class="v23-queue-head"><div><span class="v23-kicker">Очередь</span><h3>Хочу пройти</h3><p data-v23-count>${countText()}</p></div><label class="v23-search"><span>⌕</span><input type="search" value="${esc(searchQuery)}" placeholder="Поиск в Backlog" data-v23-search></label></div>
        <div class="v23-filter-label">Показывать</div>
        ${filterBar(ids)}
        <div data-v23-results>${resultsMarkup()}</div>
      </section>`;
  }

  renderView=function(){
    if(state.view==='backlog')return renderBacklogV23();
    return baseView();
  };

  function refreshQueue(){
    const count=document.querySelector('[data-v23-count]');
    const results=document.querySelector('[data-v23-results]');
    if(count)count.textContent=countText();
    if(results)results.innerHTML=resultsMarkup();
    document.querySelectorAll('[data-v23-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.v23Filter===filterPlatform));
  }
  function refreshPicker(){
    document.querySelectorAll('[data-v23-add-platform]').forEach(btn=>{
      const active=btn.dataset.v23AddPlatform===addPlatform;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',active?'true':'false');
    });
  }
  function refreshSuggestions(){
    const field=document.querySelector('.v23-title-field');
    if(!field)return;
    field.querySelector('[data-v23-suggestions]')?.remove();
    const html=suggestionsMarkup();
    if(html)field.insertAdjacentHTML('beforeend',html);
  }

  async function saveBacklog(form){
    const title=String(form?.querySelector('[data-v23-title]')?.value||'').trim();
    if(!title||!addPlatform)return;
    const match=exactCatalogMatch(addPlatform,title);
    const now=nowIso();
    const g=migrateGame({
      id:crypto.randomUUID?crypto.randomUUID():`b-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title:match?.title||title,
      platform:addPlatform,
      status:'backlog',
      releaseYear:String(match?.releaseYear||''),
      genre:String(match?.genre||''),
      franchise:String(match?.franchise||''),
      notes:'',rating:'',replay:0,
      coverUrl:String(match?.coverUrl||''),
      coverSource:String(match?.coverSource||''),
      addedAt:now,updatedAt:now
    });
    state.games.push(g);
    draftTitle='';
    filterPlatform=addPlatform;
    localStorage.setItem(ADD_KEY,addPlatform);
    localStorage.setItem(FILTER_KEY,filterPlatform);
    await persist();
    scheduleAutoSync();
    render();
    setToast(`Добавлено в Backlog · ${platform(addPlatform).abbr}`);
    if(!g.coverUrl){
      try{
        const c=await fetchCoverForGame(g.title,g.releaseYear,g.platform);
        if(c?.url){g.coverUrl=c.url;g.coverSource=c.source||'';g.updatedAt=nowIso();await persist();scheduleAutoSync();render();}
      }catch(_){}
    }
  }

  document.addEventListener('input',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    if(target.matches('[data-v23-title]')){draftTitle=target.value;refreshSuggestions();return;}
    if(target.matches('[data-v23-search]')){searchQuery=target.value;refreshQueue();}
  });

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const add=target.closest('[data-v23-add-platform]');
    if(add){
      addPlatform=String(add.dataset.v23AddPlatform||'');
      filterPlatform=addPlatform;
      localStorage.setItem(ADD_KEY,addPlatform);
      localStorage.setItem(FILTER_KEY,filterPlatform);
      refreshPicker();refreshQueue();refreshSuggestions();
      return;
    }
    const filter=target.closest('[data-v23-filter]');
    if(filter){
      filterPlatform=String(filter.dataset.v23Filter||'ALL');
      if(filterPlatform!=='ALL'){
        addPlatform=filterPlatform;
        localStorage.setItem(ADD_KEY,addPlatform);
        refreshPicker();refreshSuggestions();
      }
      localStorage.setItem(FILTER_KEY,filterPlatform);
      refreshQueue();
      return;
    }
    const suggestion=target.closest('[data-v23-suggestion]');
    if(suggestion){
      draftTitle=String(suggestion.dataset.title||'');
      const input=document.querySelector('[data-v23-title]');
      if(input){input.value=draftTitle;input.focus();input.setSelectionRange?.(draftTitle.length,draftTitle.length);}
      document.querySelector('[data-v23-suggestions]')?.remove();
    }
  });

  document.addEventListener('submit',event=>{
    if(event.target?.id!=='v23BacklogForm')return;
    event.preventDefault();
    saveBacklog(event.target);
  });
})();
