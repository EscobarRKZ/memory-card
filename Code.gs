const MASTER_SHEET = 'Games';
const STATS_SHEET = 'Stats';
const SETTINGS_SHEET = 'Settings';
const HEADERS = ['id','platform','title','releaseYear','genre','franchise','coverUrl','status','rating','replay','notes','addedAt','updatedAt','deletedAt'];
const SETTINGS_KEYS = ['theme','handheldRotation','desktopRotation','currentHandheld','currentDesktop','settingsUpdatedAt'];

function doGet() {
  return json_({ ok:true, service:'Memory Card Sync', version:5, time:new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    if (body.action !== 'sync') return json_({ok:false,error:'Unknown action'});
    const props = PropertiesService.getScriptProperties();
    const expected = props.getProperty('SYNC_SECRET') || '';
    if (expected && body.secret !== expected) return json_({ok:false,error:'Invalid secret'});

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreate_(ss, MASTER_SHEET);
    const remoteGames = readGamesFlexible_(sheet);
    const localGames = Array.isArray(body.games) ? body.games.map(normalizeGame_) : [];
    const mergedGames = mergeGames_(remoteGames, localGames);
    writeGames_(sheet, mergedGames);

    const remoteSettings = readSettings_(ss);
    const localSettings = normalizeSettings_(body.settings || {});
    const mergedSettings = mergeSettings_(remoteSettings, localSettings);
    writeSettings_(ss, mergedSettings);

    const live = mergedGames.filter(g => !g.deletedAt);
    rebuildPlatformSheets_(ss, live);
    rebuildStats_(ss, live);
    return json_({ok:true,games:mergedGames,settings:mergedSettings,updatedAt:new Date().toISOString()});
  } catch (err) {
    return json_({ok:false,error:String(err && err.stack || err)});
  }
}

function getOrCreate_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }

function readGamesFlexible_(sheet) {
  if (sheet.getLastRow() < 1) return [];
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(String);
  if (sheet.getLastRow() < 2 || !headers.some(Boolean)) return [];
  const rows = sheet.getRange(2,1,sheet.getLastRow()-1,lastCol).getValues();
  return rows.filter(r => r[headers.indexOf('id')] || r[0]).map(row => {
    const obj = {};
    headers.forEach((h,i) => { if (h) obj[h] = normalizeCell_(row[i]); });
    return normalizeGame_(obj);
  });
}

function normalizeGame_(g) {
  const legacyAdded = g.addedAt || g.createdAt || (g.completedAt ? String(g.completedAt) + 'T12:00:00.000Z' : '') || new Date().toISOString();
  const ratingNumber = Number(g.rating || 0);
  return {
    id:String(g.id || ''),
    platform:String(g.platform || ''),
    title:String(g.title || ''),
    releaseYear:String(g.releaseYear || ''),
    genre:String(g.genre || ''),
    franchise:String(g.franchise || ''),
    coverUrl:String(g.coverUrl || ''),
    status:String(g.status || 'completed'),
    rating:ratingNumber ? String(Math.max(1, Math.min(10, Math.round(ratingNumber)))) : '',
    replay:Number(g.replay || 0),
    notes:String(g.notes || ''),
    addedAt:String(legacyAdded),
    updatedAt:String(g.updatedAt || legacyAdded),
    deletedAt:String(g.deletedAt || '')
  };
}

function normalizeCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  return v === null || v === undefined ? '' : v;
}

function mergeGames_(a,b) {
  const m = new Map();
  [...a,...b].forEach(raw => {
    const g = normalizeGame_(raw);
    if (!g.id) return;
    const old = m.get(g.id);
    if (!old || String(g.updatedAt || '') >= String(old.updatedAt || '')) m.set(g.id, g);
  });
  return [...m.values()].sort((x,y) => String(x.addedAt || x.updatedAt || '').localeCompare(String(y.addedAt || y.updatedAt || '')));
}

