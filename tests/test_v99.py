"""v99 UI regression: mobile empty hero and unfinished game management.

Run with Python Playwright and Chromium:
    MC_CHROMIUM=/usr/bin/chromium python tests/test_v99.py

Uses an isolated browser profile and a local HTTP server; external requests are
blocked. No production Supabase account or game records are used.
"""
from pathlib import Path
import functools
import http.server
import os
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
NOW = '2026-11-22T10:00:00.000Z'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_server():
    handler = functools.partial(Quiet, directory=str(ROOT))
    server = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def check(condition, label):
    assert condition, label
    print('PASS ' + label)


def test():
    server = start_server()
    try:
        origin = 'http://127.0.0.1:' + str(server.server_address[1])
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('MC_CHROMIUM') or None)
            ctx = browser.new_context(
                viewport={'width': 390, 'height': 844},
                device_scale_factor=2,
                is_mobile=True,
                has_touch=True,
                service_workers='block',
            )
            ctx.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin) else route.abort())
            page = ctx.new_page()
            page.goto(origin + '/index.html', wait_until='domcontentloaded')
            page.wait_for_function("typeof render === 'function' && typeof state === 'object'")
            # Keep the test data in this disposable tab only, never log in to cloud.
            page.evaluate("""() => {
                const stamp = '2026-11-22T10:00:00.000Z';
                const game = (id,title,status,platform) => ({
                  id,title,status,platform,notes:'Keep this note',coverUrl:'',
                  rating:'',releaseYear:'2020',genre:'',franchise:'',replay:0,
                  addedAt:stamp,updatedAt:stamp
                });
                state.games = [
                  game('p1','Test Playing','playing','PS4'),
                  game('d1','Test Dropped','dropped','PS4'),
                  game('c1','Test Completed','completed','3DS')
                ];
                state.settings = migrateSettings({
                  ...state.settings,language:'ru',theme:'light',
                  ownedPlatforms:['3DS','PS4','PS5'],
                  handheldRotation:['3DS'], desktopRotation:['PS5'],
                  currentHandheld:'3DS',currentDesktop:'PS5',
                  autoSync:false
                });
                state.view = 'home';
                state.gameDetailId = '';
                render();
            }""")

            hero = page.locator('.v17-home-empty')
            hero.wait_for()
            metrics = hero.evaluate("""el => ({
              display:getComputedStyle(el).display,
              heroWidth:el.getBoundingClientRect().width,
              textWidth:el.firstElementChild.getBoundingClientRect().width,
              titleWidth:el.querySelector('h2').getBoundingClientRect().width,
              height:el.getBoundingClientRect().height
            })""")
            check(metrics['display'] == 'block', 'Empty hero is not the 95px mobile grid')
            check(metrics['textWidth'] >= metrics['heroWidth'] - 55,
                  'Empty hero text fills the card width')
            check(metrics['height'] < 500, 'Empty hero no longer becomes a very tall column')
            check('На текущей ротации' in hero.inner_text(),
                  'Empty active-rotation message is displayed')

            def open_detail(game_id):
                page.evaluate("""id => {
                    state.view='gameDetail';
                    state.gameDetailId=id;
                    render();
                }""", game_id)

            open_detail('c1')
            page.locator('.v16-detail').wait_for()
            check(page.locator('[data-mc-v99-action]').count() == 0,
                  'Finished games do not expose delete/backlog detail actions')

            open_detail('p1')
            move = page.locator('[data-mc-v99-action="backlog"]')
            remove = page.locator('[data-mc-v99-action="delete"]')
            move.wait_for()
            check(remove.is_visible(), 'Playing game offers both detail actions')

            # A cancelled delete must not change the in-memory game.
            page.once('dialog', lambda dialog: dialog.dismiss())
            remove.click()
            check(page.evaluate("!state.games.find(g=>g.id==='p1').deletedAt"),
                  'Cancelled delete leaves the game untouched')

            page.once('dialog', lambda dialog: dialog.accept())
            move.click()
            page.wait_for_function("""() =>
                state.games.find(g=>g.id==='p1').status==='backlog'
                && state.view==='backlog'""")
            check(page.evaluate("""() => {
                const g=state.games.find(g=>g.id==='p1');
                return g.id==='p1' && g.notes==='Keep this note' && !g.deletedAt;
            }"""), 'Move to Backlog preserves the same record and notes')
            check(page.locator('.v23-backlog-grid').count() > 0,
                  'Moved game is visible in Backlog')

            open_detail('d1')
            remove = page.locator('[data-mc-v99-action="delete"]')
            remove.wait_for()
            check('Брошено' in page.locator('.v16-detail-copy .v16-badge-row').inner_text(),
                  'Dropped game is labelled as unfinished')
            page.once('dialog', lambda dialog: dialog.accept())
            remove.click()
            page.wait_for_function("""() =>
                Boolean(state.games.find(g=>g.id==='d1').deletedAt)
                && state.view==='games'""")
            check(page.evaluate("""() =>
                Boolean(state.games.find(g=>g.id==='d1').deletedAt)"""),
                  'Delete creates a normal syncable tombstone')

            ctx.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    test()
