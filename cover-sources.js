/* Memory Card v0.15 — shared cover source registry */
(() => {
  const libretroRepos = Object.freeze({
    PSP: ['Sony_-_PlayStation_Portable'],
    VITA: ['Sony_-_PlayStation_Vita'],
    DSI: ['Nintendo_-_Nintendo_DS', 'Nintendo_-_Nintendo_DSi'],
    '3DS': ['Nintendo_-_Nintendo_3DS'],
    GBA: ['Nintendo_-_Game_Boy_Advance'],
    PS1: ['Sony_-_PlayStation'],
    PS2: ['Sony_-_PlayStation_2'],
    PS3: ['Sony_-_PlayStation_3', 'Sony_-_PlayStation_3_Downloadable'],
    PS4: ['Sony_-_PlayStation_4'],
    XBOX: ['Microsoft_-_Xbox'],
    X360: ['Microsoft_-_Xbox_360'],
    WII: ['Nintendo_-_Wii'],
    WIIU: ['Nintendo_-_Wii_U'],
    GC: ['Nintendo_-_GameCube'],
    DREAMCAST: ['Sega_-_Dreamcast'],
    N64: ['Nintendo_-_Nintendo_64'],
    SNES: ['Nintendo_-_Super_Nintendo_Entertainment_System'],
    NES: ['Nintendo_-_Nintendo_Entertainment_System'],
    GENESIS: ['Sega_-_Mega_Drive_-_Genesis'],
  });

  const registry = Object.freeze({
    version: 15,
    libretroRepos,
    specialized: Object.freeze({
      PSP: 'AldoTools + Libretro',
      VITA: 'VitaDB + HexFlow + AldoTools + Libretro',
      PS3: 'AldoTools + Libretro',
      SWITCH: 'GameTDB',
    }),
    wikipediaFallback: Object.freeze(['PS5', 'XONE', 'XSERIES']),
  });

  window.MemoryCardCoverSources = registry;

  // app.js owns this lexical binding. Because all scripts are classic scripts,
  // later scripts can safely extend it without duplicating the resolver itself.
  try {
    if (typeof LIBRETRO_COVER_REPOS !== 'undefined') {
      Object.assign(LIBRETRO_COVER_REPOS, libretroRepos);
    }
  } catch (error) {
    console.warn('Memory Card cover registry could not extend app resolver:', error);
  }
})();
