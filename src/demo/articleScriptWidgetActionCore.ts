import type { CardId, Problem } from '../core';
import {
  resolveArticleScriptCardAtCursor,
  resolveArticleScriptCheckpoint,
  resolveNextArticleScriptCheckpoint,
  resolvePendingArticleScriptChoice,
  type ArticleScriptSpec
} from './articleScripts';
import { matchArticleScriptHistory, replayArticleHistory } from './articleScriptRuntime';

export type ArticleScriptWidgetAction = 'start' | 'next' | 'nextPause';
export type ArticleScriptWidgetStartupMode = 'default' | 'single-step';
export type StartupGatePhase = 'pending' | 'started';
export type ReadingControlsRevealStage = 'collapsed' | 'quiet' | 'full';

export type ArticleScriptWidgetProgressionState = {
  startupGatePhase: StartupGatePhase;
  readingRevealEnabled: boolean;
  readingControlsRevealStage: ReadingControlsRevealStage;
  checkpointId: string | null;
  cursor: number;
  history: CardId[];
};

export type ArticleScriptWidgetActionCoreInput = {
  action: ArticleScriptWidgetAction;
  state: ArticleScriptWidgetProgressionState;
  spec: ArticleScriptSpec;
  problem: Problem;
  seed: number;
  pauseTriggerCards: ReadonlySet<CardId>;
  startupOpeningLength: number;
  startupMode?: ArticleScriptWidgetStartupMode;
};

export type ArticleScriptWidgetProgressionStep = {
  cursor: number;
  cardId: CardId;
};

export type ArticleScriptWidgetActionCoreResult = {
  nextState: ArticleScriptWidgetProgressionState;
  steps: ArticleScriptWidgetProgressionStep[];
  changed: boolean;
};

function normalizeWorkingState(
  state: ArticleScriptWidgetProgressionState,
  spec: ArticleScriptSpec
): ArticleScriptWidgetProgressionState {
  const checkpointId = resolveArticleScriptCheckpoint(spec, state.checkpointId).id;
  const history = [...state.history];
  const cursor = Math.max(0, Math.min(state.cursor, history.length));
  return {
    startupGatePhase: state.startupGatePhase,
    readingRevealEnabled: state.readingRevealEnabled,
    readingControlsRevealStage: state.readingControlsRevealStage,
    checkpointId,
    cursor,
    history
  };
}

function matchAtCursor(
  spec: ArticleScriptSpec,
  working: ArticleScriptWidgetProgressionState,
  cursor: number
) {
  return matchArticleScriptHistory(
    spec,
    working.checkpointId,
    working.history,
    cursor
  );
}

function nextCardAtCursor(
  spec: ArticleScriptSpec,
  working: ArticleScriptWidgetProgressionState,
  cursor: number
): CardId | null {
  const matched = matchAtCursor(spec, working, cursor);
  const pendingChoice = resolvePendingArticleScriptChoice(
    spec,
    cursor,
    matched.choiceSelections
  );
  if (pendingChoice) return null;
  return resolveArticleScriptCardAtCursor(
    spec,
    cursor,
    matched.choiceSelections
  );
}

function hasPendingChoiceAtCursor(
  spec: ArticleScriptSpec,
  working: ArticleScriptWidgetProgressionState,
  cursor: number
): boolean {
  const matched = matchAtCursor(spec, working, cursor);
  return Boolean(resolvePendingArticleScriptChoice(spec, cursor, matched.choiceSelections));
}

function endCursorForCurrentCheckpoint(
  spec: ArticleScriptSpec,
  working: ArticleScriptWidgetProgressionState
): number {
  const checkpoint = resolveArticleScriptCheckpoint(spec, working.checkpointId);
  const nextCheckpoint = resolveNextArticleScriptCheckpoint(spec, checkpoint.id);
  const matchedEnd = matchAtCursor(spec, working, working.cursor).endCursor;
  return nextCheckpoint ? Math.min(nextCheckpoint.cursor, matchedEnd) : matchedEnd;
}

