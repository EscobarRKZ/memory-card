"""v68 browser component fixtures (not a signed-in/live-origin app).
Run from the repo with Python Playwright and Chromium installed.
MC_CHROMIUM=/usr/bin/chromium python tests/test_v68.py
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests' / 'artifacts-v68'
OUT.mkdir(parents=True, exist_ok=True)
CSS = r'''
*{box-sizing:border-box}:root{font-family:system-ui,sans-serif;--bg:#09111f;--panel:#111b31;--panel2:#1c233d;--field:#141d34;--line:#294064;--text:#f7f8ff;--muted:#a9b9d4;--accent:#a48df2;--success:#5ee6a8;--star:#ffd05a}
html[data-theme=light]{--bg:#f4f4ff;--panel:#fff;--panel2:#f0f1ff;--field:#fafaff;--line:#d9ddf3;--text:#17152a;--muted:#6f7391;--accent:#6d4aff;--success:#168a59;--star:#d99200}
body{margin:0;background:var(--bg);color:var(--text)}button,input{font:inherit}button{cursor:pointer}.shell{max-width:980px;margin:auto;padding:18px 14px 94px}.topbar{display:flex;justify-content:space-between;align-items:center;padding:8px 0 22px}.brand{font-weight:800;font-size:22px;color:var(--accent)}.primary,.secondary{color:var(--text);border:1px solid var(--line);border-radius:12px;background:var(--panel2);padding:11px 14px;min-height:44px}.primary{background:var(--accent);color:white}.content{min-width:0}.section-head h2{font-size:27px;letter-spacing:-.025em;margin:0 0 8px}.section-head p{margin:0 0 22px;color:var(--muted);line-height:1.5;font-size:14px}.panel{padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:18px;margin-bottom:14px;min-width:0}.panel h3{margin:0 0 15px;font-size:18px}input{width:100%;min-width:0;min-height:46px;padding:12px;background:var(--field);color:var(--text);border:1px solid var(--line);border-radius:12px;font-size:16px;outline:none;margin-bottom:15px}input:focus{border-color:var(--accent)}
.empty{padding:24px 18px;border:1px dashed color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:16px;background:color-mix(in srgb,var(--accent) 3%,var(--panel));font-size:14px;line-height:1.6;overflow-wrap:anywhere;text-align:center;color:var(--muted)}#app .empty::before{content:'';display:block;width:28px;height:32px;margin:0 auto 12px;border:2px solid var(--muted);border-radius:7px;pointer-events:none}.empty .secondary{display:block;margin:15px auto 0}.mobile-nav{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-around;align-items:center;min-height:68px;background:var(--bg);color:var(--muted);font-size:11px;border-top:1px solid var(--line)}.mobile-nav span.active{color:var(--accent);font-weight:800}.v16-collection-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.v16-collection-card{display:grid;grid-template-columns:auto 1fr;gap:14px;text-align:left;color:inherit;border:1px solid var(--line);background:var(--panel);border-radius:20px;padding:18px;min-height:145px}.v16-collection-icon{font-size:32px}.v16-collection-card h3{margin:2px 0;font-size:17px}.v16-collection-card p{color:var(--muted);margin:8px 0;font-size:13px}.v16-cover-stack{display:flex;height:55px;margin-top:10px}.v16-cover-stack img,.v16-cover-stack i{width:40px;height:55px;object-fit:cover;border-radius:5px;border:2px solid var(--panel);margin-left:-9px;background:var(--panel2);display:grid;place-items:center;font-style:normal;font-size:8px}.v16-cover-stack>:first-child{margin-left:0}.playing-view-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}[hidden]{display:none!important}
@media(max-width:760px){.v16-collection-cards,.playing-view-grid{grid-template-columns:1fr}.v16-collection-card{min-height:145px}.section-head h2{font-size:25px}}
'''
SCRIPT=r'''
const state={view:'backlog',settings:{language:'ru',reducedMotion:false},games:[]};
let calls=0;function coverMarkup(){return ''}function safeImage(){return ''}function render(){}
function layout(view,content){state.view=view;document.querySelector('#app').innerHTML=`<div class="shell"><header class="topbar"><div class="brand">Memory Card</div><button class="primary" id="add">+</button></header><main class="content">${content}</main></div><nav class="mobile-nav"><span>Главная</span><span>Сейчас</span><span class="active">Игры</span><span>Статистика</span><span>Ещё</span></nav>`;document.dispatchEvent(new Event('mc:experience-ready'));}
function showGames(){layout('games','<div class="section-head"><h2>Игры</h2><p>Твоя коллекция впечатлений</p></div><input id="search" placeholder="Название игры…"><div class="empty">В библиотеке пока нет игр.<button class="secondary" id="original">Добавить первую игру</button></div>');window.original=document.querySelector('#original');original.onclick=()=>calls++;document.querySelector('#search').oninput=e=>{document.querySelector('.content > .empty,.title-search-empty')?.remove();if(e.target.value){const x=document.createElement('div');x.className='empty title-search-empty';x.textContent='Совпадений нет. Попробуй другое название или сбрось поиск.';document.querySelector('.content').appendChild(x)}};}
function showBacklog(){layout('backlog','<div class="section-head"><h2>Backlog</h2><p>Игры, к которым хочется вернуться</p></div><section class="panel v23-backlog-add"><h3>Добавить игру</h3><div class="empty" id="not-owned">Сначала выбери свои платформы в настройках.</div><form id="v23BacklogForm"><input data-v23-title placeholder="Название игры"></form></section><section class="panel v23-backlog-list"><h3>Хочу пройти</h3><input data-v23-search placeholder="Поиск в Backlog"><div data-v23-results><div class="empty v23-backlog-empty">Backlog пуст. Добавь сюда игры, которые хочешь когда-нибудь начать.</div></div></section>');document.querySelector('[data-v23-search]').oninput=e=>document.querySelector('[data-v23-results]').innerHTML='<div class="empty v23-backlog-empty">'+(e.target.value?'Ничего не найдено по этому запросу.':'Backlog пуст. Добавь сюда игры, которые хочешь когда-нибудь начать.')+'</div>';}
function showCollections(){layout('collections','<div class="section-head"><h2>Коллекции</h2><p>Тематические полки для твоих воспоминаний</p></div><div class="v16-collection-cards"><button class="v16-collection-card" id="album"><span class="v16-collection-icon">💾</span><div><h3>Любимые приключения</h3><p>4 игры</p><div class="v16-cover-stack"><i>PS5</i><i>Vita</i><i>PC</i><i>VR</i></div></div></button><button class="v16-collection-card"><span class="v16-collection-icon">🌙</span><div><h3>На уютный вечер</h3><p>2 игры</p><div class="v16-cover-stack"><i>Wii U</i><i>3DS</i></div></div></button><section class="panel empty">Создай первую коллекцию.</section></div>');document.querySelector('#album').onclick=()=>{calls++;layout('collections','<div class="section-head"><h2>Новая полка</h2></div><section class="panel"><div class="empty">В коллекции пока нет игр. Добавляй их со страницы игры.</div></section>')};}
function showPlaying(){layout('playing','<div class="section-head"><h2>Сейчас играю</h2></div><div class="playing-view-grid"><section class="panel playing-group"><h3>Портативки</h3><div class="empty">Сейчас здесь ничего не запущено.</div></section><section class="panel playing-group"><h3>Desktop</h3><div class="empty">Сейчас здесь ничего не запущено.</div></section></div>');}
'''

def load(page,theme):
    experience=(ROOT/'experience-v66.js').read_text() if (ROOT/'experience-v66.js').exists() else ''
    html=f'<html lang="ru" data-theme="{theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+CSS+(ROOT/'memory-companion-v68.css').read_text()+'</style></head><body><div id="app"></div><script>'+SCRIPT+'</script><script>'+experience+'</script><script>'+(ROOT/'memory-companion-v68.js').read_text()+'</script></body></html>'
    page.set_content(html,wait_until='domcontentloaded')

def settle(page):
    page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), 'page overflows'

results=[]; errors=[]; requests=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('MC_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    for width in [320,360,390,430,768,1440]:
        for theme in ['dark','light']:
            context=browser.new_context(viewport={'width':width,'height':950})
            page=context.new_page();page.set_default_timeout(4000)
            page.on('pageerror',lambda e: errors.append(str(e)))
            page.on('request',lambda req: requests.append(req.url))
            load(page,theme)
            page.evaluate('showGames()');page.wait_for_selector('[data-mood=welcome]')
            assert page.locator('.empty').inner_text()=='В библиотеке пока нет игр.\nДобавить первую игру'
            assert page.evaluate('original===document.querySelector("#original")')
            page.locator('#original').click();assert page.evaluate('calls')==1
            assert page.locator('.mc-companion').get_attribute('aria-hidden')=='true'
            assert page.locator('.mc-companion svg').get_attribute('focusable')=='false'
            assert page.locator('.empty').evaluate("e=>getComputedStyle(e,'::before').display")=='none'
            for _ in range(15):page.evaluate("document.dispatchEvent(new Event('mc:experience-ready'))")
            settle(page);assert page.locator('.mc-companion').count()==1
            page.locator('#search').fill('Несуществующая игра')
            page.wait_for_selector('[data-mood=search]');assert page.locator('#search').evaluate('e=>e===document.activeElement')
            no_overflow(page)
            if width==390:page.screenshot(path=str(OUT/f'search-{theme}.png'))
            page.locator('#search').fill('');settle(page);assert page.locator('.mc-companion').count()==0
            page.evaluate('showBacklog()');page.wait_for_selector('[data-mood=sleepy]')
            assert page.locator('#not-owned .mc-companion').count()==0
            page.locator('[data-v23-title]').fill('Черновик игры — не терять')
            page.locator('[data-v23-search]').fill('нет');page.wait_for_selector('[data-mood=search]')
            assert page.locator('[data-v23-title]').input_value()=='Черновик игры — не терять'
            page.locator('[data-v23-search]').fill('');page.wait_for_selector('[data-mood=sleepy]')
            no_overflow(page)
            if width==390:page.screenshot(path=str(OUT/f'backlog-{theme}.png'))
            page.evaluate('showCollections()');page.wait_for_selector('[data-mood=collection]')
            original_title=page.locator('#album h3').inner_text()
            assert page.locator('#album').evaluate("e=>getComputedStyle(e,'::after').pointerEvents")=='none'
            assert page.locator('#album i').count()==4
            no_overflow(page)
            if width==390:page.screenshot(path=str(OUT/f'albums-{theme}.png'))
            # Long names are preserved and wrap instead of forcing overflow.
            page.locator('#album h3').evaluate("e=>e.textContent='ОченьДлинноеНазваниеКоллекции'.repeat(8)")
            no_overflow(page)
            page.locator('#album').click();page.wait_for_selector('[data-mood=collection]')
            assert page.evaluate('calls')==2
            page.evaluate('showPlaying()');page.wait_for_selector('[data-mood=sleepy]')
            assert page.locator('.mc-companion').count()==2
            no_overflow(page)
            # Warnings, loading states and forms never get a decorative mascot.
            page.evaluate("layout('games', '<div role=alert><div class=empty>Ошибка соединения</div></div><div class=empty role=alert>Ошибка сохранения</div><div class=empty aria-busy=true>Загрузка</div><form><div class=empty>Подсказка формы</div></form>')")
            settle(page);assert page.locator('.mc-companion').count()==0
            # Timeline has an empty-list mascot; a reused node loses it outside scope.
            page.evaluate("layout('timeline','<div class=empty>Добавленные игры появятся здесь автоматически.</div>')")
            page.wait_for_selector('[data-mood=welcome]')
            page.evaluate("state.view='settings';document.dispatchEvent(new Event('mc:experience-ready'))")
            settle(page);assert page.locator('.mc-companion').count()==0
            page.evaluate('showCollections()');page.wait_for_selector('[data-mood=collection]')
            page.emulate_media(reduced_motion='reduce');page.evaluate("document.documentElement.classList.add('mc-reduced-motion')")
            assert page.locator('.mc-companion').evaluate("e=>e.getAnimations({subtree:true}).length") == 0
            # Decorative geometry remains within its designated box.
            assert page.locator('.mc-companion').bounding_box()['width']<=84
            results.append({'width':width,'theme':theme,'moods':4,'buttonAndDraftPreserved':True,'overflow':False,'duplicateMascots':False,'errorsExcluded':True,'static':True})
            context.close()
    browser.close()
assert not errors,errors
assert not requests,requests
report={'configurations':results,'pageErrors':errors,'networkRequests':requests,'limit':'Local DOM/style fixtures; no authenticated production app, native Android or installed PWA.'}
(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(results),'pageErrors':errors,'networkRequests':requests,'artifacts':str(OUT)},ensure_ascii=False))
