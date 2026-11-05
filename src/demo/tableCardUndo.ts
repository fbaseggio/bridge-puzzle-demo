import type { CardId, Play, Problem, Seat } from '../core';
import { apply, legalPlays } from '../core';
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

/** Legal alternatives for a hand that has already contributed to this open
 * trick. Reconstruct its turn using the same engine as table-card take-back;
 * following suit is judged there, not against the current player's turn.
 * Completed/cleared tricks retain their existing navigation semantics. */
export function handCardReplacementTurn(problem: Problem, history: CardId[],
  trick: readonly Play[], seat: Seat, seed: number,
  replay: typeof replayArticleHistory = replayArticleHistory) {
  if (trick.length === 0 || trick.length >= 4) return null;
  const original = trick.find(play => play.seat === seat);
  if (!original) return null;
  const cursor = tableCardUndoCursor(history, trick, original);
  if (cursor === null || cursor - trick.indexOf(original) + trick.length !== history.length) return null;
  const replayed = replayBeforeTableCard(problem, history, cursor, seed, replay);
  if (!replayed || replayed.state.turn !== seat) return null;
  const alternatives = legalPlays(replayed.state).filter(play =>
    play.suit !== original.suit || play.rank !== original.rank);
  return { cursor, original, alternatives };
}

/** A frozen trick is already visible, so step to the one before it. A cleared
 * table at the same cursor instead steps back to that just-cleared trick. */
export function previousCompletedTrickCursor(cursor:number, frozen:boolean):number|null {
  const target=Math.floor((cursor-(frozen?1:0))/4)*4;
  return cursor>0?Math.max(0,target):null;
}

export function replayCompletedTableTrick(problem:Problem,history:CardId[],cursor:number,seed:number){
  if(cursor<4 || cursor%4!==0)return null;
  const prefix=replayBeforeTableCard(problem,history,cursor-1,seed);
  if(!prefix)return null;
  const before=prefix.state;
  const play=legalPlays(before).find(p=>p.seat===before.turn && `${p.suit}${p.rank}`===history[cursor-1]);
  if(!play)return null;
  const result=apply({...before,userControls:['N','E','S','W']},play);
  const end=result.events.findIndex(e=>e.type==='trickComplete');
  if(end<0)return null;
  const event=result.events[end];
  if(event.type!=='trickComplete')return null;
  return {before,events:result.events.slice(0,end+1),trick:event.trick};
}

/** Keep an unwound continuation only while actual play still follows its prefix.
 * A new choice replaces that future, rather than splicing incompatible tricks. */
export function retainTableContinuation(saved: readonly CardId[], played: readonly CardId[]): CardId[] {
  return played.length <= saved.length && played.every((card, i) => card === saved[i])
    ? [...saved] : [...played];
}

export function nextRecordedTrickCursor(cursor: number, length: number): number | null {
  return cursor < length ? Math.min((Math.floor(cursor / 4) + 1) * 4, length) : null;
}
