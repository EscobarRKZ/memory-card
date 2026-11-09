# Memory Card v97 — local per-game cover visibility

**Date:** 9 November 2026. **Status:** implemented in PWA source, static/VM offline tests. No approval to commercially redistribute external game art is implied.

## What users can do

Open a game detail page and use **Скрыть обложку** / **Показать обложку**. The setting affects *only this one game* on the *current browser/device* and *current Memory Card account* (or guest session). It displays a native branded placeholder instead of the third-party art. Re-enabling it restores the existing image URL without downloading it first.

No edits are made to `state.games`, the stored `coverUrl`/`coverSource`, game title, status, date, score, notes, friendships, Supabase rows or any cloud synchronization baseline. The application will not mark the game as changed or upload anything as a result of hiding.

## Storage and account isolation

The rules are kept under `localStorage['memory-card-hidden-covers-v97']` as keyed truth values using a JSON tuple `[owner UUID or 'guest', game ID]`. Rules cannot leak from account A to account B and are bounded to 2,000 keys. If the browser rejects the write (quota/private browsing), the UI shows an error and leaves existing flags unchanged. Browsers can clear localStorage with site data, and a device/browser change does not carry the flags over. Users with legal takedown needs must not rely on localStorage.

A second tab on the same origin receives `storage` events and refreshes visible image state. Existing editing/login/share forms are not forcibly replaced mid-operation; the hidden preference is picked up on the next regular re-render instead.

## Where hidden covers are suppressed

- Shared `coverMarkup` wrapper in `cover-visibility-v97.js` removes image URLs from rendered thumbnails, detail art, friends/collections and Backlog and replaces them with local placeholders. It marks the wrapper `data-mc-cover-hidden="1"`.
- `product-v16.js` and `product-v17.js` guard direct CSS hero/background images and collection stacks against hidden games.
- PS3, Switch and Wikipedia DOM image enhancers stop before doing a remote image request for any suppressed wrapper, including delayed asynchronous callbacks.
- `manual-cover-picker-v18.js` refuses loading alternative candidates until the user re-enables that game.
- `cover-refresh-helper.js` skips suppressed games when scanning stored local rows for artwork refresh (does not mutate them).
- `share-card-v66.js` disables the game-art option when hidden and cannot fetch its URL for the PNG.

**Global rule remains:** external art stays OFF by default from v90. A per-game “show” control does not override that global switch.

## Limitations / legal rights

- This feature does **not** remove artwork URLs in the Supabase database, purge browser HTTP caches, issue reports on behalf of publishers, verify Wikimedia licenses, or prove commercial redistribution rights.
- A given cover URL may also be used for another game; v97 hides by game/account rather than globally suppressing that URL. A rights-holder takedown must apply centrally to every affected record and delivery path, not depend on each user's device.
- Before public/store monetization, confirm permissions for all external cover providers, implement a centrally administered rights ledger, verified contact and uniform removal policy. See [COVER_ART_RIGHTS_V90.md](COVER_ART_RIGHTS_V90.md).

## Verification

`tests/test_cover_visibility_v97.cjs` checks the production cover renderer, local hide/show, preservation of game metadata, scope isolation A/B, storage write rejection, cross-tab event refresh, suppressor markers in all eight direct/indirect image modules, SVG/card backgrounds and PWA cache wiring. CI also runs v90 cover-control, v86 release integrity and service-worker tests.

These tests are offline and do not prove real Safari/Android network behavior; perform physical-device checks before clearing a launch gate.
