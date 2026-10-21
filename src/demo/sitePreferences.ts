export type SitePreferences = {
  version: 1;
  alwaysHint: boolean;
  allowMoreAnalysisTime: boolean;
  ddsLoadingAllowance?: 'normal' | 'extended' | 'patient';
  showAnalysisLog?: boolean;
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

// Bundle the existing preference reader so startup never waits for another download.
// @ts-expect-error The shared website preference module is plain JavaScript.
import * as preferenceModule from '../../public/site/preferences.js';
const preferences = preferenceModule as PreferencesModule;

export function readInitialSitePreferences(): SitePreferences {
  return preferences.readPreferences();
}
export async function readSitePreferences(): Promise<SitePreferences> {
  return readInitialSitePreferences();
}

export async function updateSitePreferences(patch: Partial<SitePreferences>): Promise<SitePreferences> {
  const module = preferences;
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
    if (event.key === preferences.PREFERENCES_KEY) onChange(preferences.readPreferences());
  };
  window.addEventListener('deepsqueeze:preferenceschange', custom);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener('deepsqueeze:preferenceschange', custom);
    window.removeEventListener('storage', storage);
  };
}
