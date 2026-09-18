(()=>{
  let bypassCoverRefresh=false;
  const baseRender=render;

  function currentDetailGame(){
    const id=String(state.gameDetailId||'');
    return (state.games||[]).find(g=>g&&String(g.id)===id&&!g.deletedAt)||null;
  }

  function enhancePlayingDetail(){
    const game=currentDetailGame();
    if(!game||game.status!=='playing')return;
    const edit=document.querySelector(`[data-action="edit"][data-id="${window.CSS?.escape?CSS.escape(String(game.id)):String(game.id).replace(/["\\]/g,'\\$&')}"]`);
    if(!edit||document.querySelector('[data-v24-complete-game]'))return;
    const wrap=document.createElement('div');
    wrap.className='v24-detail-actions';
    edit.before(wrap);
    wrap.append(edit);
    const done=document.createElement('button');
    done.type='button';
    done.className='primary v24-complete-button';
    done.dataset.v24CompleteGame=String(game.id);
    done.textContent='✓ Прошёл';
    wrap.append(done);
  }

  render=function(){
    const out=baseRender();
    queueMicrotask(enhancePlayingDetail);
    return out;
  };
  queueMicrotask(enhancePlayingDetail);

  async function completeGame(id){
    const game=(state.games||[]).find(g=>g&&String(g.id)===String(id)&&!g.deletedAt);
    if(!game||game.status!=='playing')return;
    if(!confirm(`Отметить «${game.title}» как пройденную?`))return;
    game.status='completed';
    game.updatedAt=nowIso();
    await persist();
    scheduleAutoSync();
    render();
    setToast('Игра отмечена как пройденная');
  }

  async function refreshPlayingCover(button,game){
    const oldText=button.textContent;
    button.disabled=true;
    button.textContent='Ищу обложку…';
    try{
      const result=await fetchCoverForGame(game.title,game.releaseYear,game.platform);
      const next=String(result?.url||'');
      const current=String(game.coverUrl||'');
      if(next&&next!==current){
        game.coverUrl=next;
        game.coverSource=String(result?.source||'auto-refresh-playing');
        game.updatedAt=nowIso();
        try{if(coverLookups instanceof Map)coverLookups.clear();}catch(_){}
        await persist();
        scheduleAutoSync();
        render();
        setToast('Обложка обновлена');
        return;
      }
      bypassCoverRefresh=true;
      button.disabled=false;
      button.textContent=oldText;
      button.click();
    }catch(err){
      console.error('Playing cover refresh failed',err);
      bypassCoverRefresh=true;
      button.disabled=false;
      button.textContent=oldText;
      button.click();
    }finally{
      setTimeout(()=>{bypassCoverRefresh=false;},0);
      if(button.isConnected){button.disabled=false;button.textContent=oldText;}
    }
  }

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;

    const done=target.closest('[data-v24-complete-game]');
    if(done){
      event.preventDefault();
      event.stopImmediatePropagation();
      completeGame(done.dataset.v24CompleteGame).catch(console.error);
      return;
    }

    const refresh=target.closest('[data-v17-cover-refresh]');
    if(!refresh||bypassCoverRefresh)return;
    const game=(state.games||[]).find(g=>g&&String(g.id)===String(refresh.dataset.v17CoverRefresh||state.gameDetailId||'')&&!g.deletedAt);
    if(!game||game.status!=='playing')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    refreshPlayingCover(refresh,game).catch(console.error);
  },true);
})();