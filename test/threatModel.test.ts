import { describe, expect, test } from 'vitest';
import type { Hand, Seat, Suit } from '../src/core';
import { chooseDiscard, getIdleThreatThresholdRank } from '../src/ai/defenderDiscard';
import {
  computeDefenderLabels,
  initThreatContext,
  updateThreatContextAfterTrick,
  type CardId,
  type Position
} from '../src/ai/threatModel';
import { getCardRankColor } from '../src/ui/annotations';

function makePosition(hands: Record<Seat, Hand>): Position {
  return { hands };
}

describe('threat model + defender discard', () => {
  test('validation errors: missing threat card and duplicate suit threats', () => {
    const position = makePosition({
      N: { S: ['A'], H: [], D: [], C: [] },
      E: { S: [], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: [], H: [], D: [], C: [] }
    });

    expect(() => initThreatContext(position, ['S8' as CardId])).toThrow(/exactly one hand/);
    expect(() => initThreatContext(position, ['SA' as CardId, 'SK' as CardId])).toThrow(/Duplicate threat suit/);
  });

  test('threatLength computation from designated threat card', () => {
    const position = makePosition({
      N: { S: ['A', 'Q', '9', '5'], H: [], D: [], C: [] },
      E: { S: [], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: [], H: [], D: [], C: [] }
    });

    const ctx = initThreatContext(position, ['S9' as CardId]);
    expect(ctx.threatsBySuit.S?.threatLength).toBe(3);
    expect(ctx.threatsBySuit.S?.establishedOwner).toBe('N');
  });

  test('busy rule marks highest threatLength cards when busy', () => {
    const position = makePosition({
      N: { S: ['A', 'Q', '9', '5'], H: [], D: [], C: [] },
      E: { S: ['8', '6', '4'], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: ['K', 'J', '7', '2'], H: [], D: ['A'], C: [] }
    });

    const ctx = initThreatContext(position, ['S9' as CardId]);
    const labels = computeDefenderLabels(ctx, position);

    expect([...labels.W.busy].sort()).toEqual(['S7', 'SJ', 'SK']);
    expect(labels.W.idle.has('S2' as CardId)).toBe(true);
    expect(labels.E.busy.size).toBe(0);
  });

  test('discard tier selection priority is correct', () => {
    const position = makePosition({
      N: { S: ['A', 'Q', '9', '5'], H: [], D: [], C: [] },
      E: { S: [], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: ['K', 'J', '7', '2'], H: [], D: ['A'], C: [] }
    });

    const ctx = initThreatContext(position, ['S9' as CardId]);
    const labels = computeDefenderLabels(ctx, position);

    // Tier 1a/1b/1c split: DA is 1a (no active threat suit), S2 is 1c.
    const pick1 = chooseDiscard('W', position, 'H' as Suit, ctx, labels, () => 0);
    expect(pick1).toBe('DA');

    // No tier 1, tier 2 available (busy and below threat rank => S7)
    const position2 = makePosition({
      N: { S: ['A', 'Q', '9', '5'], H: [], D: [], C: [] },
      E: { S: [], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: ['K', 'J', '7'], H: [], D: [], C: [] }
    });
    const ctx2 = initThreatContext(position2, ['S9' as CardId]);
    const labels2 = computeDefenderLabels(ctx2, position2);
    const pick2 = chooseDiscard('W', position2, null, ctx2, labels2, () => 0);
    expect(pick2).toBe('S7');
  });

  test('dynamic relabel turns threat OFF when designated card owner changes', () => {
    const start = makePosition({
      N: { S: ['A', 'Q', '9'], H: [], D: [], C: [] },
      E: { S: ['7'], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: ['K', 'J', '2'], H: [], D: [], C: [] }
    });

    const ctx0 = initThreatContext(start, ['S9' as CardId]);
    expect(ctx0.threatsBySuit.S?.active).toBe(true);

    // Simulate state where threat card moved to a different owner.
    const moved = makePosition({
      N: { S: ['A', 'Q'], H: [], D: [], C: [] },
      E: { S: ['9', '7'], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: ['K', 'J', '2'], H: [], D: [], C: [] }
    });

    const ctx1 = updateThreatContextAfterTrick(ctx0, moved, ['SA', 'S7', 'SK', 'SQ']);
    expect(ctx1.threatsBySuit.S?.active).toBe(false);

    const labels = computeDefenderLabels(ctx1, moved);
    expect(labels.W.busy.size).toBe(0);
    expect(labels.W.idle.has('SK' as CardId)).toBe(true);
  });

  test('teaching annotations: threat green, busy blue, otherwise black', () => {
    const position = makePosition({
      N: { S: ['A', 'Q', '9', '5'], H: [], D: [], C: [] },
      E: { S: ['8', '6', '4'], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: ['K', 'J', '7', '2'], H: [], D: [], C: [] }
    });

    const ctx = initThreatContext(position, ['S9' as CardId]);
    const labels = computeDefenderLabels(ctx, position);

    expect(getCardRankColor('S9' as CardId, ctx, labels, true)).toBe('green');
    expect(getCardRankColor('SK' as CardId, ctx, labels, true)).toBe('blue');
    expect(getCardRankColor('S2' as CardId, ctx, labels, true)).toBe('black');
    expect(getCardRankColor('SK' as CardId, ctx, labels, false)).toBe('black');

    const offCtx = updateThreatContextAfterTrick(
      ctx,
      {
        hands: {
          N: { S: ['A', 'Q', '5'], H: [], D: [], C: [] },
          E: { S: ['9', '8', '6', '4'], H: [], D: [], C: [] },
          S: { S: [], H: [], D: [], C: [] },
          W: { S: ['K', 'J', '7', '2'], H: [], D: [], C: [] }
        }
      },
      ['SA', 'S8', 'SK', 'SQ']
    );
    const offLabels = computeDefenderLabels(offCtx, {
      hands: {
        N: { S: ['A', 'Q', '5'], H: [], D: [], C: [] },
        E: { S: ['9', '8', '6', '4'], H: [], D: [], C: [] },
        S: { S: [], H: [], D: [], C: [] },
        W: { S: ['K', 'J', '7', '2'], H: [], D: [], C: [] }
      }
    });
    expect(getCardRankColor('S9' as CardId, offCtx, offLabels, true)).toBe('black');
  });

  test('promotedWinner is purple when active threat has no busy defenders', () => {
    const position = makePosition({
      N: { S: ['9'], H: [], D: [], C: [] },
      E: { S: ['8'], H: [], D: [], C: [] },
      S: { S: [], H: [], D: [], C: [] },
      W: { S: ['7'], H: [], D: [], C: [] }
    });

    const ctx = initThreatContext(position, ['S9' as CardId]);
    const labels = computeDefenderLabels(ctx, position);

    expect(getCardRankColor('S9' as CardId, ctx, labels, true)).toBe('purple');
    expect(getCardRankColor('S9' as CardId, ctx, labels, false)).toBe('black');
    expect(getIdleThreatThresholdRank('S', ctx, labels)).toBe('9');
  });
});
