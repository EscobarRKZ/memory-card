/* v66: local PNG export. No uploads, analytics, proxies or profile writes. */
(() => {
  'use strict';
  const ui = window.MemoryCardExperience;
  const tr = (ru, en) => ui?.tr(ru, en) || ru;
  const icon = name => ui?.icon(name) || '';
  const clean = value => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  let current = null;

  function round(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function lines(ctx, text, width, max) {
    const words = clean(text).split(/\s+/), out = []; let line = '';
    for (const word of words) {
      if (ctx.measureText((line ? line + ' ' : '') + word).width <= width) { line += (line ? ' ' : '') + word; continue; }
      if (line) { out.push(line); line = ''; }
      for (const char of word) {
        if (ctx.measureText(line + char).width > width && line) { out.push(line); line = ''; }
        line += char;
      }
    }
    if (line) out.push(line);
    if (out.length > max) {
      out.length = max;
      while (out[max-1] && ctx.measureText(out[max-1] + '…').width > width) out[max-1] = out[max-1].slice(0,-1);
      out[max-1] += '…';
    }
    return out;
  }
  function cover(url) {
    if (!/^https?:\/\//i.test(url || '')) return Promise.resolve(null);
    return new Promise(resolve => {
      const image = new Image(); let finished = false;
      const finish = result => { if (finished) return; finished = true; clearTimeout(timer); image.onload = image.onerror = null; resolve(result); };
      const timer = setTimeout(() => finish(null), 7000);
      image.crossOrigin = 'anonymous'; image.referrerPolicy = 'no-referrer';
      image.onload = () => finish(image.naturalWidth ? image : null);
      image.onerror = () => finish(null);
      image.src = url;
    });
  }
  function paint(canvas, game, opts, image, accent) {
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0,0,1080,1350);
    bg.addColorStop(0,'#18213b'); bg.addColorStop(1,'#090f1b'); ctx.fillStyle=bg; ctx.fillRect(0,0,1080,1350);
    ctx.save(); ctx.globalAlpha=.10; ctx.fillStyle=accent;
    ctx.beginPath();ctx.arc(990,90,340,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='#d1d9ec';ctx.font='700 25px system-ui, sans-serif';ctx.fillText('MEMORY CARD',64,87);
    ctx.fillStyle=accent;round(ctx,64,116,48,5,2);ctx.fill();
    ctx.fillStyle='#a8b5ce';ctx.font='500 24px system-ui, sans-serif';
    ctx.fillText(tr('ИГРОВАЯ КОЛЛЕКЦИЯ','GAME COLLECTION'),130,128);
    const pid=clean(platform(game.platform).abbr || game.platform);
    ctx.font='700 26px system-ui, sans-serif';const pillW=Math.min(380,ctx.measureText(pid).width+42);
    ctx.fillStyle='#253049';round(ctx,1016-pillW,57,pillW,53,18);ctx.fill();ctx.fillStyle='#f6f8ff';ctx.fillText(pid,1037-pillW,92);
    const x=64,y=190,w=300,h=450;
    ctx.fillStyle='#202c43';round(ctx,x,y,w,h,25);ctx.fill();
    ctx.save();round(ctx,x,y,w,h,25);ctx.clip();
    if (opts.art && image) {
      const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;
      ctx.drawImage(image,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
    } else {
      ctx.fillStyle=accent;ctx.globalAlpha=.16;ctx.fillRect(x,y,w,h);ctx.globalAlpha=1;
      const initials=clean(game.title).split(/\s+/).slice(0,3).map(s=>[...s][0]).join('').toUpperCase();
      ctx.fillStyle='#f6f8ff';ctx.textAlign='center';ctx.font='800 72px system-ui, sans-serif';ctx.fillText(initials||'MC',x+w/2,y+h/2+14,260);
      ctx.fillStyle='#acbad3';ctx.font='600 23px system-ui, sans-serif';ctx.fillText(pid,x+w/2,y+h/2+61,250);ctx.textAlign='left';
    }
    ctx.restore();
    let font=64,titleLines=[];
    for (;font>=40;font-=2) {ctx.font=`750 ${font}px system-ui, sans-serif`;titleLines=lines(ctx,game.title,608,20);if(titleLines.length<=5)break;}
    ctx.font=`750 ${Math.max(40,font)}px system-ui, sans-serif`;titleLines=lines(ctx,game.title,608,5);
    ctx.fillStyle='#f6f8ff';titleLines.forEach((line,i)=>ctx.fillText(line,408,241+i*(Math.max(40,font)+10)));
    const rating=Number(game.rating);ctx.fillStyle=accent;
    if (rating>=1 && rating<=10) {
      ctx.font='800 108px system-ui, sans-serif';ctx.fillText(String(rating),408,585);
      const rw=ctx.measureText(String(rating)).width;ctx.fillStyle='#a8b5ce';ctx.font='500 35px system-ui, sans-serif';ctx.fillText('/ 10',424+rw,581);
    } else {ctx.font='600 32px system-ui, sans-serif';ctx.fillText(tr('Без оценки','Not rated'),408,570);}
    const status=({completed:tr('Пройдено','Completed'),playing:tr('Играю','Playing'),dropped:tr('Брошено','Dropped'),backlog:tr('Хочу пройти','Backlog')})[game.status]||clean(game.status);
    ctx.fillStyle='#c0cce1';ctx.font='600 26px system-ui, sans-serif';ctx.fillText(clean(status),408,631);
    ctx.strokeStyle='#2d3b53';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(64,694);ctx.lineTo(1016,694);ctx.stroke();
    if (opts.note && opts.excerpt.trim()) {
      ctx.fillStyle=accent;ctx.font='700 72px Georgia, serif';ctx.fillText('“',64,779);
      ctx.fillStyle='#e5eafa';ctx.font='500 33px system-ui, sans-serif';
      lines(ctx,opts.excerpt,862,8).forEach((line,i)=>ctx.fillText(line,112,776+i*43));
    } else {
      ctx.fillStyle='#9caecb';ctx.font='500 34px system-ui, sans-serif';
      lines(ctx,tr('Ещё одна игра в моей коллекции.','Another game in my collection.'),880,3).forEach((line,i)=>ctx.fillText(line,64,790+i*45));
      ctx.fillStyle=accent;ctx.globalAlpha=.35;
      for(let i=0;i<5;i++){round(ctx,64+i*34,915,22,22,6);ctx.fill();}ctx.globalAlpha=1;
    }
    ctx.fillStyle='#d9e2f5';ctx.font='600 25px system-ui, sans-serif';
    if(opts.name) lines(ctx,opts.nickname,920,1).forEach(line=>ctx.fillText(line,64,1174));
    if(opts.date && game.addedAt) {
      const date=new Date(game.addedAt);
      if(!Number.isNaN(date.getTime())) {ctx.fillStyle='#9caecb';ctx.font='500 23px system-ui, sans-serif';ctx.fillText(tr('Запись от ','Entry added ')+date.toLocaleDateString(state.settings?.language==='en'?'en-GB':'ru-RU'),64,1218);}
    }
    ctx.fillStyle='#657896';ctx.font='500 23px system-ui, sans-serif';ctx.fillText('Memory Card · '+tr('Личный игровой архив','Personal game archive'),64,1290);
    return canvas;
  }
  function close() {
    if (!current) return;
    const old=current;current=null;
    clearTimeout(old.timer);old.dialog.remove();
    if(old.returnFocus?.isConnected)old.returnFocus.focus({preventScroll:true});
  }
  async function build(box, revision) {
    const {dialog,game}=box;
    const get=id=>dialog.querySelector(`[data-share-${id}]`);
    const opts={art:get('art').checked,note:get('note').checked,name:get('name').checked,date:get('date').checked,excerpt:get('excerpt').value,nickname:box.nickname};
    let image=null;
    if(opts.art && game.coverUrl) image=await box.image;
    if(current!==box || revision!==box.revision)return;
    const canvas=paint(get('canvas'),game,opts,image,box.accent);
    try {
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG export failed')),'image/png'));
      if(current!==box || revision!==box.revision)return;
      box.blob=blob;
      box.file=typeof File==='function'?new File([blob],box.filename,{type:'image/png'}):null;
      get('download').disabled=false;
      const send=get('send');
      let supported=false;
      try {supported=!!(box.file && navigator.share && navigator.canShare?.({files:[box.file]}));}catch(_){}
      send.hidden=!supported;send.disabled=!supported;
      get('status').textContent=opts.art && game.coverUrl && !image
        ? tr('Источник обложки недоступен или запрещает экспорт. PNG готов с заглушкой.','The cover is unavailable or disallows export. PNG is ready with a placeholder.')
        : tr('PNG готов. Личные поля добавляются только по вашему выбору.','PNG is ready. Personal fields are included only when selected.');
    } catch(error) {get('status').textContent=tr('Не удалось подготовить PNG. Попробуйте без обложки.','Could not prepare PNG. Try without the cover.');console.warn('Share card export',error);}
  }
  function schedule(box) {
    if(current!==box)return;
    clearTimeout(box.timer);box.revision++;box.blob=null;box.file=null;
    box.dialog.querySelectorAll('[data-share-download],[data-share-send]').forEach(b=>b.disabled=true);
    box.dialog.querySelector('[data-share-status]').textContent=tr('Готовлю предпросмотр…','Preparing preview…');
    const revision=box.revision;
    box.timer=setTimeout(()=>build(box,revision),120);
  }
  function open(id) {
    const found=(state.games||[]).find(g=>g&&!g.deletedAt&&String(g.id)===String(id));
    if(!found)return;
    close();
    const game={...found};
    const dialog=document.createElement('dialog');dialog.className='mc-share-dialog';
    dialog.setAttribute('aria-labelledby','mc-share-title');
    dialog.innerHTML=`<div class="mc-share-head"><div><h2 id="mc-share-title">${tr('Карточка для друзей','A card for friends')}</h2><p>${tr('Сначала предпросмотр. Ничего не отправляется автоматически.','Preview first. Nothing is sent automatically.')}</p></div><button type="button" class="icon-btn" data-share-close aria-label="${tr('Закрыть','Close')}">${icon('close')}</button></div>
      <div class="mc-share-layout"><div class="mc-share-preview"><canvas data-share-canvas width="1080" height="1350" role="img" aria-label="${tr('Предпросмотр карточки игры','Game card preview')}"></canvas></div>
      <div class="mc-share-options"><h3>${tr('Что показать на карточке','Include on the card')}</h3>
      <label><input type="checkbox" data-share-art checked><span>${tr('Обложка игры','Game cover')}</span></label>
      <label><input type="checkbox" data-share-name><span>${tr('Имя из профиля','Profile name')}</span></label>
      <label><input type="checkbox" data-share-date><span>${tr('Дата добавления записи','Date entry was added')}</span></label>
      <label><input type="checkbox" data-share-note><span>${tr('Фрагмент моего отзыва','An excerpt from my review')}</span></label>
      <textarea data-share-excerpt maxlength="360" rows="5" disabled aria-label="${tr('Текст отзыва для карточки','Review excerpt for the card')}"></textarea>
      <small>${tr('До 360 символов. Можно изменить текст только для этой картинки.','Up to 360 characters. Edits affect this image only.')}</small>
      <p data-share-status role="status" aria-live="polite"></p></div></div>
      <div class="mc-share-actions"><button type="button" class="secondary mc-icon-button" data-share-download disabled>${icon('download')}<span>${tr('Сохранить PNG','Save PNG')}</span></button><button type="button" class="primary mc-icon-button" data-share-send disabled hidden>${icon('share')}<span>${tr('Поделиться','Share')}</span></button></div>`;
    const probe=document.createElement('span');probe.style.color='var(--accent)';dialog.appendChild(probe);
    document.body.appendChild(dialog);
    const accent=getComputedStyle(probe).color;probe.remove();
    const box={dialog,game,nickname:clean(state.settings?.profileName),accent,filename:'memory-card-'+(clean(game.title).replace(/[^\p{L}\p{N}]+/gu,'-').slice(0,80)||'game')+'.png',returnFocus:document.activeElement,revision:0,timer:0,blob:null,file:null,image:cover(game.coverUrl)};
    current=box;dialog.querySelector('[data-share-excerpt]').value=String(game.notes||'').slice(0,360);
    paint(dialog.querySelector('[data-share-canvas]'),game,{art:true,note:false,name:false,date:false},null,accent);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('click',event=>{
      if(event.target===dialog || event.target.closest('[data-share-close]')){close();return;}
      if(event.target.closest('[data-share-download]') && box.blob){
        const url=URL.createObjectURL(box.blob),a=document.createElement('a');a.href=url;a.download=box.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
      if(event.target.closest('[data-share-send]') && box.file){
        // File is already prepared: invoke share directly within user activation.
        const button=dialog.querySelector('[data-share-send]');button.disabled=true;
        navigator.share({files:[box.file],title:clean(game.title)}).catch(error=>{
          if(error.name!=='AbortError')dialog.querySelector('[data-share-status]').textContent=tr('Отправка не удалась. Используйте «Сохранить PNG».','Sharing failed. Use Save PNG instead.');
        }).finally(()=>{if(current===box && box.file)button.disabled=false;});
      }
    });
    dialog.addEventListener('input',()=>{
      dialog.querySelector('[data-share-excerpt]').disabled=!dialog.querySelector('[data-share-note]').checked;
      schedule(box);
    });
    if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.setAttribute('open','');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');}
    schedule(box);
  }
  function enhance() {
    const root=document.querySelector('.v16-detail-actions');
    const id=String(state.gameDetailId||'');
    if(!root || !id || root.querySelector('[data-mc-share-game]'))return;
    const button=document.createElement('button');button.type='button';button.className='secondary mc-icon-button';button.dataset.mcShareGame=id;
    button.innerHTML=icon('share')+`<span>${tr('Поделиться','Share')}</span>`;root.appendChild(button);
  }
  const baseRender=render;
  render=function(...args){const value=baseRender.apply(this,args);queueMicrotask(enhance);return value;};
  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('[data-mc-share-game]'):null;
    if(!button)return;event.preventDefault();event.stopImmediatePropagation();open(button.dataset.mcShareGame);
  },true);
  document.addEventListener('mc:experience-ready',enhance);
  queueMicrotask(enhance);
})();
