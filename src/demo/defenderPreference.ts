import type { CardId, State } from '../core/types';
import type { WidgetHost } from './widgetHost';

/** A consumer may narrow DDS's choices, never enlarge or replace its safe set. */
export function defenderPreference(state: State, safe: readonly CardId[],
  prefer?: WidgetHost['preferDefenderCards']): CardId[] {
  if (!prefer || safe.length < 2) return [...safe];
  try {
    const requested = prefer(structuredClone(state), [...safe]);
    const intersection = safe.filter(card => requested.includes(card));
    return intersection.length ? intersection : [...safe];
  } catch { return [...safe]; }
}
