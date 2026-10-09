export type SitePreferences = {
  version: 1;
  alwaysHint: boolean;
  autoplaySingletons: boolean;
  autoplayEw: boolean;
  tableColor: 'default' | 'very-light' | 'light' | 'medium';
  animation: 'instant' | 'fast' | 'slow' | 'annoyingly-slow';
  zoom: number;
};

type PreferencesModule = {
  readPreferences: () => SitePreferences;
  writePreferences: (value: SitePreferences) => { preferences: SitePreferences; saved: boolean };
  PREFERENCES_KEY: string;
};

let modulePromise: Promise<PreferencesModule> | undefined;

function loadModule(): Promise<PreferencesModule> {
  const moduleUrl = '/site/preferences.js';
  modulePromise ??= import(/* @vite-ignore */ moduleUrl) as Promise<PreferencesModule>;
  return modulePromise;
}

export async function readSitePreferences(): Promise<SitePreferences> {
  return (await loadModule()).readPreferences();
}

export async function updateSitePreferences(patch: Partial<SitePreferences>): Promise<SitePreferences> {
  const module = await loadModule();
  const result = module.writePreferences({ ...module.readPreferences(), ...patch });
  window.dispatchEvent(new CustomEvent('deepsqueeze:preferenceschange', { detail: result.preferences }));
  return result.preferences;
}

export function watchSitePreferences(onChange: (preferences: SitePreferences) => void): () => void {
  const custom = (event: Event) => {
    const detail = (event as CustomEvent<SitePreferences>).detail;
    if (detail) onChange(detail);
  };
  const storage = (event: StorageEvent) => {
    void loadModule().then(module => {
      if (event.key === module.PREFERENCES_KEY) onChange(module.readPreferences());
    });
  };
  window.addEventListener('deepsqueeze:preferenceschange', custom);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener('deepsqueeze:preferenceschange', custom);
    window.removeEventListener('storage', storage);
  };
}
