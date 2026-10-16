import type { CardId, Play, Problem } from '../core';
import { replayArticleHistory } from './articleScriptRuntime';

// Cards are unique within a deal. Locate the displayed trick in the complete
// play history, which can also contain automatic plays beyond a frozen trick.
export function tableCardUndoCursor(history: readonly string[], trick: readonly Play[], play: Play): number | null {
  const offset = trick.findIndex(p => p.seat === play.seat && p.suit === play.suit && p.rank === play.rank);
  if (offset < 0) return null;
  const start = history.indexOf(`${trick[0].suit}${trick[0].rank}`);
  if (start < 0 || trick.some((p, i) => history[start + i] !== `${p.suit}${p.rank}`)) return null;
  return start + offset;
}

export function replayBeforeTableCard(problem: Problem, history: CardId[], cursor: number,
  seed: number, replay: typeof replayArticleHistory = replayArticleHistory) {
  const replayed = replay(problem, history, cursor, seed);
  // A partial replay must never silently replace the displayed position.
  return replayed.playedCardIds.length === cursor ? replayed : null;
}
