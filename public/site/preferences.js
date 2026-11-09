export const PREFERENCES_KEY = 'deepsqueeze.preferences.v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  version: 1,
  defensePolicy: 'mule',
  bindingPolicy: 'standard',
  exploreBranches: false,
  alwaysHint: false,
  allowMoreAnalysisTime: false,
  ddsLoadingAllowance: 'normal',
  showAnalysisLog: false,
  autoplaySingletons: false,
  autoplayEw: false,
  tableColor: 'default',
  animation: 'instant',
  zoom: 120
});

const TABLE_COLOR_LEVELS = ['default', 'very-light', 'light', 'medium'];
const TABLE_COLOR_LABELS = ['None', 'Very light', 'Light', 'Medium'];
const tableColors = new Set(TABLE_COLOR_LEVELS);
const animationSpeeds = new Set(['instant', 'fast', 'slow', 'annoyingly-slow']);

function booleanOrDefault(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function zoomOrDefault(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PREFERENCES.zoom;
  return Math.max(50, Math.min(200, Math.round(value / 10) * 10));
}

export function normalizePreferences(value) {
  const source = value && typeof value === 'object' && value.version === 1 ? value : {};
  const tableColor = source.tableColor === 'light-green' ? 'very-light' : source.tableColor;
  return {
    version: 1,
    exploreBranches: booleanOrDefault(source.exploreBranches, DEFAULT_PREFERENCES.exploreBranches),
    bindingPolicy: source.bindingPolicy === 'jrl' ? 'jrl' : 'standard',
    defensePolicy: ['mule', 'laa', 'lta', 'random'].includes(source.defensePolicy) ? source.defensePolicy : 'mule',
    allowMoreAnalysisTime: booleanOrDefault(source.allowMoreAnalysisTime, DEFAULT_PREFERENCES.allowMoreAnalysisTime),
    ddsLoadingAllowance: ['normal','extended','patient'].includes(source.ddsLoadingAllowance) ? source.ddsLoadingAllowance : (source.allowMoreAnalysisTime === true ? 'extended' : 'normal'),
    showAnalysisLog: booleanOrDefault(source.showAnalysisLog, DEFAULT_PREFERENCES.showAnalysisLog),
    alwaysHint: booleanOrDefault(source.alwaysHint, DEFAULT_PREFERENCES.alwaysHint),
    autoplaySingletons: booleanOrDefault(source.autoplaySingletons, DEFAULT_PREFERENCES.autoplaySingletons),
    autoplayEw: booleanOrDefault(source.autoplayEw, DEFAULT_PREFERENCES.autoplayEw),
    tableColor: tableColors.has(tableColor) ? tableColor : DEFAULT_PREFERENCES.tableColor,
    animation: animationSpeeds.has(source.animation) ? source.animation : DEFAULT_PREFERENCES.animation,
    zoom: zoomOrDefault(source.zoom)
  };
}

function browserStorage() {
  try { return window.localStorage; } catch { return undefined; }
}

export function readPreferences(storage = browserStorage()) {
  if (!storage) return normalizePreferences();
  try { return normalizePreferences(JSON.parse(storage.getItem(PREFERENCES_KEY) || 'null')); }
  catch { return normalizePreferences(); }
}

export function writePreferences(value, storage = browserStorage()) {
  const preferences = normalizePreferences(value);
  if (!storage) return { preferences, saved: false };
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return { preferences, saved: true };
  } catch {
    return { preferences, saved: false };
  }
}

export function resetPreferences(storage = browserStorage()) {
  if (!storage) return { preferences: normalizePreferences(), saved: false };
  try {
    storage.removeItem(PREFERENCES_KEY);
    return { preferences: normalizePreferences(), saved: true };
  } catch {
    return { preferences: normalizePreferences(), saved: false };
  }
}

function headerTarget() {
  return document.querySelector('.site-header-inner')
    || document.querySelector('.ds-info > header')
    || document.querySelector('body > header')
    || document.querySelector('body > main > header')
    || document.querySelector('main > header');
}

function dispatchPreferences(preferences) {
  window.dispatchEvent(new CustomEvent('deepsqueeze:preferenceschange', { detail: preferences }));
}

