import type { CardId, Play, State } from '../core/types';
import type { WidgetHost } from './widgetHost';
import { lowestEquivalentPlay } from './forcedAutoplay';

/** Narrow the supplied candidates: DDS-optimal when available, otherwise legal.
 * The consumer can never enlarge the set or mutate the live position. */
export function defenderPreference(state: State, safe: readonly CardId[],
  prefer?: WidgetHost['preferDefenderCards']): CardId[] {
  if (!prefer || safe.length < 2) return [...safe];
  try {
    const requested = prefer(structuredClone(state), [...safe]);
    const intersection = safe.filter(card => requested.includes(card));
    return intersection.length ? intersection : [...safe];
  } catch { return [...safe]; }
}

/** Optional-DDS fallback retains the host's defensive preferences. These plays
 * are legal, but do not carry a double-dummy guarantee. */
export function fallbackDefenderPlay(state:State, legal:readonly Play[], policyChoice:Play,
 prefer?:WidgetHost['preferDefenderCards']):Play {
 const preferred=defenderPreference(state,legal.map(play=>`${play.suit}${play.rank}` as CardId),prefer);
 const policyId=`${policyChoice.suit}${policyChoice.rank}`;
 const chosenId=preferred.includes(policyId as CardId)?policyId:preferred[0];
 const chosen=legal.find(play=>`${play.suit}${play.rank}`===chosenId)??policyChoice;
 return lowestEquivalentPlay(state,chosen,legal.filter(play=>preferred.includes(`${play.suit}${play.rank}` as CardId)));
}

/** Reporting provenance only: a partial/wrong-player result cannot justify 'DDS best'. */
export function hasConfirmedDdsCoverage(legal:readonly CardId[],scores:ReadonlyMap<CardId,number>,turn:State['turn'],player?:State['turn']):boolean {
 return legal.length>0&&(player===undefined||player===turn)&&legal.every(card=>Number.isFinite(scores.get(card)));
}

/** Explain DDS only when it changed the pool; retain incomplete evidence explicitly. */
export function ddsDecisionContribution(legal:readonly CardId[],candidates:readonly CardId[],scores:ReadonlyMap<CardId,number>|undefined,turn:State['turn'],player?:State['turn']){
 const complete=!!scores&&hasConfirmedDdsCoverage(legal,scores,turn,player);
 return {ddsRestricted:complete&&candidates.length<legal.length,ddsIncomplete:!complete};
}
