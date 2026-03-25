import { apply, init, legalPlays, type CardId, type Problem, type Seat, type State } from '../core';
import { toCardId } from '../ai/threatModel';
import {
  clampArticleScriptCursor,
  resolveArticleScriptCardAtCursor,
  resolveArticleScriptCheckpoint,
  resolveArticleScriptCheckpointEndCursor,
  type ArticleScriptSpec
} from './articleScripts';

export type ArticleScriptReplayResult = {
  state: State;
  cursor: number;
  playedCardIds: CardId[];
};

export type ArticleScriptChoiceSelections = Record<number, CardId>;
export type ArticleScriptStateId = 'pre-script' | 'in-script' | 'off-script' | 'post-script';

const SCRIPTED_USER_CONTROLS: Seat[] = ['N', 'E', 'S', 'W'];

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
  const checkpoint = resolveArticleScriptCheckpoint(spec, checkpointId);
  const endCursor = resolveArticleScriptCheckpointEndCursor(spec, checkpointId);
  const boundedCursor = Math.max(0, Math.min(cursor, history.length));

  if (boundedCursor < checkpoint.cursor) return 'pre-script';

  for (let i = 0; i < Math.min(boundedCursor, endCursor); i += 1) {
    const played = history[i];
    const expected = resolveArticleScriptCardAtCursor(spec, i, history as unknown as ArticleScriptChoiceSelections);
    if (!expected || !played || played !== expected) return 'off-script';
  }

  if (boundedCursor > endCursor) return 'post-script';
  return 'in-script';
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
