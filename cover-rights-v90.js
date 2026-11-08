/* v90 — local, explicit external game-cover consent.
 * Safe-by-default controls reduce remote requests; they do NOT grant copyright.
 * Stored game metadata, URLs, cloud records and user backups are untouched.
 */
(function(root){
  'use strict';
  const KEY='memory-card-external-covers-v90';
  const OLD_COVER_CACHE='memory-card-covers-v14';
  let on=false;
  try{on=root.localStorage?.getItem(KEY)==='enabled';}catch(_){}
  function enabled(){return on;}
  function sourceLabel(source='',url=''){
    const value=String(source||'').toLowerCase();
    const target=String(url||'').toLowerCase();
    if(!url)return 'Без обложки';
    if(value.startsWith('libretro:')||target.includes('libretro-thumbnails/'))return 'Libretro Thumbnails';
    if(value.startsWith('gametdb-')||target.includes('art.gametdb.com/'))return 'GameTDB';
    if(value.startsWith('aldostools:')||target.includes('aldostools/resources'))return 'AldoTools';
    if(value.startsWith('hexflow-')||target.includes('hexflow-covers'))return 'HexFlow Covers';
    if(value.startsWith('wikipedia:')||value.startsWith('wikipedia-')||
       target.includes('upload.wikimedia.org'))return 'Wikipedia / Wikimedia';
    if(value==='manual-url'||value==='manual')return 'Ссылка пользователя';
    if(value.startsWith('catalog'))return 'Каталог игр';
    return 'Внешний источник (не определён)';
  }
  function describe(source='',url=''){
    if(!url)return 'Обложка не выбрана';
    return sourceLabel(source,url)+' · права на изображение не подтверждены';
  }
  function clearOldCoverCache(){
    try{
      if(root.caches?.delete)return Promise.resolve(root.caches.delete(OLD_COVER_CACHE)).catch(()=>false);
    }catch(_){}
    return Promise.resolve(false);
  }
  function setEnabled(value){
    on=value===true;
    try{root.localStorage?.setItem(KEY,on?'enabled':'disabled');}catch(_){}
    if(!on)void clearOldCoverCache();
    return on;
  }
  const api=Object.freeze({enabled,setEnabled,sourceLabel,describe,clearOldCoverCache,storageKey:KEY});
  root.MemoryCardCoverRightsV90=api;
  root.document?.addEventListener?.('change',event=>{
    const input=event.target?.closest?.('[data-mc-external-covers]');
    if(!input)return;
    setEnabled(!!input.checked);
    try{root.render?.();}catch(_){}
  },true);
  root.addEventListener?.('storage',event=>{
    if(event.key!==KEY)return;
    on=event.newValue==='enabled';
    try{root.render?.();}catch(_){}
  });
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
