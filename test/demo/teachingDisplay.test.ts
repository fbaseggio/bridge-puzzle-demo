import { describe, expect, it } from 'vitest';
import { buildTeachingDisplayEntries, buildTeachingDisplayEntry, splitDdErrorSummary } from '../../src/demo/teachingDisplay';

describe('teaching display projection', () => {
  it('splits DD Error from a regular semantic summary', () => {
    expect(splitDdErrorSummary('South leads ♦Q. DD Error.')).toEqual({
      summary: 'South leads ♦Q.',
      ddError: 'DD Error.'
    });
  });

  it('projects a regular teaching entry without recomputing semantics in the renderer', () => {
    const display = buildTeachingDisplayEntry(
      {
        summary: 'South leads ♦Q. DD Error.',
        reasons: ['DD: best is ♦A'],
        effects: ['♠T becomes idle.']
      },
      false
    );

    expect(display.summary).toBe('South leads ♦Q.');
    expect(display.ddError).toBe('DD Error.');
    expect(display.bracketText).toBe('best is ♦A');
    expect(display.variantLines).toEqual([]);
    expect(display.effects).toEqual(['♠T becomes idle.']);
  });

  it('projects unknown-mode grouped entries into variant display lines', () => {
    const display = buildTeachingDisplayEntry(
      {
        summary: '',
        reasons: [],
        effects: [],
        variantGroups: [
          { labels: ['A'], summary: 'North discards ♠T. DD Error.', reasons: [], effects: [] },
          { labels: ['B'], summary: 'North discards ♠T.', reasons: [], effects: [] }
        ]
      },
      false
    );

    expect(display.variantLines).toEqual([
      { labels: ['A'], summary: 'North discards ♠T.', ddError: 'DD Error.' },
      { labels: ['B'], summary: 'North discards ♠T.', ddError: null }
    ]);
  });

  it('builds regular display-list entries with seq and seat preserved', () => {
    const display = buildTeachingDisplayEntries(
      [
        {
          seq: 12,
          seat: 'N',
          summary: 'North leads ♦Q. DD Error.',
          reasons: ['DD: best is ♦A'],
          effects: []
        }
      ],
      false
    );

    expect(display).toEqual([
      {
        seq: 12,
        seat: 'N',
        summary: 'North leads ♦Q.',
        bracketText: 'best is ♦A',
        ddError: 'DD Error.',
        variantLines: [],
        effects: []
      }
    ]);
  });
});
