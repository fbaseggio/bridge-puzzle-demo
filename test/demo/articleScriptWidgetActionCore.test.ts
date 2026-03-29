import { describe, expect, it } from 'vitest';
import type { CardId } from '../../src/core';
import { experimentalDraft01 } from '../../src/puzzles/experimental_draft';
import { experimentalDraftIntroScript } from '../../src/demo/articleScripts';
import {
  applyArticleScriptWidgetActionCore,
  type ArticleScriptWidgetProgressionState
} from '../../src/demo/articleScriptWidgetActionCore';

const VSC_TRIGGER_CARDS = new Set<CardId>(
  Object.keys(experimentalDraftIntroScript.companionPanel?.narrative?.activeSegmentByPlayCardId ?? {}) as CardId[]
);

function makeState(overrides: Partial<ArticleScriptWidgetProgressionState> = {}): ArticleScriptWidgetProgressionState {
  return {
    startupGatePhase: 'pending',
    readingRevealEnabled: true,
    readingControlsRevealStage: 'collapsed',
    checkpointId: '1',
    cursor: 0,
    history: [],
    ...overrides
  };
}

function applyAction(
  action: 'start' | 'next' | 'nextPause',
  state: ArticleScriptWidgetProgressionState
) {
  return applyArticleScriptWidgetActionCore({
    action,
    state,
    spec: experimentalDraftIntroScript,
    problem: experimentalDraft01,
    seed: 1975,
    pauseTriggerCards: VSC_TRIGGER_CARDS,
    startupOpeningLength: 24,
    startupMode: 'single-step'
  });
}

describe('articleScriptWidgetActionCore', () => {
  it('applies start in single-step story mode as gate-transition + one scripted card', () => {
    const start = applyAction('start', makeState());

    expect(start.changed).toBe(true);
    expect(start.nextState.startupGatePhase).toBe('started');
    expect(start.nextState.readingControlsRevealStage).toBe('quiet');
    expect(start.nextState.cursor).toBe(1);
    expect(start.nextState.history).toEqual(['S7']);
    expect(start.steps).toEqual([{ cursor: 0, cardId: 'S7' }]);
  });

  it('applies next as a single scripted card step only after startup gate is started', () => {
    const pending = applyAction('next', makeState());
    expect(pending.changed).toBe(false);
    expect(pending.nextState.cursor).toBe(0);
    expect(pending.nextState.history).toEqual([]);

    const started = applyAction('next', makeState({
      startupGatePhase: 'started',
      cursor: 4,
      history: ['S7', 'SA', 'S6', 'S5']
    }));
    expect(started.changed).toBe(true);
    expect(started.nextState.cursor).toBe(5);
    expect(started.nextState.history.slice(0, 5)).toEqual(['S7', 'SA', 'S6', 'S5', 'H2']);
  });

  it('keeps nextPause progression on authored prefix across repeated advances', () => {
    let working = makeState();
    working = applyAction('start', working).nextState;
    for (let i = 0; i < 6; i += 1) {
      working = applyAction('nextPause', working).nextState;
    }
    expect(working.cursor).toBeGreaterThanOrEqual(5);
    expect(working.history.slice(0, 5)).toEqual(['S7', 'SA', 'S6', 'S5', 'H2']);
    expect(working.history[4]).toBe('H2');
  });
});