function trickLengthAtCursor(
  problem: Problem,
  seed: number,
  working: ArticleScriptWidgetProgressionState,
  cursor: number
): number | null {
  const replayed = replayArticleHistory(problem, working.history, cursor, seed);
  return replayed?.state.trick.length ?? null;
}

function appendCardAtCursor(
  working: ArticleScriptWidgetProgressionState,
  cardId: CardId,
  cursor: number
): void {
  working.history = working.history.slice(0, cursor);
  working.history.push(cardId);
  working.cursor = cursor + 1;
}

function applyNext(
  spec: ArticleScriptSpec,
  working: ArticleScriptWidgetProgressionState
): ArticleScriptWidgetProgressionStep[] {
  if (working.startupGatePhase === 'pending') return [];
  const nextCard = nextCardAtCursor(spec, working, working.cursor);
  if (!nextCard) return [];
  const step = { cursor: working.cursor, cardId: nextCard };
  appendCardAtCursor(working, nextCard, working.cursor);
  return [step];
}

function applyNextPause(
  input: ArticleScriptWidgetActionCoreInput,
  working: ArticleScriptWidgetProgressionState
): ArticleScriptWidgetProgressionStep[] {
  if (working.startupGatePhase === 'pending') return [];
  const endCursor = endCursorForCurrentCheckpoint(input.spec, working);
  const steps: ArticleScriptWidgetProgressionStep[] = [];
  let cursor = working.cursor;
  while (cursor < endCursor) {
    const previousTrickLength = trickLengthAtCursor(input.problem, input.seed, working, cursor);
    const nextCard = nextCardAtCursor(input.spec, working, cursor);
    if (!nextCard) break;
    steps.push({ cursor, cardId: nextCard });
    appendCardAtCursor(working, nextCard, cursor);
    cursor += 1;
    const nextTrickLength = trickLengthAtCursor(input.problem, input.seed, working, cursor);
    const completedTrick = Boolean(
      previousTrickLength !== null
      && nextTrickLength !== null
      && previousTrickLength > 0
      && nextTrickLength === 0
    );
    if (input.pauseTriggerCards.has(nextCard) || completedTrick) break;
    if (hasPendingChoiceAtCursor(input.spec, working, cursor)) break;
  }
  return steps;
}

function startupAdvanceTarget(
  startupMode: ArticleScriptWidgetStartupMode,
  startupOpeningLength: number
): number {
  const openingLength = Math.max(0, startupOpeningLength);
  if (startupMode === 'single-step') return Math.min(1, openingLength);
  return openingLength;
}

export function applyArticleScriptWidgetActionCore(
  input: ArticleScriptWidgetActionCoreInput
): ArticleScriptWidgetActionCoreResult {
  const working = normalizeWorkingState(input.state, input.spec);
  const initialSnapshot = {
    startupGatePhase: working.startupGatePhase,
    readingControlsRevealStage: working.readingControlsRevealStage,
    cursor: working.cursor,
    history: [...working.history]
  };
  const steps: ArticleScriptWidgetProgressionStep[] = [];

  if (input.action === 'start') {
    if (working.startupGatePhase !== 'pending') {
      return { nextState: working, steps, changed: false };
    }
    working.startupGatePhase = 'started';
    const startupMode = input.startupMode ?? 'default';
    if (startupMode === 'single-step' && working.readingRevealEnabled) {
      working.readingControlsRevealStage = 'quiet';
    }
    const target = startupAdvanceTarget(startupMode, input.startupOpeningLength);
    for (let i = 0; i < target; i += 1) {
      const nextSteps = applyNext(input.spec, working);
      if (nextSteps.length === 0) break;
      steps.push(...nextSteps);
    }
  } else if (input.action === 'next') {
    steps.push(...applyNext(input.spec, working));
  } else {
    steps.push(...applyNextPause(input, working));
  }

  const changed = (
    initialSnapshot.startupGatePhase !== working.startupGatePhase
    || initialSnapshot.readingControlsRevealStage !== working.readingControlsRevealStage
    || initialSnapshot.cursor !== working.cursor
    || steps.length > 0
    || initialSnapshot.history.length !== working.history.length
  );
  return {
    nextState: working,
    steps,
    changed
  };
}
