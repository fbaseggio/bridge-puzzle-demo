import { describe, expect, it } from 'vitest';
import { mergeUnknownDdsSummaries, mergeUnknownTeachingEntries } from '../../src/demo/unknownModeDisplay';

describe('unknown mode display merge', () => {
  it('groups distinct teaching entries by variant label', () => {
    const perVariant = new Map([
      [
        'a',
        {
          entries: [{ seq: 1, seat: 'W', card: 'SQ', summary: 'West discards busy SQ.', reasons: [], effects: [] }],
          ddsSummaries: []
        }
      ],
      [
        'b',
        {
          entries: [{ seq: 1, seat: 'W', card: 'SQ', summary: 'West discards busy SQ, promoting ST.', reasons: [], effects: [] }],
          ddsSummaries: []
        }
      ]
    ]);

    expect(mergeUnknownTeachingEntries(perVariant, (variantId) => variantId.toUpperCase())).toEqual([
      {
        seq: 1,
        seat: 'W',
        card: 'SQ',
        summary: 'West discards busy SQ.',
        reasons: [],
        effects: [],
        variantGroups: [
          { labels: ['A'], summary: 'West discards busy SQ.', reasons: [], effects: [] },
          { labels: ['B'], summary: 'West discards busy SQ, promoting ST.', reasons: [], effects: [] }
        ]
      }
    ]);
  });

  it('groups matching DD summaries under merged labels', () => {
    const perVariant = new Map([
      ['a', { entries: [], ddsSummaries: ['DD Error.'] }],
      ['b', { entries: [], ddsSummaries: ['Different.'] }],
      ['c', { entries: [], ddsSummaries: ['DD Error.'] }]
    ]);

    expect(mergeUnknownDdsSummaries(perVariant, (variantId) => variantId.toUpperCase())).toEqual([
      [
        { labels: ['A', 'C'], text: 'DD Error.' },
        { labels: ['B'], text: 'Different.' }
      ]
    ]);
  });
});
