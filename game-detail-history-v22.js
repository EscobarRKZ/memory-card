(()=>{
  let backContext=null;
  const listViews=new Set(['games','backlog','collections','franchise']);
  const baseOpenGame=openGame;

  function selectorFor(id){
    const safe=window.CSS?.escape?CSS.escape(String(id)):String(id).replace(/["\\]/g,'\\$&');
    return `[data-v16-game-detail="${safe}"],[data-game="${safe}"]`;
  }

  function remember(id){
    const view=state.view;
    if(!listViews.has(view)){backContext=null;return;}
    const card=document.querySelector(selectorFor(id));
    backContext={
      view,
      id:String(id),
      scrollY:window.scrollY,
      anchorTop:card?.getBoundingClientRect().top ?? null,
      platformFilter:state.platformFilter,
      search:state.search,
      statusFilter:state.statusFilter,
      collectionId:state.collectionId,
      franchiseName:state.franchiseName
    };
  }

  openGame=function(id){
    remember(id);
    return baseOpenGame(id);
  };

  function restoreScroll(ctx){
    window.scrollTo({top:ctx.scrollY,left:0,behavior:'auto'});
    const adjust=()=>{
      const card=document.querySelector(selectorFor(ctx.id));
      if(!card||ctx.anchorTop==null)return;
      const delta=card.getBoundingClientRect().top-ctx.anchorTop;
      if(Math.abs(delta)>1)window.scrollBy({top:delta,left:0,behavior:'auto'});
    };
    requestAnimationFrame(()=>requestAnimationFrame(adjust));
    setTimeout(adjust,120);
  }

  function goBack(){
    const ctx=backContext;
    if(!ctx){navigate('games');return;}
    backContext=null;
    state.view=ctx.view;
    state.gameDetailId='';
    state.platformFilter=ctx.platformFilter;
    state.search=ctx.search;
    state.statusFilter=ctx.statusFilter;
    state.collectionId=ctx.collectionId;
    state.franchiseName=ctx.franchiseName;
    state.friendCompare=false;
    state.modal=null;
    render();
    restoreScroll(ctx);
  }

  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target.closest('[data-v16-detail-back]'):null;
    if(!target)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    goBack();
  },true);
})();
