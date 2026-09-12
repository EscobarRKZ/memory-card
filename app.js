const PLATFORMS = [
  { id: 'PSP', name: 'PlayStation Portable', abbr: 'PSP', group: 'handheld', wikidata: ['Q170325'] },
  { id: 'VITA', name: 'PlayStation Vita', abbr: 'Vita', group: 'handheld', wikidata: ['Q188808'] },
  { id: 'DSI', name: 'Nintendo DS / DSi', abbr: 'DSi', group: 'handheld', wikidata: ['Q170323', 'Q637178'] },
  { id: '3DS', name: 'Nintendo 3DS', abbr: '3DS', group: 'handheld', wikidata: ['Q203597', 'Q17679679'] },
  { id: 'GBA', name: 'Game Boy Advance', abbr: 'GBA', group: 'handheld', wikidata: ['Q188642'] },
  { id: 'PS3', name: 'PlayStation 3', abbr: 'PS3', group: 'desktop', wikidata: ['Q10683'] },
  { id: 'WIIU', name: 'Nintendo Wii U', abbr: 'Wii U', group: 'desktop', wikidata: ['Q56942'] },
  { id: 'SWITCH', name: 'Nintendo Switch', abbr: 'Switch', group: 'desktop', wikidata: ['Q19610114'] },
];

const CATALOG_SEED = [
  ['PSP','LocoRoco','2006','Platformer'],['PSP','LocoRoco 2','2008','Platformer'],['PSP','Metal Gear Solid: Peace Walker','2010','Action'],['PSP','Patapon','2007','Rhythm / Strategy'],['PSP','Jeanne d’Arc','2006','Tactical RPG'],['PSP','Me & My Katamari','2005','Action / Puzzle'],
  ['VITA','Touch My Katamari','2011','Action / Puzzle'],['VITA','Persona 4 Golden','2012','RPG'],['VITA','Gravity Rush','2012','Action-adventure'],['VITA','Tearaway','2013','Platformer'],['VITA','Muramasa Rebirth','2013','Action RPG'],
  ['DSI','Orcs & Elves','2007','RPG'],['DSI','Ghost Trick: Phantom Detective','2010','Adventure / Puzzle'],['DSI','The World Ends with You','2007','Action RPG'],['DSI','Chrono Trigger','2008','RPG'],['DSI','Pokémon HeartGold and SoulSilver','2009','RPG'],['DSI','999: Nine Hours, Nine Persons, Nine Doors','2009','Adventure / Visual novel'],
  ['3DS','Pushmo','2011','Puzzle'],['3DS','Kid Icarus: Uprising','2012','Action'],['3DS','The Legend of Zelda: A Link Between Worlds','2013','Action-adventure'],['3DS','Fire Emblem Awakening','2012','Tactical RPG'],['3DS','Super Mario 3D Land','2011','Platformer'],['3DS','Shin Megami Tensei IV','2013','RPG'],
  ['GBA','Metroid: Zero Mission','2004','Action-adventure'],['GBA','Metroid Fusion','2002','Action-adventure'],['GBA','Castlevania: Aria of Sorrow','2003','Action RPG'],['GBA','Advance Wars','2001','Strategy'],['GBA','Mother 3','2006','RPG'],
  ['PS3','Resident Evil 4 HD','2011','Action / Survival horror'],['PS3','The Last of Us','2013','Action-adventure'],['PS3','Uncharted 2: Among Thieves','2009','Action-adventure'],['PS3','Demon’s Souls','2009','Action RPG'],['PS3','Metal Gear Solid 4: Guns of the Patriots','2008','Stealth action'],['PS3','Journey','2012','Adventure'],
  ['WIIU','Paper Mario: Color Splash','2016','RPG / Adventure'],['WIIU','Xenoblade Chronicles X','2015','Action RPG'],['WIIU','The Wonderful 101','2013','Action'],['WIIU','Donkey Kong Country: Tropical Freeze','2014','Platformer'],['WIIU','Super Mario 3D World','2013','Platformer'],
  ['SWITCH','Metroid Prime Remastered','2023','Action-adventure'],['SWITCH','The Legend of Zelda: Breath of the Wild','2017','Action-adventure'],['SWITCH','The Legend of Zelda: Tears of the Kingdom','2023','Action-adventure'],['SWITCH','Super Mario Odyssey','2017','Platformer'],['SWITCH','Metroid Dread','2021','Action-adventure'],['SWITCH','Once Upon a Katamari','2025','Action / Puzzle'],
].map(([platform,title,releaseYear,genre], i) => ({ key:`seed-${i}`, platform, title, releaseYear, genre, source:'seed' }));


const LEGACY_SQL_CATALOG = {
  PSP: 'psp.sql', VITA: 'psv.sql', DSI: 'ds.sql', '3DS': '3ds.sql',
  GBA: 'gba.sql', PS3: 'ps3.sql', WIIU: 'wiiu.sql',
};
const LEGACY_SQL_BASE = 'https://raw.githubusercontent.com/bocaletto-luca/Videogames-Database/main/';

const DEFAULT_SETTINGS = {
  sheetEndpoint: '',
  syncSecret: '',
  theme: 'system',
  handheldRotation: ['DSI', 'VITA', '3DS', 'PSP', 'GBA'],
  desktopRotation: ['PS3', 'WIIU', 'SWITCH'],
  currentHandheld: 'PSP',
  currentDesktop: 'SWITCH',
  settingsUpdatedAt: '',
  lastSync: null,
  autoSync: true,
};

let state = {
  games: [],
  settings: { ...DEFAULT_SETTINGS },
  view: 'home',
  platformFilter: '',
  search: '',
  statusFilter: 'all',
  modal: null,
  toast: '',
  catalog: [...CATALOG_SEED],
  catalogMeta: {},
  catalogBusy: '',
};

let autoSyncTimer = null;
let syncInFlight = false;
const coverLookups = new Map();

const DB_NAME = 'memory-card-db';
const STORE = 'state';
const KEY = 'main';
const systemThemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

function dbOpen() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function nowIso() { return new Date().toISOString(); }
function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function platform(id) { return PLATFORMS.find(p => p.id === id) || { id, name: id, abbr: id, group: 'handheld' }; }
function esc(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function liveGames() { return state.games.filter(g => !g.deletedAt); }
function statusLabel(status) { return ({ completed: 'Пройдено', playing: 'Играю', dropped: 'Брошено', backlog: 'Хочу пройти' })[status] || status; }
function ratingStars(value) {
  const n = Math.max(0, Math.min(10, Number(value) || 0));
  return `${'★'.repeat(n)}${'☆'.repeat(10 - n)}`;
}
function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}
function monthKey(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Без даты' : new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(d);
}

function normalizeText(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9а-яё]+/gi, ' ').trim();
}

