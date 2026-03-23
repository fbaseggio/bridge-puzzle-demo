import { describe, expect, it } from 'vitest';
import { apply, init, legalPlays } from '../../src/core';
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

  it('continues autoplay after a designated threat has been played from the unknown view branch', () => {
    let state = init(sureTricksDemo);
    const seq = ['CT', 'CA', 'CQ', 'CK', 'DQ'];
    for (const cardId of seq) {
      const legal = legalPlays(state).map((play) => `${play.suit}${play.rank}`);
      expect(legal).toContain(cardId);
      const play = { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const;
      state = apply(state, play).state;
    }

    expect(state.turn).toBe('N');
    expect(legalPlays(state).map((play) => `${play.suit}${play.rank}`)).toContain('ST');
    expect(() => apply(state, { seat: 'N', suit: 'S', rank: 'T' })).not.toThrow();
  });

  it('falls back to a legal discard when no designated threats remain', () => {
    let state = init(sureTricksDemo);
    const seq = ['CT', 'CA', 'CQ', 'CK', 'CJ', 'ST', 'S2', 'SA', 'HA', 'S3'];
    for (const cardId of seq) {
      const legal = legalPlays(state).map((play) => `${play.suit}${play.rank}`);
      expect(legal).toContain(cardId);
      state = apply(state, { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const).state;
    }

    expect(state.turn).toBe('N');
    expect(legalPlays(state).map((play) => `${play.suit}${play.rank}`)).toEqual(['HT']);
    const result = apply(state, { seat: 'N', suit: 'H', rank: 'T' });
    expect(result.events.some((event) => event.type === 'illegal')).toBe(false);
    expect(result.events.some((event) => event.type === 'autoplay' && event.play.seat === 'E' && event.play.suit === 'D' && event.play.rank === 'K')).toBe(true);
  });

  it('treats equivalence-class peers of the preferred card as A in variant arbitration', () => {
    let state = init(sureTricksDemo);
    const seq = ['CT', 'CA', 'CQ'];
    for (const cardId of seq) {
      state = apply(state, { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const).state;
    }

    const result = apply(state, { seat: 'S', suit: 'C', rank: 'K' });
    const westAuto = result.events.find((event) => event.type === 'autoplay' && event.play.seat === 'W');
    expect(westAuto?.type).toBe('autoplay');
    if (westAuto?.type !== 'autoplay' || !westAuto.ewVariantTrace) throw new Error('missing W variant trace');

    const variantA = westAuto.ewVariantTrace.perVariant.find((variant) => variant.variantId === 'a');
    const variantB = westAuto.ewVariantTrace.perVariant.find((variant) => variant.variantId === 'b');
    expect(variantA?.a).toEqual(expect.arrayContaining(['SK', 'SQ', 'SJ']));
    expect(variantA?.c).toEqual(expect.arrayContaining(['HK', 'HQ']));
    expect(variantB?.a).toEqual(expect.arrayContaining(['HK', 'HQ', 'HJ']));
    expect(variantB?.c).toEqual(expect.arrayContaining(['SK', 'SQ']));
  });

  it('demotes plays that resolve an ambiguous designated threat into uniform promotion', () => {
    const problem = { ...sureTricksDemo, userControls: ['N', 'E', 'S', 'W'] as const };
    let state = init(problem);
    const seq = ['CT', 'H9', 'CA', 'C4', 'CQ', 'C3', 'CK', 'HK', 'CJ'];
    for (const cardId of seq) {
      state = apply(state, { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const).state;
    }

    expect(state.turn).toBe('W');
    const result = evaluatePolicy({
      policy: { kind: 'threatAware' },
      seat: 'W',
      problemId: state.id,
      contractStrain: state.contract.strain,
      hands: state.hands,
      trick: state.trick,
      threat: state.threat as any,
      resource: state.resource as any,
      threatLabels: state.threatLabels as any,
      ewVariantState: state.ewVariantState,
      rng: state.rng
    });

    expect(result.chosenCardId).not.toBe('HQ');
    const variantA = result.ewVariantTrace?.perVariant.find((variant) => variant.variantId === 'a');
    const variantB = result.ewVariantTrace?.perVariant.find((variant) => variant.variantId === 'b');
    expect(variantA?.c).toContain('HQ');
    expect(variantB?.c).toEqual(expect.arrayContaining(['HQ', 'HJ']));
    expect(variantA?.b).not.toContain('HQ');
    expect(variantB?.b).not.toContain('HQ');
  });

  it('eliminates variants by follow-suit legality when a defender discards', () => {
    const problem = { ...sureTricksDemo, userControls: ['N', 'E', 'S', 'W'] as const };
    let state = init(problem);
    const seq = ['CT', 'H9', 'CA', 'C2', 'CQ', 'C3', 'CK', 'SK', 'CJ', 'HK', 'ST', 'C4', 'S2', 'SQ', 'SA'];
    for (const cardId of seq) {
      state = apply(state, { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const).state;
    }

    expect(state.turn).toBe('E');
    expect(state.ewVariantState?.activeVariantIds).toEqual(['a', 'b']);

    state = apply(state, { seat: 'E', suit: 'D', rank: 'A' }).state;
    expect(state.ewVariantState?.activeVariantIds).toEqual(['a']);
    expect(state.ewVariantState?.committedVariantId).toBe('a');
    expect(state.ewVariantState?.representativeVariantId).toBe('a');
  });

  it('looks ahead through forced trick resolution when scoring ambiguous-to-uniform promotions', () => {
    const problem = { ...sureTricksDemo, userControls: ['N', 'E', 'S', 'W'] as const };
    let state = init(problem);
    const seq = ['CT', 'H9', 'CA', 'C2', 'CQ', 'C3', 'CK', 'SK', 'CJ', 'HK', 'ST', 'C4', 'S2', 'SQ', 'SA'];
    for (const cardId of seq) {
      state = apply(state, { seat: state.turn, suit: cardId[0], rank: cardId.slice(1) } as const).state;
    }

    const result = evaluatePolicy({
      policy: { kind: 'threatAware' },
      seat: 'E',
      problemId: state.id,
      contractStrain: state.contract.strain,
      hands: state.hands,
      trick: state.trick,
      threat: state.threat as any,
      resource: state.resource as any,
      threatLabels: state.threatLabels as any,
      ewVariantState: state.ewVariantState,
      rng: state.rng
    });

    expect(result.chosenCardId).toBe('SJ');
    const variantA = result.ewVariantTrace?.perVariant.find((variant) => variant.variantId === 'a');
    expect(variantA?.a).toEqual([]);
    expect(variantA?.c).toEqual(expect.arrayContaining(['DA', 'DK']));
  });
});
