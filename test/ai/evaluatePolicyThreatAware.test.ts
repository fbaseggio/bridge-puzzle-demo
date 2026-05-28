import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../../src/ai/evaluatePolicy';
import { initClassification, type CardId, type Hand } from '../../src/ai/threatModel';

describe('evaluatePolicy threatAware follow cover guard', () => {
  it('preserves the last card above threat rank when it is not guaranteed to win the trick', () => {
    const hands: Record<'N' | 'E' | 'S' | 'W', Hand> = {
      N: { S: [], H: [], D: ['7'], C: ['8'] },
      E: { S: [], H: [], D: [], C: ['J', '9'] },
      S: { S: [], H: [], D: [], C: ['A', 'T'] },
      W: { S: [], H: ['K'], D: ['J'], C: [] }
    };
    const threatCardIds: CardId[] = ['D7', 'CT'];
    const classification = initClassification({ hands }, threatCardIds);

    const result = evaluatePolicy({
      policy: { kind: 'threatAware' },
      seat: 'E',
      hands,
      trick: [{ seat: 'N', suit: 'C', rank: '8' }],
      threat: classification.threat,
      resource: classification.resource,
      threatLabels: classification.labels,
      contractStrain: 'S',
      ewVariantState: null,
      rng: { seed: 4004, counter: 0 }
    });

    expect(result.chosenCardId).toBe('C9');
    expect(result.chosenBucket).toBe('follow:below-partial');
  });

  it('uses the last card above threat rank when it is guaranteed to win the trick', () => {
    const hands: Record<'N' | 'E' | 'S' | 'W', Hand> = {
      N: { S: [], H: [], D: [], C: ['8'] },
      E: { S: [], H: [], D: [], C: ['J', '9'] },
      S: { S: [], H: [], D: ['2'], C: ['T'] },
      W: { S: [], H: [], D: ['3'], C: ['2'] }
    };
    const threatCardIds: CardId[] = ['CT'];
    const classification = initClassification({ hands }, threatCardIds);

    const result = evaluatePolicy({
      policy: { kind: 'threatAware' },
      seat: 'E',
      hands,
      trick: [{ seat: 'N', suit: 'C', rank: '8' }],
      threat: classification.threat,
      resource: classification.resource,
      threatLabels: classification.labels,
      contractStrain: 'NT',
      ewVariantState: null,
      rng: { seed: 99, counter: 0 }
    });

    expect(result.chosenCardId).toBe('CJ');
    expect(result.chosenBucket).toBe('follow:busy-protect-threat');
  });
});
