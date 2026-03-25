import { apply, init, legalPlays, type CardId, type Problem, type Seat, type State, type Suit } from '../core';
import { toCardId } from '../ai/threatModel';
import {
  clampArticleScriptCursor,
  resolveArticleScriptCardAtCursor,
  resolveArticleScriptCheckpoint,
  resolveArticleScriptLength,
  resolvePendingArticleScriptChoice,
  resolveArticleScriptStepAtCursor,
  type ArticleScriptDerivedPlayStep,
  type ArticleScriptChoiceStep,
  type ArticleScriptSpec
} from './articleScripts';

export type ArticleScriptReplayResult = {
  state: State;
  cursor: number;
  playedCardIds: CardId[];
};

export type ArticleScriptChoiceSelections = Record<number, CardId>;
export type ArticleScriptStateId = 'pre-script' | 'in-script' | 'off-script' | 'post-script';
export type ArticleScriptAssertionFailure = {
  cursor: number;
  kind: 'choice-options' | 'choice-suits' | 'trick-winner';
  expected: string[];
  actual: string[];
};
export type ArticleScriptHistoryMatcher = {
  resolveChoiceStep?: (step: ArticleScriptChoiceStep, historyPrefix: CardId[], cursor: number) => ArticleScriptChoiceStep;
  matchDerivedPlay?: (history: CardId[], cursor: number, step: ArticleScriptDerivedPlayStep) => boolean;
  matchFlexSegment?: (history: CardId[], cursor: number) => boolean;
  replayHistory?: (history: CardId[], cursor: number) => ArticleScriptReplayResult | null;
};
export type ArticleScriptHistoryMatchResult = {
  stateId: ArticleScriptStateId;
  choiceSelections: ArticleScriptChoiceSelections;
  endCursor: number;
  assertionFailure: ArticleScriptAssertionFailure | null;
};

const SCRIPTED_USER_CONTROLS: Seat[] = ['N', 'E', 'S', 'W'];

function assertionFailure(
  cursor: number,
  kind: ArticleScriptAssertionFailure['kind'],
  expected: string[],
  actual: string[]
): ArticleScriptAssertionFailure {
  return {
    cursor,
    kind,
    expected: [...expected],
    actual: [...actual]
  };
}

function resolveWinnerAssertionFailure(
  matcher: ArticleScriptHistoryMatcher,
  history: CardId[],
  cursor: number,
  assertedWinner: Seat
): ArticleScriptAssertionFailure | null {
  const replayed = matcher.replayHistory?.(history, cursor) ?? null;
  if (!replayed) return null;
  const actualWinner = replayed.state.trick.length === 0 ? replayed.state.turn : null;
  if (actualWinner === assertedWinner) return null;
  return assertionFailure(cursor - 1, 'trick-winner', [assertedWinner], actualWinner ? [actualWinner] : []);
}

export function defaultArticleScriptHistory(spec: ArticleScriptSpec, cursor: number): CardId[] {
  const history: CardId[] = [];
  const bounded = clampArticleScriptCursor(spec, cursor);
  for (let i = 0; i < bounded; i += 1) {
    const cardId = resolveArticleScriptCardAtCursor(spec, i);
    if (!cardId) break;
    history.push(cardId);
  }
  return history;
}

export function deriveArticleScriptState(
  spec: ArticleScriptSpec,
  checkpointId: string | null | undefined,
  history: CardId[],
  cursor: number
): ArticleScriptStateId {
  return matchArticleScriptHistory(spec, checkpointId, history, cursor).stateId;
}