function preferencesFromForm(form) {
  const data = new FormData(form);
  const tableColorIndex = Number(data.get('tableColorLevel'));
  return normalizePreferences({
    ...readPreferences(),
    version: 1,
    exploreBranches: form.elements.exploreBranches ? data.has('exploreBranches') : readPreferences().exploreBranches,
    bindingPolicy: data.get('bindingPolicy') ?? readPreferences().bindingPolicy,
    alwaysHint: data.has('alwaysHint'),
    allowMoreAnalysisTime: data.get('ddsLoadingAllowance') !== 'normal',
    ddsLoadingAllowance: data.get('ddsLoadingAllowance'),
    showAnalysisLog: data.has('showAnalysisLog'),
    autoplaySingletons: data.has('autoplaySingletons'),
    autoplayEw: data.has('autoplayEw'),
    tableColor: TABLE_COLOR_LEVELS[tableColorIndex] ?? DEFAULT_PREFERENCES.tableColor,
    animation: data.get('animation'),
    zoom: Number(data.get('zoom'))
  });
}

function modernPlayerSettings() {
  return document.documentElement.dataset.movieVersion === '2' || document.documentElement.dataset.playerUi === 'modern';
}

function populateForm(form, preferences) {
  if(form.elements.exploreBranches)form.elements.exploreBranches.checked = preferences.exploreBranches;
  if(form.elements.bindingPolicy)form.elements.bindingPolicy.value = preferences.bindingPolicy;
  form.elements.ddsLoadingAllowance.value = preferences.ddsLoadingAllowance;
  form.elements.showAnalysisLog.checked = preferences.showAnalysisLog;
  form.elements.alwaysHint.checked = preferences.alwaysHint;
  form.elements.autoplaySingletons.checked = preferences.autoplaySingletons;
  form.elements.autoplayEw.checked = preferences.autoplayEw;
  const tableColorIndex = Math.max(0, TABLE_COLOR_LEVELS.indexOf(preferences.tableColor));
  form.elements.tableColorLevel.value = String(tableColorIndex);
  form.querySelector('[data-table-color-value]').textContent = TABLE_COLOR_LABELS[tableColorIndex];
  form.elements.animation.value = preferences.animation;
  form.elements.zoom.value = String(preferences.zoom);
  form.querySelector('[data-zoom-value]').textContent = `${preferences.zoom}%`;
  const number=form.querySelector('[data-zoom-number]');if(number)number.value=String(preferences.zoom);
  if(modernPlayerSettings()){
    try{const raw=JSON.parse(browserStorage()?.getItem(PREFERENCES_KEY)||'null');if(typeof raw?.showAnalysisLog!=='boolean')form.elements.showAnalysisLog.checked=true;}catch{form.elements.showAnalysisLog.checked=true;}
  }
}

