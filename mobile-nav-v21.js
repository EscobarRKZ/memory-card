(()=>{
  const mq=window.matchMedia('(max-width: 900px)');
  const baseNav=navButtons;
  const baseView=renderView;
  const icon={
    home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2h-5.1v-6.2H9.3V21H4.2A1.2 1.2 0 0 1 3 19.8z"/></svg>',
    playing:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>',
    games:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 6.5h13.6A2.2 2.2 0 0 1 21 8.7v6.6a2.2 2.2 0 0 1-2.2 2.2h-2.3l-2.1-2.2H9.6l-2.1 2.2H5.2A2.2 2.2 0 0 1 3 15.3V8.7a2.2 2.2 0 0 1 2.2-2.2Zm2.3 2.3v2.1H5.4v1.8h2.1v2.1h1.8v-2.1h2.1v-1.8H9.3V8.8Zm8.4 1.1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm2.5 2.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg>',
    stats:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10h3v10H4Zm6.5 0V4h3v16h-3Zm6.5 0v-7h3v7h-3Z"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
  };
  const gameViews=new Set(['games','backlog','collections','gameDetail']);
  const statViews=new Set(['stats','timeline','franchise']);
  const moreViews=new Set(['achievements','friends','settings']);
  const item=(view,label,key,active,badge='')=>`<button data-nav="${view}" class="mc-mobile-nav-item ${active?'active':''}" aria-label="${label}"><span class="mc-mobile-nav-icon">${icon[key]}</span><span class="mc-mobile-nav-label">${label}</span>${badge}</button>`;
  navButtons=function(){
    if(!mq.matches)return baseNav();
    const v=state.view;
    const incoming=Number(state.social?.incoming?.length||0);
    return [
      item('home','Главная','home',v==='home'),
      item('playing','Сейчас','playing',v==='playing'),
      item('games','Игры','games',gameViews.has(v)),
      item('stats','Статистика','stats',statViews.has(v)),
      `<button type="button" data-mobile-more class="mc-mobile-nav-item ${moreViews.has(v)?'active':''}" aria-label="Ещё"><span class="mc-mobile-nav-icon">${icon.more}</span><span class="mc-mobile-nav-label">Ещё</span>${incoming?`<span class="mc-mobile-more-badge">${incoming>9?'9+':incoming}</span>`:''}</button>`
    ].join('');
  };
  const tabs=(items)=>`<div class="mc-mobile-subnav">${items.map(([v,label])=>`<button data-nav="${v}" class="${state.view===v?'active':''}">${label}</button>`).join('')}</div>`;
  renderView=function(){
    const html=baseView();
    if(!mq.matches)return html;
    if(['games','backlog','collections'].includes(state.view))return tabs([['games','Все игры'],['backlog','Backlog'],['collections','Коллекции']])+html;
    if(['stats','timeline'].includes(state.view))return tabs([['stats','Обзор'],['timeline','История']])+html;
    return html;
  };
  function sheet(){
    let el=document.querySelector('.mc-more-sheet');
    if(el)return el;
    el=document.createElement('div');
    el.className='mc-more-sheet';
    el.hidden=true;
    document.body.appendChild(el);
    return el;
  }
  function closeSheet(){const el=document.querySelector('.mc-more-sheet');if(el){el.classList.remove('open');setTimeout(()=>{if(!el.classList.contains('open'))el.hidden=true;},180);}document.body.classList.remove('mc-more-open');}
  function openSheet(){
    const el=sheet();
    const incoming=Number(state.social?.incoming?.length||0);
    const name=String(state.settings?.profileName||'Игрок');
    const id=String(state.settings?.userId||'');
    el.innerHTML=`<div class="mc-more-backdrop" data-mobile-more-close></div><section class="mc-more-panel" role="dialog" aria-modal="true" aria-label="Дополнительные разделы"><div class="mc-more-handle"></div><div class="mc-more-head"><div><span>Memory Card</span><h3>Ещё</h3></div><button type="button" data-mobile-more-close aria-label="Закрыть">×</button></div><div class="mc-more-list"><button type="button" data-mobile-more-nav="achievements"><span class="mc-more-emoji">🏆</span><span><b>Достижения</b><small>Прогресс и открытые награды</small></span><i>›</i></button><button type="button" data-mobile-more-nav="friends"><span class="mc-more-emoji">👥</span><span><b>Друзья</b><small>Профили и игровые библиотеки</small></span>${incoming?`<em>${incoming}</em>`:'<i>›</i>'}</button><button type="button" data-mobile-more-nav="settings"><span class="mc-more-emoji">⚙️</span><span><b>Настройки</b><small>Профиль, консоли и приложение</small></span><i>›</i></button></div><div class="mc-more-account"><b>${esc(name)}</b>${id?`<span>${esc(id)}</span>`:''}</div></section>`;
    el.hidden=false;
    document.body.classList.add('mc-more-open');
    requestAnimationFrame(()=>el.classList.add('open'));
  }
  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;
    if(!target)return;
    if(target.closest('[data-mobile-more]')){e.preventDefault();openSheet();return;}
    if(target.closest('[data-mobile-more-close]')){e.preventDefault();closeSheet();return;}
    const nav=target.closest('[data-mobile-more-nav]');
    if(nav){e.preventDefault();const view=nav.dataset.mobileMoreNav;closeSheet();setTimeout(()=>navigate(view),80);}
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
  mq.addEventListener?.('change',()=>{closeSheet();render();});
})();
