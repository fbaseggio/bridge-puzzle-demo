import type { CardId, EwVariantState, Rank, Seat, Suit } from '../core';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function rankOrderValue(rank: Rank): number {
  return ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'].indexOf(rank);
}

function sortRanksDesc(ranks: Rank[]): Rank[] {
  return [...ranks].sort((a, b) => rankOrderValue(a) - rankOrderValue(b));
}

function activeVariants(state: EwVariantState | null) {
  if (!state) return [];
  return state.variants.filter((variant) => state.activeVariantIds.includes(variant.id));
}

export function fixedRanksForSeatSuit(state: EwVariantState | null, seat: 'E' | 'W', suit: Suit): Rank[] {
  const variants = activeVariants(state);
  if (variants.length === 0) return [];
  const shared = variants.reduce<Rank[]>(
    (common, variant) => common.filter((rank) => variant.hands[seat][suit].includes(rank)),
    [...variants[0].hands[seat][suit]]
  );
  return sortRanksDesc(shared);
}

export function unresolvedEwCardsBySuit(state: EwVariantState | null): Record<Suit, CardId[]> {
  const variants = activeVariants(state);
  const out: Record<Suit, CardId[]> = { S: [], H: [], D: [], C: [] };
  if (variants.length === 0) return out;

  const fixedBySeatSuit: Record<'E' | 'W', Record<Suit, Set<string>>> = {
    E: { S: new Set(fixedRanksForSeatSuit(state, 'E', 'S')), H: new Set(fixedRanksForSeatSuit(state, 'E', 'H')), D: new Set(fixedRanksForSeatSuit(state, 'E', 'D')), C: new Set(fixedRanksForSeatSuit(state, 'E', 'C')) },
    W: { S: new Set(fixedRanksForSeatSuit(state, 'W', 'S')), H: new Set(fixedRanksForSeatSuit(state, 'W', 'H')), D: new Set(fixedRanksForSeatSuit(state, 'W', 'D')), C: new Set(fixedRanksForSeatSuit(state, 'W', 'C')) }
  };

  for (const suit of SUITS) {
    const all = new Set<CardId>();
    for (const variant of variants) {
      for (const seat of ['E', 'W'] as const) {
        for (const rank of variant.hands[seat][suit]) {
          all.add(`${suit}${rank}` as CardId);
        }
      }
    }
    out[suit] = [...all]
      .filter((cardId) => {
        const rank = cardId.slice(1);
        return !fixedBySeatSuit.E[suit].has(rank) && !fixedBySeatSuit.W[suit].has(rank);
      })
      .sort((a, b) => rankOrderValue(a.slice(1) as Rank) - rankOrderValue(b.slice(1) as Rank));
  }
  return out;
}
