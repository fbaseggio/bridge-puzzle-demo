import { describe, expect, it } from 'vitest';
import { buildDdsScoreByCard } from '../../src/ai/ddsCardScores';
import type { DdsPlay } from '../../src/ai/ddsBrowser';

describe('ddsCardScores', () => {
  it('includes equals cards when building score map', () => {
    const plays: DdsPlay[] = [
      { suit: 'H', rank: '9', score: 0, equals: ['3', '2'] }
    ];
    const scoreByCard = buildDdsScoreByCard(plays);
    expect(scoreByCard.get('H9')).toBe(0);
    expect(scoreByCard.get('H3')).toBe(0);
    expect(scoreByCard.get('H2')).toBe(0);
  });

  it('accepts suit-rank and rank-suit equals forms', () => {
    const plays: DdsPlay[] = [
      { suit: 'S', rank: 'A', score: 1, equals: ['S3', '2S'] }
    ];
    const scoreByCard = buildDdsScoreByCard(plays);
    expect(scoreByCard.get('SA')).toBe(1);
    expect(scoreByCard.get('S3')).toBe(1);
    expect(scoreByCard.get('S2')).toBe(1);
  });
});

