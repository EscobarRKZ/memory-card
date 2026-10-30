/* v77: a quiet, keyboard-friendly More sheet; native dialog protects the page behind it. */
(()=>{
  'use strict';
  const mq=window.matchMedia('(max-width: 900px)');
  const baseNav=navButtons;
  const baseView=renderView;
  const icon={
    home:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2h-5.1v-6.2H9.3V21H4.2A1.2 1.2 0 0 1 3 19.8z"/></svg>',
    playing:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10-6.5z"/></svg>',
    games:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5.2 6.5h13.6A2.2 2.2 0 0 1 21 8.7v6.6a2.2 2.2 0 0 1-2.2 2.2h-2.3l-2.1-2.2H9.6l-2.1 2.2H5.2A2.2 2.2 0 0 1 3 15.3V8.7a2.2 2.2 0 0 1 2.2-2.2Zm2.3 2.3v2.1H5.4v1.8h2.1v2.1h1.8v-2.1h2.1v-1.8H9.3V8.8Zm8.4 1.1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm2.5 2.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg>',
    stats:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20V10h3v10H4Zm6.5 0V4h3v16h-3Zm6.5 0v-7h3v7h-3Z"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
  };
  const tr=(ru,en)=>state.settings?.language==='en'?en:ru;
  const gameViews=new Set(['games','backlog','collections','gameDetail']);
  const statViews=new Set(['stats','timeline','franchise']);
  const moreViews=new Set(['achievements','friends','settings']);
  const paths={
    achievements:'<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 14v5m-4 2h8m-7-2h6"/>',
    friends:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m3 9v-2a6 6 0 0 0-3-5"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6m-6 0v6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    arrow:'<path d="m9 5 7 7-7 7"/>',
    check:'<path d="m5 12 4 4L19 6"/>'
  };
  const lineIcon=key=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key]}</svg>`;
  const incomingCount=()=>Math.max(0,Number(state.social?.incoming?.length)||0);
  const requestLabel=n=>tr(`Входящие заявки в друзья: ${n}`,`Incoming friend requests: ${n}`);
  const item=(view,label,key,active)=>`<button type="button" data-nav="${view}" class="mc-mobile-nav-item ${active?'active':''}" ${active?'aria-current="page"':''} aria-label="${label}"><span class="mc-mobile-nav-icon">${icon[key]}</span><span class="mc-mobile-nav-label">${label}</span></button>`;
  navButtons=function(){
    if(!mq.matches)return baseNav();
    const v=state.view,n=incomingCount(),more=tr('Ещё','More');
    return [
      item('home',tr('Главная','Home'),'home',v==='home'),
      item('playing',tr('Сейчас','Playing'),'playing',v==='playing'),
      item('games',tr('Игры','Games'),'games',gameViews.has(v)),
      item('stats',tr('Статистика','Stats'),'stats',statViews.has(v)),
      `<button type="button" data-mobile-more class="mc-mobile-nav-item ${moreViews.has(v)?'active':''}" aria-haspopup="dialog" aria-controls="mc-more-sheet" aria-expanded="${!!document.querySelector('#mc-more-sheet[open]')}" ${moreViews.has(v)?'aria-current="page"':''} aria-label="${more}${n?'. '+requestLabel(n):''}"><span class="mc-mobile-nav-icon">${icon.more}</span><span class="mc-mobile-nav-label">${more}</span>${n?`<span class="mc-mobile-more-badge" aria-hidden="true">${n>9?'9+':n}</span>`:''}</button>`
    ].join('');
  };
  const tabs=items=>`<nav class="mc-mobile-subnav" aria-label="${tr('Разделы','Sections')}">${items.map(([v,label])=>`<button type="button" data-nav="${v}" class="${state.view===v?'active':''}" ${state.view===v?'aria-current="page"':''}>${label}</button>`).join('')}</nav>`;
  let returnFocus=null,openedView='',openedOwner='';
  const owner=()=>String(state.settings?.userId||'');
  const expanded=value=>document.querySelectorAll('[data-mobile-more]').forEach(b=>b.setAttribute('aria-expanded',String(value)));
  renderView=function(){
    const dialog=document.querySelector('#mc-more-sheet');
    if(dialog?.open&&(openedView!==state.view||openedOwner!==owner()||state.modal))closeSheet(false);
    const html=baseView();
    if(!mq.matches)return html;
    if(['games','backlog','collections'].includes(state.view))return tabs([['games',tr('Все игры','All games')],['backlog','Backlog'],['collections',tr('Коллекции','Collections')]])+html;
    if(['stats','timeline'].includes(state.view))return tabs([['stats',tr('Обзор','Overview')],['timeline',tr('История','History')]])+html;
    return html;
  };
  function releaseSheet(){
    document.body.classList.remove('mc-more-open');
    expanded(false);
  }
  function closeSheet(restore=true){
    const el=document.querySelector('#mc-more-sheet');
    if(!el?.open)return;
    el.close();
    releaseSheet();
    if(restore){
      const target=returnFocus?.isConnected&&returnFocus.getClientRects().length?returnFocus:document.querySelector('.mobile-nav [data-mobile-more]');
      target?.focus({preventScroll:true});
    }
    returnFocus=null;
  }
  function sheet(){
    let el=document.querySelector('#mc-more-sheet');
    if(el)return el;
    el=document.createElement('dialog');
    el.id='mc-more-sheet';el.className='mc-more-sheet';el.setAttribute('aria-labelledby','mc-more-title');
    // Native modal focus/inert behavior also makes the existing PWA update guard see this sheet.
    el.addEventListener('cancel',e=>{e.preventDefault();closeSheet();});
    el.addEventListener('close',()=>{if(!el.open)releaseSheet();});
    let backdropDown=false;
    el.addEventListener('pointerdown',e=>{backdropDown=e.target===el;});
    el.addEventListener('click',e=>{if(e.target===el&&backdropDown)closeSheet();backdropDown=false;});
    el.addEventListener('keydown',e=>{
      if(e.key!=='Tab')return;
      const buttons=[...el.querySelectorAll('button:not([disabled])')];
      const first=buttons[0],last=buttons[buttons.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    });
    document.body.appendChild(el);
    return el;
  }
  function openSheet(trigger){
    if(!mq.matches||state.modal||document.querySelector('dialog[open],.modal-backdrop,.mc-cover-picker-backdrop'))return;
    const el=sheet(),n=incomingCount();
    const name=String(state.settings?.profileName||tr('Игрок','Player'));
    const id=String(state.settings?.userId||'');
    const entries=[
      ['achievements',tr('Достижения','Achievements'),tr('Прогресс и открытые награды','Progress and unlocked rewards')],
      ['friends',tr('Друзья','Friends'),tr('Профили и игровые библиотеки','Profiles and game libraries')],
      ['settings',tr('Настройки','Settings'),tr('Профиль, консоли и приложение','Profile, devices and app')]
    ];
    el.innerHTML=`<section class="mc-more-panel"><div class="mc-more-handle" aria-hidden="true"></div><div class="mc-more-head"><h3 id="mc-more-title">${tr('Ещё','More')}</h3><button type="button" data-mobile-more-close aria-label="${tr('Закрыть меню','Close menu')}">${lineIcon('close')}</button></div><nav class="mc-more-list" aria-label="${tr('Дополнительные разделы','More sections')}">${entries.map(([view,title,description])=>`<button type="button" data-mobile-more-nav="${view}" ${state.view===view?'aria-current="page"':''}><span class="mc-more-icon">${lineIcon(view)}</span><span><b>${title}</b><small>${description}</small></span><span class="mc-more-trailing">${view==='friends'&&n?`<em aria-label="${requestLabel(n)}">${n>99?'99+':n}</em>`:''}${lineIcon(state.view===view?'check':'arrow')}</span></button>`).join('')}</nav><div class="mc-more-account"><b title="${esc(name)}">${esc(name)}</b>${id?`<span title="${esc(id)}">${esc(id)}</span>`:''}</div></section>`;
    returnFocus=trigger;openedView=state.view;openedOwner=owner();
    // Explicit button focus avoids returning focus to an old text field (and reopening its keyboard).
    trigger?.focus({preventScroll:true});
    el.showModal();
    document.body.classList.add('mc-more-open');expanded(true);
    (el.querySelector('[aria-current="page"]')||el.querySelector('[data-mobile-more-nav]'))?.focus({preventScroll:true});
  }
  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;
    if(!target)return;
    const trigger=target.closest('[data-mobile-more]');
    if(trigger){e.preventDefault();openSheet(trigger);return;}
    if(!target.closest('#mc-more-sheet[open]'))return;
    if(target.closest('[data-mobile-more-close]')){e.preventDefault();closeSheet();return;}
    const nav=target.closest('[data-mobile-more-nav]');
    if(nav&&moreViews.has(nav.dataset.mobileMoreNav)){
      e.preventDefault();const view=nav.dataset.mobileMoreNav;
      if(openedOwner!==owner()){closeSheet();return;}
      const same=view===state.view;
      closeSheet(same);
      if(!same){
        navigate(view); // No delayed callback that could override the user's next action.
        document.querySelector('.mobile-nav [data-mobile-more]')?.focus({preventScroll:true});
      }
    }
  },true);
  mq.addEventListener?.('change',()=>{
    closeSheet(false);
    // CSS adapts immediately; defer markup replacement until the next normal render while typing.
    if(state.modal||document.querySelector('dialog[open],.modal-backdrop,.mc-cover-picker-backdrop')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
    render();
  });
})();
