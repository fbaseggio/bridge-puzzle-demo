export type SitePreferences = {
  version: 1;
  exploreBranches?: boolean;
  bindingPolicy?: 'standard' | 'jrl';
  defensePolicy?: 'mule' | 'laa' | 'lta' | 'random';
  alwaysHint: boolean;
  allowMoreAnalysisTime: boolean;
  calculationPatience?: 'normal' | 'extended' | 'patient';
  // Derived compatibility field; use calculationPatience when saving a choice.
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
  writePreferences: (value: SitePreferences, storage?: unknown, options?: { calculationPatienceChanged: boolean }) => { preferences: SitePreferences; saved: boolean };
  PREFERENCES_KEY: string;
  CALCULATION_PATIENCE_KEY: string;
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
  const result = module.writePreferences({ ...module.readPreferences(), ...patch }, undefined, {
    calculationPatienceChanged: Object.prototype.hasOwnProperty.call(patch, 'calculationPatience')
  });
  window.dispatchEvent(new CustomEvent('deepsqueeze:preferenceschange', { detail: result.preferences }));
  return result.preferences;
}

export function watchSitePreferences(onChange: (preferences: SitePreferences) => void): () => void {
  const custom = (event: Event) => {
    const detail = (event as CustomEvent<SitePreferences>).detail;
    if (detail) onChange(detail);
  };
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === preferences.PREFERENCES_KEY || event.key === preferences.CALCULATION_PATIENCE_KEY) onChange(preferences.readPreferences());
  };
  window.addEventListener('deepsqueeze:preferenceschange', custom);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener('deepsqueeze:preferenceschange', custom);
    window.removeEventListener('storage', storage);
  };
}
