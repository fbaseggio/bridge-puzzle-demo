import { describe, expect, it } from 'vitest';
import { apply, init } from '../../src/core';
import { sureTricksDemo } from '../../src/puzzles/sure_tricks_demo';
import { cardVariantColors, fixedRanksForSeatSuit, unresolvedEwCardsBySuit } from '../../src/demo/ewVariantView';

describe('multi-EW version-unknown view', () => {
  it('shows only seat-fixed E/W cards and isolates unresolved cards to the slash line', () => {
    const state = init(sureTricksDemo);

    expect(fixedRanksForSeatSuit(state.ewVariantState, 'W', 'S')).toEqual(['K', 'Q']);
    expect(fixedRanksForSeatSuit(state.ewVariantState, 'W', 'H')).toEqual(['K', 'Q', '9']);
    expect(fixedRanksForSeatSuit(state.ewVariantState, 'E', 'D')).toEqual(['A', 'K']);
    expect(fixedRanksForSeatSuit(state.ewVariantState, 'E', 'C')).toEqual(['4', '3', '2']);

    const unresolved = unresolvedEwCardsBySuit(state.ewVariantState);
    expect(unresolved.S).toEqual(['SJ']);
    expect(unresolved.H).toEqual(['HJ']);
    expect(unresolved.D).toEqual([]);
    expect(unresolved.C).toEqual([]);
  });

  it('aggregates fixed-card colors across active variants', () => {
    let state = init(sureTricksDemo);
    for (const cardId of ['CT', 'CA', 'CQ']) {
      state = apply(state, { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const).state;
    }

    expect(cardVariantColors(state, 'W', 'SK', true)).toEqual(['blue']);
    expect(cardVariantColors(state, 'E', 'DA', true)).toEqual(['black']);
  });
});
