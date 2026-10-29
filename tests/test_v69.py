"""v69 browser interaction fixtures; core routing/data are simulated.
Uses exact committed v22 history, v63 title search, v66/v68 enhancements, plus v69.
MC_CHROMIUM=/usr/bin/chromium python tests/test_v69.py
No auth, network requests, live storage or installed-PWA upgrade is exercised.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT/'tests'/'artifacts-v69'; OUT.mkdir(parents=True, exist_ok=True)
CSS = r'''
*{box-sizing:border-box}:root{font-family:system-ui,sans-serif;--bg:#09111f;--panel:#111b31;--panel2:#1c233d;--field:#141d34;--line:#294064;--text:#f7f8ff;--muted:#a9b9d4;--accent:#a48df2;--accentText:#fff;--success:#5ee6a8;--star:#ffd05a;--soft:#d6dcf4;--warning:#fbbf24;--overlay:#030814bc;--shadow:0 20px 45px #0004}
html[data-theme=light]{--bg:#f4f4ff;--panel:#fff;--panel2:#f0f1ff;--field:#fafaff;--line:#d9ddf3;--text:#17152a;--muted:#6f7391;--accent:#6d4aff;--success:#168a59;--star:#d99200;--warning:#a96a00;--overlay:#16162890}
body{margin:0;background:var(--bg);color:var(--text)}button,input,textarea,select{font:inherit}button{cursor:pointer}.shell{max-width:980px;margin:auto;padding:10px 14px 100px}.topbar{display:flex;position:sticky;top:0;z-index:20;justify-content:space-between;align-items:center;min-height:66px;margin-bottom:16px;background:var(--bg)}.brand{font-weight:800;font-size:22px;color:var(--accent)}.primary,.secondary,.ghost{border:1px solid var(--line);padding:11px 16px;border-radius:12px;color:var(--text);background:var(--panel2);min-height:44px}.primary{background:var(--accent);color:white}.section-head h2{font-size:26px;margin:0 0 6px}.section-head p{font-size:13px;color:var(--muted);margin:0 0 18px}.content{min-width:0}.toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.field{display:grid;gap:7px;flex:1;min-width:150px}.field label{font-size:11px;color:var(--muted);font-weight:700}.field input,.field select{width:100%;min-width:0;min-height:46px;background:var(--field);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:12px;outline:none}.field input:focus,.field select:focus{border-color:var(--accent)}.mc-search-field{position:relative;flex-basis:100%}.mc-search-clear{position:absolute;right:7px;bottom:6px;width:33px;height:33px;padding:0;border:0;border-radius:11px;background:var(--panel2);color:var(--text);font-size:22px}.mc-search-field input{padding-right:43px}.mc-search-field #search::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}.mc-filter-toggle{display:none}.mc-quick-status{display:flex;align-items:center;gap:8px;min-width:0;overflow-x:auto;margin:0 0 16px;padding:2px 0 5px;scrollbar-width:none}.mc-status-pill{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;min-height:41px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--muted);font-size:12px;font-weight:750;white-space:nowrap}.mc-status-pill b{min-width:20px;line-height:20px;text-align:center;border-radius:6px;background:var(--panel2);font-size:11px}.mc-status-pill.active{color:var(--text);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.game-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.game-grid.list{grid-template-columns:1fr}.game-card{display:grid;grid-template-columns:92px minmax(0,1fr);min-height:180px;border:1px solid var(--line);border-radius:18px;background:var(--panel);cursor:pointer;overflow:hidden}.game-grid:not(.list) .game-card{grid-template-columns:1fr}.cover{background:color-mix(in srgb,var(--accent) 10%,var(--panel));display:flex;justify-content:center;align-items:center;color:var(--muted);font-size:24px;font-weight:800;min-height:100px}.game-body{padding:14px;min-width:0}.game-body h3{margin:5px 0;font-size:17px;overflow-wrap:anywhere}.game-card-kicker{font-size:10px;letter-spacing:.04em;color:var(--muted)}.chips{display:flex;flex-wrap:wrap;gap:5px}.chip{padding:5px 7px;border:1px solid var(--line);border-radius:999px;font-size:11px;background:var(--panel2)}.success{color:var(--success)}.stars-chip{color:var(--star)}.mc-card-edit{padding:10px 14px;margin-top:12px;border:1px solid var(--line);border-radius:11px;background:var(--panel2);color:var(--text);min-height:44px;font-size:12px}.empty{padding:24px 18px;border:1px dashed var(--line);border-radius:16px;background:var(--panel);font-size:14px;line-height:1.6;text-align:center;overflow-wrap:anywhere;color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:14px}.panel h3{margin-top:0}.v16-detail{padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:18px;margin-bottom:14px}.v16-detail-copy h1{font-size:30px}.v16-notes{line-height:1.5}.modal-backdrop{position:fixed;inset:0;background:var(--overlay);z-index:100;display:grid;place-items:center;padding:12px}.modal{background:var(--panel);border-radius:18px;padding:20px;width:min(550px,100%)}.modal input,.modal textarea{width:100%;min-height:44px;background:var(--field);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:12px;margin:8px 0}.mobile-nav{position:fixed;left:0;right:0;bottom:0;z-index:60;min-height:68px;border-top:1px solid var(--line);background:var(--bg);display:flex;justify-content:space-around;padding:8px}.mobile-nav button{min-height:44px;border:0;background:transparent;color:var(--muted);font-size:12px}.mobile-nav button.active{color:var(--accent);font-weight:800}.mc-filter-count[hidden],[hidden]{display:none!important}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:900px){.toolbar .field{min-width:0;flex-basis:calc(50% - 4px)}.toolbar .mc-search-field{flex-basis:100%}.toolbar:not(.mc-filters-open)>.field:not(.mc-search-field){display:none}.mc-filter-toggle{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;width:100%;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:8px 12px;font-size:12px}.mc-filter-toggle::after{content:'⌄';margin-left:6px}.game-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mc-status-pill{min-height:44px}}
'''
SCRIPT = r'''
const PLATFORMS=[{id:'PS5',name:'PlayStation 5',abbr:'PS5'},{id:'PC',name:'PC (Windows / Linux / SteamOS)',abbr:'PC'},{id:'VR',name:'VR / Virtual Reality',abbr:'VR'},{id:'VITA',name:'PlayStation Vita',abbr:'Vita'},{id:'EMPTY',name:'Без игр',abbr:'Empty'}];
const state={view:'games',platformFilter:'',statusFilter:'all',search:'',gameDetailId:'',modal:null,settings:{language:'ru',userId:'fixture-user',reducedMotion:false},games:Array.from({length:64},(_,i)=>({id:'g'+i,title:['Astro','Adventure','Puzzle','Story'][i%4]+' '+String(i+1).padStart(2,'0'),platform:PLATFORMS[i%4].id,status:['completed','playing','dropped'][i%3],rating:String((i%6)+5),notes:'Моя запись об игре.'}))};
window.originalData=JSON.stringify(state.games);let renderCount=0,persistCount=0,sortMode='title-asc',viewMode='list';
const esc=x=>String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const platform=id=>PLATFORMS.find(p=>p.id===id)||{id,name:id,abbr:id};
const statusLabel=s=>({all:'Все',completed:'Пройдено',playing:'Играю',dropped:'Брошено',backlog:'Хочу пройти'})[s]||s;
function safeImage(x){return x||''}function coverMarkup(g){return '<div class="cover">'+esc(g.platform)+'</div>'}
function navigate(view){state.view=view;state.platformFilter='';state.collectionId='';state.franchiseName='';state.gameDetailId='';render();return 'native-navigation-result'}
function openGame(id){state.view='gameDetail';state.gameDetailId=id;state.modal=null;render();scrollTo(0,0)}
function openEdit(id){state.modal={game:{...state.games.find(g=>g.id===id)},type:'edit'};render()}
function render(){renderCount++;let content='';if(state.view==='games'){
 const games=state.games.filter(g=>(!state.platformFilter||g.platform===state.platformFilter)&&(state.statusFilter==='all'||g.status===state.statusFilter));
 if(sortMode==='title-desc')games.reverse();
 content=`<div class="section-head"><h2>${state.platformFilter?esc(platform(state.platformFilter).name):'Игры'}</h2><p>${games.length} записей</p></div><div class="toolbar"><div class="field"><label for="search">Поиск</label><input id="search" type="search" value="${esc(state.search)}" placeholder="Название игры…" autocomplete="off"></div><div class="field"><label>Статус</label><select id="statusFilter">${['all','completed','playing','dropped','backlog'].map(s=>`<option value="${s}" ${s===state.statusFilter?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></div><div class="field"><label>Платформа</label><select id="platformFilter"><option value="">Все</option>${PLATFORMS.map(p=>`<option value="${p.id}" ${p.id===state.platformFilter?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="field games-sort-field"><label>Сортировка</label><select id="gamesSort"><option value="title-asc" ${sortMode==='title-asc'?'selected':''}>По названию</option><option value="title-desc" ${sortMode==='title-desc'?'selected':''}>В обратном порядке</option></select></div><div class="field games-view-field"><label>Вид</label><select id="gamesView"><option value="list" ${viewMode==='list'?'selected':''}>Список</option><option value="grid" ${viewMode==='grid'?'selected':''}>Сетка</option></select></div></div>`;
 content+=games.length?`<div class="game-grid ${viewMode==='list'?'list':''}">${games.map(g=>`<article class="game-card" data-game="${g.id}">${coverMarkup(g)}<div class="game-body"><div class="game-card-kicker">${esc(platform(g.platform).name)}</div><h3>${esc(g.title)}</h3><div class="chips"><span class="chip ${g.status==='completed'?'success':''}">${statusLabel(g.status)}</span><span class="chip stars-chip">★ ${g.rating}/10</span></div><button class="mc-card-edit" data-mc-card-edit="${g.id}">Изменить</button></div></article>`).join('')}</div>`:'<div class="empty">Ничего не найдено.</div>';
 }else if(state.view==='gameDetail'){const g=state.games.find(g=>g.id===state.gameDetailId);content=`<section class="v16-detail"><button class="ghost" data-v16-detail-back>Назад</button><div class="v16-detail-copy"><h1>${esc(g.title)}</h1><button class="primary" data-action="edit" data-id="${g.id}">Редактировать</button></div></section><section class="panel"><h3>Моя запись</h3><p class="v16-notes">${esc(g.notes)}</p></section>`;
 }else if(state.view==='home'){content='<div class="section-head"><h2>Платформы</h2></div><section class="panel"><button class="secondary" data-platform="VR">VR</button><button class="secondary" data-platform="PC">PC</button></section>';
 }else if(state.view==='settings'){content='<div class="section-head"><h2>Настройки</h2></div><section class="panel"><p>Настройки тестового профиля</p></section>';
 }else{content='<div class="section-head"><h2>Статистика</h2></div><section class="panel"><h3>Игровая коллекция</h3><p>Тестовый экран</p></section>';}
 document.querySelector('#app').innerHTML=`<div class="shell"><header class="topbar"><span class="brand">Memory Card</span><button class="primary" data-add>+</button></header><main class="content">${content}</main></div><nav class="mobile-nav">${[['home','Главная'],['games','Игры'],['stats','Статистика'],['settings','Настройки']].map(([v,t])=>`<button data-nav="${v}" class="${v===state.view?'active':''}">${t}</button>`).join('')}</nav>${state.modal?`<div class="modal-backdrop"><form id="gameForm" class="modal"><h2>Запись об игре</h2><input name="title" value="${esc(state.modal.game.title)}"><textarea name="notes">${esc(state.modal.game.notes)}</textarea><button class="secondary" data-close type="button">Закрыть</button><button class="primary" type="submit">Сохранить</button></form></div>`:''}`;
 document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
 document.querySelectorAll('[data-platform]').forEach(b=>b.onclick=()=>{state.platformFilter=b.dataset.platform;state.view='games';render()});
 document.querySelectorAll('[data-game]').forEach(c=>c.onclick=e=>{if(!e.target.closest('button'))openGame(c.dataset.game)});
 document.querySelectorAll('[data-mc-card-edit]').forEach(b=>b.onclick=()=>openEdit(b.dataset.mcCardEdit));
 document.querySelectorAll('[data-action=edit]').forEach(b=>b.onclick=()=>openEdit(b.dataset.id));
 const s=document.querySelector('#search');if(s)s.oninput=e=>state.search=e.target.value;
 const sf=document.querySelector('#statusFilter');if(sf)sf.onchange=e=>{state.statusFilter=e.target.value;render()};
 const pf=document.querySelector('#platformFilter');if(pf)pf.onchange=e=>{state.platformFilter=e.target.value;render()};
 const sort=document.querySelector('#gamesSort');if(sort)sort.onchange=e=>{sortMode=e.target.value;render()};
 const view=document.querySelector('#gamesView');if(view)view.onchange=e=>{viewMode=e.target.value;render()};
 document.querySelector('[data-close]')?.addEventListener('click',()=>{state.modal=null;render()});
 return 'native-render-result';}
'''
MODULES=['title-search-helper.js','game-detail-history-v22.js','library-ux-v63.js','experience-v66.js','memory-companion-v68.js']

def load(page,theme):
    style=CSS+(ROOT/'experience-v66.css').read_text()+(ROOT/'memory-companion-v68.css').read_text()+(ROOT/'library-context-v69.css').read_text()
    html=f'<html data-theme="{theme}" lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>{style}</style></head><body><div id="app"></div><script>{SCRIPT}</script>'
    html+=''.join('<script>'+ (ROOT/p).read_text()+'</script>' for p in MODULES)
    html+='<script>render()</script></body></html>'
    page.set_content(html,wait_until='domcontentloaded');settle(page)

def settle(page,n=6):
    page.evaluate('(n)=>new Promise(resolve=>{const step=()=>--n<=0?resolve():requestAnimationFrame(step);requestAnimationFrame(step)})',n)

def filters(page,platform='PS5',status='completed',query='Astro'):
    page.evaluate('({p,s,q})=>{state.view="games";state.platformFilter=p;state.statusFilter=s;state.search=q;render()}',{'p':platform,'s':status,'q':query});settle(page)

def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), 'horizontal overflow'

def snapshot(page):
    return page.evaluate('({search:state.search,platform:state.platformFilter,status:state.statusFilter,sort:sortMode,view:viewMode})')

reports=[];errors=[];requests=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('MC_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    for width in [int(x) for x in os.environ.get('MC_TEST_WIDTHS','320,360,390,430,768,1440').split(',')]:
        for theme in os.environ.get('MC_TEST_THEMES','dark,light').split(','):
            context=browser.new_context(viewport={'width':width,'height':900})
            page=context.new_page();page.set_default_timeout(4000)
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.on('request',lambda req: requests.append(req.url))
            load(page,theme)
            assert page.locator('.mc-applied-filters').count()==0
            filters(page)
            assert page.locator('[data-mc-clear-filter=platform]').inner_text()=='PS5'
            assert page.locator('[data-mc-clear-filter=search]').inner_text()=='Поиск: Astro'
            assert page.locator('[data-mc-filter-count]').text_content()=='3'
            assert page.locator('.mc-status-pill[aria-pressed=true]').get_attribute('data-mc-status')=='completed'
            assert page.locator('[data-mc-filters] > .mc-icon').count()==1
            assert page.locator('[data-mc-filters]').text_content().count('3')==1,'duplicate count from legacy icon decoration'
            for _ in range(5):page.evaluate("document.dispatchEvent(new Event('mc:experience-ready'))")
            settle(page)
            assert page.locator('.mc-applied-filters').count()==1
            assert page.locator('[data-mc-clear-filter=platform]').count()==1
            if width<=900:
                assert page.locator('[data-mc-clear-filter=platform]').bounding_box()['height']>=44
                assert not page.locator('#platformFilter').is_visible()
            no_overflow(page)
            if width==390:page.screenshot(path=str(OUT/f'filters-{theme}.png'))
            # Removing one filter leaves every other criterion intact.
            page.locator('[data-mc-clear-filter=platform]').click();settle(page)
            assert snapshot(page)=={'search':'Astro','platform':'','status':'completed','sort':'title-asc','view':'list'}
            assert page.locator('.mc-status-pill[aria-pressed=true]').evaluate('e=>e===document.activeElement')
            before=page.evaluate('renderCount')
            page.locator('[data-mc-clear-filter=search]').click();settle(page)
            assert page.evaluate('renderCount')==before,'query removal redrew app'
            assert snapshot(page)['search']==''
            assert page.locator('#search').evaluate('e=>e===document.activeElement')
            assert page.locator('[data-mc-filter-count]').text_content()=='1'
            page.locator('.mc-applied-filters [data-mc-clear-filter=all]').click();settle(page)
            assert snapshot(page)['status']=='all'
            assert page.locator('.mc-applied-filters').count()==0
            assert page.locator('[data-mc-filter-count]').is_hidden()
            # Search typing updates summary without replacing input/card nodes.
            page.evaluate('window.inputBefore=document.querySelector("#search");window.cardBefore=document.querySelector(".game-card")')
            before=page.evaluate('renderCount')
            page.locator('#search').fill('no such title');settle(page)
            assert page.evaluate('renderCount')==before
            assert page.evaluate('inputBefore===document.querySelector("#search") && cardBefore===document.querySelector(".game-card")')
            assert page.locator('.title-search-empty [data-mc-empty-reset]').count()==1
            assert page.locator('.title-search-empty .mc-companion').count()==1
            if width==390:page.screenshot(path=str(OUT/f'empty-{theme}.png'))
            page.locator('[data-mc-empty-reset]').click();settle(page)
            assert snapshot(page)['search']==''
            assert page.locator('.game-card:visible').count()==64
            # Escape clears library search only; it doesn't touch an editing form.
            page.locator('#search').fill('Astro');settle(page);before=page.evaluate('renderCount')
            page.locator('#search').press('Escape');settle(page)
            assert page.locator('#search').input_value()=='' and page.evaluate('renderCount')==before
            page.evaluate("openEdit('g0')");settle(page)
            page.locator('#gameForm textarea').fill('Черновик — не трогать')
            page.locator('#gameForm textarea').press('Escape');settle(page)
            assert page.locator('#gameForm textarea').input_value()=='Черновик — не трогать'
            page.locator('[data-close]').click();settle(page)
            # Native core choice with no records also gets an escape hatch.
            filters(page,platform='EMPTY',status='playing',query='Anything')
            assert page.locator('.content > .empty [data-mc-empty-reset]').count()==1
            page.locator('[data-mc-empty-reset]').click();settle(page)
            assert page.locator('.game-card:visible').count()==64
            # Reset preserves deliberately selected display/sort preferences.
            page.evaluate("viewMode='grid';sortMode='title-desc'");filters(page)
            page.locator('.mc-applied-filters [data-mc-clear-filter=all]').click();settle(page)
            assert snapshot(page)['sort']=='title-desc' and snapshot(page)['view']=='grid'
            # Long values are safe text and fit at every width.
            query='<img src=x onerror="window.INJECTED=1"> ' + 'оченьдлинноебезпробелов'*15
            page.locator('#search').fill(query);settle(page)
            assert page.locator('.mc-applied-filters img').count()==0
            assert page.locator('[data-mc-clear-filter=search]').get_attribute('title')=='Поиск: '+query
            assert not page.evaluate('Boolean(window.INJECTED)')
            no_overflow(page)
            page.evaluate("PLATFORMS[0].abbr='ОченьДлиннаяПлатформа'.repeat(10);state.search='';state.platformFilter='PS5';render()");settle(page)
            no_overflow(page)
            # The page lifetime return keeps query/filter and the same visible card.
            page.evaluate("PLATFORMS[0].abbr='PS5';viewMode='list';sortMode='title-asc'")
            filters(page,platform='PC',status='all',query='Adventure')
            page.evaluate('scrollTo(0,900)');settle(page)
            old=page.evaluate('({y:scrollY,search:state.search,platform:state.platformFilter,status:state.statusFilter})')
            assert old['y']>500
            page.locator('.mobile-nav [data-nav=stats]').click();settle(page)
            assert page.locator('#search').count()==0
            page.locator('.mobile-nav [data-nav=games]').click();settle(page)
            assert snapshot(page)['search']==old['search'] and snapshot(page)['platform']==old['platform']
            assert abs(page.evaluate('scrollY')-old['y'])<5, (page.evaluate('scrollY'),old)
            # Returning from detail continues to use the pre-existing v22 Back action.
            page.locator('[data-game=g17] h3').click();settle(page)
            assert page.evaluate('state.view')=='gameDetail'
            page.locator('[data-v16-detail-back]').click();settle(page)
            assert snapshot(page)['platform']=='PC' and snapshot(page)['search']=='Adventure'
            # Intentional platform tile navigation overrides any saved library context.
            page.locator('.mobile-nav [data-nav=home]').click();settle(page)
            page.locator('[data-platform=VR]').click();settle(page)
            assert snapshot(page)['platform']=='VR'
            assert page.locator('[data-mc-clear-filter=platform]').inner_text()=='VR'
            # Language and keyboard focus.
            page.evaluate("state.settings.language='en'");filters(page)
            assert page.locator('[data-mc-clear-filter=search]').inner_text()=='Search: Astro'
            assert page.locator('.mc-reset-filters').inner_text()=='Reset'
            # Original data remains unchanged throughout all navigational changes.
            assert page.evaluate('JSON.stringify(state.games)===window.originalData')
            assert page.evaluate('persistCount')==0
            reports.append({'width':width,'theme':theme,'individualReset':True,'resetAll':True,'inputPreserved':True,'nativeBackPreserved':True,'scrollReturn':True,'emptyRecovery':True,'i18n':True,'overflow':False})
            context.close();print('PASS',width,theme,flush=True)
    # Focused race/cancellation checks in a fresh tab.
    context=browser.new_context(viewport={'width':390,'height':900});page=context.new_page();page.set_default_timeout(4000)
    page.on('pageerror',lambda error:errors.append(str(error)));load(page,'dark')
    filters(page,platform='PC',status='all',query='Adventure');page.evaluate('scrollTo(0,900)');settle(page)
    page.evaluate("navigate('stats')");settle(page)
    result=page.evaluate("()=>{const result=navigate('games');document.dispatchEvent(new WheelEvent('wheel',{deltaY:100}));scrollTo(0,0);return result}")
    settle(page)
    assert result=='native-navigation-result' and page.evaluate('scrollY')==0,'return fought new scroll gesture'
    # Changed account cannot restore the previous profile's query/filters.
    filters(page,platform='PC',status='all',query='Adventure');page.evaluate("navigate('stats');state.settings.userId='another-user';state.search='';state.statusFilter='all';navigate('games')");settle(page)
    assert snapshot(page)['platform']=='' and snapshot(page)['search']==''
    # Detached/removed anchor is handled without crashing.
    filters(page,platform='PC',status='all',query='Adventure');page.evaluate("scrollTo(0,900)");settle(page)
    page.evaluate("navigate('stats');state.games=state.games.filter(g=>g.platform!=='PC');navigate('games')");settle(page)
    assert page.locator('.content > .empty [data-mc-empty-reset]').count()==1
    # Composition Escape and modal backing library must not be reset.
    page.locator('[data-mc-empty-reset]').click();settle(page)
    page.locator('#search').fill('Astro');page.locator('#search').dispatch_event('keydown',{'key':'Escape','isComposing':True});settle(page)
    assert page.locator('#search').input_value()=='Astro'
    page.evaluate("openEdit('g0')");settle(page)
    page.evaluate("document.querySelector('[data-mc-clear-filter=all]').click()");settle(page)
    assert page.evaluate('state.search')=='Astro' and page.locator('#gameForm').count()==1
    context.close();browser.close()
assert not errors,errors
assert not requests,requests
report={'configurations':reports,'pageErrors':errors,'networkRequests':requests,'raceChecks':['return-scroll cancelled by new user input','account identity change discards context','missing anchor','IME Escape','open form not reset'],'limit':'Local component fixtures with simulated app router/data, not authenticated production or installed Android PWA.'}
(OUT/('results-'+os.environ.get('MC_TEST_WIDTHS','all').replace(',','-')+'-'+os.environ.get('MC_TEST_THEMES','both').replace(',','-')+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(reports),'errors':errors,'requests':requests},ensure_ascii=False))
