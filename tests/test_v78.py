"""Exercise the real app with the v78 tactile layer in Chromium.
IndexedDB is seeded with a few test games. Every request that is not served from this folder is
aborted, so no production account, Supabase project or CDN is ever contacted.
Run: MC_CHROMIUM=/usr/bin/chromium python tests/test_v78.py   (MC_CHROMIUM is optional)
"""
from pathlib import Path
import functools, http.server, json, os, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/artifacts-v78'
OUT.mkdir(exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def serve():
    handler = functools.partial(Quiet, directory=str(ROOT))
    server = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]

NOW = '2026-10-01T10:00:00.000Z'
GAMES = [
    dict(id='g1', title='Persona 5 Royal', platform='PS4', status='completed', releaseYear='2019', genre='JRPG', franchise='Persona', rating=10),
    dict(id='g2', title='Hollow Knight', platform='SWITCH', status='playing', releaseYear='2017', genre='Metroidvania', franchise='', rating=9),
    dict(id='g3', title='God of War', platform='PS4', status='completed', releaseYear='2018', genre='Action', franchise='God of War', rating=9),
    dict(id='g4', title='Hades', platform='PC', status='playing', releaseYear='2020', genre='Roguelike', franchise='', rating=''),
]
SEED = {
    'games': [dict(g, notes='', updatedAt=NOW, createdAt=NOW, startedAt='2026-09-01', finishedAt='2026-09-20' if g['status'] == 'completed' else '') for g in GAMES],
    'settings': dict(language='ru', theme='dark', ownedPlatforms=['PS4', 'PS5', 'SWITCH', 'PC'], currentDesktop='SWITCH',
                     onboardingVersion=1, onboardingCompleted=True, userId='test-user'),
}
INIT = """
window.__vib = []; window.__vt = 0;
Object.defineProperty(navigator, 'vibrate', {configurable: true, value: p => { window.__vib.push(p); return true; }});
if (document.startViewTransition) {
  const real = document.startViewTransition.bind(document);
  document.startViewTransition = cb => { window.__vt++; return real(cb); };
}
(() => {
  const data = %s;
  const req = indexedDB.open('memory-card-db', 1);
  req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('state')) req.result.createObjectStore('state'); };
  req.onsuccess = () => { req.result.transaction('state', 'readwrite').objectStore('state').put(data, 'main'); };
})();
""" % json.dumps(SEED)

def checks():
    results = []
    def check(name, ok, detail=''):
        results.append((name, bool(ok), detail))
        print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail and not ok else ''))
    return results, check

