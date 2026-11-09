/* Memory Card v97 — account-scoped, device-local cover suppression.
 * This is a privacy/user-control feature, NOT a copyright license or a
 * publisher-wide takedown. Never modifies games, cloud rows, IDs or notes.
 */
(function(root){
  'use strict';
  const KEY='memory-card-hidden-covers-v97';
  const MAX_ENTRIES=2000;
  let hidden=read();

  function plain(item){
    return !!item && typeof item==='object' && !Array.isArray(item);
  }
  function read(){
    try{
      const data=JSON.parse(root.localStorage?.getItem(KEY)||'{}');
      if(!plain(data))return Object.create(null);
      const result=Object.create(null);
      for(const key of Object.keys(data).slice(0,MAX_ENTRIES)){
        if(data[key]===true&&key.length<=500)result[key]=true;
      }
      return result;
    }catch(_){return Object.create(null);}
  }
  function keyFor(owner,gameId){
    const a=String(owner||'guest').trim()||'guest';
    const b=String(gameId||'').trim();
    if(!b||b.length>250||a.length>150)return '';
    return JSON.stringify([a,b]);
  }
  function owner(){
    const current=typeof state!=='undefined'?state:root.state;
    return String(current?.settings?.cloudOwnerUid||'guest');
  }
  function isHiddenFor(ownerId,gameId){
    const key=keyFor(ownerId,gameId);
    return !!key&&Object.prototype.hasOwnProperty.call(hidden,key);
  }
  function isHidden(game){
    return isHiddenFor(owner(),game?.id);
  }
  function isVisible(game){
    return root.MemoryCardCoverRightsV90?.enabled?.()===true&&!isHidden(game);
  }
  function countFor(ownerId){
    let count=0;
    const scope=String(ownerId||'guest');
    for(const key of Object.keys(hidden)){
      try{const item=JSON.parse(key);if(item[0]===scope)count++;}
      catch(_){}
    }
    return count;
  }
  function setHiddenFor(ownerId,gameId,value){
    const key=keyFor(ownerId,gameId);
    if(!key)throw new Error('Недопустимый идентификатор игры');
    const next=Object.assign(Object.create(null),hidden);
    if(value===true)next[key]=true;
    else delete next[key];
    if(Object.keys(next).length>MAX_ENTRIES)
      throw new Error('Список скрытых обложек переполнен');
    try{
      if(!root.localStorage?.setItem)throw new Error('storage unavailable');
      root.localStorage.setItem(KEY,JSON.stringify(next));
    }catch(_){
      throw new Error('Браузер не сохранил настройку скрытия');
    }
    hidden=next;
    return isHiddenFor(ownerId,gameId);
  }
  function suppressedContainer(container){
    return !!container?.closest?.('[data-mc-cover-hidden="1"]');
  }
  function gameById(id){
    const current=typeof state!=='undefined'?state:root.state;
    return (current?.games||[]).find(g=>g&&!g.deletedAt&&String(g.id)===String(id))||null;
  }
  function decorateDetail(){
    const d=root.document;
    if(!d?.querySelector)return;
    const detail=d.querySelector('.v16-detail');
    const current=typeof state!=='undefined'?state:root.state;
    if(!detail||current?.view!=='gameDetail')return;
    const g=gameById(current.gameDetailId);
    const actions=detail.querySelector('.v16-detail-actions');
    if(!g||!actions)return;
    const existing=actions.querySelector('[data-mc-cover-toggle]');
    const button=existing||d.createElement('button');
    button.type='button';
    button.className='secondary compact mc-cover-visibility-action';
    button.dataset.mcCoverToggle=String(g.id);
    const active=isHidden(g);
    button.textContent=active?'Показать обложку':'Скрыть обложку';
    button.setAttribute('aria-pressed',active?'true':'false');
    if(!existing)actions.appendChild(button);
    let note=detail.querySelector('[data-mc-cover-visibility-note]');
    if(!note){
      note=d.createElement('p');
      note.className='mc-cover-visibility-note';
      note.dataset.mcCoverVisibilityNote='1';
      actions.insertAdjacentElement('afterend',note);
    }
    note.textContent=active?
      'Обложка скрыта на этом устройстве. Ссылка, игра, оценка и заметки сохранены.':
      'Можно скрыть только эту обложку на устройстве, не удаляя игру или ссылку.';
  }
  function redraw(){
    if(typeof render==='function')render();
    else root.render?.();
  }

  const api=Object.freeze({
    storageKey:KEY,keyFor,isHiddenFor,isHidden,isVisible,setHiddenFor,countFor,
    suppressedContainer,refresh:()=>{hidden=read();},maxEntries:MAX_ENTRIES
  });
  root.MemoryCardCoverVisibilityV97=api;

  if(typeof coverMarkup==='function'){
    const before=coverMarkup;
    coverMarkup=function(game,cls='cover'){
      if(!game||!isHidden(game))return before.apply(this,arguments);
      const safe={...game,coverUrl:''};
      const markup=before.call(this,safe,cls);
      return markup.replace(/^<div(?=\s)/,'<div data-mc-cover-hidden="1"');
    };
  }
  if(typeof render==='function'){
    const before=render;
    render=function(){
      const result=before.apply(this,arguments);
      decorateDetail();
      return result;
    };
  }
  if(root.document?.addEventListener){
    root.document.addEventListener('click',event=>{
      const button=event.target?.closest?.('[data-mc-cover-toggle]');
      if(!button)return;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      const game=gameById(button.dataset.mcCoverToggle);
      if(!game)return;
      try{
        const next=setHiddenFor(owner(),game.id,!isHidden(game));
        redraw();
        if(typeof setToast==='function')
          setToast(next?'Обложка скрыта только на этом устройстве':'Обложка снова доступна');
      }catch(error){
        if(typeof setToast==='function')setToast(error.message);
      }
    },true);
  }
  root.addEventListener?.('storage',event=>{
    if(event.key!==KEY)return;
    hidden=read();
    try{redraw();}catch(_){}
  });
  if(root.document)root.queueMicrotask?.(decorateDetail);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
