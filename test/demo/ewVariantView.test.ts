import { describe, expect, it } from 'vitest';
import { init } from '../../src/core';
import { sureTricksDemo } from '../../src/puzzles/sure_tricks_demo';
import { fixedRanksForSeatSuit, unresolvedEwCardsBySuit } from '../../src/demo/ewVariantView';

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
});
