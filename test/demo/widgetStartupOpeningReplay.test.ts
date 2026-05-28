import { describe, expect, it } from 'vitest';
import type { CardId, Play, Seat, State } from '../../src/core';
import { init, legalPlays } from '../../src/core';
import { whichSqueeze1 } from '../../src/puzzles/which_squeeze_1';
import { applyWidgetScriptedOpeningStep } from '../../src/demo/widgetScriptedOpeningStep';
import {
  resolveWidgetNonScriptForwardPauseMessage,
  resolveScriptedOpeningReplayCard,
  resolveWidgetNonScriptForwardMode
} from '../../src/demo/widgetStartupOpeningReplay';

const USER_SEATS: Seat[] = ['N', 'S'];
const WHICH_SQUEEZE_OPENING: CardId[] = ['D3', 'D5', 'DT', 'DQ', 'S5', 'SA', 'S4', 'S9', 'D6'];

function applyCardById(state: State, cardId: CardId): { state: State; autoplayCount: number } {
  const legal = legalPlays(state).find((candidate) => `${candidate.suit}${candidate.rank}` === cardId);
  expect(legal).toBeTruthy();
  const result = applyWidgetScriptedOpeningStep({
    state,
    play: legal as Play
  });
  return {
    state: result.state,
    autoplayCount: result.events.filter((event) => event.type === 'autoplay').length
  };
}

describe('widgetStartupOpeningReplay', () => {
  it('resolves scripted opening replay cards from a strict played-prefix match', () => {
    expect(resolveScriptedOpeningReplayCard(WHICH_SQUEEZE_OPENING, [])).toBe('D3');
    expect(resolveScriptedOpeningReplayCard(WHICH_SQUEEZE_OPENING, ['D3'])).toBe('D5');
    expect(resolveScriptedOpeningReplayCard(WHICH_SQUEEZE_OPENING, ['D3', 'D5', 'DT'])).toBe('DQ');
    expect(resolveScriptedOpeningReplayCard(WHICH_SQUEEZE_OPENING, WHICH_SQUEEZE_OPENING)).toBeNull();
    expect(resolveScriptedOpeningReplayCard(WHICH_SQUEEZE_OPENING, ['D3', 'S5'])).toBeNull();
  });

  it('keeps which_squeeze_1 startup forward presses on scripted cards and pauses after D6 for puzzle-solving handoff', () => {
    let state = init({ ...whichSqueeze1, rngSeed: whichSqueeze1.rngSeed >>> 0 });
    state.userControls = [...USER_SEATS];
    const played: CardId[] = [];

    // Start (Play): consume first scripted startup card.
    const start = applyCardById(state, 'D3');
    state = start.state;
    expect(start.autoplayCount).toBe(0);
    played.push('D3');

    const expectedForwardCards: CardId[] = ['D5', 'DT', 'DQ', 'S5', 'SA', 'S4', 'S9', 'D6'];
    for (const expectedCardId of expectedForwardCards) {
      const mode = resolveWidgetNonScriptForwardMode({
        scriptedOpening: WHICH_SQUEEZE_OPENING,
        playedCardIds: played,
        userTurn: state.userControls.includes(state.turn),
        activeInteractionProfile: 'puzzle-solving'
      });
      expect(mode).toEqual({ kind: 'scripted-opening', cardId: expectedCardId });
      const step = applyCardById(state, expectedCardId);
      state = step.state;
      expect(step.autoplayCount).toBe(0);
      played.push(expectedCardId);
    }

    expect(played).toEqual(WHICH_SQUEEZE_OPENING);
    expect(state.turn).toBe('N');
    expect(state.userControls.includes(state.turn)).toBe(true);

    const ninthForward = resolveWidgetNonScriptForwardMode({
      scriptedOpening: WHICH_SQUEEZE_OPENING,
      playedCardIds: played,
      userTurn: state.userControls.includes(state.turn),
      activeInteractionProfile: 'puzzle-solving'
    });
    expect(ninthForward).toEqual({ kind: 'pause-user-turn' });
  });

  it('formats pause guidance when forward cannot auto-advance solver turn', () => {
    expect(resolveWidgetNonScriptForwardPauseMessage('North')).toBe("Select North's next play to continue.");
  });
});
