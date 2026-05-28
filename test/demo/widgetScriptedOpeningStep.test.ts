import { describe, expect, it } from 'vitest';
import { init, legalPlays, type Play, type Seat } from '../../src/core';
import { whichSqueeze1 } from '../../src/puzzles/which_squeeze_1';
import { applyWidgetScriptedOpeningStep } from '../../src/demo/widgetScriptedOpeningStep';

const USER_SEATS: Seat[] = ['N', 'S'];

function findPlayByCardId(state: ReturnType<typeof init>, cardId: string): Play {
  const play = legalPlays(state).find((candidate) => `${candidate.suit}${candidate.rank}` === cardId);
  if (!play) throw new Error(`Expected legal play ${cardId}`);
  return play;
}

describe('widgetScriptedOpeningStep', () => {
  it('applies exactly one scripted card without autoplaying defender turns', () => {
    let state = init({ ...whichSqueeze1, rngSeed: whichSqueeze1.rngSeed >>> 0 });
    state.userControls = [...USER_SEATS];

    const d3 = applyWidgetScriptedOpeningStep({
      state,
      play: findPlayByCardId(state, 'D3')
    });
    state = d3.state;
    expect(d3.events.filter((event) => event.type === 'autoplay')).toHaveLength(0);
    expect(state.turn).toBe('N');
    expect(state.trick.map((play) => `${play.suit}${play.rank}`)).toEqual(['D3']);
    expect(state.userControls).toEqual(USER_SEATS);

    const d5 = applyWidgetScriptedOpeningStep({
      state,
      play: findPlayByCardId(state, 'D5')
    });
    state = d5.state;
    expect(d5.events.filter((event) => event.type === 'autoplay')).toHaveLength(0);
    expect(state.turn).toBe('E');
    expect(state.trick.map((play) => `${play.suit}${play.rank}`)).toEqual(['D3', 'D5']);
    expect(state.userControls).toEqual(USER_SEATS);
  });
});
