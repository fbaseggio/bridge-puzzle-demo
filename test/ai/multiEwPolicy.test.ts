import { describe, expect, it } from 'vitest';
import { init } from '../../src/core';
import { evaluatePolicy } from '../../src/ai/evaluatePolicy';
import { sureTricksDemo } from '../../src/puzzles/sure_tricks_demo';

describe('multi-EW defender policy arbitration', () => {
  it('keeps all active variants when a common playable set exists', () => {
    const state = init(sureTricksDemo);
    const result = evaluatePolicy({
      policy: { kind: 'threatAware' },
      seat: 'W',
      problemId: state.id,
      contractStrain: state.contract.strain,
      hands: state.hands,
      trick: [],
      threat: state.threat as any,
      resource: state.resource as any,
      threatLabels: state.threatLabels as any,
      ewVariantState: state.ewVariantState,
      rng: state.rng
    });

    expect(result.bucketCards).toEqual([result.chosenCardId]);
    expect(result.ewVariantState?.activeVariantIds).toEqual(['a', 'b']);
    expect(result.ewVariantState?.committedVariantId).toBeNull();
    expect(result.ewVariantTrace?.arbitration).toBe('intersection');
    expect(result.ewVariantTrace?.intersection).toEqual(expect.arrayContaining(['SK', 'SQ', 'HK', 'HQ', 'H9']));
    expect(result.ewVariantTrace?.perVariant.map((variant) => variant.variantId)).toEqual(['a', 'b']);
    expect(result.ewVariantTrace?.perVariant.every((variant) => variant.a.includes(variant.chosenCardId!))).toBe(true);
    expect(result.chosenCardId).toBeTruthy();
  });

  it('commits to a single variant when no common playable card exists', () => {
    const state = init(sureTricksDemo);
    const result = evaluatePolicy({
      policy: { kind: 'threatAware' },
      seat: 'E',
      problemId: state.id,
      contractStrain: state.contract.strain,
      hands: state.hands,
      trick: [{ seat: 'N', suit: 'H', rank: 'A' }],
      threat: state.threat as any,
      resource: state.resource as any,
      threatLabels: state.threatLabels as any,
      ewVariantState: state.ewVariantState,
      rng: state.rng
    });

    expect(result.ewVariantState?.activeVariantIds.length).toBe(1);
    expect(result.ewVariantState?.committedVariantId).toBe(result.ewVariantState?.activeVariantIds[0]);
    expect(result.ewVariantState?.representativeVariantId).toBe(result.ewVariantState?.activeVariantIds[0]);
    expect(result.ewVariantTrace?.arbitration).toBe('eliminate');
    expect(result.ewVariantTrace?.intersection).toEqual([]);
    expect(result.ewVariantTrace?.chosenVariantId).toBe(result.ewVariantState?.activeVariantIds[0]);
    expect(result.chosenCardId).toBeTruthy();
  });
});