function writeGames_(sheet, games) {
  sheet.clearContents();
  sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  if (games.length) {
    const rows = games.map(g => HEADERS.map(h => g[h] === undefined ? '' : g[h]));
    sheet.getRange(2,1,rows.length,HEADERS.length).setValues(rows);
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1,HEADERS.length);
}

function normalizeSettings_(s) {
  const out = {};
  SETTINGS_KEYS.forEach(k => { if (s[k] !== undefined) out[k] = s[k]; });
  if (typeof out.handheldRotation === 'string') { try { out.handheldRotation = JSON.parse(out.handheldRotation); } catch (_) {} }
  if (typeof out.desktopRotation === 'string') { try { out.desktopRotation = JSON.parse(out.desktopRotation); } catch (_) {} }
  if (!Array.isArray(out.handheldRotation)) out.handheldRotation = ['DSI','VITA','3DS','PSP','GBA'];
  if (!Array.isArray(out.desktopRotation)) out.desktopRotation = ['PS3','WIIU','SWITCH'];
  out.theme = ['system','light','dark'].includes(out.theme) ? out.theme : 'system';
  out.currentHandheld = out.currentHandheld || out.handheldRotation[0] || 'PSP';
  out.currentDesktop = out.currentDesktop || out.desktopRotation[0] || 'SWITCH';
  out.settingsUpdatedAt = out.settingsUpdatedAt || '';
  return out;
}

function readSettings_(ss) {
  const sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh || sh.getLastRow() < 2) return normalizeSettings_({});
  const rows = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  const obj = {};
  rows.forEach(([k,v]) => {
    if (!k) return;
    if (k === 'handheldRotation' || k === 'desktopRotation') {
      try { obj[k] = JSON.parse(String(v)); } catch (_) { obj[k] = []; }
    } else obj[k] = normalizeCell_(v);
  });
  return normalizeSettings_(obj);
}

function mergeSettings_(remote, local) {
  remote = normalizeSettings_(remote);
  local = normalizeSettings_(local);
  return String(local.settingsUpdatedAt || '') >= String(remote.settingsUpdatedAt || '') ? local : remote;
}

function writeSettings_(ss, settings) {
  const sh = getOrCreate_(ss, SETTINGS_SHEET);
  sh.clearContents();
  sh.getRange(1,1,1,2).setValues([['key','value']]);
  const rows = SETTINGS_KEYS.map(k => [k, Array.isArray(settings[k]) ? JSON.stringify(settings[k]) : (settings[k] === undefined ? '' : settings[k])]);
  sh.getRange(2,1,rows.length,2).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1,2);
}

function rebuildPlatformSheets_(ss, games) {
  const ids = [...new Set(games.map(g => g.platform).filter(Boolean))];
  ids.forEach(id => {
    const sh = getOrCreate_(ss, id);
    sh.clearContents();
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
    const rows = games.filter(g => g.platform === id).map(g => HEADERS.map(h => g[h] === undefined ? '' : g[h]));
    if (rows.length) sh.getRange(2,1,rows.length,HEADERS.length).setValues(rows);
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1,HEADERS.length);
  });
}

function rebuildStats_(ss, games) {
  const sh = getOrCreate_(ss, STATS_SHEET);
  sh.clearContents();
  const completed = games.filter(g => g.status === 'completed');
  const playing = games.filter(g => g.status === 'playing');
  const rated = completed.map(g => Number(g.rating)).filter(n => n > 0);
  const by = {};
  completed.forEach(g => by[g.platform] = (by[g.platform] || 0) + 1);
  const rows = [
    ['Показатель','Значение'],
    ['Всего пройдено',completed.length],
    ['Сейчас играю',playing.length],
    ['Средняя оценка',rated.length ? (rated.reduce((a,b) => a+b,0)/rated.length).toFixed(2) : ''],
    ['Игр на 10/10',completed.filter(g => Number(g.rating) === 10).length],
    ['Последнее обновление',new Date()]
  ];
  Object.keys(by).sort().forEach(k => rows.push([k,by[k]]));
  sh.getRange(1,1,rows.length,2).setValues(rows);
  sh.autoResizeColumns(1,2);
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
