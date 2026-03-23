import { describe, expect, it } from 'vitest';
import { buildRankColorVisual, buildRegularRankColorClass } from '../../src/demo/cardDisplay';
import { init } from '../../src/core';
import { sureTricksDemo } from '../../src/puzzles/sure_tricks_demo';

describe('card display projection', () => {
  it('builds a regular rank color class from semantic state', () => {
    const state = init(sureTricksDemo);
    const colorClass = buildRegularRankColorClass(
      'ST',
      {
        threat: state.threat as any,
        threatLabels: state.threatLabels as any,
        cardRoles: state.cardRoles
      },
      state.goalStatus,
      true,
      true
    );

    expect(colorClass).toBe('rank--green');
  });

  it('falls back to black when card coloring is disabled', () => {
    const state = init(sureTricksDemo);
    const colorClass = buildRegularRankColorClass(
      'ST',
      {
        threat: state.threat as any,
        threatLabels: state.threatLabels as any,
        cardRoles: state.cardRoles
      },
      state.goalStatus,
      true,
      false
    );

    expect(colorClass).toBe('rank--black');
  });

  it('builds split and striped visuals from merged color classes', () => {
    expect(buildRankColorVisual(['rank--green'])).toEqual({ kind: 'solid', colorClass: 'rank--green' });
    expect(buildRankColorVisual(['rank--green', 'rank--purple'])).toEqual({
      kind: 'split',
      colors: ['rank--green', 'rank--purple']
    });
    expect(buildRankColorVisual(['rank--green', 'rank--purple', 'rank--blue'])).toEqual({
      kind: 'stripes',
      colors: ['rank--green', 'rank--purple', 'rank--blue']
    });
  });
});
