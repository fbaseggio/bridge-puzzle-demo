import { describe, expect, it } from 'vitest';
import { normalizeEncapsulationRoundTrip } from '../../src/encapsulation';

const ROUND_TRIP_CASES = [
  'Wa, a > w',
  'Waou',
  'Wwc > a, b, W',
  "WLa, WB > b', W -1",
  '[shdc] wau, WWu > WLc, Wc',
  '[schd] Wa, a > w, iooo'
];

describe('encapsulation round-trip normalization', () => {
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
