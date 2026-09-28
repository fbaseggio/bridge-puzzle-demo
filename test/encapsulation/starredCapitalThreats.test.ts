import { describe, expect, it } from 'vitest';
import { bindStandard, computeSpecifiedCardCounts, inferSuitAbstraction, normalizeEncapsulationRoundTrip, parseEncapsulation } from '../../src/encapsulation';
import { demoProblems, resolveDemoProblem } from '../../src/demo/problems';
import type { Side, Suit } from '../../src/encapsulation';

const RANKS = 'AKQJT98765432';
const REVIEWED_SUITS: Array<{ id: string; suit: Suit; primary: 'N' | 'S'; text: string; links: number }> = [
  { id: 'double_dummy_01', suit: 'C', primary: 'S', text: 'WB*imuuuuu', links: 1 },
  { id: 'ruff_or_sluff_03', suit: 'C', primary: 'N', text: 'WLA*oouu', links: 2 },
  { id: 'ruff_or_sluff_10', suit: 'D', primary: 'N', text: 'WA*imouuuu', links: 1 },
  { id: 'ruff_or_sluff_11', suit: 'D', primary: 'N', text: 'A*iu', links: 0 },
  { id: 'for_barry_full_deal', suit: 'S', primary: 'S', text: 'WB*imooouu', links: 1 }
];

describe('starred capital threats', () => {
  it.each(['A', 'B'])('parses %s* without counting the suffix as a card', (symbol) => {
    const input = `W${symbol}*imou =`;
    expect(parseEncapsulation(input).suits[0].pattern).toBe(`W${symbol}*imou`);
    expect(computeSpecifiedCardCounts(input)).toEqual({ specifiedNorth: 3, specifiedSouth: 3 });
    expect(parseEncapsulation(`W${symbol}*o' =`).suits[0].allowIdleFill).toBe(false);
  });

  it.each(["WA'*", "WA*'", "WB'*", "WB*'", 'A**', '*A', 'Wa*', 'Wg*', 'WC*'])(
    'rejects unsupported modifier syntax: %s', (pattern) => {
      expect(() => parseEncapsulation(`${pattern} =`)).toThrow();
    }
  );

  for (const primary of ['N', 'S'] as const) {
    it.each(['A', 'B'])(`${primary}-primary %s* binds no secondary cards and leaves low ranks available`, (symbol) => {
      const pattern = `W${symbol}*`;
      const bound = bindStandard(primary === 'N' ? `${pattern} =` : `= ${pattern}`);
      const owner = primary === 'N' ? 'S' : 'N';
      const stopper = (owner === 'S') === (symbol === 'A') ? 'E' : 'W';
      const secondary = stopper === 'E' ? 'W' : 'E';
      const pre = bound.metadata.preCompletionHands;
      expect(pre[stopper].S).toEqual(['K', 'Q']);
      expect(pre[secondary].S).toEqual([]);
      expect(pre[primary].S).toEqual(['A', 'T']);
      expect(pre[owner].S).toEqual(['2', 'J']);
      expect(bound.threatCards[0].symbol).toBe(`${symbol}*`);
      expect(bound.cardBindings.filter((card) => card.hand === secondary && card.suit === 'S')
        .every((card) => card.role === 'idleFill')).toBe(true);
      expect(bound.hands[secondary].S.every((rank) => RANKS.indexOf(rank) > RANKS.indexOf('T'))).toBe(true);
    });
  }

  it.each(['8', '9', 'T'])('recognizes a singleton %s above the companion as idle', (singleton) => {
    expect(inferSuitAbstraction({ N: 'A7', E: 'KQ', S: 'J2', W: singleton })).toBe('WA*o');
    expect(inferSuitAbstraction({ N: 'A7', E: singleton, S: 'J2', W: 'KQ' })).toBe('WB*u');
  });

  it('requires both length and rank to cover the next primary card', () => {
    expect(inferSuitAbstraction({ N: 'A7', E: 'KQ', S: 'J2', W: 'T3' })).toBe('WA');
    expect(inferSuitAbstraction({ N: 'A7', E: 'KQ', S: 'J2', W: '65' })).toBe('WA*oo');
  });

  it.each(REVIEWED_SUITS)('inverts and rebinds $id:$suit with $text', ({ id, suit, primary, text, links }) => {
    const problem = resolveDemoProblem(demoProblems.find((entry) => entry.id === id)!);
    const originalSuit = Object.fromEntries(Object.entries(problem.hands).map(([seat, hand]) => [seat, hand[suit]])) as Record<Side, string[]>;
    expect(inferSuitAbstraction(originalSuit)).toBe(text);

    const input = primary === 'N' ? `[s] ${text} =` : `[s] = ${text}`;
    const bound = bindStandard(input);
    const structuralSuit = Object.fromEntries(Object.entries(bound.metadata.preCompletionHands).map(([seat, hand]) => [seat, hand.S])) as Record<Side, string[]>;
    // Before automatic hand completion, no suit cards may be invented or lost.
    for (const seat of ['N', 'E', 'S', 'W'] as const) {
      expect(structuralSuit[seat]).toHaveLength(originalSuit[seat].length);
    }
    expect(inferSuitAbstraction(structuralSuit)).toBe(text);

    const symbol = text.includes('A*') ? 'A*' : 'B*';
    const stopper = (primary === 'N') === (symbol === 'A*') ? 'E' : 'W';
    const secondary = stopper === 'E' ? 'W' : 'E';
    const remainingPrimary = bound.cardBindings
      .filter((card) => card.hand === primary && card.suit === 'S' && !['w', 'W', 'L'].includes(card.symbol))
      .map((card) => card.rank).sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b));
    const stops = bound.hands[secondary].S.length >= links + 1 &&
      bound.hands[secondary].S.some((rank) => RANKS.indexOf(rank) < RANKS.indexOf(remainingPrimary[0]));
    expect(stops).toBe(false);

    const roundtrip = normalizeEncapsulationRoundTrip(input);
    expect(roundtrip.explicitEncap1).toContain(symbol);
    expect(roundtrip.explicitEncap2).toBe(roundtrip.explicitEncap1);
  });
});
