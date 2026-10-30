"""Exercise the real Backlog module in Chromium DOM/style fixtures.
The base router, storage and games are test doubles. No production account or network.
Run: MC_CHROMIUM=/usr/bin/chromium python tests/test_v73.py
"""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'tests/artifacts-v73';OUT.mkdir(exist_ok=True)
CSS='''
*{box-sizing:border-box}:root{font-family:system-ui,sans-serif;--bg:#09111f;--panel:#111b31;--panel2:#1c233d;--field:#141d34;--line:#294064;--text:#f7f8ff;--muted:#a9b9d4;--accent:#a48df2;--accentText:#fff;--success:#5ee6a8;--star:#ffd05a;--shadow:0 20px 45px #0004}
html[data-theme=light]{--bg:#f4f4ff;--panel:#fff;--panel2:#f0f1ff;--field:#fafaff;--line:#d9ddf3;--text:#17152a;--muted:#6f7391;--accent:#6d4aff}
body{margin:0;background:var(--bg);color:var(--text)}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}[hidden]{display:none!important}.shell{max-width:1140px;margin:auto;padding:18px 14px 90px}.topbar{display:flex;justify-content:space-between;align-items:center;margin:6px 0 24px}.brand{font-weight:800;font-size:23px;color:var(--accent)}.primary,.secondary,.ghost{border:1px solid var(--line);border-radius:12px;background:var(--panel2);color:var(--text);padding:11px 14px;min-height:44px;font-weight:750}.primary{background:var(--accent);color:white}.ghost{background:transparent}.compact{font-size:12px}.section-head h2{margin:0 0 8px;font-size:27px}.section-head p{margin:0 0 20px;font-size:14px;line-height:1.5;color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;min-width:0}.content{min-width:0}.device-icon{display:inline-flex;width:36px;height:25px;align-items:center;justify-content:center;flex:none}.device-icon svg{width:100%;height:100%;fill:currentColor}.device-icon .screen{fill:var(--panel)}.v16-backlog-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.v16-backlog-card{display:grid;grid-template-columns:82px minmax(0,1fr);gap:14px;align-items:start;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px;min-width:0}.v16-backlog-card h3{margin:8px 0;font-size:17px;line-height:1.25;overflow-wrap:anywhere}.v16-backlog-cover{width:82px;height:115px;border-radius:9px;background:var(--panel2);display:grid;place-items:center;font-size:19px;color:var(--muted)}.v16-card-actions{display:flex;flex-wrap:wrap;gap:8px}.v16-platform-pill{font-size:11px;color:var(--muted);border:1px solid var(--line);padding:5px 7px;border-radius:8px}.empty{padding:24px 16px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:16px;font-size:14px;line-height:1.5}.mobile-nav{position:fixed;bottom:0;left:0;right:0;background:var(--bg);border-top:1px solid var(--line);min-height:66px;display:flex;justify-content:space-around;align-items:center;z-index:60}.mobile-nav button{color:var(--muted);font-size:12px;border:0;background:none;min-height:44px}.mobile-nav button.active{color:var(--accent);font-weight:800}.test-detail{padding:20px}.test-detail h1{overflow-wrap:anywhere}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.v23-search input{outline:none}
@media(max-width:760px){.v16-backlog-grid{grid-template-columns:1fr}}
'''
BASE=r'''
const storage=new Map();let writes=0,saveCalls=0,syncCalls=0,renderCalls=0,openCalls=[];
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{writes++;storage.set(k,String(v))}}});
const state={view:'backlog',settings:{userId:'test-user',language:'ru',ownedPlatforms:['PS5','PC','VR']},modal:null,games:[
{id:'a',title:'Astro Bot',platform:'PS5',status:'backlog',releaseYear:'2024',genre:'Platformer'},
{id:'r',title:'Returnal',platform:'PS5',status:'backlog',releaseYear:'2021',genre:'Action'},
{id:'b',title:'Sackboy: A Big Adventure',platform:'PS5',status:'backlog',releaseYear:'2020',genre:'Platformer'},
{id:'p',title:'Portal 2',platform:'PC',status:'backlog',releaseYear:'2011',genre:'Puzzle'},
{id:'h',title:'Half-Life 2',platform:'PC',status:'backlog',releaseYear:'2004',genre:'Action'},
{id:'v',title:'Beat Saber',platform:'VR',status:'backlog',releaseYear:'2019',genre:'Rhythm'},
{id:'old',title:'Astro old',platform:'PS5',status:'backlog',deletedAt:'2026-01-01'},
{id:'done',title:'Astro completed',platform:'PS5',status:'completed'},
{id:'now',title:'Astro playing',platform:'PS5',status:'playing'},
{id:'drop',title:'Astro dropped',platform:'PS5',status:'dropped'}]};
const PLATFORMS=[{id:'PS5',name:'PlayStation 5',abbr:'PS5'},{id:'PC',name:'PC (Windows / Linux / SteamOS)',abbr:'PC'},{id:'VR',name:'VR / Virtual Reality',abbr:'VR'}];
const platform=id=>PLATFORMS.find(p=>p.id===id)||{id,name:id,abbr:id};
const mcOwnedPlatforms=()=>state.settings.ownedPlatforms;
const migrateGame=g=>({...g});
const catalogSearch=(p,q)=>[{title:'A catalog suggestion',platform:p,releaseYear:'2025'}];
const esc=x=>String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function platformIcon(){return '<span class="device-icon"><svg viewBox="0 0 72 44" aria-hidden="true"><rect x="9" y="8" width="54" height="28" rx="5"/><rect class="screen" x="19" y="13" width="34" height="17" rx="2"/></svg></span>'}
function safeImage(){return ''}function coverMarkup(g,cls){return `<div class="${cls}">${esc(g.platform)}</div>`}
const nowIso=()=>new Date().toISOString();const persist=async()=>{saveCalls++};const scheduleAutoSync=()=>{syncCalls++};
function setToast(){}async function fetchCoverForGame(){return null}
function renderView(){return `<section class="test-detail"><h1>${esc(state.games.find(g=>g.id===state.gameDetailId)?.title||'Страница игры')}</h1><button class="secondary" data-back>В Backlog</button></section>`}
function render(){renderCalls++;document.querySelector('#app').innerHTML=`<div class="shell"><header class="topbar"><span class="brand">Memory Card</span><button class="primary">+</button></header><main class="content">${renderView()}</main></div><nav class="mobile-nav"><button>Главная</button><button>Сейчас</button><button class="active">Игры</button><button>Статистика</button><button>Ещё</button></nav>`;document.querySelector('[data-back]')?.addEventListener('click',()=>{state.view='backlog';render()});}
function openGame(id){openCalls.push(id);state.gameDetailId=id;state.view='gameDetail';render()}
'''
def setup(page,theme):
    styles=CSS+(ROOT/'backlog-v23.css').read_text()+(ROOT/'experience-v66.css').read_text()+(ROOT/'memory-companion-v68.css').read_text()
    mods=''.join('<script>'+ (ROOT/n).read_text()+'</script>' for n in ['backlog-v23.js','experience-v66.js','memory-companion-v68.js'])
    page.set_content(f'<html data-theme="{theme}" lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>{styles}</style></head><body><div id="app"></div><script>{BASE}</script>{mods}<script>render()</script></body></html>',wait_until='domcontentloaded')
    settle(page)
