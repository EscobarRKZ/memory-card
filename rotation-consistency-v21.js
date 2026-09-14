(()=>{
  const currentGameForRotation=group=>{
    const currentId=currentPlatformFor(group);
    if(!currentId)return null;
    return playingGamesForPlatform(currentId)[0]||null;
  };

  renderRotationCard=function(group){
    const label=group==='handheld'?'Портативная ротация':'Desktop-ротация';
    const currentId=currentPlatformFor(group);
    const currentGame=currentGameForRotation(group);
    const nextId=nextPlatformAfter(currentId,group);
    const rotation=rotationFor(group);
    const chips=rotation.map(id=>{
      const inner=`${platformIcon(id)}<span>${platform(id).abbr}</span>`;
      if(id===nextId)return `<button class="rotation-chip next rotation-next-button" data-action="advance-rotation" data-group="${group}" title="Перейти с ${platform(currentId).name} на ${platform(nextId).name}">${inner}</button>`;
      return `<span class="rotation-chip ${id===currentId?'current':''}">${inner}</span>`;
    }).join('<span class="rotation-arrow">→</span>');
    return `<section class="rotation-card">
      <div class="rotation-head">
        <div><div class="rotation-title">${label}</div>${currentGame?`<div class="rotation-playing">${esc(currentGame.title)}</div><div class="meta">${platform(currentGame.platform).name}${currentGame.releaseYear?` · ${currentGame.releaseYear}`:''}${currentGame.genre?` · ${esc(currentGame.genre)}`:''}</div>`:`<div class="rotation-playing muted">На ${platform(currentId).abbr} активная игра не выбрана</div>`}</div>
      </div>
      <div class="rotation-row">${chips}</div>
      <div class="status-line">По ротации сейчас: <b>${platform(currentId).abbr}</b> · следующая: <button class="next-inline" data-action="advance-rotation" data-group="${group}">${platform(nextId).abbr}</button>.</div>
    </section>`;
  };

  openFinishRotation=function(group){
    const currentId=currentPlatformFor(group);
    const nextId=nextPlatformAfter(currentId,group);
    const candidates=playingGamesForPlatform(currentId);
    state.modal={type:'finish-rotation',group,currentId,nextId,selectedId:candidates[0]?.id||''};
    render();
  };
})();