def open_page(playwright, port, mobile=True, reduced=False, scheme='dark'):
    browser = playwright.chromium.launch(executable_path=os.environ.get('MC_CHROMIUM') or None)
    kwargs = dict(color_scheme=scheme, service_workers='block', reduced_motion='reduce' if reduced else 'no-preference')
    if mobile:
        kwargs.update(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    else:
        kwargs.update(viewport={'width': 1280, 'height': 860})
    context = browser.new_context(**kwargs)
    context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(f'http://127.0.0.1:{port}') else r.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.add_init_script(INIT)
    page.goto(f'http://127.0.0.1:{port}/index.html')
    page.wait_for_timeout(900)
    # The app's first render can run before the mobile-nav module is installed; render once more.
    page.evaluate('render()')
    page.wait_for_timeout(400)
    return browser, context, page, errors

def navigate(page, view):
    page.evaluate('v => navigate(v)', view)
    page.wait_for_timeout(450)

def touch(context, page, points, hold=30):
    cdp = context.new_cdp_session(page)
    x, y = points[0]
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    for x, y in points[1:]:
        page.wait_for_timeout(hold)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    page.wait_for_timeout(60)

def run():
    server, port = serve()
    results, check = checks()
    with sync_playwright() as p:
        # ---------- mobile, motion allowed ----------
        browser, context, page, errors = open_page(p, port)
        check('layer is loaded', page.evaluate("typeof window.MemoryCardTactile === 'object'"))
        check('stylesheet is applied', page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--mc-spring').trim() !== ''"))

        # Navigation pill sits under the active item and slides on change.
        def pill_state():
            return page.evaluate("""() => {
              const nav = document.querySelector('#app .mobile-nav');
              const pill = nav?.querySelector('.mc-nav-pill');
              const active = nav?.querySelector('.mc-mobile-nav-item.active');
              if (!pill || !active) return null;
              return {x: new DOMMatrix(getComputedStyle(pill).transform).m41, left: active.offsetLeft, view: state.view,
                      w: pill.offsetWidth, aw: active.offsetWidth};
            }""")
        s = pill_state()
        check('nav pill matches active item', s and abs(s['x'] - s['left']) < 1.5 and s['w'] == s['aw'], str(s))
        page.evaluate('window.__vib.length = 0; window.__vt = 0')
        page.click('.mobile-nav [data-nav="games"]')
        page.wait_for_timeout(900)
        s = pill_state()
        check('section changed through a view transition', page.evaluate('window.__vt') == 1 and s and s['view'] == 'games', str(s))
        check('pill followed to the new item', s and abs(s['x'] - s['left']) < 1.5, str(s))
        check('nav tap gives a tick', page.evaluate('window.__vib') == [8], str(page.evaluate('window.__vib')))
        check('nav is glass (backdrop blur)', 'blur' in page.evaluate("getComputedStyle(document.querySelector('#app .mobile-nav')).backdropFilter"))
        page.screenshot(path=str(OUT / 'mobile-games.png'))

        # Press feedback: mouse press applies the class at once and the card squeezes.
        card = page.locator('.game-card').first
        box = card.bounding_box()
        page.mouse.move(box['x'] + 20, box['y'] + 20)
        page.mouse.down()
        page.wait_for_timeout(150)
        scale = page.evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.game-card')).transform).a")
        check('card squeezes while pressed', page.evaluate("document.querySelector('.game-card').classList.contains('mc-pressed')") and scale < 0.99, str(scale))
        page.mouse.move(box['x'] + 5, box['y'] + box['height'] + 40)
        page.mouse.up()
        page.wait_for_timeout(500)
        check('press releases', not page.evaluate("document.querySelector('.game-card')?.classList.contains('mc-pressed')"))

        # Covers have gloss; elevation is a real shadow.
        check('cover gloss layer', page.evaluate("getComputedStyle(document.querySelector('.game-card > .cover'), '::before').content") not in ('none', 'normal'))
        check('card uses elevation shadow', 'rgba' in page.evaluate("getComputedStyle(document.querySelector('.game-card')).boxShadow"))

        # Add-game modal: entrance class once, stars pop, drag and haptics.
        page.evaluate("document.querySelector('[data-action=\"add\"]').click()")
        page.wait_for_timeout(500)
        check('modal gets one-shot entrance', page.evaluate("!!document.querySelector('#app > .modal-backdrop.mc-modal-enter')"))
        page.evaluate("setToast('Тест')")
        page.wait_for_timeout(200)
        check('re-render does not replay the modal entrance', page.evaluate("!document.querySelector('#app > .modal-backdrop.mc-modal-enter')"))
        check('toast arrives with animation', page.evaluate("!!document.querySelector('#app > .toast.mc-toast-enter')"))
        page.evaluate('window.__vib.length = 0')
        star = page.locator('#gameForm .star-picker button[data-rating="7"]')
        star.click()
        page.wait_for_timeout(60)
        check('star tap sets rating', page.evaluate("document.querySelector('#gameForm input[name=rating]').value") == '7')
        check('star pops', page.evaluate("document.querySelector('#gameForm button[data-rating=\"7\"]').classList.contains('mc-star-pop')"))
        check('star tap haptic', page.evaluate('window.__vib') == [6], str(page.evaluate('window.__vib')))
        page.wait_for_timeout(500)
        a = page.locator('#gameForm .star-picker button[data-rating="3"]').bounding_box()
        b = page.locator('#gameForm .star-picker button[data-rating="9"]').bounding_box()
        page.evaluate('window.__vib.length = 0')
        page.mouse.move(a['x'] + a['width'] / 2, a['y'] + a['height'] / 2)
        page.mouse.down()
        page.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2, steps=12)
        page.mouse.up()
        page.wait_for_timeout(450)
        value = page.evaluate("document.querySelector('#gameForm input[name=rating]').value")
        check('dragging across stars sets the last star, release does not reset it', value == '9', value)
        check('drag gives a tick per step', len(page.evaluate('window.__vib')) >= 3, str(page.evaluate('window.__vib')))
        page.screenshot(path=str(OUT / 'mobile-modal.png'))

        # Real save: LED toast and success pattern.
        page.fill('#gameForm [name="title"]', 'Tactile Test Game')
        page.evaluate('window.__vib.length = 0')
        page.evaluate("document.querySelector('#gameForm').requestSubmit()")
        page.wait_for_timeout(1500)
        led = page.evaluate("!!document.querySelector('#app > .toast.mc-memory-feedback.mc-led-blink')")
        check('save blinks the memory LED', led, page.evaluate("document.querySelector('#app > .toast')?.className || 'no toast'"))
        check('save gives the success pattern', [10, 40, 16] in page.evaluate('window.__vib'), str(page.evaluate('window.__vib')))

        # More sheet: spring back on a short pull, dismiss on a long one.
        page.wait_for_timeout(4800)
        page.evaluate("document.querySelector('[data-mobile-more]').click()")
        page.wait_for_timeout(600)
        check('more sheet opens', page.evaluate("document.querySelector('#mc-more-sheet')?.open") is True)
        h = page.locator('.mc-more-handle').bounding_box()
        hx, hy = h['x'] + h['width'] / 2, h['y'] + h['height'] / 2
        touch(context, page, [(hx, hy), (hx, hy + 12), (hx, hy + 28), (hx, hy + 40)])
        page.wait_for_timeout(700)
        check('short pull springs back', page.evaluate("document.querySelector('#mc-more-sheet')?.open") is True
              and page.evaluate("getComputedStyle(document.querySelector('.mc-more-panel')).transform") in ('none', 'matrix(1, 0, 0, 1, 0, 0)'))
        page.evaluate('window.__vib.length = 0')
        touch(context, page, [(hx, hy), (hx, hy + 20), (hx, hy + 80), (hx, hy + 160), (hx, hy + 240)])
        page.wait_for_timeout(900)
        check('long pull dismisses the sheet', page.evaluate("document.querySelector('#mc-more-sheet')?.open") is False)
        check('crossing the threshold ticks', 10 in page.evaluate('window.__vib'), str(page.evaluate('window.__vib')))
        check('view unchanged after dismiss', page.evaluate('state.view') == 'games')

        # App modal (bottom sheet on phones): same gesture from its header.
        page.evaluate("document.querySelector('[data-action=\"add\"]').click()")
        page.wait_for_timeout(600)
        head = page.locator('#app .modal .modal-head').bounding_box()
        mx, my = head['x'] + head['width'] / 2 - 60, head['y'] + head['height'] / 2
        touch(context, page, [(mx, my), (mx, my + 14), (mx, my + 30), (mx, my + 44)])
        page.wait_for_timeout(700)
        check('modal: short pull springs back and stays open', page.evaluate('!!state.modal')
              and page.evaluate("document.querySelector('#app .modal').style.transform") == '')
        touch(context, page, [(mx, my), (mx, my + 20), (mx, my + 90), (mx, my + 180), (mx, my + 260)])
        page.wait_for_timeout(900)
        check('modal: long pull closes it through the normal close path', page.evaluate('state.modal') is None
              and page.evaluate("!document.querySelector('.modal-backdrop')"))

        # Settings: haptics switch.
        navigate(page, 'settings')
        page.evaluate('render()')
        page.wait_for_timeout(300)
        check('haptics switch is offered', page.evaluate("!!document.querySelector('#hapticsMode')"))
        page.evaluate("document.querySelector('#hapticsMode').click()")
        check('switch stores a local preference', page.evaluate("localStorage.getItem('memory-card-haptics-v1')") == 'off')
        page.evaluate('window.__vib.length = 0')
        page.click('.mobile-nav [data-nav="home"]')
        page.wait_for_timeout(700)
        check('no vibration when switched off', page.evaluate('window.__vib') == [], str(page.evaluate('window.__vib')))

        # Hero parallax follows scroll.
        navigate(page, 'home')
        page.evaluate('render()')
        page.wait_for_timeout(300)
        before = page.evaluate("getComputedStyle(document.querySelector('.v16-home-hero')).getPropertyValue('--mc-py')")
        page.evaluate('window.scrollTo(0, 120)')
        page.wait_for_timeout(300)
        after = page.evaluate("getComputedStyle(document.querySelector('.v16-home-hero')).getPropertyValue('--mc-py')")
        check('hero parallax value changes with scroll', before.strip() != after.strip(), f'{before!r} -> {after!r}')
        check('no console or page errors (mobile)', not errors, '; '.join(errors[:3]))
        browser.close()

        # ---------- mobile, reduced motion ----------
        browser, context, page, errors = open_page(p, port, reduced=True)
        page.evaluate('window.__vib.length = 0; window.__vt = 0')
        page.click('.mobile-nav [data-nav="games"]')
        page.wait_for_timeout(500)
        check('reduced motion: no view transition', page.evaluate('window.__vt') == 0)
        check('reduced motion: no vibration', page.evaluate('window.__vib') == [], str(page.evaluate('window.__vib')))
        page.evaluate("document.querySelector('[data-action=\"add\"]').click()")
        page.wait_for_timeout(300)
        check('reduced motion: no modal entrance', page.evaluate("!document.querySelector('.mc-modal-enter')"))
        check('reduced motion: no console or page errors', not errors, '; '.join(errors[:3]))
        browser.close()

        # ---------- desktop ----------
        browser, context, page, errors = open_page(p, port, mobile=False)
        navigate(page, 'games')
        check('desktop: no nav pill', page.evaluate("document.querySelectorAll('.mc-nav-pill').length") in (0, 1)
              and page.evaluate("!document.querySelector('#app .mobile-nav')?.offsetWidth"))
        card = page.locator('.game-card').first
        card.hover()
        page.wait_for_timeout(500)
        check('desktop: hover lifts the card', page.evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.game-card')).transform).m42") < 0)
        page.screenshot(path=str(OUT / 'desktop-games.png'))
        check('desktop: no console or page errors', not errors, '; '.join(errors[:3]))
        browser.close()
    server.shutdown()
    failed = [name for name, ok, _ in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    if failed:
        raise SystemExit('FAILED: ' + '; '.join(failed))

if __name__ == '__main__':
    run()