def settle(page):
    page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
def chosen(page):return page.locator('[data-v23-draw-open]').get_attribute('data-v23-draw-open')
def filter_to(page,p):page.locator(f'[data-v23-filter="{p}"]').click();settle(page)
def no_overflow(page):assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
errors=[];requests=[];reports=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('MC_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    for width in map(int,os.environ.get('MC_WIDTHS','320,360,390,430,768,1440').split(',')):
      for theme in ['dark','light']:
        context=browser.new_context(viewport={'width':width,'height':1000});page=context.new_page();page.set_default_timeout(3000)
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
        setup(page,theme)
        assert page.locator('[data-v23-draw-result]').is_hidden()
        assert page.locator('[data-v23-backlog-card]').count()==3
        page.locator('[data-v23-title]').fill('Мой черновик — не трогать')
        page.evaluate('window.draftNode=document.querySelector("[data-v23-title]");window.searchNode=document.querySelector("[data-v23-search]");window.cardsNode=document.querySelector("[data-v23-results]");window.before=JSON.stringify(state.games);window.beforeCounts=[writes,saveCalls,syncCalls,renderCalls];')
        assert page.locator('[data-v23-suggestions]').count()==1
        sequence=[]
        for _ in range(10):
          page.locator('[data-v23-draw]').click();sequence.append(chosen(page))
        assert page.locator('[data-v23-suggestions]').count()==0
        assert set(sequence)<=set(['a','r','b']) and all(a!=b for a,b in zip(sequence,sequence[1:])),sequence
        assert page.evaluate('JSON.stringify(state.games)===before')
        assert page.evaluate('JSON.stringify([writes,saveCalls,syncCalls,renderCalls])===JSON.stringify(beforeCounts)')
        assert page.evaluate('draftNode===document.querySelector("[data-v23-title]") && searchNode===document.querySelector("[data-v23-search]") && cardsNode===document.querySelector("[data-v23-results]")')
        assert page.locator('[data-v23-title]').input_value()=='Мой черновик — не трогать'
        assert page.locator('[data-v23-draw]').evaluate('e=>e===document.activeElement')
        assert page.locator('[data-v23-draw-message]').get_attribute('aria-live')=='polite'
        assert page.locator('[data-v23-draw-message] button').count()==0
        no_overflow(page)
        if width in [390,1440]:
          page.locator('.v23-backlog-list').screenshot(path=str(OUT/f'pick-{width}-{theme}.png'))
        for n in ['[data-v23-draw]','[data-v23-draw-open]','[data-v23-draw-dismiss]']:
          assert page.locator(n).bounding_box()['height']>=44
        current=chosen(page);page.evaluate('render()');settle(page)
        assert chosen(page)==current,'ordinary render re-picked'
        page.locator('[data-v23-draw-dismiss]').click()
        assert page.locator('[data-v23-draw-result]').is_hidden()
        assert page.locator('[data-v23-draw]').evaluate('e=>e===document.activeElement')
        filter_to(page,'PC');assert page.locator('[data-v23-draw-result]').is_hidden()
        for _ in range(4):page.locator('[data-v23-draw]').click();assert chosen(page) in ['p','h']
        page.locator('[data-v23-search]').fill('Portal');settle(page)
        assert page.locator('[data-v23-draw-result]').is_hidden()
        page.locator('[data-v23-draw]').click();assert chosen(page)=='p'
        page.locator('[data-v23-draw]').click();assert chosen(page)=='p'
        assert 'Единственная' in page.locator('[data-v23-draw-message]').inner_text()
        page.locator('[data-v23-search]').fill('ZZZnothere');settle(page)
        assert page.locator('[data-v23-draw]').is_disabled() and page.locator('[data-v23-draw-result]').is_hidden()
        page.locator('[data-v23-search]').fill('');filter_to(page,'ALL')
        # Exact visible-set scope, including all platforms; no completed/playing/deleted.
        for _ in range(12):page.locator('[data-v23-draw]').click();assert chosen(page) in ['a','r','b','p','h','v']
        filter_to(page,'VR');page.locator('[data-v23-draw]').click();assert chosen(page)=='v'
        # Explicit open only; returning keeps the separate add-form draft.
        page.locator('[data-v23-draw-open]').click();assert page.evaluate('openCalls')==['v']
        page.locator('[data-back]').click();settle(page)
        assert page.locator('[data-v23-title]').input_value()=='Мой черновик — не трогать'
        assert chosen(page)=='v'
        # A stale suggestion must never open a deleted/completed record.
        page.evaluate("state.games.find(g=>g.id==='v').status='completed'")
        page.locator('[data-v23-draw-open]').click()
        assert page.evaluate('openCalls')==['v'] and page.locator('[data-v23-draw-result]').is_hidden()
        assert page.locator('[data-v23-draw]').is_disabled()
        page.evaluate("state.games.find(g=>g.id==='v').status='backlog'");filter_to(page,'ALL')
        page.locator('[data-v23-draw]').click()
        page.evaluate("state.settings.userId='another-user'")
        page.locator('[data-v23-draw-open]').click()
        assert page.evaluate('openCalls')==['v'] and page.locator('[data-v23-draw-result]').is_hidden()
        # No duplicate controls; HTML-like and very long titles remain safe text.
        payload='<img src=x onerror=alert(1)> '+ 'Оченьдлинноеназвание'*25
        page.evaluate('(title)=>{state.games=[{id:"unsafe",title,platform:"VR",status:"backlog"}];render()}',payload);settle(page)
        filter_to(page,'VR');page.locator('[data-v23-draw]').click()
        assert page.locator('[data-v23-draw-message] img').count()==0
        assert payload in page.locator('[data-v23-draw-message]').inner_text()
        no_overflow(page)
        for _ in range(5):page.evaluate("document.dispatchEvent(new Event('mc:experience-ready'))")
        settle(page);assert page.locator('[data-v23-draw]').count()==1
        assert page.locator('[data-v23-draw-result]').count()==1
        # Keyboard and English controls; reduced motion has no new animation.
        page.evaluate("state.settings.language='en';render()");settle(page)
        assert page.locator('[data-v23-draw]').inner_text()=='Pick for me'
        page.locator('[data-v23-draw]').focus();page.keyboard.press('Enter')
        assert 'Picked:' in page.locator('[data-v23-draw-message]').inner_text()
        page.locator('[data-v23-draw-dismiss]').focus();page.keyboard.press('Space')
        assert page.locator('[data-v23-draw-result]').is_hidden()
        page.locator('[data-v23-draw]').click()
        page.emulate_media(reduced_motion='reduce');page.evaluate("state.settings.reducedMotion=true;document.documentElement.classList.add('mc-reduced-motion')")
        assert page.locator('[data-v23-draw-result]').evaluate('e=>e.getAnimations({subtree:true}).length')==0
        # Guard scripted clicks through an open form/dialog.
        page.evaluate("state.modal={type:'edit'};document.querySelector('[data-v23-draw-open]').click()")
        assert page.evaluate('openCalls')==['v']
        page.evaluate("state.modal=null;const d=document.createElement('dialog');d.innerHTML='<button>Dialog</button>';document.body.appendChild(d);d.showModal();document.querySelector('[data-v23-draw-open]').click()")
        assert page.evaluate('openCalls')==['v']
        page.evaluate("document.querySelector('dialog').remove();state.games=[];render()");settle(page)
        assert page.locator('[data-v23-draw]').is_disabled() and page.locator('[data-v23-draw-result]').is_hidden()
        assert page.evaluate('saveCalls')==0 and page.evaluate('syncCalls')==0
        reports.append({'width':width,'theme':theme,'filterScope':True,'noImmediateRepeat':True,'draftNodesPreserved':True,'noRenderForPick':True,'noWritesForPick':True,'staleGuard':True,'keyboard':True,'overflow':False})
        print('PASS',width,theme,flush=True);context.close()
    browser.close()
assert not errors,errors
assert not requests,requests
(OUT/('results-'+os.environ.get('MC_WIDTHS','all').replace(',','-')+'.json')).write_text(json.dumps({'cases':reports,'pageErrors':errors,'networkRequests':requests,'limits':'Actual backlog/experience/companion modules, representative base DOM/styles and simulated router/storage. Not a signed-in app or installed Android PWA.'},ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(reports),'errors':errors,'requests':requests}))
