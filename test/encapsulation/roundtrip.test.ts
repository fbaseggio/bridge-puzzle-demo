import { describe, expect, it } from 'vitest';
import { normalizeEncapsulationRoundTrip } from '../../src/encapsulation';
import { authoredStructureDifferences as compareAuthoredStructure } from '../../src/encapsulation/structureComparison';

const ROUND_TRIP_CASES = [
  'Wa, a > w',
  'Waou',
  'Wwc > a, b, W',
  "WLa, WB > b', W -1",
  "Wg', Wg > wwo",
  'Wf > LF, w',
  'Wf > wLF',
  '[shdc] wau, WWu > WLc, Wc',
  '[schd] Wa, a > w, iooo',
  'www < io, iu, iou',
  'WLau, WAuu > b, Wo -1',
  'Wwa, WC > Wc, Ww',
  'WA =',
  "WA' =",
  'WB =',
  "WB' =",
  "wA' > a",
  "wB' > b",
  '[s] = WB*imuuuuu',
  '[s] WLA*oouu =',
  '[s] WA*imouuuu =',
  '[s] A*iu =',
  '[s] = WB*imooouu'
];

// Owner-approved per-case permission only. Inversion describes potential
// threats; it does not analyze whether they are useful in the whole position.
const ALLOW_ADDITIONAL_LOWERCASE_THREATS = new Set([
  'Waou',
  '[schd] Wa, a > w, iooo',
  'www < io, iu, iou'
]);

// Owner-approved omissions; keep the E1 = E2 check for both cases below.
// - Wf > LF, w: LF with South primary can invert to Wfm with North primary
//   (L/W and F/fm are mirrors).
// - Wf > wLF: inversion can pair the original F card with w and reclassify
//   another card as the threat, yielding WLb instead of wLF.
// In general, lowercase w mixed with non-W capitals, and all-capital forms,
// need review for representation ambiguity. Do not exempt them automatically.
const OMIT_ORIGINAL_COMPARISON = new Set(['Wf > LF, w', 'Wf > wLF']);

// Permissions stay specific to these owner-reviewed fixtures.
function authoredStructureDifferences(input: string, inverse: string, allowAdditionalThreats = ALLOW_ADDITIONAL_LOWERCASE_THREATS.has(input)): string[] {
  return compareAuthoredStructure(input, inverse, allowAdditionalThreats);
}

describe('encapsulation round-trip normalization', () => {
  it('limits extra-threat permission to approved cases and preserves authored content', () => {
    expect(authoredStructureDifferences('Waou', '[s] Wabcou =')).toEqual([]);
    expect(authoredStructureDifferences('Wa, a > w', '[shd] Wab, a > w')).not.toEqual([]);
    for (const inverse of ['[s] Wou =', '[s] aou =', '[s] Wau =', '[s] WaAou =']) {
      expect(authoredStructureDifferences('Waou', inverse), inverse).not.toEqual([]);
    }
  });

  it('allows approved a/io, b/iu, and c/iou absorption in any idle-symbol order', () => {
    const groups = [
      { threat: 'a', permutations: ['io', 'oi'] },
      { threat: 'b', permutations: ['iu', 'ui'] },
      { threat: 'c', permutations: ['iou', 'iuo', 'oiu', 'oui', 'uio', 'uoi'] }
    ];
    for (const { threat, permutations } of groups) {
      for (const idle of permutations) {
        expect(authoredStructureDifferences(`[s] ${idle} =`, `[s] ${threat} =`, true), idle).toEqual([]);
        expect(authoredStructureDifferences(`[s] ${idle} =`, `[s] ${threat} =`, false), idle).not.toEqual([]);
      }
    }
    expect(authoredStructureDifferences('[s] iooi =', '[s] aa =', true)).toEqual([]);
    expect(authoredStructureDifferences('[s] iooo =', '[s] oao =', true)).toEqual([]);
  });

  it('does not absorb the wrong guard, opposite-hand idle, or more cards than added threats cover', () => {
    for (const [input, inverse] of [
      ['io', 'b'],
      ['iu', 'a'],
      ['iou', 'a'],
      ['iooi', 'a'],
      ['mo', 'a'],
      ['aio', 'a']
    ]) {
      expect(authoredStructureDifferences(`[s] ${input} =`, `[s] ${inverse} =`, true), `${input} -> ${inverse}`).not.toEqual([]);
    }
  });

  it('inverts the three idle holdings to a, b, and c', () => {
    const result = normalizeEncapsulationRoundTrip('www < io, iu, iou');
    expect(result.explicitEncap1).toBe('[shdc] wwwou < a, b, c');
    expect(result.explicitEncap2).toBe(result.explicitEncap1);
  });

  for (const input of ROUND_TRIP_CASES) {
    it.skipIf(OMIT_ORIGINAL_COMPARISON.has(input))(`preserves authored structure and idle cards in E1: ${input}`, () => {
      const result = normalizeEncapsulationRoundTrip(input);
      const differences = authoredStructureDifferences(input, result.explicitEncap1);
      expect(differences, `Original: ${input}\nE1: ${result.explicitEncap1}\n${differences.join('\n')}`).toEqual([]);
    });
  }

  it('stabilizes after first explicit inverse form', () => {
    const results = ROUND_TRIP_CASES.map((input) => normalizeEncapsulationRoundTrip(input));
    const failures = results.filter((result) => !result.stable);
    if (failures.length > 0) {
      const details = failures
        .map((failure) => {
          return [
            `input: ${failure.input}`,
            `explicit_1: ${failure.explicitEncap1}`,
            `explicit_2: ${failure.explicitEncap2}`,
            `second_pass_error: ${failure.secondPassError ?? 'none'}`,
            'bind_1:',
            failure.diagram1,
            'bind_2:',
            failure.diagram2
          ].join('\n');
        })
        .join('\n\n---\n\n');
      throw new Error(`Round-trip normalization mismatches:\n\n${details}`);
    }
    expect(failures).toHaveLength(0);
  });
});
