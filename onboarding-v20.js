(() => {
  const VERSION = 1;
  let installState = null;

  const baseMigrateSettings = migrateSettings;
  migrateSettings = function(raw = {}) {
    const out = baseMigrateSettings(raw);
    if (Number(raw.onboardingVersion || 0) < VERSION) return out;

    const known = new Set(PLATFORMS.map(p => p.id));
    const owned = [...new Set((Array.isArray(raw.ownedPlatforms) ? raw.ownedPlatforms : []).filter(id => known.has(id)))];
    const ownedSet = new Set(owned);
    const rotation = (value, group) => [...new Set((Array.isArray(value) ? value : []).filter(id => ownedSet.has(id) && platform(id).group === group))];

    out.onboardingVersion = VERSION;
    out.onboardingCompleted = raw.onboardingCompleted === true;
    out.ownedPlatforms = owned;
    out.rotationHandheldEnabled = raw.rotationHandheldEnabled === true;
    out.rotationDesktopEnabled = raw.rotationDesktopEnabled === true;
    out.handheldRotation = rotation(raw.handheldRotation, 'handheld');
    out.desktopRotation = rotation(raw.desktopRotation, 'desktop');
    out.currentHandheld = out.handheldRotation.includes(raw.currentHandheld) ? raw.currentHandheld : '';
    out.currentDesktop = out.desktopRotation.includes(raw.currentDesktop) ? raw.currentDesktop : '';
    return out;
  };

  function pending() {
    return Number(state?.settings?.onboardingVersion || 0) >= VERSION && state.settings.onboardingCompleted !== true;
  }

  function initializeFreshState() {
    if (installState !== false || Number(state?.settings?.onboardingVersion || 0) >= VERSION) return false;
    state.settings = migrateSettings({
      ...state.settings,
      onboardingVersion: VERSION,
      onboardingCompleted: false,
      ownedPlatforms: [],
      rotationHandheldEnabled: false,
      rotationDesktopEnabled: false,
      handheldRotation: [],
      desktopRotation: [],
      currentHandheld: '',
      currentDesktop: '',
    });
    state.platformFilter = '';
    Promise.resolve(persist()).catch(() => {});
    return true;
  }

  function text(ru, en) {
    return state?.settings?.language === 'en' ? en : ru;
  }

  function removeModal() {
    document.querySelector('.mc-onboarding-backdrop')?.remove();
    document.documentElement.classList.remove('mc-onboarding-open');
  }

  function syncModal() {
    if (!pending() || state.view === 'settings') {
      removeModal();
      return;
    }
    if (document.querySelector('.mc-onboarding-backdrop')) return;

    const overlay = document.createElement('div');
    overlay.className = 'mc-onboarding-backdrop';
    overlay.innerHTML = `<section class="mc-onboarding-card" role="dialog" aria-modal="true" aria-labelledby="mcOnboardingTitle"><div class="mc-onboarding-mark">MC</div><span class="mc-onboarding-kicker">Memory Card</span><h2 id="mcOnboardingTitle">${text('Для начала зайдите в настройки','Start in Settings')}</h2><p>${text('Сейчас ничего не выбрано: ни приставки, ни ротации. Отметьте свои устройства и настройте ротацию так, как вам удобно.','Nothing is selected yet: no consoles and no rotations. Choose your devices and configure rotation the way you want.')}</p><div class="mc-onboarding-points"><span><b>1</b>${text('Выберите приставки','Choose consoles')}</span><span><b>2</b>${text('Настройте ротации','Set rotations')}</span><span><b>3</b>${text('Сохраните настройки','Save settings')}</span></div><button type="button" class="primary mc-onboarding-action" data-onboarding-settings>${text('Открыть настройки','Open Settings')}</button><small>${text('После первого сохранения это окно больше не появится.','After the first save, this window will not appear again.')}</small></section>`;
    document.body.appendChild(overlay);
    document.documentElement.classList.add('mc-onboarding-open');
  }

  const baseRender = render;
  render = function() {
    initializeFreshState();
    baseRender();
    syncModal();
  };

  const baseSaveSettings = saveSettings;
  saveSettings = async function(silent = false) {
    const wasPending = pending();
    if (wasPending) {
      state.settings.onboardingVersion = VERSION;
      state.settings.onboardingCompleted = true;
    }
    await baseSaveSettings(silent);
    if (wasPending) {
      state.settings.onboardingVersion = VERSION;
      state.settings.onboardingCompleted = true;
      await persist();
    }
  };

  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-onboarding-settings]') : null;
    if (!button) return;
    event.preventDefault();
    navigate('settings');
  }, true);

  Promise.resolve(window.MemoryCardInstallProbe ?? true).then(hadState => {
    installState = hadState !== false;
    const changed = initializeFreshState();
    if (changed) render();
    else syncModal();
  }).catch(() => {
    installState = true;
  });
})();