export function matchArticleScriptHistory(
  spec: ArticleScriptSpec,
  checkpointId: string | null | undefined,
  history: CardId[],
  cursor: number,
  matcher: ArticleScriptHistoryMatcher = {}
): ArticleScriptHistoryMatchResult {
  const checkpoint = resolveArticleScriptCheckpoint(spec, checkpointId);
  const boundedCursor = Math.max(0, Math.min(cursor, history.length));

  if (boundedCursor < checkpoint.cursor) {
    return { stateId: 'pre-script', choiceSelections: {}, endCursor: resolveArticleScriptLength(spec), assertionFailure: null };
  }

  const workingSelections: ArticleScriptChoiceSelections = {};
  for (let i = 0; i < boundedCursor; i += 1) {
    const endCursor = resolveArticleScriptLength(spec, workingSelections);
    if (i >= endCursor) break;
    const pendingStep = resolvePendingArticleScriptChoice(spec, i, workingSelections);
    const pending = pendingStep
      ? (matcher.resolveChoiceStep?.(pendingStep, history.slice(0, i), i) ?? pendingStep)
      : null;
    if (pending) {
      if (pendingStep?.assertedOptions && pending.options) {
        const actual = [...(pending.options ?? [])].sort();
        const expected = [...pendingStep.assertedOptions].sort();
        if (actual.length !== expected.length || actual.some((cardId, idx) => cardId !== expected[idx])) {
          return {
            stateId: 'off-script',
            choiceSelections: workingSelections,
            endCursor,
            assertionFailure: assertionFailure(i, 'choice-options', pendingStep.assertedOptions, pending.options ?? [])
          };
        }
      }
      if (pendingStep?.assertedSuits && pending.options) {
        const actual = [...new Set((pending.options ?? []).map((cardId) => cardId[0] as Suit))].sort();
        const expected = [...pendingStep.assertedSuits].sort();
        if (actual.length !== expected.length || actual.some((suit, idx) => suit !== expected[idx])) {
          return {
            stateId: 'off-script',
            choiceSelections: workingSelections,
            endCursor,
            assertionFailure: assertionFailure(i, 'choice-suits', expected, actual)
          };
        }
      }
      const played = history[i];
      if (!played) return { stateId: 'off-script', choiceSelections: workingSelections, endCursor, assertionFailure: null };
      if (pending.options && pending.options.length > 0 && !pending.options.includes(played)) {
        return { stateId: 'off-script', choiceSelections: workingSelections, endCursor, assertionFailure: null };
      }
      workingSelections[i] = played;
      if (pendingStep?.assertedWinner) {
        const winnerFailure = resolveWinnerAssertionFailure(matcher, history, i + 1, pendingStep.assertedWinner);
        if (winnerFailure) {
          return {
            stateId: 'off-script',
            choiceSelections: workingSelections,
            endCursor,
            assertionFailure: winnerFailure
          };
        }
      }
      continue;
    }
    const played = history[i];
    const expected = resolveArticleScriptCardAtCursor(spec, i, workingSelections);
    if (expected) {
      if (!played || played !== expected) return { stateId: 'off-script', choiceSelections: workingSelections, endCursor, assertionFailure: null };
      if (stepWithWinner(spec, i, workingSelections)?.assertedWinner) {
        const assertedWinner = stepWithWinner(spec, i, workingSelections)?.assertedWinner;
        const winnerFailure = assertedWinner ? resolveWinnerAssertionFailure(matcher, history, i + 1, assertedWinner) : null;
        if (winnerFailure) {
          return {
            stateId: 'off-script',
            choiceSelections: workingSelections,
            endCursor,
            assertionFailure: winnerFailure
          };
        }
      }
      continue;
    }
    const step = resolveArticleScriptStepAtCursor(spec, i, workingSelections);
    if (step?.kind === 'derived-play') {
      const matches = matcher.matchDerivedPlay?.(history, i, step);
      if (!matches) return { stateId: 'off-script', choiceSelections: workingSelections, endCursor, assertionFailure: null };
      if (step.assertedWinner) {
        const winnerFailure = resolveWinnerAssertionFailure(matcher, history, i + 1, step.assertedWinner);
        if (winnerFailure) {
          return {
            stateId: 'off-script',
            choiceSelections: workingSelections,
            endCursor,
            assertionFailure: winnerFailure
          };
        }
      }
      continue;
    }
    if (step?.kind === 'flex-segment') {
      const matches = matcher.matchFlexSegment?.(history, i) ?? false;
      if (!matches) return { stateId: 'off-script', choiceSelections: workingSelections, endCursor, assertionFailure: null };
      continue;
    }
    return { stateId: 'off-script', choiceSelections: workingSelections, endCursor, assertionFailure: null };
  }

  const endCursor = resolveArticleScriptLength(spec, workingSelections);
  return {
    stateId: boundedCursor > endCursor ? 'post-script' : 'in-script',
    choiceSelections: workingSelections,
    endCursor,
    assertionFailure: null
  };
}

function stepWithWinner(
  spec: ArticleScriptSpec,
  cursor: number,
  choiceSelections: Partial<Record<number, CardId>>
) {
  const step = resolveArticleScriptStepAtCursor(spec, cursor, choiceSelections);
  if (!step) return null;
  return 'assertedWinner' in step ? step : null;
}

export function replayArticleScript(
  problem: Problem,
  spec: ArticleScriptSpec,
  cursor: number,
  seed: number = problem.rngSeed >>> 0,
  choiceSelections: ArticleScriptChoiceSelections = {}
): ArticleScriptReplayResult {
  const bounded = clampArticleScriptCursor(spec, cursor);
  let state = init({ ...problem, rngSeed: seed });
  state.userControls = [...SCRIPTED_USER_CONTROLS];
  const playedCardIds: CardId[] = [];

  for (let i = 0; i < bounded; i += 1) {
    const legal = legalPlays(state).filter((candidate) => candidate.seat === state.turn);
    const expectedCardId = resolveArticleScriptCardAtCursor(spec, i, choiceSelections);
    if (!expectedCardId) break;
    const play = legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === expectedCardId);
    if (!play) break;
    const result = apply({ ...state, userControls: [...SCRIPTED_USER_CONTROLS] }, play);
    state = result.state;
    state.userControls = [...SCRIPTED_USER_CONTROLS];
    playedCardIds.push(expectedCardId);
  }

  return { state, cursor: bounded, playedCardIds };
}

export function replayArticleHistory(problem: Problem, history: CardId[], cursor: number, seed: number = problem.rngSeed >>> 0): ArticleScriptReplayResult {
  const bounded = Math.max(0, Math.min(cursor, history.length));
  let state = init({ ...problem, rngSeed: seed });
  state.userControls = [...SCRIPTED_USER_CONTROLS];
  const playedCardIds: CardId[] = [];

  for (let i = 0; i < bounded; i += 1) {
    const expectedCardId = history[i];
    const legal = legalPlays(state).filter((candidate) => candidate.seat === state.turn);
    const play = legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === expectedCardId);
    if (!play) break;
    const result = apply({ ...state, userControls: [...SCRIPTED_USER_CONTROLS] }, play);
    state = result.state;
    state.userControls = [...SCRIPTED_USER_CONTROLS];
    playedCardIds.push(expectedCardId);
  }

  return { state, cursor: bounded, playedCardIds };
}
