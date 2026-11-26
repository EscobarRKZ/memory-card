"""Mobile smoke test for v100 in the actual application, isolated from cloud.
Run: python -m pip install playwright && python -m playwright install chromium
     python tests/test_v100_mobile.py
"""
from pathlib import Path
import functools
import http.server
import os
import socketserver
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def check_mobile(page, width):
    page.wait_for_function("typeof render==='function' && typeof state==='object' && !!document.querySelector('#app .shell')")
    page.evaluate("""() => {
      const stamp = '2026-11-26T07:00:00.000Z';
      state.games = ['queued1','queued2'].map((id,i)=>migrateGame({
        id,title:'Queued game '+(i+1),status:'backlog',platform:'PS4',
        notes:'preserve this note',rating:'',addedAt:stamp,updatedAt:stamp
      }));
      state.settings=migrateSettings({...state.settings,language:'ru',theme:'light',
        onboardingVersion:1,onboardingCompleted:true,ownedPlatforms:['3DS','VITA','PSP','PS4','PS5','SWITCH','PC'],
        rotationHandheldEnabled:true,rotationDesktopEnabled:true,
        handheldRotation:['3DS','VITA','PSP'],desktopRotation:['PS5','PS4','SWITCH','PC'],
        currentHandheld:'3DS',currentDesktop:'PS5',autoSync:false});
      state.modal=null;state.gameDetailId='';state.view='home';render();
    }""")
    page.wait_for_timeout(400)
    assert page.locator('.platform-card:visible').count()>0
    assert page.locator('.platform-top:visible').first.evaluate("el=>parseFloat(getComputedStyle(el).gap)>=10")
    assert page.locator('.rotation-chip:visible').first.evaluate("el=>parseFloat(getComputedStyle(el).gap)>=6")
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    assert page.locator('#app .mobile-nav').evaluate("el=>getComputedStyle(el).backdropFilter==='none'")
    page.evaluate("navigate('backlog');")
    page.locator('[data-v23-filter="ALL"]').click()
    start=page.locator('[data-v16-backlog-start="queued1"]')
    start.wait_for()
    assert start.evaluate("el=>el.getBoundingClientRect().height>=43")
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    # A real touch target must not be covered by absolute-positioned artwork.
    assert page.locator('[data-v23-backlog-card="queued1"] .v16-backlog-cover').evaluate(
        "el=>getComputedStyle(el).position==='relative' && getComputedStyle(el).overflow==='hidden'")
    start.evaluate("el=>el.scrollIntoView({block:'center',inline:'nearest'})")
    start.click(timeout=10000)
    page.wait_for_function("state.view==='playing' && state.games.find(g=>g.id==='queued1').status==='playing'")
    assert page.evaluate("state.settings.currentDesktop==='PS4'")
    assert page.evaluate("state.games.find(g=>g.id==='queued1').notes==='preserve this note'")
    assert page.get_by_text('Queued game 1',exact=True).first.is_visible()
    # Backlog detail uses a modal; capture handler must work even with data-stop.
    page.evaluate("navigate('backlog'); openGame('queued2');")
    page.locator('.modal [data-v16-backlog-start="queued2"]').click(timeout=10000)
    page.wait_for_function("state.view==='playing' && !state.modal && state.games.find(g=>g.id==='queued2').status==='playing'")
    page.evaluate("window.__toastShell=document.querySelector('#app .shell');setToast('Notice',{render:false})")
    assert page.evaluate("window.__toastShell===document.querySelector('#app .shell')")
    print(f'PASS {width}px: platform spacing, no overflow, queue/detail start, rotation, toast without rebuild')

def main():
    handler=functools.partial(Quiet,directory=str(ROOT))
    server=socketserver.ThreadingTCPServer(('127.0.0.1',0),handler)
    server.daemon_threads=True
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_address[1]}'
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get('MC_CHROMIUM') or None)
            for width in (360,390,412):
                ctx=browser.new_context(viewport={'width':width,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2,service_workers='block')
                ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin) else r.abort())
                page=ctx.new_page()
                page.goto(origin+'/index.html',wait_until='load')
                page.wait_for_timeout(1000)
                check_mobile(page,width)
                ctx.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__=='__main__':
    main()
