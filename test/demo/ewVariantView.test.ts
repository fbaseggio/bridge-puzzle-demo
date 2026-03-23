import { describe, expect, it } from 'vitest';
import { apply, init } from '../../src/core';
import { sureTricksDemo } from '../../src/puzzles/sure_tricks_demo';
import {
  buildUnknownMergedRankColorVisual,
  cardVariantColors,
  fixedRanksForSeatSuit,
  unresolvedEwCardsBySuit
} from '../../src/demo/ewVariantView';

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

  it('shows ST as ambiguous after CK and uniform threat again after S2, SA', () => {
    let state = init(sureTricksDemo);
    for (const cardId of ['CT', 'CA', 'CQ', 'CK']) {
      state = apply(state, { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const).state;
    }

    expect(cardVariantColors(state, 'N', 'ST', true)).toEqual(['green', 'purple']);

    for (const cardId of ['S2', 'SA']) {
      state = apply(state, { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const).state;
    }

    expect(cardVariantColors(state, 'N', 'ST', true)).toEqual(['green']);
    expect(state.cardRoles.ST).toBe('threat');
  });

  it('builds merged unknown visuals from per-variant regular views when provided', () => {
    const state = init(sureTricksDemo);
    expect(
      buildUnknownMergedRankColorVisual(
        state,
        'N',
        'ST',
        true,
        true,
        [
          {
            threat: state.threat as any,
            threatLabels: state.threatLabels as any,
            cardRoles: { ...state.cardRoles, ST: 'threat' },
            goalStatus: state.goalStatus
          },
          {
            threat: state.threat as any,
            threatLabels: state.threatLabels as any,
            cardRoles: { ...state.cardRoles, ST: 'promotedWinner' },
            goalStatus: state.goalStatus
          }
        ]
      )
    ).toEqual({
      kind: 'split',
      colors: ['rank--green', 'rank--purple']
    });
  });
});