const FRANCHISE_RULES = [
  [/\bresident evil\b|\bbiohazard\b/i, 'Resident Evil'], [/\bmetroid\b/i, 'Metroid'],
  [/\bthe legend of zelda\b|\bzelda\b/i, 'The Legend of Zelda'], [/\bpaper mario\b|\bmario & luigi\b|\bsuper mario\b|\bmario kart\b|\bmario\b/i, 'Mario'],
  [/\bsonic\b/i, 'Sonic the Hedgehog'], [/\bkatamari\b/i, 'Katamari'], [/\bmetal gear\b/i, 'Metal Gear'],
  [/\bfinal fantasy\b/i, 'Final Fantasy'], [/\bpersona\b/i, 'Persona'], [/\bshin megami tensei\b/i, 'Shin Megami Tensei'],
  [/\bpok[eé]mon\b/i, 'Pokémon'], [/\bcastlevania\b/i, 'Castlevania'], [/\bfire emblem\b/i, 'Fire Emblem'],
  [/\badvance wars\b/i, 'Advance Wars'], [/\bxenoblade\b/i, 'Xenoblade Chronicles'], [/\bdonkey kong\b/i, 'Donkey Kong'],
  [/\bluigi['’]?s mansion\b/i, "Luigi's Mansion"], [/\bkid icarus\b/i, 'Kid Icarus'], [/\blocoroco\b/i, 'LocoRoco'],
  [/\bpatapon\b/i, 'Patapon'], [/\buncharted\b/i, 'Uncharted'], [/\bdemon['’]?s souls\b|\bdark souls\b/i, 'Souls'],
  [/\bdevil may cry\b|\bdmc\b/i, 'Devil May Cry'], [/\bking of fighters\b|\bkof\b/i, 'The King of Fighters'],
  [/\bblazblue\b/i, 'BlazBlue'], [/\bfallout\b/i, 'Fallout'], [/\bstar wars\b/i, 'Star Wars'],
  [/\bmother 3\b|\bearthbound\b/i, 'Mother / EarthBound'], [/\bgravity rush\b/i, 'Gravity Rush'],
  [/\bmonster hunter\b/i, 'Monster Hunter'], [/\bdragon quest\b/i, 'Dragon Quest'], [/\bprofessor layton\b/i, 'Professor Layton'],
  [/\bwarioware\b/i, 'WarioWare'], [/\bdead cells\b/i, 'Dead Cells'], [/\bsega rally\b/i, 'Sega Rally']
];
function inferFranchise(title = '', explicit = '') {
  if (String(explicit || '').trim()) return String(explicit).trim();
  for (const [rx, name] of FRANCHISE_RULES) if (rx.test(String(title))) return name;
  return '';
}
function franchiseHue(franchise = '', title = '') {
  const input = franchise || title || 'Memory Card';
  let h = 0; for (const ch of input) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
function safeImage(url = '') { const v=String(url||'').trim(); return /^https?:\/\//i.test(v) ? v.replace(/^http:/i,'https:') : ''; }
function catalogKey(platformId, title, year = '') { return `${platformId}|${normalizeText(title)}|${year || ''}`; }
function mergeCatalog(entries = []) {
  const map = new Map(state.catalog.map(x => [catalogKey(x.platform, x.title, x.releaseYear), x]));
  for (const raw of entries) {
    if (!raw || !raw.platform || !String(raw.title || '').trim()) continue;
    const entry = {
      key: raw.key || `cat-${raw.platform}-${Math.random().toString(36).slice(2)}`,
      platform: raw.platform,
      title: String(raw.title).trim(),
      releaseYear: String(raw.releaseYear || ''),
      genre: String(raw.genre || '').trim(),
      franchise: inferFranchise(raw.title, raw.franchise),
      coverUrl: safeImage(raw.coverUrl || ''),
      source: raw.source || 'wikidata',
    };
    const k = catalogKey(entry.platform, entry.title, entry.releaseYear);
    const old = map.get(k);
    if (!old || (!old.genre && entry.genre) || (!old.coverUrl && entry.coverUrl) || (!old.franchise && entry.franchise) || old.source === 'seed') map.set(k, { ...old, ...entry, key: old?.key || entry.key });
  }
  state.catalog = [...map.values()];
}
function catalogCounts() {
  const out = Object.fromEntries(PLATFORMS.map(p => [p.id, 0]));
  for (const e of state.catalog) if (out[e.platform] !== undefined) out[e.platform]++;
  return out;
}
function catalogSearch(platformId, query) {
  const q = normalizeText(query);
  if (!q || q.length < 1) return [];
  return state.catalog.filter(e => e.platform === platformId && normalizeText(e.title).includes(q)).map(e => {
    const t = normalizeText(e.title);
    const rank = t === q ? 0 : t.startsWith(q) ? 1 : t.indexOf(q) + 10;
    return { ...e, rank };
  }).sort((a,b) => a.rank - b.rank || a.title.length - b.title.length || a.title.localeCompare(b.title)).slice(0, 8);
}
function wdYear(value) {
  if (!value) return '';
  const m = String(value).match(/([12]\d{3})/);
  return m ? m[1] : '';
}
function wikidataQueryForPlatform(platformId) {
  const p = platform(platformId);
  const values = (p.wikidata || []).map(q => `wd:${q}`).join(' ');
  return `SELECT ?game ?gameLabel (MIN(?date) AS ?releaseDate) (SAMPLE(?genreLabel) AS ?genreLabel) (SAMPLE(?image) AS ?image) (SAMPLE(?seriesLabel) AS ?seriesLabel) WHERE {
`+
    `  VALUES ?plat { ${values} }
`+
    `  ?game wdt:P400 ?plat .
`+
    `  ?game rdfs:label ?gameLabel . FILTER(LANG(?gameLabel) = "en")
`+
    `  OPTIONAL { ?game wdt:P577 ?date . }
`+
    `  OPTIONAL { ?game wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "en") }
`+
    `  OPTIONAL { ?game wdt:P18 ?image . }
`+
    `  OPTIONAL { ?game wdt:P179 ?series . ?series rdfs:label ?seriesLabel . FILTER(LANG(?seriesLabel) = "en") }
`+
    `}
GROUP BY ?game ?gameLabel
ORDER BY LCASE(?gameLabel)`;
}
async function fetchWikidataPlatform(platformId) {
  const query = wikidataQueryForPlatform(platformId);
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } });
  if (!resp.ok) throw new Error(`Wikidata HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.results?.bindings || []).map((row, i) => ({
    key: `wd-${platformId}-${row.game?.value?.split('/').pop() || i}`,
    platform: platformId,
    title: row.gameLabel?.value || '',
    releaseYear: wdYear(row.releaseDate?.value),
    genre: row.genreLabel?.value || '',
    franchise: inferFranchise(row.gameLabel?.value || '', row.seriesLabel?.value || ''),
    coverUrl: safeImage(row.image?.value || ''),
    source: 'wikidata',
  })).filter(x => x.title);
}

function unescapeSqlString(value = '') {
  return String(value).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}
async function fetchLegacySqlPlatform(platformId) {
  const file = LEGACY_SQL_CATALOG[platformId];
  if (!file) return [];
  const resp = await fetch(`${LEGACY_SQL_BASE}${file}`);
  if (!resp.ok) throw new Error(`Game DB HTTP ${resp.status}`);
  const text = await resp.text();
  const out = [];
  const re = /\(\d+,\s*'((?:\\.|[^'])*)',\s*'((?:\\.|[^'])*)',\s*'((?:\\.|[^'])*)',\s*(NULL|\d{4}),\s*'((?:\\.|[^'])*)'\)/g;
  let m; let i = 0;
  while ((m = re.exec(text))) {
    out.push({
      key: `vgdb-${platformId}-${i++}`,
      platform: platformId,
      title: unescapeSqlString(m[1]),
      genre: unescapeSqlString(m[2]),
      releaseYear: m[4] === 'NULL' ? '' : m[4],
      franchise: inferFranchise(unescapeSqlString(m[1])),
      coverUrl: '',
      source: 'videogames-db',
    });
  }
  return out;
}
function dedupeCatalogEntries(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!e?.title) continue;
    const k = catalogKey(e.platform, e.title, e.releaseYear);
    const old = map.get(k);
    if (!old) map.set(k, e);
    else map.set(k, { ...old, ...e, genre: e.genre || old.genre || '', franchise: e.franchise || old.franchise || '', coverUrl: e.coverUrl || old.coverUrl || '', releaseYear: e.releaseYear || old.releaseYear || '', key: old.key || e.key });
  }
  return [...map.values()];
}
async function fetchPlatformCatalog(platformId) {
  const jobs = [fetchWikidataPlatform(platformId)];
  if (LEGACY_SQL_CATALOG[platformId]) jobs.push(fetchLegacySqlPlatform(platformId));
  const settled = await Promise.allSettled(jobs);
  const good = settled.filter(x => x.status === 'fulfilled').flatMap(x => x.value || []);
  if (!good.length) throw new Error(settled.map(x => x.reason?.message || '').filter(Boolean).join('; ') || 'Каталог недоступен');
  return dedupeCatalogEntries(good);
}
async function persistCatalog() {
  try {
    const db = await dbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ catalog: state.catalog, catalogMeta: state.catalogMeta }, 'catalog-v1');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { console.warn('Catalog save failed', e); }
}
function enrichGamesFromCatalog(platformId) {
  const entries = state.catalog.filter(e => e.platform === platformId);
  let changed = false;
  for (const g of state.games) {
    if (g.deletedAt || g.platform !== platformId) continue;
    const titleKey = normalizeText(g.title);
    let match = entries.find(e => normalizeText(e.title) === titleKey && (!g.releaseYear || !e.releaseYear || String(e.releaseYear) === String(g.releaseYear)));
    if (!match) match = entries.find(e => normalizeText(e.title) === titleKey);
    const nextFranchise = inferFranchise(g.title, g.franchise || match?.franchise || '');
    const nextCover = g.coverUrl || match?.coverUrl || '';
    const nextGenre = g.genre || match?.genre || '';
    if (nextFranchise !== (g.franchise || '') || nextCover !== (g.coverUrl || '') || nextGenre !== (g.genre || '')) {
      g.franchise = nextFranchise; g.coverUrl = safeImage(nextCover); g.genre = nextGenre; g.updatedAt = nowIso(); changed = true;
    }
  }
  return changed;
}

async function refreshCatalog(platformId, quiet = false) {
  if (state.catalogBusy) return;
  state.catalogBusy = platformId;
  if (!quiet) setToast(`Обновляю каталог ${platform(platformId).abbr}…`);
  try {
    const entries = await fetchPlatformCatalog(platformId);
    if (!entries.length) throw new Error('Пустой ответ');
    state.catalog = state.catalog.filter(e => e.platform !== platformId || e.source === 'seed');
    mergeCatalog(entries);
    state.catalogMeta[platformId] = { updatedAt: nowIso(), count: entries.length, source: LEGACY_SQL_CATALOG[platformId] ? 'Wikidata + Videogames-Database' : 'Wikidata' };
    const gamesEnriched = enrichGamesFromCatalog(platformId);
    await persistCatalog();
    if (gamesEnriched) await persist();
    const coversFound = await hydrateMissingCoversForGames(platformId, 25);
    if (!quiet) setToast(`${platform(platformId).abbr}: ${entries.length} игр${coversFound ? ` · +${coversFound} обложек` : ''}`);
  } catch (e) {
    console.warn('Catalog refresh failed', platformId, e);
    if (!quiet) setToast(`Не удалось обновить ${platform(platformId).abbr}; остаётся локальный кэш`);
  } finally {
    state.catalogBusy = '';
    updateCatalogStatusDom();
    refreshActiveAutocomplete();
  }
}
async function refreshAllCatalog() {
  if (state.catalogBusy) return;
  let ok = 0;
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i];
    state.catalogBusy = p.id;
    setToast(`Каталог ${i + 1}/${PLATFORMS.length}: ${p.abbr}…`);
    try {
      const entries = await fetchPlatformCatalog(p.id);
      if (!entries.length) throw new Error('Пустой ответ');
      state.catalog = state.catalog.filter(e => e.platform !== p.id || e.source === 'seed');
      mergeCatalog(entries);
      state.catalogMeta[p.id] = { updatedAt: nowIso(), count: entries.length, source: LEGACY_SQL_CATALOG[p.id] ? 'Wikidata + Videogames-Database' : 'Wikidata' };
      enrichGamesFromCatalog(p.id);
      ok++;
      await persistCatalog();
    } catch (e) { console.warn('Catalog refresh failed', p.id, e); }
    state.catalogBusy = '';
  }
  await persist();
  const coversFound = await hydrateMissingCoversForGames('', 100);
  updateCatalogStatusDom();
  setToast(`Каталог: ${ok}/${PLATFORMS.length}${coversFound ? ` · найдено обложек ${coversFound}` : ''}`);
}
async function ensurePlatformCatalog(platformId) {
  const nonSeed = state.catalog.some(e => e.platform === platformId && e.source !== 'seed');
  if (!nonSeed && !state.catalogBusy) refreshCatalog(platformId, true);
}
function updateCatalogStatusDom() {
  const el = document.querySelector('#catalogStatus');
  if (!el) return;
  const counts = catalogCounts();
  el.innerHTML = PLATFORMS.map(p => `<span>${p.abbr}: <b>${counts[p.id] || 0}</b></span>`).join(' · ');
}

function normalizeRotation(ids, group) {
  const allowed = PLATFORMS.filter(p => p.group === group).map(p => p.id);
  const result = [];
  for (const id of Array.isArray(ids) ? ids : []) if (allowed.includes(id) && !result.includes(id)) result.push(id);
  for (const id of allowed) if (!result.includes(id)) result.push(id);
  return result;
}

function migrateSettings(raw = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  const legacyRotation = Array.isArray(raw.rotation) ? raw.rotation : [];
  if (!Array.isArray(raw.handheldRotation) && legacyRotation.length) merged.handheldRotation = legacyRotation.filter(id => platform(id).group === 'handheld');
  if (!Array.isArray(raw.desktopRotation) && legacyRotation.length) merged.desktopRotation = legacyRotation.filter(id => platform(id).group === 'desktop');
  if (!raw.currentHandheld && raw.currentPlatform && platform(raw.currentPlatform).group === 'handheld') merged.currentHandheld = raw.currentPlatform;
  if (!raw.currentDesktop && raw.currentPlatform && platform(raw.currentPlatform).group === 'desktop') merged.currentDesktop = raw.currentPlatform;
  merged.handheldRotation = normalizeRotation(merged.handheldRotation, 'handheld');
  merged.desktopRotation = normalizeRotation(merged.desktopRotation, 'desktop');
  if (!merged.handheldRotation.includes(merged.currentHandheld)) merged.currentHandheld = merged.handheldRotation[0];
  if (!merged.desktopRotation.includes(merged.currentDesktop)) merged.currentDesktop = merged.desktopRotation[0];
  if (!['system', 'light', 'dark'].includes(merged.theme)) merged.theme = 'system';
  return merged;
}

function migrateGame(raw) {
  const fallbackDate = raw.addedAt || raw.createdAt || (raw.completedAt ? `${raw.completedAt}T12:00:00.000Z` : nowIso());
  const rating = raw.rating === '' || raw.rating == null ? '' : String(Math.max(1, Math.min(10, Math.round(Number(raw.rating) || 0))));
  return {
    ...raw,
    title: String(raw.title || '').trim(),
    platform: raw.platform || 'PSP',
    status: raw.status || 'completed',
    releaseYear: String(raw.releaseYear || ''),
    genre: String(raw.genre || ''),
    franchise: inferFranchise(raw.title, raw.franchise),
    coverUrl: safeImage(raw.coverUrl || ''),
    rating,
    replay: Number(raw.replay || 0),
    notes: String(raw.notes || ''),
    addedAt: fallbackDate,
    updatedAt: raw.updatedAt || fallbackDate,
  };
}

async function loadState() {
  try {
    const db = await dbOpen();
    const val = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (val) {
      state.games = Array.isArray(val.games) ? val.games.map(migrateGame) : [];
      state.settings = migrateSettings(val.settings || {});
    } else {
      state.settings = migrateSettings(DEFAULT_SETTINGS);
    }
    const cat = await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get('catalog-v1');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    if (cat?.catalog?.length) {
      state.catalog = [...CATALOG_SEED];
      mergeCatalog(cat.catalog);
      state.catalogMeta = cat.catalogMeta || {};
    }
  } catch (e) {
    console.warn('DB load failed', e);
  }
  applyTheme();
  await persist();
  render();
  if (state.settings.autoSync && state.settings.sheetEndpoint) scheduleAutoSync(900);
}

async function persist() {
  try {
    const db = await dbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ games: state.games, settings: state.settings }, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('DB save failed', e);
  }
}

function resolvedTheme() {
  if (state.settings.theme === 'light' || state.settings.theme === 'dark') return state.settings.theme;
  return systemThemeQuery?.matches ? 'dark' : 'light';
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#101217' : '#f4f6fa');
}

systemThemeQuery?.addEventListener?.('change', () => {
  if (state.settings.theme === 'system') applyTheme();
});

function setToast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => {
    if (state.toast === msg) {
      state.toast = '';
      render();
    }
  }, 2200);
}

function navigate(view) {
  state.view = view;
  state.platformFilter = '';
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

function openGame(id) {
  state.modal = { type: 'game', id };
  render();
}

function openAddCompleted(prefill = {}) {
  state.modal = {
    type: 'edit',
    mode: 'completed',
    game: {
      id: '', status: 'completed', platform: recommendedPlatform(), rating: '', releaseYear: '', genre: '', franchise: '', coverUrl: '', replay: 0, notes: '', title: '', ...prefill,
    },
  };
  render();
}

function openAddPlaying(group = '') {
  state.modal = {
    type: 'playing',
    group,
    game: { title: '', platform: recommendedPlatform(group), releaseYear: '', genre: '', franchise: '', coverUrl: '' },
  };
  render();
}

function openEdit(id, forceCompleted = false) {
  const g = state.games.find(x => x.id === id);
  if (!g) return;
  state.modal = { type: 'edit', mode: 'edit', game: { ...g, ...(forceCompleted ? { status: 'completed' } : {}) } };
  render();
}

function playingGamesForPlatform(platformId) {
  return liveGames().filter(g => g.status === 'playing' && g.platform === platformId)
    .sort((a,b) => String(b.updatedAt || b.addedAt || '').localeCompare(String(a.updatedAt || a.addedAt || '')));
}

function openFinishRotation(group) {
  const currentGame = currentPlayingFor(group);
  const currentId = currentGame?.platform || currentPlatformFor(group);
  const nextId = nextPlatformAfter(currentId, group);
  const candidates = playingGamesForPlatform(currentId);
  state.modal = { type: 'finish-rotation', group, currentId, nextId, selectedId: candidates[0]?.id || '' };
  render();
}

function rotationFor(group) { return group === 'desktop' ? state.settings.desktopRotation : state.settings.handheldRotation; }
function currentSettingKey(group) { return group === 'desktop' ? 'currentDesktop' : 'currentHandheld'; }
function currentPlatformFor(group) { return state.settings[currentSettingKey(group)] || rotationFor(group)[0]; }
function nextPlatformAfter(id, group) {
  const rotation = rotationFor(group);
  const i = rotation.indexOf(id);
  return rotation[(i >= 0 ? i + 1 : 0) % rotation.length];
}
function setCurrentPlatform(id) {
  const p = platform(id);
  state.settings[currentSettingKey(p.group)] = id;
}
function currentPlayingFor(group) {
  return liveGames().filter(g => g.status === 'playing' && platform(g.platform).group === group)
    .sort((a, b) => String(b.updatedAt || b.addedAt || '').localeCompare(String(a.updatedAt || a.addedAt || '')))[0] || null;
}
function recommendedPlatform(group = '') {
  if (group === 'handheld' || group === 'desktop') return currentPlatformFor(group);
  const hh = currentPlayingFor('handheld');
  const desk = currentPlayingFor('desktop');
  if (hh && !desk) return currentPlatformFor('desktop');
  if (desk && !hh) return currentPlatformFor('handheld');
  return currentPlatformFor('handheld');
}

function countsByPlatform() {
  const map = Object.fromEntries(PLATFORMS.map(p => [p.id, 0]));
  for (const g of liveGames().filter(g => g.status === 'completed')) map[g.platform] = (map[g.platform] || 0) + 1;
  return map;
}

function filteredGames() {
  return liveGames().filter(g => {
    if (state.platformFilter && g.platform !== state.platformFilter) return false;
    if (state.statusFilter !== 'all' && g.status !== state.statusFilter) return false;
    if (state.search && !`${g.title} ${platform(g.platform).name} ${g.releaseYear || ''} ${g.genre || ''} ${g.franchise || ''}`.toLowerCase().includes(state.search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => String(b.addedAt || b.updatedAt || '').localeCompare(String(a.addedAt || a.updatedAt || '')));
}

function platformIcon(id) {
  const common = 'viewBox="0 0 72 44" aria-hidden="true" focusable="false"';
  const shapes = {
    PSP: `<svg ${common}><rect x="4" y="8" width="64" height="28" rx="9"/><rect class="screen" x="23" y="11" width="26" height="22" rx="2"/><circle class="detail" cx="14" cy="22" r="4"/><circle class="detail" cx="58" cy="18" r="2"/><circle class="detail" cx="62" cy="23" r="2"/></svg>`,
    VITA: `<svg ${common}><path d="M9 8h54c4 0 7 5 7 14s-3 14-7 14H9c-4 0-7-5-7-14S5 8 9 8Z"/><rect class="screen" x="22" y="10" width="28" height="24" rx="2"/><circle class="detail" cx="14" cy="22" r="4"/><circle class="detail" cx="58" cy="22" r="4"/><circle class="detail" cx="17" cy="31" r="2.5"/><circle class="detail" cx="55" cy="31" r="2.5"/></svg>`,
    DSI: `<svg ${common}><rect x="15" y="2" width="42" height="19" rx="3"/><rect x="15" y="23" width="42" height="19" rx="3"/><rect class="screen" x="23" y="5" width="26" height="13" rx="1"/><rect class="screen" x="23" y="26" width="26" height="13" rx="1"/><line class="detail-line" x1="27" y1="22" x2="45" y2="22"/><circle class="detail" cx="52" cy="32" r="2"/></svg>`,
    '3DS': `<svg ${common}><rect x="13" y="2" width="46" height="19" rx="4"/><rect x="13" y="23" width="46" height="19" rx="4"/><rect class="screen" x="21" y="5" width="30" height="13" rx="1"/><rect class="screen" x="23" y="26" width="26" height="13" rx="1"/><circle class="detail" cx="54" cy="32" r="2"/><circle class="detail" cx="18" cy="32" r="3"/><circle class="detail" cx="36" cy="20.5" r="1"/></svg>`,
    GBA: `<svg ${common}><path d="M9 4h54c4 0 7 4 7 9v22c0 4-3 7-7 7H9c-4 0-7-3-7-7V13c0-5 3-9 7-9Z"/><rect class="screen" x="23" y="7" width="27" height="22" rx="2"/><circle class="detail" cx="15" cy="24" r="4"/><circle class="detail" cx="58" cy="19" r="2.4"/><circle class="detail" cx="62" cy="25" r="2.4"/></svg>`,
    PS3: `<svg ${common}><path d="M8 11c15-5 41-5 56 0v23H8Z"/><path class="screen" d="M18 15c10-2 26-2 36 0v13H18Z"/></svg>`,
    WIIU: `<svg ${common}><rect x="5" y="7" width="62" height="30" rx="8"/><rect class="screen" x="22" y="10" width="28" height="22" rx="2"/><circle class="detail" cx="14" cy="18" r="3"/><circle class="detail" cx="58" cy="18" r="3"/><circle class="detail" cx="14" cy="29" r="2.5"/><circle class="detail" cx="58" cy="29" r="2.5"/></svg>`,
    SWITCH: `<svg ${common}><rect x="18" y="6" width="36" height="32" rx="3"/><rect class="screen" x="22" y="9" width="28" height="26" rx="1"/><path d="M9 5h9v34H9c-4 0-7-4-7-9V14c0-5 3-9 7-9ZM54 5h9c4 0 7 4 7 9v16c0 5-3 9-7 9h-9Z"/><circle class="detail" cx="11" cy="16" r="3"/><circle class="detail" cx="61" cy="28" r="3"/></svg>`,
  };
  return `<span class="device-icon">${shapes[id] || shapes.PSP}</span>`;
}

function navButtons() {
  return [
    ['home', 'Главная'], ['playing', 'Сейчас играю'], ['games', 'Игры'], ['timeline', 'Лог'], ['stats', 'Статистика'], ['settings', 'Настройки'],
  ].map(([v, label]) => `<button data-nav="${v}" class="${state.view === v ? 'active' : ''}">${label}</button>`).join('');
}

function render() {
  applyTheme();
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><div class="brand-mark brand-logo"><img src="./logo-192.png" alt=""></div><div><h1>Memory Card</h1><p>Твой игровой архив</p></div></div>
        <button class="primary" data-action="add">+ Прошёл игру</button>
      </header>
      <div class="layout">
        <aside class="sidebar"><nav class="nav">${navButtons()}</nav></aside>
        <main class="content">${renderView()}</main>
      </div>
    </div>
    <nav class="mobile-nav">${navButtons()}</nav>
    ${state.modal ? renderModal() : ''}
    ${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ''}`;
  bind();
}

function renderView() {
  if (state.view === 'playing') return renderPlayingView();
  if (state.view === 'games') return renderGames();
  if (state.view === 'timeline') return renderTimeline();
  if (state.view === 'stats') return renderStats();
  if (state.view === 'settings') return renderSettings();
  return renderHome();
}

function renderRotationCard(group) {
  const label = group === 'handheld' ? 'Портативная ротация' : 'Desktop-ротация';
  const currentGame = currentPlayingFor(group);
  const currentId = currentGame?.platform || currentPlatformFor(group);
  const nextId = nextPlatformAfter(currentId, group);
  const rotation = rotationFor(group);
  const chips = rotation.map(id => {
    const inner = `${platformIcon(id)}<span>${platform(id).abbr}</span>`;
    if (id === nextId) return `<button class="rotation-chip next rotation-next-button" data-action="advance-rotation" data-group="${group}" title="Завершить игру на ${platform(currentId).name} и перейти на ${platform(nextId).name}">${inner}</button>`;
    return `<span class="rotation-chip ${id === currentId ? 'current' : ''}">${inner}</span>`;
  }).join('<span class="rotation-arrow">→</span>');
  return `<section class="rotation-card">
    <div class="rotation-head">
      <div><div class="rotation-title">${label}</div>${currentGame ? `<div class="rotation-playing">${esc(currentGame.title)}</div><div class="meta">${platform(currentGame.platform).name}${currentGame.releaseYear ? ` · ${currentGame.releaseYear}` : ''}${currentGame.genre ? ` · ${esc(currentGame.genre)}` : ''}</div>` : `<div class="rotation-playing muted">Игра не выбрана</div>`}</div>
    </div>
    <div class="rotation-row">${chips}</div>
    <div class="status-line">${currentGame ? `Текущая: <b>${platform(currentId).abbr}</b>` : `По ротации: <b>${platform(currentId).abbr}</b>`} · нажми на <button class="next-inline" data-action="advance-rotation" data-group="${group}">${platform(nextId).abbr}</button>, когда закончишь текущую игру.</div>
  </section>`;
}

function coverMarkup(g, cls = 'cover') {
  const hue = franchiseHue(g.franchise, g.title);
  const img = safeImage(g.coverUrl);
  const initials = String(g.title || '?').split(/\s+/).slice(0, 3).map(x => x[0]).join('').toUpperCase();
  return `<div class="${cls} ${img ? 'has-image' : ''}" style="--coverHue:${hue}">${img ? `<img loading="lazy" src="${esc(img)}" alt="Обложка ${esc(g.title)}" onerror="this.parentElement.classList.add('image-failed');this.remove()">` : ''}<div class="cover-fallback"><span class="cover-franchise">${esc(g.franchise || platform(g.platform).abbr)}</span><strong>${esc(initials)}</strong></div><span class="cover-platform-badge">${platform(g.platform).abbr}</span></div>`;
}
function franchiseChip(g) { return g.franchise ? `<span class="chip franchise-chip">${esc(g.franchise)}</span>` : ''; }

function renderHome() {
  const counts = countsByPlatform();
  const completed = liveGames().filter(g => g.status === 'completed');
  const recent = [...completed].sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || ''))).slice(0, 5);
  return `
    <section class="hero">
      <div>
        <h2>Все прохождения — в одной памяти.</h2>
        <p>Веди отдельные ротации портативок и больших консолей, отмечай пройденные игры и синхронизируй архив с Google Sheets.</p>
        <div class="hero-actions"><button class="primary" data-action="add">+ Прошёл игру</button><button class="secondary" data-action="add-playing">Сейчас играю</button></div>
      </div>
      <div class="hero-mini"><div class="hero-mini-value">${completed.length}</div><div class="hero-mini-label">игр в архиве</div></div>
    </section>
    <div class="rotation-grid">${renderRotationCard('handheld')}${renderRotationCard('desktop')}</div>
    <div class="section-head"><div><h2>Платформы</h2><p>Открой устройство и посмотри историю прохождений.</p></div></div>
    <div class="cards">${PLATFORMS.map(p => `<button class="platform-card platform-${p.id.toLowerCase()}" data-platform="${p.id}"><div class="platform-top">${platformIcon(p.id)}<div><div class="platform-abbr">${p.abbr}</div><div class="platform-name">${p.name}</div></div></div><div class="platform-count">${counts[p.id] || 0} пройдено</div></button>`).join('')}</div>
    <section class="panel recent-panel"><div class="section-head"><div><h2 class="h3">Последние добавленные прохождения</h2></div></div>${recent.length ? `<div class="list">${recent.map(gameRow).join('')}</div>` : `<div class="empty">Пока пусто. Добавь первую игру.</div>`}</section>`;
}

function gameRow(g) {
  return `<button class="game-row with-cover" data-game="${g.id}">${coverMarkup(g, 'mini-cover')}<div><div class="game-title">${esc(g.title)}</div><div class="meta">${platform(g.platform).abbr}${g.releaseYear ? ` · ${g.releaseYear}` : ''}${g.genre ? ` · ${esc(g.genre)}` : ''}${g.franchise ? ` · ${esc(g.franchise)}` : ''} · добавлено ${fmtDateTime(g.addedAt)}</div></div><div class="rating-text">${g.rating ? `${ratingStars(g.rating)} <span>${g.rating}/10</span>` : ''}</div></button>`;
}

function renderPlayingView() {
  const all = liveGames().filter(g => g.status === 'playing').sort((a,b) => String(b.updatedAt || b.addedAt || '').localeCompare(String(a.updatedAt || a.addedAt || '')));
  const groupBlock = (group) => {
    const title = group === 'handheld' ? 'Портативки' : 'Desktop';
    const arr = all.filter(g => platform(g.platform).group === group);
    const suggested = currentPlatformFor(group);
    return `<section class="panel playing-group"><div class="section-head"><div><h2 class="h3">${title}</h2><p>${arr.length ? `${arr.length} активн${arr.length === 1 ? 'ая игра' : 'ых игры'}` : `Следующая по ротации: ${platform(suggested).name}`}</p></div><button class="secondary compact" data-action="add-playing" data-group="${group}">+ Добавить</button></div>${arr.length ? `<div class="playing-list">${arr.map(g => `<article class="playing-card">${coverMarkup(g, 'playing-cover')}<div class="playing-main"><div class="game-title">${esc(g.title)}</div><div class="meta">${platform(g.platform).name}${g.releaseYear ? ` · ${g.releaseYear}` : ''}${g.genre ? ` · ${esc(g.genre)}` : ''}${g.franchise ? ` · ${esc(g.franchise)}` : ''}</div></div><div class="playing-actions"><button class="ghost compact" data-game="${g.id}">Открыть</button><button class="primary compact" data-action="finish" data-id="${g.id}">Прошёл</button></div></article>`).join('')}</div>` : `<div class="empty">Сейчас здесь ничего не запущено.</div>`}</section>`;
  };
  return `<div class="section-head"><div><h2>Сейчас играю</h2><p>Только активные игры — отдельно от общего архива.</p></div></div><div class="playing-view-grid">${groupBlock('handheld')}${groupBlock('desktop')}</div>`;
}

function renderGames() {
  const games = filteredGames();
  return `<div class="section-head"><div><h2>${state.platformFilter ? platform(state.platformFilter).name : 'Игры'}</h2><p>${games.length} записей в текущем фильтре</p></div>${state.platformFilter ? '<button class="ghost" data-action="clear-platform">Все платформы</button>' : ''}</div>
    <div class="toolbar">
      <div class="field"><label>Поиск</label><input id="search" placeholder="Название игры…" value="${esc(state.search)}"></div>
      <div class="field"><label>Статус</label><select id="statusFilter"><option value="all">Все</option><option value="completed" ${state.statusFilter === 'completed' ? 'selected' : ''}>Пройдено</option><option value="playing" ${state.statusFilter === 'playing' ? 'selected' : ''}>Играю</option><option value="dropped" ${state.statusFilter === 'dropped' ? 'selected' : ''}>Брошено</option><option value="backlog" ${state.statusFilter === 'backlog' ? 'selected' : ''}>Хочу пройти</option></select></div>
      <div class="field"><label>Платформа</label><select id="platformFilter"><option value="">Все</option>${PLATFORMS.map(p => `<option value="${p.id}" ${state.platformFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
    </div>
    ${games.length ? `<div class="game-grid">${games.map(gameCard).join('')}</div>` : `<div class="empty">Ничего не найдено.</div>`}`;
}

function gameCard(g) {
  return `<article class="game-card" data-game="${g.id}">${coverMarkup(g)}<div class="game-body"><div class="game-card-kicker">${platform(g.platform).name}${g.releaseYear ? ` · ${g.releaseYear}` : ''}</div><h3>${esc(g.title)}</h3><div class="meta">${g.genre ? esc(g.genre) : 'Жанр не указан'}</div><div class="chips">${franchiseChip(g)}<span class="chip ${g.status === 'completed' ? 'success' : ''}">${statusLabel(g.status)}</span>${g.rating ? `<span class="chip stars-chip">★ ${g.rating}/10</span>` : ''}${g.replay ? `<span class="chip">Прохождение №${Number(g.replay) + 1}</span>` : ''}</div></div></article>`;
}

function renderTimeline() {
  const games = liveGames().filter(g => g.addedAt).sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  const groups = {};
  for (const g of games) (groups[monthKey(g.addedAt)] ??= []).push(g);
  return `<div class="section-head"><div><h2>Лог</h2><p>Дата здесь означает момент, когда запись была добавлена в Memory Card.</p></div></div>${games.length ? `<div class="timeline">${Object.entries(groups).map(([month, arr]) => `<section class="panel"><div class="month-title">${month}</div>${arr.map(g => `<button class="timeline-item" data-game="${g.id}"><div class="timeline-date">${fmtDateTime(g.addedAt)}</div><div><div class="game-title">${esc(g.title)}</div><div class="meta">${platform(g.platform).name} · ${statusLabel(g.status)}</div></div><div class="rating">${g.rating ? `${g.rating}/10` : ''}</div></button>`).join('')}</section>`).join('')}</div>` : `<div class="empty">Добавленные игры появятся здесь автоматически.</div>`}`;
}

function renderStats() {
  const games = liveGames();
  const completed = games.filter(g => g.status === 'completed');
  const playing = games.filter(g => g.status === 'playing');
  const ratings = completed.map(g => Number(g.rating)).filter(n => n > 0);
  const counts = countsByPlatform();
  const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const tens = completed.filter(g => Number(g.rating) === 10).length;
  const franchiseCounts = {};
  completed.forEach(g => { const f = inferFranchise(g.title, g.franchise); if (f) franchiseCounts[f] = (franchiseCounts[f] || 0) + 1; });
  const topFranchises = Object.entries(franchiseCounts).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  return `<div class="section-head"><div><h2>Статистика</h2><p>Твой игровой архив в цифрах.</p></div></div>
    <div class="stats"><div class="stat-card"><div class="stat-value">${completed.length}</div><div class="stat-label">Игр пройдено</div></div><div class="stat-card"><div class="stat-value">${ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—'}</div><div class="stat-label">Средняя оценка</div></div><div class="stat-card"><div class="stat-value">${playing.length}</div><div class="stat-label">Сейчас играю</div></div><div class="stat-card"><div class="stat-value">${tens}</div><div class="stat-label">Игр на 10/10</div></div></div>
    <section class="panel stats-platforms"><div class="section-head"><div><h2 class="h3">По платформам</h2></div></div><div class="list">${PLATFORMS.map(p => `<div class="game-row static-row"><div class="platform-inline">${platformIcon(p.id)}<div><div class="game-title">${p.name}</div><div class="meta">${p.group === 'handheld' ? 'Портативная' : 'Desktop'}</div></div></div><div class="rating">${counts[p.id] || 0}</div></div>`).join('')}</div>${favorite && favorite[1] ? `<div class="footer-note">Чаще всего пройдено на ${platform(favorite[0]).name}.</div>` : ''}</section>
    ${topFranchises.length ? `<section class="panel franchise-stats"><div class="section-head"><div><h2 class="h3">Франшизы</h2><p>Автоматически определено по твоей библиотеке.</p></div></div><div class="franchise-grid">${topFranchises.map(([name,count]) => `<div class="franchise-stat" style="--franchiseHue:${franchiseHue(name)}"><span>${esc(name)}</span><strong>${count}</strong></div>`).join('')}</div></section>` : ''}`;
}

function rotationEditor(group) {
  const rotation = rotationFor(group);
  const title = group === 'handheld' ? 'Портативная ротация' : 'Desktop-ротация';
  const currentKey = currentSettingKey(group);
  return `<section class="panel"><div class="settings-panel-head"><div><h3>${title}</h3><p class="status-line">Меняй порядок кнопками. Первая и последняя позиции замыкаются в цикл.</p></div><div class="field current-select"><label>Текущее устройство</label><select data-current-group="${group}">${rotation.map(id => `<option value="${id}" ${state.settings[currentKey] === id ? 'selected' : ''}>${platform(id).name}</option>`).join('')}</select></div></div><div class="rotation-editor">${rotation.map((id, index) => `<div class="rotation-edit-row"><div class="platform-inline">${platformIcon(id)}<div><div class="game-title">${platform(id).name}</div><div class="meta">${index + 1} в очереди</div></div></div><div class="order-actions"><button class="ghost icon-small" data-action="rotation-move" data-group="${group}" data-id="${id}" data-direction="up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="ghost icon-small" data-action="rotation-move" data-group="${group}" data-id="${id}" data-direction="down" ${index === rotation.length - 1 ? 'disabled' : ''}>↓</button></div></div>`).join('')}</div></section>`;
}

function renderSettings() {
  return `<div class="section-head"><div><h2>Настройки</h2><p>Ротации, тема, синхронизация и резервная копия.</p></div></div><div class="settings-grid">
    <section class="panel"><h3>Оформление</h3><div class="field theme-field"><label>Тема</label><select id="themeMode"><option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>Системная</option><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Светлая</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Тёмная</option></select></div><div class="footer-note">В режиме «Системная» приложение автоматически следует теме устройства.</div></section>
    <div class="rotation-settings-grid">${rotationEditor('handheld')}${rotationEditor('desktop')}</div>
    <section class="panel"><div class="settings-panel-head"><div><h3>Каталог игр и обложки</h3><p class="status-line">Каталог нужен для автоподстановки названия, года и жанра. Обложки для твоих записей дополнительно ищутся через Wikipedia.</p></div><div class="settings-actions"><button class="secondary" data-action="catalog-refresh-all">Обновить каталог</button><button class="secondary" data-action="covers-refresh">Обновить обложки</button></div></div><div id="catalogStatus" class="catalog-status">${PLATFORMS.map(p => `${p.abbr}: <b>${catalogCounts()[p.id] || 0}</b>`).join(' · ')}</div><div class="footer-note">Обновление каталога теперь также обогащает уже добавленные игры. Если конкретной обложки нет в Wikidata, приложение ищет её отдельно по названию игры.</div></section>
    <section class="panel"><h3>Google Sheets · облачная синхронизация</h3><p class="status-line">Одна Google Таблица может быть общим облаком для Mac и телефона. Конфликты решаются по времени последнего изменения записи.</p><div class="form-grid"><div class="field span-2"><label>Apps Script endpoint</label><input id="sheetEndpoint" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(state.settings.sheetEndpoint || '')}"></div><div class="field span-2"><label>Секрет синхронизации</label><input id="syncSecret" type="password" value="${esc(state.settings.syncSecret || '')}"></div><label class="sync-toggle span-2"><input id="autoSync" type="checkbox" ${state.settings.autoSync !== false ? 'checked' : ''}><span><b>Автосинхронизация</b><small>Подтягивать изменения при открытии приложения и отправлять изменения после сохранения.</small></span></label></div><div class="settings-actions"><button class="primary" data-action="sync">Синхронизировать сейчас</button><button class="secondary" data-action="save-settings">Сохранить настройки</button></div><div class="status-line sync-status">${state.settings.lastSync ? `Последняя синхронизация: ${new Date(state.settings.lastSync).toLocaleString('ru-RU')}` : 'Синхронизация ещё не выполнялась.'}</div><div class="footer-note">Endpoint и секрет намеренно хранятся только локально на каждом устройстве и не записываются в Google Таблицу.</div></section>
    <section class="panel"><h3>Резервная копия</h3><div class="settings-actions"><button class="secondary" data-action="export">Экспорт JSON</button><label class="secondary file-label">Импорт JSON<input id="importFile" type="file" accept="application/json" hidden></label></div><div class="footer-note">Экспорт содержит игры и настройки приложения.</div></section>
  </div>`;
}

function starPicker(value) {
  const current = Number(value) || 0;
  return `<div class="star-picker" role="radiogroup" aria-label="Моя оценка от 1 до 10"><input type="hidden" name="rating" value="${current || ''}">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button type="button" class="star-button ${n <= current ? 'selected' : ''}" data-rating="${n}" aria-label="${n} из 10" title="${n}/10">★</button>`).join('')}<span class="star-value">${current ? `${current}/10` : 'Без оценки'}</span></div>`;
}

function renderGameModal(g) {
  return `<div class="modal-backdrop" data-action="close"><div class="modal" data-stop><div class="game-detail-hero">${coverMarkup(g, 'detail-cover')}<div class="game-detail-title"><div class="game-card-kicker">${platform(g.platform).name}${g.releaseYear ? ` · ${g.releaseYear}` : ''}</div><h3>${esc(g.title)}</h3>${g.franchise ? `<div class="franchise-label">${esc(g.franchise)}</div>` : ''}</div><button class="icon-btn detail-close" data-action="close">×</button></div>
    <div class="game-detail-stats"><div class="stat-card"><div class="detail-stars">${g.rating ? ratingStars(g.rating) : '—'}</div><div class="stat-label">${g.rating ? `${g.rating}/10` : 'Оценка'}</div></div><div class="stat-card"><div class="stat-value small-value">${g.releaseYear || '—'}</div><div class="stat-label">Год выхода</div></div><div class="stat-card"><div class="stat-value small-value">${fmtDateTime(g.addedAt)}</div><div class="stat-label">Добавлено</div></div></div>
    <div class="panel detail-panel"><div class="meta">Статус</div><div class="game-title">${statusLabel(g.status)}</div>${g.genre ? `<div class="meta detail-gap">Жанр</div><div>${esc(g.genre)}</div>` : ''}${g.franchise ? `<div class="meta detail-gap">Франшиза</div><div>${esc(g.franchise)}</div>` : ''}${g.replay ? `<div class="meta detail-gap">Прохождение</div><div>№${Number(g.replay) + 1}</div>` : ''}${g.notes ? `<div class="meta detail-gap">Комментарий</div><div class="notes">${esc(g.notes)}</div>` : ''}</div>
    <div class="modal-actions"><button class="danger" data-action="delete" data-id="${g.id}">Удалить</button><div class="right-actions">${g.status === 'playing' ? `<button class="secondary" data-action="finish" data-id="${g.id}">Отметить пройденной</button>` : ''}<button class="secondary" data-action="close">Закрыть</button><button class="primary" data-action="edit" data-id="${g.id}">Редактировать</button></div></div>
  </div></div>`;
}

function autocompleteField(g, compact = false) {
  return `<div class="field ${compact ? '' : 'span-2'} autocomplete-field"><label>Название игры</label><div class="autocomplete-wrap"><input name="title" data-game-title required autocomplete="off" value="${esc(g.title || '')}" placeholder="LocoRoco"><div class="autocomplete-list" data-autocomplete-list hidden></div></div></div>`;
}

function renderPlayingModal(g) {
  return `<div class="modal-backdrop" data-action="close"><form class="modal small-modal" id="playingForm" data-stop><div class="modal-head"><div><h3>Сейчас играю</h3><div class="meta">Начни вводить название — приложение предложит игры для выбранной платформы.</div></div><button type="button" class="icon-btn" data-action="close">×</button></div><div class="form-grid one-col"><div class="field"><label>Платформа</label><select name="platform" data-game-platform>${PLATFORMS.map(p => `<option value="${p.id}" ${g.platform === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>${autocompleteField(g, true)}<div class="field"><label>Год выхода</label><input name="releaseYear" data-game-year inputmode="numeric" value="${esc(g.releaseYear || '')}" placeholder="2006"></div><input type="hidden" name="genre" data-game-genre value="${esc(g.genre || '')}"><input type="hidden" name="franchise" data-game-franchise value="${esc(g.franchise || '')}"><input type="hidden" name="coverUrl" data-game-cover value="${esc(g.coverUrl || '')}"><div class="catalog-picked" data-catalog-picked>${g.genre || g.franchise ? `${g.genre ? `Жанр: <b>${esc(g.genre)}</b>` : ''}${g.franchise ? `${g.genre ? ' · ' : ''}Франшиза: <b>${esc(g.franchise)}</b>` : ''}` : 'Жанр и франшиза подставятся при выборе игры из каталога.'}</div></div><div class="modal-actions"><button type="button" class="secondary" data-action="close">Отмена</button><div class="right-actions"><button class="primary" type="submit">Добавить</button></div></div></form></div>`;
}


function renderFinishRotationModal(m) {
  const candidates = playingGamesForPlatform(m.currentId);
  const selected = candidates.find(g => g.id === m.selectedId) || candidates[0];
  return `<div class="modal-backdrop" data-action="close"><form class="modal small-modal finish-rotation-modal" id="finishRotationForm" data-stop>
    <div class="modal-head"><div><h3>Завершить прохождение</h3><div class="meta">${platform(m.currentId).name} → ${platform(m.nextId).name}</div></div><button type="button" class="icon-btn" data-action="close">×</button></div>
    <div class="rotation-transition"><div class="transition-device current">${platformIcon(m.currentId)}<span>${platform(m.currentId).abbr}</span></div><span>→</span><div class="transition-device next">${platformIcon(m.nextId)}<span>${platform(m.nextId).abbr}</span></div></div>
    ${candidates.length ? `<div class="form-grid one-col"><div class="field"><label>Что ты закончил на ${platform(m.currentId).abbr}</label><select name="gameId" id="finishGameId">${candidates.map(g => `<option value="${g.id}" ${g.id === selected?.id ? 'selected' : ''}>${esc(g.title)}${g.releaseYear ? ` (${g.releaseYear})` : ''}</option>`).join('')}</select></div><div class="finish-game-preview">${selected ? coverMarkup(selected, 'playing-cover') : ''}<div><div class="game-title">${esc(selected?.title || '')}</div><div class="meta">После сохранения игра уйдёт в «Пройдено», а ротация переключится на ${platform(m.nextId).name}.</div></div></div><div class="field"><label>№ перепрохождения</label><input name="replay" type="number" min="0" step="1" value="${esc(selected?.replay || 0)}"></div><div class="field"><label>Моя оценка</label>${starPicker(selected?.rating)}</div><div class="field"><label>Комментарий</label><textarea name="notes" placeholder="Что запомнилось, впечатления…">${esc(selected?.notes || '')}</textarea></div></div><div class="modal-actions"><button type="button" class="secondary" data-action="close">Отмена</button><button class="primary" type="submit">Завершить и перейти на ${platform(m.nextId).abbr}</button></div>` : `<div class="empty">На ${platform(m.currentId).name} сейчас нет игры со статусом «Играю». Сначала добавь её в разделе «Сейчас играю».</div><div class="modal-actions"><button type="button" class="secondary" data-action="close">Закрыть</button><button type="button" class="primary" data-action="go-playing">Открыть «Сейчас играю»</button></div>`}
  </form></div>`;
}
function renderEditModal(g) {
  const editing = Boolean(g.id);
  return `<div class="modal-backdrop" data-action="close"><form class="modal" id="gameForm" data-stop><div class="modal-head"><div><h3>${editing ? 'Редактировать игру' : 'Прошёл игру'}</h3><div class="meta">Выбери игру из подсказок — год, жанр, франшиза и обложка подставятся автоматически.</div></div><button type="button" class="icon-btn" data-action="close">×</button></div><div class="form-grid">${autocompleteField(g)}<div class="field"><label>Платформа</label><select name="platform" data-game-platform>${PLATFORMS.map(p => `<option value="${p.id}" ${g.platform === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div><div class="field"><label>Год выхода</label><input name="releaseYear" data-game-year inputmode="numeric" value="${esc(g.releaseYear || '')}" placeholder="2006"></div><div class="field"><label>Жанр</label><input name="genre" data-game-genre value="${esc(g.genre || '')}" placeholder="Action-adventure"></div><div class="field"><label>Франшиза</label><input name="franchise" data-game-franchise value="${esc(g.franchise || inferFranchise(g.title))}" placeholder="Metroid"></div><input type="hidden" name="coverUrl" data-game-cover value="${esc(g.coverUrl || '')}">${editing ? `<div class="field"><label>Статус</label><select name="status"><option value="completed" ${g.status === 'completed' ? 'selected' : ''}>Пройдено</option><option value="playing" ${g.status === 'playing' ? 'selected' : ''}>Играю</option><option value="dropped" ${g.status === 'dropped' ? 'selected' : ''}>Брошено</option><option value="backlog" ${g.status === 'backlog' ? 'selected' : ''}>Хочу пройти</option></select></div>` : '<input type="hidden" name="status" value="completed">'}<div class="field"><label>№ перепрохождения</label><input name="replay" type="number" min="0" step="1" value="${esc(g.replay || 0)}"></div><div class="field span-2"><label>Моя оценка</label>${starPicker(g.rating)}</div><div class="field span-2"><label>Комментарий</label><textarea name="notes" placeholder="Что запомнилось, впечатления, любимые моменты…">${esc(g.notes || '')}</textarea></div></div><div class="modal-actions"><button type="button" class="secondary" data-action="close">Отмена</button><div class="right-actions"><button class="primary" type="submit">${editing ? 'Сохранить' : 'Добавить'}</button></div></div></form></div>`;
}

function renderModal() {
  if (state.modal.type === 'game') {
    const g = state.games.find(x => x.id === state.modal.id);
    return g ? renderGameModal(g) : '';
  }
  if (state.modal.type === 'playing') return renderPlayingModal(state.modal.game);
  if (state.modal.type === 'finish-rotation') return renderFinishRotationModal(state.modal);
  return renderEditModal(state.modal.game);
}

function bind() {
  document.querySelectorAll('[data-nav]').forEach(x => x.onclick = () => navigate(x.dataset.nav));
  document.querySelectorAll('[data-action="add"]').forEach(x => x.onclick = () => openAddCompleted());
  document.querySelectorAll('[data-action="add-playing"]').forEach(x => x.onclick = () => openAddPlaying(x.dataset.group || ''));
  document.querySelectorAll('[data-action="advance-rotation"]').forEach(x => x.onclick = () => openFinishRotation(x.dataset.group));
  document.querySelectorAll('[data-action="go-playing"]').forEach(x => x.onclick = () => { state.modal = null; state.view = 'playing'; render(); });
  document.querySelectorAll('[data-platform]').forEach(x => x.onclick = () => { state.platformFilter = x.dataset.platform; state.view = 'games'; render(); });
  document.querySelectorAll('[data-game]').forEach(x => x.onclick = () => openGame(x.dataset.game));
  document.querySelectorAll('[data-action="close"]').forEach(x => x.onclick = () => closeModal());
  document.querySelectorAll('[data-stop]').forEach(x => x.onclick = e => e.stopPropagation());
  document.querySelectorAll('[data-action="edit"]').forEach(x => x.onclick = () => openEdit(x.dataset.id));
  document.querySelectorAll('[data-action="finish"]').forEach(x => x.onclick = () => openEdit(x.dataset.id, true));
  document.querySelectorAll('[data-action="delete"]').forEach(x => x.onclick = () => deleteGame(x.dataset.id));
  document.querySelectorAll('[data-action="clear-platform"]').forEach(x => x.onclick = () => { state.platformFilter = ''; render(); });
  document.querySelectorAll('[data-action="save-settings"]').forEach(x => x.onclick = saveSettings);
  document.querySelectorAll('[data-action="sync"]').forEach(x => x.onclick = syncSheets);
  document.querySelectorAll('[data-action="export"]').forEach(x => x.onclick = exportData);
  document.querySelectorAll('[data-action="rotation-move"]').forEach(x => x.onclick = () => moveRotation(x.dataset.group, x.dataset.id, x.dataset.direction));
  document.querySelectorAll('[data-action="catalog-refresh-all"]').forEach(x => x.onclick = refreshAllCatalog);
  document.querySelectorAll('[data-action="covers-refresh"]').forEach(x => x.onclick = refreshMissingCovers);

  bindAutocomplete();

  const gameForm = document.querySelector('#gameForm');
  if (gameForm) gameForm.onsubmit = saveGame;
  const playingForm = document.querySelector('#playingForm');
  if (playingForm) playingForm.onsubmit = savePlaying;
  const finishRotationForm = document.querySelector('#finishRotationForm');
  if (finishRotationForm) {
    finishRotationForm.onsubmit = finishRotation;
    const sel = finishRotationForm.querySelector('#finishGameId');
    if (sel) sel.onchange = () => { state.modal.selectedId = sel.value; render(); };
  }

  document.querySelectorAll('[data-rating]').forEach(btn => btn.onclick = () => setRating(Number(btn.dataset.rating)));

  const search = document.querySelector('#search');
  if (search) search.oninput = e => { const pos = e.target.selectionStart; state.search = e.target.value; render(); const next = document.querySelector('#search'); if (next) { next.focus(); next.setSelectionRange(pos, pos); } };
  const sf = document.querySelector('#statusFilter');
  if (sf) sf.onchange = e => { state.statusFilter = e.target.value; render(); };
  const pf = document.querySelector('#platformFilter');
  if (pf) pf.onchange = e => { state.platformFilter = e.target.value; render(); };
  const theme = document.querySelector('#themeMode');
  if (theme) theme.onchange = e => { state.settings.theme = e.target.value; state.settings.settingsUpdatedAt = nowIso(); applyTheme(); persist(); };
  document.querySelectorAll('[data-current-group]').forEach(sel => sel.onchange = async e => {
    state.settings[currentSettingKey(sel.dataset.currentGroup)] = e.target.value;
    state.settings.settingsUpdatedAt = nowIso();
    await persist();
    render();
    scheduleAutoSync();
  });
  const imp = document.querySelector('#importFile');
  if (imp) imp.onchange = importData;
}

function activeForm() { return document.querySelector('#gameForm') || document.querySelector('#playingForm'); }
function bindAutocomplete() {
  const form = activeForm();
  if (!form) return;
  const title = form.querySelector('[data-game-title]');
  const platformSel = form.querySelector('[data-game-platform]');
  if (!title || !platformSel) return;
  ensurePlatformCatalog(platformSel.value);
  title.oninput = () => showAutocomplete(title, platformSel.value);
  title.onfocus = () => showAutocomplete(title, platformSel.value);
  platformSel.onchange = () => {
    hideAutocomplete(form);
    ensurePlatformCatalog(platformSel.value);
    if (title.value.trim()) showAutocomplete(title, platformSel.value);
  };
  document.querySelectorAll('[data-catalog-select]').forEach(btn => btn.onclick = e => {
    e.preventDefault(); e.stopPropagation(); applyCatalogSuggestion(btn.dataset.catalogSelect);
  });
}
function showAutocomplete(input, platformId) {
  const form = input.closest('form');
  const box = form?.querySelector('[data-autocomplete-list]');
  if (!box) return;
  const q = input.value.trim();
  const items = catalogSearch(platformId, q);
  if (!q || !items.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = items.map(e => `<button type="button" class="autocomplete-item" data-catalog-select="${esc(e.key)}"><span><b>${esc(e.title)}</b><small>${[e.genre, e.franchise].filter(Boolean).map(esc).join(' · ') || 'Метаданные не указаны'}</small></span><em>${esc(e.releaseYear || '—')}</em></button>`).join('');
  box.hidden = false;
  box.querySelectorAll('[data-catalog-select]').forEach(btn => btn.onclick = ev => { ev.preventDefault(); applyCatalogSuggestion(btn.dataset.catalogSelect); });
}
function hideAutocomplete(form = activeForm()) {
  const box = form?.querySelector('[data-autocomplete-list]');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}
async function fetchWikipediaCover(title, releaseYear = '', platformId = '') {
  const cacheKey = `${normalizeText(title)}|${releaseYear}|${platformId}`;
  if (coverLookups.has(cacheKey)) return coverLookups.get(cacheKey);
  const job = (async () => {
    const attempts = [
      { host: 'en.wikipedia.org', query: `intitle:"${title}" video game` },
      { host: 'en.wikipedia.org', query: `"${title}" ${releaseYear || ''} video game` },
      { host: 'en.wikipedia.org', query: title },
      { host: 'ru.wikipedia.org', query: `intitle:"${title}" видеоигра` },
    ];
    for (const attempt of attempts) {
      try {
        const searchUrl = `https://${attempt.host}/w/api.php?action=query&format=json&origin=*&list=search&srnamespace=0&srlimit=6&srsearch=${encodeURIComponent(attempt.query)}`;
        const sr = await fetch(searchUrl);
        if (!sr.ok) continue;
        const sd = await sr.json();
        const rows = sd.query?.search || [];
        if (!rows.length) continue;
        const desired = normalizeText(title);
        rows.sort((a,b) => {
          const score = x => {
            const t = normalizeText(x.title || '');
            let n = t === desired ? 0 : t.startsWith(desired) ? 1 : t.includes(desired) ? 3 : 10;
            if (/video game|видеоигр/i.test(x.title || '')) n -= .5;
            return n;
          };
          return score(a) - score(b);
        });
        const ids = rows.slice(0,5).map(x => x.pageid).filter(Boolean).join('|');
        if (!ids) continue;
        const imageUrl = `https://${attempt.host}/w/api.php?action=query&format=json&origin=*&pageids=${ids}&prop=pageimages&piprop=thumbnail|original&pithumbsize=900`;
        const ir = await fetch(imageUrl);
        if (!ir.ok) continue;
        const idata = await ir.json();
        const pages = idata.query?.pages || {};
        for (const row of rows.slice(0,5)) {
          const page = pages[row.pageid];
          const found = safeImage(page?.thumbnail?.source || page?.original?.source || '');
          if (found) return found;
        }
      } catch (_) {}
    }
    return '';
  })();
  coverLookups.set(cacheKey, job);
  const result = await job;
  coverLookups.set(cacheKey, Promise.resolve(result));
  return result;
}

async function hydrateGameCover(game) {
  if (!game || game.deletedAt || game.coverUrl) return false;
  const titleKey = normalizeText(game.title);
  const cat = state.catalog.find(e => e.platform === game.platform && normalizeText(e.title) === titleKey && e.coverUrl)
    || state.catalog.find(e => normalizeText(e.title) === titleKey && e.coverUrl);
  let found = safeImage(cat?.coverUrl || '');
  if (!found) found = await fetchWikipediaCover(game.title, game.releaseYear, game.platform);
  if (!found) return false;
  game.coverUrl = found;
  game.updatedAt = nowIso();
  const matches = state.catalog.filter(e => e.platform === game.platform && normalizeText(e.title) === titleKey);
  matches.forEach(e => { if (!e.coverUrl) e.coverUrl = found; });
  return true;
}

async function hydrateMissingCoversForGames(platformId = '', limit = 60) {
  const pending = liveGames().filter(g => !g.coverUrl && (!platformId || g.platform === platformId)).slice(0, limit);
  if (!pending.length) return 0;
  let changed = 0;
  const queue = [...pending];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const g = queue.shift();
      if (await hydrateGameCover(g)) changed++;
    }
  });
  await Promise.all(workers);
  if (changed) {
    await persistCatalog();
    await persist();
    render();
  }
  return changed;
}

async function refreshMissingCovers() {
  setToast('Ищу обложки для твоей библиотеки…');
  const changed = await hydrateMissingCoversForGames('', 100);
  setToast(changed ? `Найдено обложек: ${changed}` : 'Новых обложек не найдено');
}

async function applyCatalogSuggestion(key) {
  const form = activeForm();
  const e = state.catalog.find(x => x.key === key);
  if (!form || !e) return;
  const title = form.querySelector('[data-game-title]');
  const year = form.querySelector('[data-game-year]');
  const genre = form.querySelector('[data-game-genre]');
  const franchise = form.querySelector('[data-game-franchise]');
  const cover = form.querySelector('[data-game-cover]');
  if (title) title.value = e.title;
  if (year && e.releaseYear) year.value = e.releaseYear;
  if (genre) genre.value = e.genre || '';
  if (franchise) franchise.value = inferFranchise(e.title, e.franchise);
  if (cover) cover.value = e.coverUrl || '';
  const picked = form.querySelector('[data-catalog-picked]');
  const f = inferFranchise(e.title, e.franchise);
  if (picked) picked.innerHTML = [e.genre ? `Жанр: <b>${esc(e.genre)}</b>` : '', f ? `Франшиза: <b>${esc(f)}</b>` : '', e.coverUrl ? 'Обложка: <b>найдена</b>' : ''].filter(Boolean).join(' · ') || 'Для этой записи дополнительных метаданных пока нет.';
  hideAutocomplete(form);
  if (!e.coverUrl) {
    if (picked) picked.innerHTML += `${picked.innerHTML ? ' · ' : ''}ищу обложку…`;
    const found = await fetchWikipediaCover(e.title, e.releaseYear, e.platform);
    if (found) {
      e.coverUrl = found;
      if (cover) cover.value = found;
      await persistCatalog();
      if (picked) picked.innerHTML = [e.genre ? `Жанр: <b>${esc(e.genre)}</b>` : '', f ? `Франшиза: <b>${esc(f)}</b>` : '', 'Обложка: <b>найдена</b>'].filter(Boolean).join(' · ');
    } else if (picked) {
      picked.innerHTML = [e.genre ? `Жанр: <b>${esc(e.genre)}</b>` : '', f ? `Франшиза: <b>${esc(f)}</b>` : '', 'обложка: цветная заглушка'].filter(Boolean).join(' · ');
    }
  }
}
function refreshActiveAutocomplete() {
  const form = activeForm();
  const title = form?.querySelector('[data-game-title]');
  const platformSel = form?.querySelector('[data-game-platform]');
  if (title && platformSel && document.activeElement === title && title.value.trim()) showAutocomplete(title, platformSel.value);
}

function setRating(value) {
  const form = document.querySelector('#gameForm');
  if (!form) return;
  const hidden = form.querySelector('input[name="rating"]');
  if (hidden) hidden.value = String(value);
  form.querySelectorAll('[data-rating]').forEach(btn => btn.classList.toggle('selected', Number(btn.dataset.rating) <= value));
  const label = form.querySelector('.star-value');
  if (label) label.textContent = `${value}/10`;
}

async function finishRotation(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const gameId = String(fd.get('gameId') || '');
  const g = state.games.find(x => x.id === gameId && !x.deletedAt);
  if (!g) return;
  const group = state.modal?.group || platform(g.platform).group;
  const nextId = state.modal?.nextId || nextPlatformAfter(g.platform, group);
  const ts = nowIso();
  g.status = 'completed';
  g.rating = String(fd.get('rating') || '');
  g.replay = Number(fd.get('replay') || 0);
  g.notes = String(fd.get('notes') || '');
  g.updatedAt = ts;
  state.settings[currentSettingKey(group)] = nextId;
  state.settings.settingsUpdatedAt = ts;
  await persist();
  state.modal = null;
  setToast(`Готово. Следующая приставка — ${platform(nextId).name}`);
  scheduleAutoSync();
  if (!g.coverUrl) hydrateGameCover(g).then(async changed => { if (changed) { await persist(); render(); scheduleAutoSync(); } });
}

async function savePlaying(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const p = String(fd.get('platform'));
  const ts = nowIso();
  const g = migrateGame({
    id: uid(),
    title: String(fd.get('title')).trim(),
    platform: p,
    status: 'playing',
    releaseYear: String(fd.get('releaseYear') || ''),
    genre: String(fd.get('genre') || ''),
    franchise: inferFranchise(String(fd.get('title') || ''), String(fd.get('franchise') || '')),
    coverUrl: safeImage(String(fd.get('coverUrl') || '')),
    rating: '', replay: 0, notes: '', addedAt: ts, updatedAt: ts,
  });
  state.games.push(g);
  setCurrentPlatform(p);
  state.settings.settingsUpdatedAt = ts;
  await persist();
  state.modal = null;
  setToast('Добавлено в «Сейчас играю»');
  scheduleAutoSync();
  if (!g.coverUrl) hydrateGameCover(g).then(async changed => { if (changed) { await persist(); render(); scheduleAutoSync(); } });
}

async function saveGame(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const base = state.modal.game;
  const old = base.id ? state.games.find(x => x.id === base.id) : null;
  const ts = nowIso();
  const g = migrateGame({
    ...base,
    title: String(fd.get('title')).trim(),
    platform: String(fd.get('platform')),
    status: String(fd.get('status') || 'completed'),
    releaseYear: String(fd.get('releaseYear') || ''),
    genre: String(fd.get('genre') || ''),
    franchise: inferFranchise(String(fd.get('title') || ''), String(fd.get('franchise') || '')),
    coverUrl: safeImage(String(fd.get('coverUrl') || '')),
    rating: String(fd.get('rating') || ''),
    replay: Number(fd.get('replay') || 0),
    notes: String(fd.get('notes') || ''),
    updatedAt: ts,
  });
  if (!g.id) {
    g.id = uid();
    g.addedAt = ts;
    state.games.push(g);
  } else {
    const i = state.games.findIndex(x => x.id === g.id);
    if (i >= 0) state.games[i] = g;
  }
  if (g.status === 'playing') setCurrentPlatform(g.platform);
  if (old?.status === 'playing' && g.status === 'completed') {
    const group = platform(g.platform).group;
    state.settings[currentSettingKey(group)] = nextPlatformAfter(g.platform, group);
    state.settings.settingsUpdatedAt = ts;
  }
  await persist();
  state.modal = null;
  setToast('Сохранено');
  scheduleAutoSync();
  if (!g.coverUrl) hydrateGameCover(g).then(async changed => { if (changed) { await persist(); render(); scheduleAutoSync(); } });
}

async function deleteGame(id) {
  const g = state.games.find(x => x.id === id);
  if (!g || !confirm(`Удалить «${g.title}»?`)) return;
  g.deletedAt = nowIso();
  g.updatedAt = g.deletedAt;
  await persist();
  state.modal = null;
  setToast('Удалено');
  scheduleAutoSync();
}

async function moveRotation(group, id, direction) {
  const key = group === 'desktop' ? 'desktopRotation' : 'handheldRotation';
  const arr = [...state.settings[key]];
  const i = arr.indexOf(id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  state.settings[key] = arr;
  state.settings.settingsUpdatedAt = nowIso();
  await persist();
  render();
  scheduleAutoSync();
}

async function saveSettings(silent = false) {
  const endpoint = document.querySelector('#sheetEndpoint');
  const secret = document.querySelector('#syncSecret');
  const theme = document.querySelector('#themeMode');
  const autoSync = document.querySelector('#autoSync');
  if (endpoint) state.settings.sheetEndpoint = endpoint.value.trim();
  if (secret) state.settings.syncSecret = secret.value;
  if (theme) state.settings.theme = theme.value;
  if (autoSync) state.settings.autoSync = autoSync.checked;
  state.settings.settingsUpdatedAt = nowIso();
  applyTheme();
  await persist();
  if (!silent) setToast('Настройки сохранены');
}

function scheduleAutoSync(delay = 1400) {
  if (!state.settings.autoSync || !state.settings.sheetEndpoint || syncInFlight) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    if (state.modal) return scheduleAutoSync(1000);
    syncSheets({ silent: true, skipSaveSettings: true });
  }, delay);
}

function syncableSettings() {
  return {
    theme: state.settings.theme,
    handheldRotation: state.settings.handheldRotation,
    desktopRotation: state.settings.desktopRotation,
    currentHandheld: state.settings.currentHandheld,
    currentDesktop: state.settings.currentDesktop,
    settingsUpdatedAt: state.settings.settingsUpdatedAt || nowIso(),
  };
}

async function syncSheets(options = {}) {
  const { silent = false, skipSaveSettings = false } = options;
  if (syncInFlight) return;
  if (!skipSaveSettings) await saveSettings(true);
  const url = state.settings.sheetEndpoint;
  if (!url) {
    alert('Сначала укажи Apps Script endpoint в настройках.');
    return;
  }
  if (!silent) setToast('Синхронизация…');
  syncInFlight = true;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sync', secret: state.settings.syncSecret, games: state.games, settings: syncableSettings() }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Sync failed');
    if (Array.isArray(data.games)) state.games = data.games.map(migrateGame);
    if (data.settings) state.settings = migrateSettings({ ...state.settings, ...data.settings });
    state.settings.lastSync = nowIso();
    applyTheme();
    await persist();
    if (silent) render(); else setToast(`Синхронизировано: ${state.games.filter(g => !g.deletedAt).length} игр`);
  } catch (e) {
    console.error(e);
    if (!silent) alert(`Не удалось синхронизировать. Проверь endpoint, права Apps Script и секрет.\n\n${e.message}`);
    state.toast = '';
    if (!silent) render();
  } finally {
    syncInFlight = false;
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify({ version: 5, exportedAt: nowIso(), games: state.games, settings: state.settings }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `memory-card-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!Array.isArray(obj.games)) throw new Error('Нет массива games');
    if (!confirm(`Импортировать ${obj.games.length} записей? Текущие записи будут объединены по ID.`)) return;
    const map = new Map(state.games.map(g => [g.id, g]));
    for (const raw of obj.games) {
      const g = migrateGame(raw);
      const old = map.get(g.id);
      if (!old || String(g.updatedAt || '') > String(old.updatedAt || '')) map.set(g.id, g);
    }
    state.games = [...map.values()];
    if (obj.settings) state.settings = migrateSettings({ ...state.settings, ...obj.settings });
    state.settings.settingsUpdatedAt = nowIso();
    applyTheme();
    await persist();
    setToast('Импорт завершён');
  } catch (err) {
    alert(`Не удалось импортировать файл: ${err.message}`);
  }
  e.target.value = '';
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleAutoSync(350); });
window.addEventListener('online', () => scheduleAutoSync(350));

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
loadState();
