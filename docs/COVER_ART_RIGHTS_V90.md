# Memory Card v90 — game cover rights, provenance and privacy review

**Reviewed: 8 November 2026. Status: NOT cleared for commercial/public reuse.** This is a technical/rights inventory, not legal advice, not evidence of permissions, and not a published privacy policy.

## Key rule

Game cover art is generally copyrighted by game publishers, designers or other rights-holders. Public GitHub repositories, free APIs, small thumbnails, hotlinks, a user's choice to display images, and labels naming the source **do not** themselves grant commercial-use rights. Google Play's Intellectual Property policy explicitly cites video-game cover art as an example of content whose unauthorized use can violate its policy: https://support.google.com/googleplay/android-developer/answer/9888072

Legal limitations and fair-use/fair-dealing exceptions depend on jurisdiction and actual use. A web app distributing art to other users and paid subscriber accounts needs a documented licensing plan, not a blanket fair-use assumption.

## Actual artwork sources in the repository

| Mechanism | Current implementation | Rights status / action |
|---|---|---|
| Libretro Named_Boxarts | `cover-sources.js`, `app.js`, `manual-cover-picker-v18.js`, `cover-refresh-helper.js`; image files from `raw.githubusercontent.com/libretro-thumbnails/…` | **Uncleared.** GitHub public visibility and the software repository's license do not prove rights to reproduce publisher-owned cover scans. Request permission or verify each asset's rights/licensing |
| GameTDB Switch / PS3 | `switch-cover-helper.js`, `ps3-cover-helper.js`, `cover-refresh-helper.js`; image URLs at `art.gametdb.com` | **Permission needs clarification for a browser-based commercial PWA.** FAQ permits software use with a GameTDB link and requests contact, but specifically says website use requires permission: https://www.gametdb.com/Main/FAQ. v90 displays a GameTDB source link; **do not treat this as written license clearance** |
| AldoTools Sony game covers | `cover-refresh-helper.js`, `raw.githubusercontent.com/aldostools/Resources/…` | **Uncleared.** Repository content is not automatically relicensed by the author's code license |
| HexFlow PS Vita covers | `cover-refresh-helper.js`, `raw.githubusercontent.com/Andiweli/HexFlow-Covers/…` | **Uncleared.** Check game publisher and asset provenance, not only repository terms |
| Wikipedia infobox art | `app.js`, `ps3-wikipedia-cover-helper.js`, `manual-cover-picker-v18.js` | **Potentially non-free.** Wikipedia can host cover art under local/non-free rules; do not assume it is redistributable commercially. Inspect image source, copyright tag and use rationale |
| Wikimedia Commons | Some image responses may originate from `upload.wikimedia.org` | **Review each file separately.** Use Commons file-description page for author, license, commercial permission, attribution and share-alike requirements: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia |
| `images.weserv.nl` image proxy | Switch and PS3 fallback | **Infrastructure, not an image license.** It can receive image requests and may cache transformations, adding a privacy/provider consideration |
| Manually entered URL | User manual cover picker | **Not independently verified.** A user URL does not license its image to the developer or make it safe to redistribute in a store screenshot |
| Local Memory Card initials/gradient placeholders | Native UI cover fallback | No third-party artwork is required for the placeholder itself; avoid separate trademark/logo usage that may confuse users |

Reference: https://github.com/libretro-thumbnails/libretro-thumbnails; https://www.gametdb.com/Main/FAQ; https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia

## v90 behavior already implemented in source

- External third-party cover display is **off by default per browser/device**. Users enable it explicitly under **Settings → Catalogs → External covers**.
- When off: `coverMarkup` shows a built-in gradient/initials fallback; background `--hero-image`, collection stacks, PS3/Switch/Wikipedia DOM image enhancers, auto-lookup/refresh and remote PNG share-card cover loading are gated. The PNG share-card artwork checkbox is **off by default**, even when external covers are enabled.
- Stored `coverUrl` and `coverSource` game data remain unchanged by the toggle. The setting lives in localStorage, not in another user's cloud profile.
- Service worker v90 stops intercepting remote artwork requests and removes the old app-owned `memory-card-covers-v14` CacheStorage cache on activation. Browser HTTP cache outside the app and previously saved offline exports are **not remotely deletable** by this feature.
- Game detail shows the known technical source plus **“права на изображение не подтверждены”**. A provider label is informational and **not a legal license or attribution proof**.

**Limitations:** The user can opt into external images without the app first proving specific artwork licensing. The current code does not maintain publisher permissions, per-image Creative Commons author attribution, a takedown index, or a verified rights allowlist. Do not present v90 as a complete copyright compliance solution.

## Required before a broadly distributed / monetized release

1. Select a business model for third-party cover distribution. Prefer direct contracts with rights-holders or an asset provider whose contract covers browser/mobile redistribution, commercial subscriptions, caching, thumbnails and store promotional screenshots.
2. Contact GameTDB and explicitly describe Memory Card as both a **web PWA** and planned **Google Play** application. Retain their written permission and any attribution/API/rate requirements. A developer FAQ alone does not settle publisher-owned IP rights.
3. Maintain a per-artwork permissions ledger (game title/platform, exact original URL/file ID, owner, provider, license/contract URL, commercial use, modification rights, attribution text, territories, expiry, takedown contact, verification date).
4. Exclude or replace artworks without approved rights. Do not use non-free Wikipedia infobox uploads unless a competent rights assessment confirms an applicable exception; prefer original gradients where unknown.
5. Build a copyright complaint/takedown route and a reliable ability to remove disallowed URLs from catalog and existing game records without erasing games, notes and ratings. Establish verified private contact details.
6. Use original Memory Card art, icons and typography in Play Store listing and advertising unless store artwork rights are separately cleared. If screenshots show copyrighted covers, treat them as a separate publication decision.
7. Verify real network traffic with external images OFF/ON in Android Chrome, iOS Safari and installed PWA; measure third-party image URL requests and review the privacy policy accordingly.
8. Before changing paid/free tiers, consult a qualified copyright lawyer for the planned jurisdictions and expected commercial distribution.

This document makes no claim of approval from Nintendo, Sony, Microsoft, publishers, Libretro, GameTDB or Wikimedia.
