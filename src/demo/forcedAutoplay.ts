import { classInfoForCard, legalPlays, type Play, type State } from '../core';

/** Keep a policy's meaningful choice, normalizing only within its equals group.
 * A caller may restrict candidates to those confirmed safe by DDS.
 */
export function lowestEquivalentPlay(state: State, chosen: Play, allowed = legalPlays(state)): Play {
  const group = classInfoForCard(state, chosen.seat, `${chosen.suit}${chosen.rank}`);
  for (const card of [...group.members].reverse()) {
    const play = allowed.find(candidate => candidate.seat === chosen.seat
      && `${candidate.suit}${candidate.rank}` === card);
    if (play) return play;
  }
  return chosen;
}

/** Autoplay only when every legal choice is the same physical equals group.
 * E/W's strategic policy is deliberately separate from this forced-play rule.
 */
export function singletonOrEqualsPlay(state: State): Play | undefined {
  const legal = legalPlays(state).filter(play => play.seat === state.turn);
  if (legal.length <= 1) return legal[0];
  const first = legal[0];
  const group = classInfoForCard(state, state.turn, `${first.suit}${first.rank}`);
  const members = new Set(group.members);
  if (!legal.every(play => members.has(`${play.suit}${play.rank}`))) return undefined;
  return lowestEquivalentPlay(state, first, legal);
}
