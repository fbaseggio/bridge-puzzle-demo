import { describe, expect, it } from 'vitest';
import {
  buildCardStatusSnapshot,
  buildRankColorVisual,
  buildRegularCardDisplayProjection,
  buildRegularRankColorClass
} from '../../src/demo/cardDisplay';
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

  it('builds a regular card display projection from the same semantic inputs', () => {
    const state = init(sureTricksDemo);
    expect(
      buildRegularCardDisplayProjection(
        'ST',
        {
          threat: state.threat as any,
          threatLabels: state.threatLabels as any,
          cardRoles: state.cardRoles
        },
        state.goalStatus,
        true,
        true
      )
    ).toEqual({
      colorClass: 'rank--green',
      visual: { kind: 'solid', colorClass: 'rank--green' }
    });
  });

  it('builds a card status snapshot from the same regular semantic inputs', () => {
    const state = init(sureTricksDemo);
    const snapshot = buildCardStatusSnapshot(state, true);

    expect(snapshot.get('ST')).toEqual({
      color: 'green',
      role: 'threat',
      seat: 'N'
    });
  });
});
