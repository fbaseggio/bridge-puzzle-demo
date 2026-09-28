import { describe, expect, it } from 'vitest';
import { bindStandard, inferSuitAbstraction, normalizeEncapsulationRoundTrip, parseEncapsulation } from '../../src/encapsulation';
import { loadEncapsulationWorkbenchProblem } from '../../src/encapsulation/workbenchProblems';

const RANKS = 'AKQJT98765432';

describe('capital threat defender lengths', () => {
  it.each(['A', 'B'])("parses %s' as a token, including before residual cards", (symbol) => {
    const parsed = parseEncapsulation(`W${symbol}'ou =`);
    expect(parsed.suits[0].pattern).toBe(`W${symbol}'ou`);
    expect(parsed.suits[0].allowIdleFill).toBe(true);
    expect(parseEncapsulation(`W${symbol}'' =`).suits[0].allowIdleFill).toBe(false);
    const lowercase = parseEncapsulation(`${symbol.toLowerCase()}' =`).suits[0];
    expect(lowercase.pattern).toBe(symbol.toLowerCase());
    expect(lowercase.allowIdleFill).toBe(false);
  });

  for (const primary of ['N', 'S'] as const) {
    for (const symbol of ['A', 'B'] as const) {
      for (const links of ['W', 'w', 'WW']) {
        it.each([false, true])(`${primary}-primary ${links}${symbol}: primed=%s`, (primed) => {
          const token = `${symbol}${primed ? "'" : ''}`;
          const pattern = `${links}${token}`;
          const bound = bindStandard(primary === 'N' ? `${pattern} =` : `= ${pattern}`);
          const owner = primary === 'N' ? 'S' : 'N';
          const stopper = (owner === 'S') === (symbol === 'A') ? 'E' : 'W';
          const other = stopper === 'E' ? 'W' : 'E';
          const fullLength = links.length + 1;
          const pre = bound.metadata.preCompletionHands;
          const threat = bound.threatCards.find((card) => card.symbol === token)!;
          const companion = bound.cardBindings.find((card) => card.symbol === token && card.note === 'low')!;
          expect(threat.seat).toBe(owner);
          expect(companion.hand).toBe(primary);
          expect(pre[stopper].S).toHaveLength(fullLength - (primed ? 1 : 0));
          expect(pre[other].S).toHaveLength(fullLength);
          for (const rank of pre[stopper].S) expect(RANKS.indexOf(rank)).toBeLessThan(RANKS.indexOf(threat.rank));
          for (const rank of pre[other].S) {
            expect(RANKS.indexOf(rank)).toBeGreaterThan(RANKS.indexOf(threat.rank));
            expect(RANKS.indexOf(rank)).toBeLessThan(RANKS.indexOf(companion.rank));
          }
          if (primed) {
            expect(bound.hands[stopper].S).toEqual(pre[stopper].S);
            expect(bound.cardBindings.some((card) => card.suit === 'S' && card.role === 'idleFill')).toBe(false);
          }
        });
      }
    }
  }

  it('keeps explicitly authored residual cards in a primed suit', () => {
    const bound = bindStandard("WA'u =");
    expect(bound.hands.E.S).toHaveLength(2);
    expect(bound.cardBindings.some((card) => card.hand === 'E' && card.symbol === 'u')).toBe(true);
    expect(bound.cardBindings.some((card) => card.suit === 'S' && card.role === 'idleFill')).toBe(false);
  });

  it.each([
    ['WA', 'KQ', 'T9'],
    ["WA'", 'K', 'T9'],
    ['WB', 'T9', 'KQ'],
    ["WB'", 'T9', 'K']
  ])('inverts the reviewed %s diagram in either orientation', (expected, east, west) => {
    expect(inferSuitAbstraction({ N: 'A2', E: east, S: 'J3', W: west })).toBe(expected);
    expect(inferSuitAbstraction({ N: 'J3', E: west, S: 'A2', W: east })).toBe(expected);
  });

  it.each(['A', 'B'])("preserves w%s' when the opposite threat has no low companion", (symbol) => {
    const pattern = `w${symbol}'`;
    const bound = bindStandard(`${pattern} =`);
    expect(inferSuitAbstraction({ N: bound.hands.N.S, E: bound.hands.E.S, S: bound.hands.S.S, W: bound.hands.W.S })).toBe(pattern);
  });

  it.each(['WA', "WA'", 'WB', "WB'", "wA'", "wB'"])(
    'preserves %s through two complete binding/inversion passes', (pattern) => {
      const result = normalizeEncapsulationRoundTrip(`${pattern} =`);
      expect(parseEncapsulation(result.explicitEncap1).suits.find((suit) => suit.suit === 'S')?.pattern).toBe(pattern);
      expect(result.explicitEncap2).toBe(result.explicitEncap1);
    }
  );

  it('marks missing secondary coverage with a star', () => {
    expect(inferSuitAbstraction({ N: 'A2', E: 'KQ', S: 'J3', W: 'T' })).toBe('WA*o');
    expect(inferSuitAbstraction({ N: 'A4', E: 'KQ', S: 'J5', W: '32' })).toBe('WA*oo');
  });

  it('accepts one card above the companion with lower backing cards', () => {
    expect(inferSuitAbstraction({ N: 'A4', E: 'KQ', S: 'J5', W: 'T2' })).toBe('WA');
    // West can beat the 8 chosen as companion, but cannot beat South's T.
    expect(inferSuitAbstraction({ N: 'Q32', E: 'KJ', S: 'AT8', W: '97654' })).toBe('WB*imuuuuu');
  });

  it('retains existing winner pairing for mixed high/low guards outside standard A/B bindings', () => {
    expect(inferSuitAbstraction({ N: 'K642', E: 'Q53', S: 'AJ', W: 'T987' })).toBe('LWcio');
    expect(inferSuitAbstraction({ N: 'A3', E: '76', S: 'J', W: 'K4' })).toBe('Wc');
  });

  it('keeps C binding unchanged', () => {
    const bound = bindStandard('WC =');
    expect(bound.hands).toEqual({
      N: { S: ['A', '3'], H: [], D: [], C: [] },
      E: { S: ['Q', 'T'], H: [], D: [], C: [] },
      S: { S: ['9', '2'], H: [], D: [], C: [] },
      W: { S: ['K', 'J'], H: [], D: [], C: [] }
    });
  });

  it('uses WAuu in the six-card problem with a five-trick goal', () => {
    const problem = loadEncapsulationWorkbenchProblem('encap_wlau_waouou_gt_b_wo');
    expect(problem.goal.n).toBe(5);
    for (const hand of Object.values(problem.hands)) {
      expect(Object.values(hand).flat()).toHaveLength(6);
    }
    const result = normalizeEncapsulationRoundTrip('WLau, WAuu > b, Wo -1');
    expect(result.explicitEncap1).toBe('[shdc] WLau, WAuu > b, Wo');
    expect(result.explicitEncap2).toBe(result.explicitEncap1);
  });
});
