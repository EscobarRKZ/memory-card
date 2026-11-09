/* Memory Card v96: opt-in, read-only device/cloud health diagnostic.
 * No Auth secrets, notes, titles, URLs, usernames, user IDs or raw errors
 * appear in reports. Cloud queries only count rows owned by this session.
 */
(function(root){
  'use strict';
  const VERSION=96;
  let lastReport=null,lastContext='',running=false;
  const KINDS=new Set(['ok','error','conflict','busy','unknown']);
  const CLOUD=new Set(['ok','offline','not-signed-in','busy','unavailable']);
  const STORAGE=new Set(['persistent','best-effort','unavailable']);
  const NETWORK=new Set(['browser-online','browser-offline']);
  const ACCOUNT=new Set(['signed-in','guest']);
  const yesNo=new Set([true,false]);

  function enumValue(value,allowed,fallback){
    return allowed.has(value)?value:fallback;
  }
  function int(value,max=100000000){
    return Number.isInteger(value)&&value>=0&&value<=max?value:null;
  }
  function roundedMiB(bytes){
    return Number.isFinite(bytes)&&bytes>=0
      ?Math.round(bytes/1048576*10)/10:null;
  }
  function safeReport(raw){
    // Do not spread or recursively serialize caller input. The exported
    // structure is an explicit allowlist of values with bounded types.
    return Object.freeze({
      format:'memory-card-sanitized-health-v96',
      build:VERSION,
      checkedAt:new Date().toISOString(),
      account:enumValue(raw.account,ACCOUNT,'guest'),
      network:enumValue(raw.network,NETWORK,'browser-offline'),
      localGames:int(raw.localGames),
      localBackups:int(raw.localBackups,10),
      cloudGames:int(raw.cloudGames),
      cloud:enumValue(raw.cloud,CLOUD,'unavailable'),
      sync:enumValue(raw.sync,KINDS,'unknown'),
      conflicts:int(raw.conflicts,100000),
      retryAttempt:int(raw.retryAttempt,5),
      localStorage:enumValue(raw.localStorage,STORAGE,'unavailable'),
      usedMiB:roundedMiB(raw.usedBytes),
      quotaMiB:roundedMiB(raw.quotaBytes),
      serviceWorkerControlled:raw.serviceWorkerControlled===true
    });
  }
  function getIdentity(env){
    const session=env.getSession?.();
    const signed=String(session?.user?.id||'');
    const local=String(env.state?.settings?.cloudOwnerUid||'');
    return {signed,local};
  }
  function checkIdentity(env,before){
    const current=getIdentity(env);
    if(current.signed!==before.signed||current.local!==before.local){
      throw new Error('ACCOUNT_CHANGED_DURING_CHECK');
    }
  }
  async function collect(env){
    const identity=getIdentity(env);
    if(identity.signed!==identity.local){
      // Never probe a previous account's library or cloud under a new UID.
      throw new Error('ACCOUNT_MISMATCH');
    }
    const navigator=env.navigator||{};
    const online=navigator.onLine!==false;
    const sync=env.getSyncState?.()||{};
    const localGames=Array.isArray(env.state?.games)
      ?env.state.games.filter(g=>g&&!g.deletedAt).length:null;
    let localBackups=null,localStorage='unavailable',usedBytes=null,quotaBytes=null;
    const storage=navigator.storage;
    if(typeof storage?.estimate==='function'){
      try{
        const estimate=await storage.estimate();
        usedBytes=Number(estimate?.usage);
        quotaBytes=Number(estimate?.quota);
        if(!Number.isFinite(usedBytes)||!Number.isFinite(quotaBytes)){
          usedBytes=null;quotaBytes=null;
        }
      }catch(_){usedBytes=null;quotaBytes=null;}
    }
    if(typeof storage?.persisted==='function'){
      try{localStorage=await storage.persisted()?'persistent':'best-effort';}
      catch(_){localStorage='unavailable';}
    }
    if(typeof env.readBackups==='function'){
      try{
        const backups=await env.readBackups();
        localBackups=Array.isArray(backups)?backups.length:null;
      }catch(_){localBackups=null;}
    }
    let cloud='not-signed-in',cloudGames=null;
    if(identity.signed){
      cloud='unavailable';
      if(!online)cloud='offline';
      else if(env.isBusy?.())cloud='busy';
      else if(env.client?.from){
        try{
          const result=await env.client.from('games')
            .select('id',{count:'exact',head:true})
            .eq('user_id',identity.signed)
            .is('deleted_at',null);
          if(!result?.error && int(result?.count)!==null){
            cloudGames=result.count;
            cloud='ok';
          }
        }catch(_){cloud='unavailable';}
      }
    }
    checkIdentity(env,identity);
    return safeReport({
      account:identity.signed?'signed-in':'guest',
      network:online?'browser-online':'browser-offline',
      localGames,localBackups,cloudGames,cloud,
      sync:sync.kind||'unknown',
      conflicts:sync.conflicts,
      retryAttempt:sync.retryAttempt,
      localStorage,usedBytes,quotaBytes,
      serviceWorkerControlled:!!navigator.serviceWorker?.controller
    });
  }
  function tr(ru,en){
    return typeof state!=='undefined'&&state?.settings?.language==='en'?en:ru;
  }
  function contextTag(){
    if(typeof state==='undefined')return '';
    const identity=getIdentity({
      state,
      getSession:()=>root.MemoryCardBackendV2?.getSession?.()
    });
    return identity.signed+'|'+identity.local;
  }
  function formatReport(report){
    const cloudStatus={
      ok:tr('Доступно','Available'),
      offline:tr('Нет сети','Offline'),
      'not-signed-in':tr('Нет входа в аккаунт','Not signed in'),
      busy:tr('Сейчас идёт синхронизация','Sync in progress'),
      unavailable:tr('Не удалось получить число игр','Cloud count unavailable')
    };
    const syncStatus={
      ok:tr('Выполнена','Completed'),
      busy:tr('Выполняется','In progress'),
      error:tr('Есть ошибка','Has an error'),
      conflict:tr('Нужен разбор конфликта','Conflict needs review'),
      unknown:tr('Ещё не выполнялась','Not run yet')
    };
    const persistence={
      persistent:tr('Постоянное хранилище разрешено','Persistent storage granted'),
      'best-effort':tr('Может быть очищено браузером','Browser may evict data'),
      unavailable:tr('Браузер не сообщил статус','Status unavailable')
    };
    const number=v=>v===null?'—':String(v);
    const local=number(report.localGames);
    const cloud=report.cloud==='ok'?number(report.cloudGames):cloudStatus[report.cloud];
    const backup=number(report.localBackups);
    const space=report.usedMiB!==null&&report.quotaMiB!==null
      ?report.usedMiB+' / '+report.quotaMiB+' '+tr('МиБ (примерно)','MiB (approx.)')
      :tr('Нет данных','Not available');
    const mismatch=report.cloud==='ok'&&report.cloudGames!==report.localGames;
    return [
      tr('Игры на устройстве: ','Local game entries: ')+local,
      tr('Игры в облаке: ','Cloud game entries: ')+cloud,
      tr('Локальных копий: ','Local backups: ')+backup,
      tr('Статус синхронизации: ','Sync: ')+syncStatus[report.sync],
      tr('Конфликтов: ','Conflicts: ')+number(report.conflicts),
      tr('Хранилище: ','Storage: ')+persistence[report.localStorage],
      tr('Занято сайтом: ','Site storage: ')+space,
      tr('Управление через PWA: ','Service worker controlling: ')+
        (report.serviceWorkerControlled?tr('Да','Yes'):tr('Нет','No')),
      mismatch
        ?tr('Число игр различается: возможны несинхронизированные изменения. Это не означает удаление данных.',
          'Game counts differ: there may be pending changes. This does not mean data was deleted.')
        :''
    ].filter(Boolean).join('\n');
  }
  function validLast(){
    if(lastContext!==contextTag()){lastReport=null;lastContext='';}
    return lastReport;
  }
  function paint(panel){
    if(!panel)return;
    const output=panel.querySelector('[data-mc-diag-output]');
    const exportButton=panel.querySelector('[data-mc-diag-export]');
    const report=validLast();
    if(output&&!running){
      output.textContent=report?formatReport(report):
        tr('Проверка ещё не запускалась. Нажми «Проверить».',
          'No check yet. Press Check.');
    }
    if(exportButton)exportButton.disabled=!report||running;
  }
  function showText(message){
    const panel=root.document?.querySelector('[data-mc-diagnostics-panel]');
    const el=panel?.querySelector('[data-mc-diag-output]');
    if(el)el.textContent=String(message||'');
  }
  function redraw(){
    paint(root.document?.querySelector('[data-mc-diagnostics-panel]'));
  }
  async function run(){
    if(running||typeof state==='undefined')return;
    const tag=contextTag();
    running=true;
    lastReport=null;
    showText(tr('Проверяю устройство и счётчик игр в облаке…',
      'Checking device and cloud game count…'));
    const btn=root.document?.querySelector('[data-mc-diag-run]');
    if(btn)btn.disabled=true;
    try{
      const report=await collect({
        state,
        navigator:root.navigator,
        getSession:()=>root.MemoryCardBackendV2?.getSession?.(),
        getSyncState:()=>root.MemoryCardBackendV2?.getSyncState?.(),
        isBusy:()=>root.MemoryCardBackendV2?.isBusy?.(),
        client:root.MemoryCardBackendV2?.client,
        readBackups:typeof readLocalBackupRecords==='function'
          ?()=>readLocalBackupRecords():null
      });
      if(contextTag()!==tag)return;
      lastContext=tag;lastReport=report;
    }catch(error){
      if(contextTag()!==tag)return;
      const message=error?.message==='ACCOUNT_MISMATCH'?
        tr('Аккаунт и локальная библиотека ещё не согласованы. Выйди и войди заново; проверка облака не выполнялась.',
          'Your account and local library do not match. Sign out/in; cloud was not queried.'):
        tr('Проверка прервана или недоступна. Игры не изменены.',
          'Check interrupted or unavailable. Games were not changed.');
      showText(message);
      return;
    }finally{
      running=false;
      const current=root.document?.querySelector('[data-mc-diag-run]');
      if(current)current.disabled=false;
      if(contextTag()===tag&&lastReport)redraw();
    }
  }
  function download(){
    const report=validLast();
    if(!report)return;
    const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=root.document.createElement('a');
    link.href=url;
    link.download='memory-card-diagnostics-v96.json';
    root.document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function protect(){
    const before=contextTag();
    const storage=root.navigator?.storage;
    if(typeof storage?.persist!=='function'){
      showText(tr('Этот браузер не поддерживает запрос постоянного хранения. Сохраняй резервные копии JSON.',
        'This browser does not support requesting persistent storage. Export JSON backups.'));
      return;
    }
    const button=root.document?.querySelector('[data-mc-diag-persist]');
    if(button)button.disabled=true;
    try{
      const granted=await storage.persist();
      if(contextTag()!==before)return;
      if(lastReport){
        lastReport=Object.freeze({...lastReport,
          localStorage:granted?'persistent':'best-effort'});
      }
      showText(granted
        ?tr('Браузер разрешил постоянное хранилище. Это не защищает от ручного удаления данных — сохраняй JSON-копии.',
          'Persistent storage granted. Manual deletion is still possible; keep JSON backups.')
        :tr('Браузер не предоставил постоянное хранилище. Храни JSON-копию отдельно.',
          'Persistent storage was not granted. Keep a separate JSON backup.'));
    }catch(_){
      if(contextTag()===before)
        showText(tr('Браузер не смог изменить режим хранения. Экспортируй JSON-копию.',
          'The browser could not change storage mode. Export a JSON backup.'));
    }finally{
      if(button?.isConnected)button.disabled=false;
    }
  }
  function panelHtml(){
    return '<section class="panel mc-diagnostics-v96" data-settings-category="data" data-mc-diagnostics-panel>'+
      '<h3>'+tr('Диагностика устройства и облака','Device & cloud diagnostics')+'</h3>'+
      '<p class="status-line">'+
      tr('Проверка запускается вручную. Запрашивается только число твоих игр; содержимое библиотеки не скачивается. Отчёт остаётся на устройстве.',
        'Checks run only when requested. Only your game count is queried, not game contents. The report stays on this device.')+
      '</p><div class="mc-diag-actions">'+
      '<button type="button" class="secondary" data-mc-diag-run>'+
      tr('Проверить состояние','Run diagnostics')+'</button>'+
      '<button type="button" class="secondary" data-mc-diag-persist>'+
      tr('Защитить офлайн-хранилище','Request persistent storage')+'</button>'+
      '<button type="button" class="secondary" data-mc-diag-export disabled>'+
      tr('Скачать обезличенный отчёт','Download sanitized report')+'</button></div>'+
      '<div class="mc-diag-output" data-mc-diag-output role="status" aria-live="polite"></div>'+
      '<p class="footer-note">'+
      tr('Отчёт не содержит email, Memory Card ID, токены, названия игр или заметки. Оценка занятого места неточна. Согласие браузера на постоянное хранение не заменяет резервную копию.',
        'The report excludes email, IDs, tokens, game titles and notes. Storage estimates are approximate. Persistent storage is not a backup.')+
      '</p></section>';
  }
  if(typeof renderSettings==='function'&&root.document){
    const original=renderSettings;
    renderSettings=function(){
      const html=original.apply(this,arguments);
      const host=root.document.createElement('div');
      host.innerHTML=String(html||'');
      const grid=host.querySelector('.settings-grid');
      if(!grid)return html;
      grid.insertAdjacentHTML('beforeend',panelHtml());
      paint(grid.querySelector('[data-mc-diagnostics-panel]'));
      return host.innerHTML;
    };
    root.document.addEventListener('click',event=>{
      const button=event.target instanceof Element?event.target:null;
      if(button?.closest('[data-mc-diag-run]')){event.preventDefault();void run();}
      if(button?.closest('[data-mc-diag-persist]')){event.preventDefault();void protect();}
      if(button?.closest('[data-mc-diag-export]')){event.preventDefault();download();}
    });
  }
  root.MemoryCardDiagnosticsV96=Object.freeze({safeReport,collect,formatReport});
  if(typeof module!=='undefined'&&module.exports)
    module.exports={safeReport,collect,formatReport};
})(typeof window!=='undefined'?window:{});
