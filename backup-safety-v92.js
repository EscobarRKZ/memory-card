/* Memory Card v92 — account-safe, validation-first JSON backups.
 * Pure module: does not touch IndexedDB, cloud sync, fetch or browser sessions.
 */
(function(root){
  'use strict';
  const MAX_FILE_BYTES=40*1024*1024;
  const MAX_GAME_ROWS=50000;
  const STATUSES=new Set(['completed','playing','dropped','backlog']);
  const SAFE_SETTING_FIELDS=Object.freeze([
    'theme','accentTheme','language','reducedMotion','ownedPlatforms',
    'handheldRotation','desktopRotation','currentHandheld','currentDesktop',
    'rotationHandheldMode','rotationDesktopMode','collections'
  ]);

  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function fail(code,message){const error=new Error(message);error.code=code;throw error;}
  function ownerOf(payload){
    if(!object(payload))return '';
    const direct=typeof payload.ownerUid==='string'?payload.ownerUid.trim():'';
    const settings=object(payload.settings)?payload.settings:{};
    const nested=typeof settings.cloudOwnerUid==='string'?settings.cloudOwnerUid.trim():'';
    if(direct&&nested&&direct!==nested)fail('OWNER_CONFLICT','Файл содержит противоречивые данные владельца.');
    return direct||nested;
  }
  function requireOwner(payload,currentOwner,strict=false){
    const active=String(currentOwner||'').trim();
    const origin=ownerOf(payload);
    if(origin&&origin!==active){
      fail('FOREIGN_OWNER','Файл принадлежит другому аккаунту. Для переноса игр потребуется отдельный подтверждённый способ.');
    }
    if(strict&&active&&!origin){
      fail('UNVERIFIED_OWNER','Не удалось подтвердить владельца этой локальной копии. Восстановление заблокировано.');
    }
    return {origin,unowned:!!active&&!origin};
  }
  function validateGames(rows){
    if(!Array.isArray(rows))fail('NO_GAMES','В файле отсутствует массив игр.');
    if(rows.length>MAX_GAME_ROWS)fail('TOO_MANY_GAMES','Файл содержит слишком много записей.');
    const ids=new Set();
    for(let i=0;i<rows.length;i++){
      const game=rows[i];
      if(!object(game))fail('INVALID_GAME','Повреждённая запись игры №'+(i+1));
      const id=String(game.id||'').trim();
      const title=String(game.title||'').trim();
      const platform=String(game.platform||'').trim();
      // IDs, platforms and years appear in historical HTML attributes and CSS.
      // Reject unsafe imported values before they can reach those renderers.
      const year=String(game.releaseYear||'');
      if(!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(id)||
         !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(platform)||
         (year!==''&&!/^[12][0-9]{3}$/.test(year))||
         !title||title.length>1000||
         !STATUSES.has(String(game.status||'completed'))||
         String(game.notes||'').length>50000||
         String(game.coverUrl||'').length>8000||
         String(game.genre||'').length>500||
         String(game.franchise||'').length>500){
        fail('INVALID_GAME','Неверные поля игры №'+(i+1));
      }
      if(ids.has(id))fail('DUPLICATE_GAME','Файл содержит повторяющийся ID игры: '+id.slice(0,80));
      ids.add(id);
    }
    return rows;
  }
  function prepareImport(payload,currentGames,currentOwner){
    if(!object(payload))fail('INVALID_FORMAT','Это не архив Memory Card.');
    if(!Array.isArray(currentGames))fail('INVALID_CURRENT','Текущая библиотека недоступна.');
    const owner=requireOwner(payload,currentOwner,false);
    const rows=validateGames(payload.games);
    const existing=new Set(currentGames.map(game=>String(game?.id||'').trim()));
    const added=rows.filter(g=>!existing.has(String(g.id).trim()));
    return {
      games:[...currentGames,...added],
      added:added.length,
      skipped:rows.length-added.length,
      total:rows.length,
      unowned:owner.unowned,
      ownerUid:owner.origin
    };
  }
  function prepareRestore(snapshot,currentOwner,currentCount=0){
    if(!object(snapshot)||!object(snapshot.settings))fail('INVALID_SNAPSHOT','Локальная копия повреждена.');
    requireOwner(snapshot,currentOwner,true);
    const rows=validateGames(snapshot.games);
    if(!rows.length&&currentCount>0)fail('EMPTY_RESTORE','Пустую копию нельзя восстановить поверх непустой библиотеки.');
    return {games:rows,count:rows.length,createdAt:String(snapshot.createdAt||'')};
  }
  function safeExportSettings(input){
    const source=object(input)?input:{};
    const out={};
    for(const name of SAFE_SETTING_FIELDS){
      if(!Object.prototype.hasOwnProperty.call(source,name))continue;
      const value=source[name];
      if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean'){
        out[name]=value;
      }else if(Array.isArray(value)){
        // A separate archive contains a portable preference snapshot, never tokens.
        out[name]=JSON.parse(JSON.stringify(value));
      }
    }
    return out;
  }
  function exportPayload(games,settings,currentOwner,metadata={}){
    validateGames(games);
    const record={
      version:92,
      format:'memory-card-library',
      exportedAt:new Date().toISOString(),
      ownerUid:String(currentOwner||''),
      games:JSON.parse(JSON.stringify(games)),
      settings:safeExportSettings(settings)
    };
    if(typeof metadata.snapshotId==='string'&&metadata.snapshotId.length<150)
      record.snapshotId=metadata.snapshotId;
    return record;
  }
  function validateFileSize(bytes){
    if(!Number.isFinite(bytes)||bytes<0||bytes>MAX_FILE_BYTES)
      fail('FILE_TOO_LARGE','Архив слишком большой (максимум 40 МБ).');
    return true;
  }
  const api=Object.freeze({
    prepareImport,prepareRestore,exportPayload,ownerOf,validateGames,
    validateFileSize,MAX_FILE_BYTES,MAX_GAME_ROWS
  });
  root.MemoryCardBackupSafetyV92=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
