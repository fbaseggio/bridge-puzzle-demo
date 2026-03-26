import { describe, expect, it } from 'vitest';
import { init, apply } from '../../src/core';
import { sureTricksDemo } from '../../src/puzzles/sure_tricks_demo';
import { buildRegularPlayedCardDisplay, buildRegularSuitCardDisplays } from '../../src/demo/regularDisplayView';

describe('regular display view', () => {
  it('builds regular suit card displays from semantic state', () => {
    const state = init(sureTricksDemo);
    const displays = buildRegularSuitCardDisplays(state, 'N', 'S', true, true, true);

    expect(displays).toEqual([
      {
        cardId: 'SA',
        rank: 'A',
        isEquivalent: false,
        visual: { kind: 'solid', colorClass: 'rank--black' }
      },
      {
        cardId: 'ST',
        rank: 'T',
        isEquivalent: false,
        visual: { kind: 'solid', colorClass: 'rank--green' }
      }
    ]);
  });

  it('builds a played-card display from the rendered regular view state', () => {
    let state = init(sureTricksDemo);
    state = apply(state, { seat: 'S', suit: 'C', rank: 'T' }).state;
    state = apply(state, { seat: 'W', suit: 'H', rank: '9' }).state;
    state = apply(state, { seat: 'N', suit: 'C', rank: 'A' }).state;
    state = apply(state, { seat: 'E', suit: 'C', rank: '2' }).state;
    state = apply(state, { seat: 'N', suit: 'C', rank: 'Q' }).state;
    state = apply(state, { seat: 'E', suit: 'C', rank: '3' }).state;
    state = apply(state, { seat: 'S', suit: 'C', rank: 'K' }).state;

    expect(
      buildRegularPlayedCardDisplay(state, { seat: 'W', suit: 'S', rank: 'K' }, true, true)
    ).toEqual({
      cardId: 'SK',
      rank: 'K',
      visual: { kind: 'solid', colorClass: 'rank--grey' }
    });
  });

  it('suppresses equivalence underlines when explicitly disabled', () => {
    const state = init(sureTricksDemo);
    const displays = buildRegularSuitCardDisplays(state, 'N', 'S', true, true, false);
    expect(displays.every((entry) => entry.isEquivalent === false)).toBe(true);
  });
});
