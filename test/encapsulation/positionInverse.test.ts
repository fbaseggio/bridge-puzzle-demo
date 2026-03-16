import { describe, expect, it } from 'vitest';
import { explainPositionInverse, explainSuitInverse, inferPositionEncapsulation, renderPositionEncapsulationSlots } from '../../src/encapsulation';

describe('position-level inverse encapsulation rendering', () => {
  it('renders explicit header and 0 placeholders for empty suits', () => {
    const out = inferPositionEncapsulation({
      hands: {
        N: { S: ['A', 'J'], H: [], D: [], C: ['K'] },
        E: { S: ['3'], H: [], D: [], C: [] },
        S: { S: ['2'], H: [], D: [], C: [] },
        W: { S: ['K', 'Q', '4'], H: [], D: [], C: [] }
      },
      turn: 'S',
      suitOrder: ['S', 'C', 'H', 'D']
    });
    expect(out.startsWith('[schd]')).toBe(true);
    expect(out.includes('>')).toBe(true);
    expect(out.includes('0')).toBe(true);
  });

  it('surfaces ambiguity markers rather than silently choosing', () => {
    const out = inferPositionEncapsulation({
      hands: {
        N: { S: [], H: [], D: [], C: [] },
        E: { S: [], H: [], D: [], C: [] },
        S: { S: [], H: [], D: [], C: [] },
        W: { S: ['7'], H: [], D: [], C: [] }
      },
      turn: 'N',
      suitOrder: ['S', 'H', 'D', 'C']
    });
    expect(out.includes('{ambiguous:')).toBe(true);
  });

  it('matches p003 suit-level inverse shape with threat metadata', () => {
    const out = inferPositionEncapsulation({
      hands: {
        N: { S: ['A', '8'], H: ['8'], D: [], C: [] },
        E: { S: ['Q', 'T'], H: [], D: ['A'], C: [] },
        S: { S: ['5'], H: [], D: ['8'], C: ['A'] },
        W: { S: ['K', 'J'], H: ['A'], D: [], C: [] }
      },
      turn: 'S',
      suitOrder: ['S', 'H', 'D', 'C'],
      threatCardIds: ['H8', 'S8', 'D8']
    });
    expect(out).toContain('[shdc]');
    expect(out).toContain('Wc');
    expect(out).toContain('a');
    expect(out).toContain('w');
  });

  it('matches post-trick p001 layout without suit-slot shifting', () => {
    const out = inferPositionEncapsulation({
      hands: {
        N: { S: ['A', '8'], H: [], D: [], C: [] },
        E: { S: [], H: [], D: ['K', 'Q'], C: [] },
        S: { S: ['5'], H: [], D: ['2'], C: [] },
        W: { S: ['J'], H: [], D: [], C: [] }
      },
      turn: 'S',
      suitOrder: ['S', 'H', 'D', 'C'],
      preferredPrimaryBySuit: { S: 'N', H: 'N', D: 'S', C: 'S' }
    });
    expect(out).toBe('[shdc] Wwo, 0 > ioo, 0');
  });

  it('uses inherited primary side to resolve pure o/u ambiguity in lineage logging (p003-style)', () => {
    const out = inferPositionEncapsulation({
      hands: {
        N: { S: ['A', '8'], H: [], D: [], C: [] },
        E: { S: ['Q'], H: [], D: ['A'], C: [] },
        S: { S: ['5'], H: [], D: ['8'], C: [] },
        W: { S: ['K', 'J'], H: ['3'], D: [], C: [] }
      },
      turn: 'S',
      suitOrder: ['S', 'H', 'D', 'C'],
      preferredPrimaryBySuit: { S: 'N', H: 'N', D: 'S', C: 'S' },
      threatCardIds: ['D8']
    });
    expect(out).toBe('[shdc] Wwou, o > a, 0');
  });

  it('matches initial p007 whole-position inverse', () => {
    const out = inferPositionEncapsulation({
      hands: {
        N: { S: ['A', '8', '4'], H: ['A', '2'], D: [], C: ['2'] },
        E: { S: ['6'], H: ['Q', 'J', 'T', '9'], D: [], C: ['K'] },
        S: { S: ['K', '5'], H: ['5', '4'], D: ['8'], C: ['A'] },
        W: { S: ['Q', 'T', '7'], H: ['7', '6'], D: ['A'], C: [] }
      },
      turn: 'S',
      suitOrder: ['S', 'H', 'D', 'C'],
      threatCardIds: ['S8', 'D8'],
      preferredPrimaryBySuit: { S: 'N', H: 'N', D: 'S', C: 'S' }
    });
    expect(out).toBe('[shdc] WLau, Wcuu > b, Wo');
  });

  it('provides suit explanation metadata', () => {
    const explained = explainSuitInverse(
      { N: ['A', '8', '4'], E: ['6'], S: ['K', '5'], W: ['Q', 'T', '7'] },
      'S',
      { preferredPrimary: 'N', threatCardIds: ['S8'] }
    );
    expect(explained.finalText).toBe('WLau');
    expect(explained.chosenPrimary).toBe('N');
    expect(explained.slotIndex).toBe(1);
    expect(explained.totalSlots).toBe(1);
    expect(explained.header).toBe('[s]');
    expect(Array.isArray(explained.winners)).toBe(true);
    expect(Array.isArray(explained.stopChecks)).toBe(true);
    expect(typeof explained.countSummary).toBe('string');
  });

  it('provides position explanation with short text and per-suit detail', () => {
    const explained = explainPositionInverse({
      hands: {
        N: { S: ['A', '8', '4'], H: ['A', '2'], D: [], C: ['2'] },
        E: { S: ['6'], H: ['Q', 'J', 'T', '9'], D: [], C: ['K'] },
        S: { S: ['K', '5'], H: ['5', '4'], D: ['8'], C: ['A'] },
        W: { S: ['Q', 'T', '7'], H: ['7', '6'], D: ['A'], C: [] }
      },
      turn: 'S',
      suitOrder: ['S', 'H', 'D', 'C'],
      threatCardIds: ['S8', 'D8'],
      preferredPrimaryBySuit: { S: 'N', H: 'N', D: 'S', C: 'S' }
    });
    expect(explained.shortText).toBe('[shdc] WLau, Wcuu > b, Wo');
    expect(explained.header).toBe('[shdc]');
    expect(explained.suits).toHaveLength(4);
    expect(explained.suits[0].suit).toBe('S');
    expect(explained.suits[0].slotIndex).toBe(1);
    expect(explained.suits[1].slotIndex).toBe(2);
    expect(explained.suits[2].slotIndex).toBe(3);
    expect(explained.suits[3].slotIndex).toBe(4);
  });

  it('renders lead indicator in fixed separator slot regardless of suit text content', () => {
    const out = renderPositionEncapsulationSlots(
      ['S', 'H', 'D', 'C'],
      ['Wwc', '{ambiguous:o|u}', '0', 'W'],
      'S'
    );
    expect(out).toBe('[shdc] Wwc, {ambiguous:o|u} > 0, W');
  });
});
