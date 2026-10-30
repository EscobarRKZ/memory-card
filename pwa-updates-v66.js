/* v66: opt-in service-worker updates. Never reload an open form automatically. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  const BUILD = 71;
  const tr = (ru,en) => window.MemoryCardExperience?.tr(ru,en) || ru;
  let registration=null, reloadNeeded=false, dismissed=false, approved=false;
  let writes=0, frame=0, lastCheck=0, activationTimer=0, hadController=!!navigator.serviceWorker.controller;
  const watched=new WeakSet();

  function changed(element) {
    if(element.disabled || ['button','submit','hidden'].includes(element.type))return false;
    if(element.type==='checkbox'||element.type==='radio')return element.checked!==element.defaultChecked;
    if(element instanceof HTMLSelectElement){
      const initial=[...element.options].find(o=>o.defaultSelected)||element.options[0];
      return element.value!==(initial?.value||'');
    }
    return element.value!==element.defaultValue;
  }
  function blocked() {
    if(writes)return true;
    if(document.querySelector('#gameForm,#playingForm,#finishRotationForm,.mc-cover-picker-backdrop,dialog[open]'))return true;
    if([...document.querySelectorAll('[data-v23-title],[data-v17-backlog-title]')].some(el=>el.value.trim()))return true;
    if(typeof state!=='undefined'&&state.view==='settings'){
      if([...document.querySelectorAll('.settings-grid input,.settings-grid select,.settings-grid textarea')].some(changed))return true;
    }
    return [...document.querySelectorAll('.mc-auth-form input')].some(el=>el.value&&el.type==='password');
  }
  function banner() {
    let el=document.querySelector('.mc-update-banner');
    if(el)return el;
    el=document.createElement('section');el.className='mc-update-banner';el.hidden=true;
    el.setAttribute('aria-label',tr('Обновление приложения','Application update'));
    el.innerHTML=`<div><b>${tr('Есть новая версия','An update is ready')}</b><p data-mc-update-message role="status" aria-live="polite"></p></div><div class="mc-update-buttons"><button type="button" class="secondary" data-mc-update-later>${tr('Позже','Later')}</button><button type="button" class="primary" data-mc-update-apply>${tr('Обновить','Update')}</button></div>`;
    document.body.appendChild(el);return el;
  }
  function status(message) {
    document.querySelectorAll('[data-mc-update-status]').forEach(el=>el.textContent=message);
  }
  function refresh() {
    frame=0;
    if(typeof state!=='undefined'&&state.view==='settings'){
      const root=document.querySelector('.content');
      if(root&&!root.querySelector('.mc-update-tools')){
        const tools=document.createElement('div');tools.className='mc-update-tools';
        tools.innerHTML=`<small>Memory Card · v${BUILD}</small><button type="button" class="secondary" data-mc-update-check>${tr('Проверить обновление','Check for updates')}</button><span data-mc-update-status role="status"></span>`;root.appendChild(tools);
      }
    }
    const available=!!registration?.waiting||reloadNeeded;
    const el=available?banner():document.querySelector('.mc-update-banner');
    if(!el)return;
    el.hidden=!available||dismissed;
    const busy=blocked();
    el.querySelector('[data-mc-update-apply]').disabled=busy||approved;
    const message=busy
      ?tr('Сначала сохраните или закройте форму. Ввод не будет прерван.','Save or close your form first. Your work will not be interrupted.')
      :approved?tr('Применяю обновление…','Applying update…')
      :tr('Перезапуск — только по этой кнопке. Библиотека останется на месте.','Restart only when you choose. Your library stays in place.');
    el.querySelector('[data-mc-update-message]').textContent=message;
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(refresh);}
  // Track writes so an Update click cannot race a pending save.
  if(typeof persist==='function'){
    const base=persist;
    persist=async function(...args){writes++;schedule();try{return await base.apply(this,args);}finally{writes--;schedule();}};
  }
  if(typeof render==='function'){
    const base=render;
    render=function(...args){const value=base.apply(this,args);schedule();return value;};
  }
  function watch(reg) {
    if(!reg)return;
    registration=reg;
    if(!watched.has(reg)){
      watched.add(reg);
      const track=()=>{
        const worker=reg.installing;
        if(worker)worker.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller){dismissed=false;schedule();}
        });
      };
      reg.addEventListener('updatefound',track);track();
    }
    schedule();
  }
  async function check(manual=false) {
    lastCheck=Date.now();
    if(manual){dismissed=false;status(tr('Проверяю…','Checking…'));}
    try{
      const reg=registration||await navigator.serviceWorker.getRegistration();
      if(!reg){if(manual)status(tr('Приложение ещё устанавливается. Повторите позже.','The app is still installing. Try again later.'));return;}
      watch(reg);await reg.update();
      if(manual)status(reg.waiting||reg.installing||reloadNeeded?tr('Обновление найдено или загружается.','An update is available or downloading.'):tr('Установлена актуальная версия.','You are up to date.'));
    }catch(error){if(manual)status(tr('Не удалось проверить. Проверьте соединение.','Could not check. Please check your connection.'));}
    schedule();
  }
  function apply() {
    if(blocked()||approved){schedule();return;}
    if(reloadNeeded){location.reload();return;}
    const worker=registration?.waiting;
    if(!worker){check(true);return;}
    approved=true;schedule();
    worker.postMessage({type:'MC_SKIP_WAITING'});
    clearTimeout(activationTimer);
    activationTimer=setTimeout(()=>{approved=false;schedule();status(tr('Обновление ещё не применено. Попробуйте ещё раз.','The update has not been applied yet. Please try again.'));},12000);
  }
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController){hadController=true;return;}
    reloadNeeded=true;clearTimeout(activationTimer);
    // Another tab can activate an update. Never reload this tab without its consent.
    if(approved&&!blocked()){location.reload();return;}
    approved=false;dismissed=false;schedule();
  });
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('[data-mc-update-apply]'))apply();
    if(target?.closest('[data-mc-update-later]')){dismissed=true;schedule();}
    if(target?.closest('[data-mc-update-check]'))check(true);
    schedule();
  });
  document.addEventListener('mc:experience-ready',schedule);
  document.addEventListener('input',schedule);
  document.addEventListener('change',schedule);
  document.addEventListener('close',schedule,true);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&Date.now()-lastCheck>15*60*1000&&!blocked())check();
  });
  navigator.serviceWorker.ready.then(watch).catch(()=>{});
  window.addEventListener('load',()=>check());
  schedule();
})();
