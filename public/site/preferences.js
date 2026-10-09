export const PREFERENCES_KEY = 'deepsqueeze.preferences.v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  version: 1,
  alwaysHint: false,
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
    version: 1,
    alwaysHint: data.has('alwaysHint'),
    autoplaySingletons: data.has('autoplaySingletons'),
    autoplayEw: data.has('autoplayEw'),
    tableColor: TABLE_COLOR_LEVELS[tableColorIndex] ?? DEFAULT_PREFERENCES.tableColor,
    animation: data.get('animation'),
    zoom: Number(data.get('zoom'))
  });
}

function populateForm(form, preferences) {
  form.elements.alwaysHint.checked = preferences.alwaysHint;
  form.elements.autoplaySingletons.checked = preferences.autoplaySingletons;
  form.elements.autoplayEw.checked = preferences.autoplayEw;
  const tableColorIndex = Math.max(0, TABLE_COLOR_LEVELS.indexOf(preferences.tableColor));
  form.elements.tableColorLevel.value = String(tableColorIndex);
  form.querySelector('[data-table-color-value]').textContent = TABLE_COLOR_LABELS[tableColorIndex];
  form.elements.animation.value = preferences.animation;
  form.elements.zoom.value = String(preferences.zoom);
  form.querySelector('[data-zoom-value]').textContent = `${preferences.zoom}%`;
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
      <div class="ds-preferences-heading"><strong>Preferences</strong><span>Defaults for this browser</span></div>
      <form>
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
    </div>`;
  target.append(menu);

  const form = menu.querySelector('form');
  const status = menu.querySelector('[data-status]');
  populateForm(form, readPreferences());

  const save = () => {
    const result = writePreferences(preferencesFromForm(form));
    populateForm(form, result.preferences);
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
    populateForm(form, result.preferences);
    status.textContent = result.saved ? 'Defaults restored.' : 'Preferences could not be reset.';
    dispatchPreferences(result.preferences);
  });
  window.addEventListener('storage', event => {
    if (event.key !== PREFERENCES_KEY) return;
    const preferences = readPreferences();
    populateForm(form, preferences);
    status.textContent = 'Updated from another tab.';
    dispatchPreferences(preferences);
  });
  window.addEventListener('deepsqueeze:preferenceschange', event => {
    if (!event.detail) return;
    populateForm(form, normalizePreferences(event.detail));
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
