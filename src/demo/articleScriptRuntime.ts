import { apply, init, legalPlays, type CardId, type Problem, type Seat, type State } from '../core';
import { toCardId } from '../ai/threatModel';
import { clampArticleScriptCursor, type ArticleScriptSpec } from './articleScripts';

export type ArticleScriptReplayResult = {
  state: State;
  cursor: number;
  playedCardIds: CardId[];
};

const SCRIPTED_USER_CONTROLS: Seat[] = ['N', 'E', 'S', 'W'];

export function replayArticleScript(problem: Problem, spec: ArticleScriptSpec, cursor: number, seed: number = problem.rngSeed >>> 0): ArticleScriptReplayResult {
  const bounded = clampArticleScriptCursor(spec, cursor);
  let state = init({ ...problem, rngSeed: seed });
  state.userControls = [...SCRIPTED_USER_CONTROLS];
  const playedCardIds: CardId[] = [];

  for (let i = 0; i < bounded; i += 1) {
    const step = spec.steps[i];
    if (!step || step.kind !== 'play') break;
    const legal = legalPlays(state).filter((candidate) => candidate.seat === state.turn);
    const play = legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === step.cardId);
    if (!play) break;
    const result = apply({ ...state, userControls: [...SCRIPTED_USER_CONTROLS] }, play);
    state = result.state;
    state.userControls = [...SCRIPTED_USER_CONTROLS];
    playedCardIds.push(step.cardId);
  }

  return { state, cursor: bounded, playedCardIds };
}