export function mountPreferencesMenu() {
  if (window.self !== window.top || document.querySelector('.ds-preferences')) return true;
  const target = headerTarget();
  if (!target) return false;

  const menu = document.createElement('details');
  menu.className = 'ds-preferences';
  menu.innerHTML = `<summary aria-label="Open preferences" title="Preferences">
      <span class="ds-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
    </summary>
    <div class="ds-preferences-panel">
      <section data-main-pane>
      <div class="ds-preferences-heading"><strong>Preferences</strong><button type="button" class="ds-dev-link" data-open-dev>Dev</button></div>
      <p class="ds-preferences-subtitle">Defaults for this browser</p>
      <form>
        <fieldset>
          <legend>Analysis</legend>
          <label>Loading and calculation allowance <select name="ddsLoadingAllowance"><option value="normal">Normal — 30 seconds</option><option value="extended">Extended — 2 minutes</option><option value="patient">Patient — 10 minutes</option></select></label>
          <small>The same deadline applies separately to DDS loading and each calculation. Applies on the next attempt. Cancel and Retry are available in the analysis pane.</small>
          <label class="ds-check"><input type="checkbox" name="showAnalysisLog"> Show diagnostics / analysis log</label>
          <small>Movie / Random: DDS diagnostics. Analyzer: squeeze-analysis progress. Each includes copy log, cancel and restart controls.</small>
        </fieldset>
        <fieldset>
          <legend>Guidance</legend>
          <label class="ds-check"><input type="checkbox" name="alwaysHint"> Show hints automatically</label>
        </fieldset>
        <fieldset>
          <legend>Autoplay</legend>
          <label class="ds-check"><input type="checkbox" name="autoplaySingletons"> Singletons / equals</label>
          <label class="ds-check"><input type="checkbox" name="autoplayEw"> East and West</label>
        </fieldset>
        <label>Table color
          <span class="ds-range-setting"><input name="tableColorLevel" type="range" min="0" max="3" step="1" aria-label="Table color"><output data-table-color-value></output></span>
          <span class="ds-range-labels" aria-hidden="true"><span>None</span><span>Very light</span><span>Light</span><span>Medium</span></span>
        </label>
        <label>Card animation
          <select name="animation"><option value="instant">Instant</option><option value="fast">Fast</option><option value="slow">Slow</option><option value="annoyingly-slow">Annoyingly slow</option></select>
        </label>
        <label>Default diagram size
          <span class="ds-zoom-setting"><input name="zoom" type="range" min="50" max="200" step="10"><output data-zoom-value></output></span>
        </label>
        <div class="ds-preferences-actions"><button type="button" data-reset>Reset defaults</button><span data-status role="status" aria-live="polite">Stored only in this browser.</span></div>
      </form>
      </section>
      <section data-dev-pane hidden aria-label="Developer preferences">
        <div class="ds-preferences-heading"><strong>Developer preferences</strong><button type="button" class="ds-dev-link" data-close-dev>Back</button></div>
        <div class="ds-dev-warning"><strong>For developers only</strong><p>These settings are not intended to be modified by users. Changing them may cause unexpected behavior.</p></div>
        <form data-dev-form>
          <label>Defense policy<select name="defensePolicy">
            <option value="mule">Mule 0.9 — default</option>
            <option value="laa">Abstract-aware (LAA)</option>
            <option value="lta">Threat-aware (LTA) — legacy</option>
            <option value="random">Random legal</option>
            <option value="ddcta" disabled>DDCTA — unavailable in this build</option>
          </select></label>
          <p>Movie and Random only. Applies to newly loaded positions; saved links keep their selected policy. Reloading a link with a defense setting keeps that setting.</p>
          <p>DDS guidance still applies when available. Legacy Threat-aware requires explicit threat cards; without them, Abstract-aware is used and a notice is shown.</p>
          <div class="ds-preferences-actions"><button type="button" data-reset-dev>Restore default policy</button><span data-dev-status role="status" aria-live="polite">Stored only in this browser.</span></div>
        </form>
      </section>
    </div>`;
  if (modernPlayerSettings()) {
    menu.querySelector('summary').setAttribute('aria-label', 'Open settings');
    menu.querySelector('summary').title = 'Settings';
    menu.querySelector('[data-main-pane] strong').textContent = 'Settings';
    menu.querySelector('.ds-preferences-subtitle').remove();
    menu.querySelector('[data-dev-pane]').setAttribute('aria-label','Developer settings');
    menu.querySelector('[data-dev-pane] strong').textContent='Developer settings';
    const mainForm=menu.querySelector('form');
    const fields=[...mainForm.querySelectorAll('fieldset')];
    const play=fields[1];play.querySelector('legend').textContent='Play';
    for(const label of [...fields[2].querySelectorAll('label')])play.append(label);
    fields[2].remove();
    play.querySelector('[name=autoplaySingletons]').nextSibling.textContent=' Autoplay singletons / equals';
    play.querySelector('[name=autoplayEw]').nextSibling.textContent=' Autoplay East / West';
    const branches=document.createElement('label');branches.className='ds-check';branches.innerHTML='<input type="checkbox" name="exploreBranches"> Explore Branches On';play.append(branches);
    const display=document.createElement('fieldset');display.innerHTML='<legend>Display</legend><label>Binding policy<select name="bindingPolicy"><option value="standard">Standard</option><option value="jrl">JRL</option></select></label><small>Movie encapsulations and catalog examples. Applies on the next load.</small>';
    for(const label of [...mainForm.querySelectorAll(':scope > label')])display.append(label);
    const diagnostics=fields[0];diagnostics.querySelector('legend').textContent='Diagnostics';
    diagnostics.querySelector('label').firstChild.textContent='Time allowance ';
    const notes=diagnostics.querySelectorAll('small');notes[0].textContent='Per load or calculation; applies on the next attempt.';notes[1].remove();
    diagnostics.querySelector('[name=showAnalysisLog]').nextSibling.textContent=' Show Diagnostics tab';
    const actions=mainForm.querySelector('.ds-preferences-actions');
    mainForm.insertBefore(play,actions);mainForm.insertBefore(display,actions);mainForm.insertBefore(diagnostics,actions);
    const range=display.querySelector('[name=zoom]');range.setAttribute('aria-label','Default diagram zoom');
    const number=document.createElement('input');number.type='number';number.min='50';number.max='200';number.step='10';number.setAttribute('data-zoom-number','');number.setAttribute('aria-label','Default diagram zoom percent');
    range.after(number);number.after(document.createTextNode('%'));display.querySelector('[data-zoom-value]').hidden=true;number.addEventListener('input',()=>{if(Number.isFinite(number.valueAsNumber))range.value=number.value;});
    number.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();range.dispatchEvent(new Event('change',{bubbles:true}));}});
    mainForm.querySelector('[data-status]').textContent='Saved in this browser.';
  }
  target.append(menu);

  const form = menu.querySelector('form');
  const status = menu.querySelector('[data-status]');
  const devForm = menu.querySelector('[data-dev-form]');
  const devStatus = menu.querySelector('[data-dev-status]');
  const populate = preferences => {
    populateForm(form, preferences);
    devForm.elements.defensePolicy.value = preferences.defensePolicy;
  };
  const showDev = open => {
    menu.querySelector('[data-main-pane]').hidden = open;
    menu.querySelector('[data-dev-pane]').hidden = !open;
    menu.querySelector(open ? '[data-close-dev]' : '[data-open-dev]').focus();
  };
  menu.querySelector('[data-open-dev]').addEventListener('click', () => showDev(true));
  menu.querySelector('[data-close-dev]').addEventListener('click', () => showDev(false));
  const saveDev = policy => {
    const result = writePreferences({...readPreferences(), defensePolicy: policy});
    populate(result.preferences);
    dispatchPreferences(result.preferences);
    devStatus.textContent = result.saved ? 'Saved for new positions.' : 'Preferences could not be saved.';
  };
  devForm.addEventListener('submit', event => event.preventDefault());
  devForm.addEventListener('change', () => saveDev(devForm.elements.defensePolicy.value));
  devForm.querySelector('[data-reset-dev]').addEventListener('click', () => saveDev('mule'));
  populate(readPreferences());

  const save = () => {
    const result = writePreferences(preferencesFromForm(form));
    populate(result.preferences);
    status.textContent = result.saved ? 'Saved on this browser.' : 'Preferences could not be saved.';
    dispatchPreferences(result.preferences);
  };
  form.addEventListener('input', event => {
    if (event.target.name === 'zoom') form.querySelector('[data-zoom-value]').textContent = `${event.target.value}%`;
    if (event.target.name === 'tableColorLevel') form.querySelector('[data-table-color-value]').textContent = TABLE_COLOR_LABELS[Number(event.target.value)];
  });
  form.addEventListener('change', save);
  form.querySelector('[data-reset]').addEventListener('click', () => {
    const result = resetPreferences();
    populate(result.preferences);
    status.textContent = result.saved ? 'Defaults restored.' : 'Preferences could not be reset.';
    dispatchPreferences(result.preferences);
  });
  window.addEventListener('storage', event => {
    if (event.key !== PREFERENCES_KEY) return;
    const preferences = readPreferences();
    populate(preferences);
    status.textContent = 'Updated from another tab.';
    dispatchPreferences(preferences);
  });
  window.addEventListener('deepsqueeze:preferenceschange', event => {
    if (!event.detail) return;
    populate(normalizePreferences(event.detail));
    status.textContent = 'Saved on this browser.';
  });
  document.addEventListener('pointerdown', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); }
  });
  return true;
}
