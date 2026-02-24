import './style.css';

import {
  apply,
  classInfoForCard,
  getSuitEquivalenceClasses,
  init,
  legalPlays,
  type DecisionRecord,
  type EngineEvent,
  type Play,
  type Rank,
  type Seat,
  type State,
  type SuccessfulTranscript,
  type UserPlayRecord,
  type Suit
} from '../core';
import { computeDiscardTiers, getIdleThreatThresholdRank } from '../ai/defenderDiscard';
import {
  toCardId,
  updateClassificationAfterPlay,
  type CardId,
  type DefenderLabels,
  type Position,
  type ThreatContext,
} from '../ai/threatModel';
import { formatAfterPlayBlock, formatAfterTrickBlock, formatDiscardDecisionBlock, formatInitBlock } from '../ai/threatModelVerbose';
import { getCardRankColor } from '../ui/annotations';
import { hasUntriedAlternatives, triedAltKey } from './playAgain';
import { demoProblems } from './problems';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app');
}
const root = app;

const seatOrder: Seat[] = ['N', 'E', 'S', 'W'];
const suitOrder: Suit[] = ['S', 'H', 'D', 'C'];
const rankOrder: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const suitSymbol: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const seatName: Record<Seat, string> = { N: 'North', E: 'East', S: 'South', W: 'West' };
type ProblemWithThreats = typeof demoProblems[number]['problem'] & { threatCardIds?: CardId[] };

const maxSuitLineLen = Math.max(
  ...demoProblems.flatMap(({ problem }) => seatOrder.flatMap((seat) => suitOrder.map((suit) => problem.hands[seat][suit].length)))
);
const suitColWidth = 12;
const suitGap = 4;
const rankGlyphWidth = 9;
const rankGap = 4;
const handPadX = 4;
const handPadY = 6;
const rowHeight = 17;
const seatRowHeight = 16;
const seatToSuitGap = 3;
const suitRowSpacingTotal = 16; // 4 rows with 2px top/bottom row margins.
const verticalGap = Math.round(rowHeight * 0.6);
const horizontalGap = Math.round(rowHeight * 0.6);
const handBoxWidth = suitColWidth + suitGap + maxSuitLineLen * rankGlyphWidth + Math.max(0, maxSuitLineLen - 1) * rankGap + handPadX;
const handBoxHeight = seatRowHeight + seatToSuitGap + rowHeight * 4 + suitRowSpacingTotal + handPadY;
const trickBoxSize = handBoxHeight + 6;
root.style.setProperty('--hand-box-w', `${handBoxWidth}px`);
root.style.setProperty('--hand-box-h', `${handBoxHeight}px`);
root.style.setProperty('--trick-box-w', `${trickBoxSize}px`);
root.style.setProperty('--trick-box-h', `${trickBoxSize}px`);
root.style.setProperty('--table-gap-y', `${verticalGap}px`);
root.style.setProperty('--table-gap-x', `${horizontalGap}px`);
root.style.setProperty('--slot-offset', '12%');

let currentProblem = demoProblems[0].problem;
let currentProblemId = demoProblems[0].id;
let currentSeed = currentProblem.rngSeed >>> 0;
let state: State = init({ ...currentProblem, rngSeed: currentSeed });
let logs: string[] = [];
let deferredLogLines: string[] = [];
let verboseLog = false;
let showLog = true;
let showGuides = true;
let teachingMode = true;
let autoplaySingletons = false;
let singletonAutoplayTimer: ReturnType<typeof setTimeout> | null = null;
let singletonAutoplayKey: string | null = null;

let trickFrozen = false;
let lastCompletedTrick: Play[] | null = null;
let frozenViewState: State | null = null;
let canLeadDismiss = false;
let threatCtx: ThreatContext | null = null;
let threatLabels: DefenderLabels | null = null;
type GameSnapshot = {
  state: State;
  currentProblemId: string;
  currentSeed: number;
  logs: string[];
  deferredLogLines: string[];
  trickFrozen: boolean;
  lastCompletedTrick: Play[] | null;
  frozenViewState: State | null;
  canLeadDismiss: boolean;
  threatCtx: ThreatContext | null;
  threatLabels: DefenderLabels | null;
  play: Play;
  runStatus: RunStatus;
  playAgainAvailable: boolean;
  playAgainUnavailableReason: string | null;
  playAgainLastCandidateIndex: number | null;
};
const undoStack: GameSnapshot[] = [];
let currentRunTranscript: DecisionRecord[] = [];
let lastSuccessfulTranscript: SuccessfulTranscript | null = null;
const triedAltClass = new Set<string>();
let currentRunUserPlays: UserPlayRecord[] = [];
type RunStatus = 'running' | 'success' | 'failure';
let runStatus: RunStatus = 'running';
let playAgainAvailable = false;
let playAgainUnavailableReason: string | null = null;
let playAgainLastCandidateIndex: number | null = null;

function clearSingletonAutoplayTimer(): void {
  if (singletonAutoplayTimer) {
    clearTimeout(singletonAutoplayTimer);
    singletonAutoplayTimer = null;
  }
  singletonAutoplayKey = null;
}

function sortRanksDesc(ranks: Rank[]): Rank[] {
  const strength = new Map(rankOrder.map((r, i) => [r, i] as const));
  return [...ranks].sort((a, b) => (strength.get(a) ?? 99) - (strength.get(b) ?? 99));
}

function playText(play: Play): string {
  return `${play.seat}:${play.suit}${displayRank(play.rank)}`;
}

function positionFromState(s: State): Position {
  return { hands: s.hands };
}

function getThreatCardIds(problem: ProblemWithThreats): CardId[] {
  return Array.isArray(problem.threatCardIds) ? [...problem.threatCardIds] : [];
}

function displayRank(rank: Rank): string {
  return rank === 'T' ? '10' : rank;
}

function formatSuitWithEquivalence(s: State, seat: Seat, suit: Suit): string {
  const classes = getSuitEquivalenceClasses(s, seat, suit);
  if (classes.length === 0) return '-';
  return classes
    .map((members) => {
      const text = members.join('');
      return members.length > 1 ? `(${text})` : text;
    })
    .join('');
}

function formatHandInitSummary(s: State, seat: Seat): string {
  const suitParts = suitOrder.map((suit) => formatSuitWithEquivalence(s, seat, suit));
  return `${seat}: ${suitParts.join('/')}`;
}

function rankColorClass(cardId: CardId): string {
  if (!threatCtx || !threatLabels) return 'rank--black';
  const color = getCardRankColor(cardId, threatCtx, threatLabels, teachingMode);
  return color === 'purple'
    ? 'rank--purple'
    : color === 'green'
      ? 'rank--green'
      : color === 'blue'
        ? 'rank--blue'
        : 'rank--black';
}

function appendRankContent(target: HTMLElement, rank: Rank, colorClass: string, isEquivalent = false): void {
  const wrap = document.createElement('span');
  wrap.className = `rank ${colorClass}${isEquivalent ? ' eq-underline' : ''}`;

  if (rank !== 'T') {
    wrap.textContent = displayRank(rank);
    target.appendChild(wrap);
    return;
  }

  const ten = document.createElement('span');
  ten.className = `rank ten ${colorClass}${isEquivalent ? ' eq-underline' : ''}`;
  const one = document.createElement('span');
  one.className = 'digit-one';
  one.textContent = '1';
  const zero = document.createElement('span');
  zero.className = 'digit-zero';
  zero.textContent = '0';
  ten.append(one, zero);
  target.appendChild(ten);
}

function eventText(event: EngineEvent): string {
  if (event.type === 'played') return `played ${playText(event.play)}`;
  if (event.type === 'autoplay') return `autoplay ${playText(event.play)}`;
  if (event.type === 'illegal') return `illegal ${event.reason}`;
  if (event.type === 'trickComplete') {
    return `trickComplete winner=${event.winner} trick=${event.trick.map(playText).join(' ')}`;
  }
  return `handComplete success=${event.success} NS=${event.tricksWon.NS} EW=${event.tricksWon.EW}`;
}

function seatSide(seat: Seat): 'NS' | 'EW' {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

function nextSeat(seat: Seat): Seat {
  const idx = seatOrder.indexOf(seat);
  return seatOrder[(idx + 1) % seatOrder.length];
}

function cloneStateForLog(src: State): State {
  return {
    ...src,
    contract: { ...src.contract },
    threat: src.threat
      ? {
          threatCardIds: [...src.threat.threatCardIds],
          threatsBySuit: { ...src.threat.threatsBySuit }
        }
      : null,
    hands: {
      N: { S: [...src.hands.N.S], H: [...src.hands.N.H], D: [...src.hands.N.D], C: [...src.hands.N.C] },
      E: { S: [...src.hands.E.S], H: [...src.hands.E.H], D: [...src.hands.E.D], C: [...src.hands.E.C] },
      S: { S: [...src.hands.S.S], H: [...src.hands.S.H], D: [...src.hands.S.D], C: [...src.hands.S.C] },
      W: { S: [...src.hands.W.S], H: [...src.hands.W.H], D: [...src.hands.W.D], C: [...src.hands.W.C] }
    },
    trick: src.trick.map((p) => ({ ...p })),
    trickClassIds: [...src.trickClassIds],
    tricksWon: { ...src.tricksWon },
    rng: { ...src.rng },
    goal: { ...src.goal },
    userControls: [...src.userControls],
    policies: { ...src.policies },
    threatLabels: src.threatLabels
      ? {
          E: { busy: new Set(src.threatLabels.E.busy), idle: new Set(src.threatLabels.E.idle) },
          W: { busy: new Set(src.threatLabels.W.busy), idle: new Set(src.threatLabels.W.idle) }
        }
      : null,
    cardRoles: { ...src.cardRoles },
    preferredDiscards: {
      N: src.preferredDiscards.N ? [...src.preferredDiscards.N] : undefined,
      E: src.preferredDiscards.E ? [...src.preferredDiscards.E] : undefined,
      S: src.preferredDiscards.S ? [...src.preferredDiscards.S] : undefined,
      W: src.preferredDiscards.W ? [...src.preferredDiscards.W] : undefined
    },
    preferredDiscardUsed: { ...src.preferredDiscardUsed },
    replay: src.replay.transcript
      ? {
          enabled: src.replay.enabled,
          cursor: src.replay.cursor,
          divergenceIndex: src.replay.divergenceIndex,
          forcedCard: src.replay.forcedCard,
          transcript: {
            problemId: src.replay.transcript.problemId,
            seed: src.replay.transcript.seed,
            decisions: src.replay.transcript.decisions.map((d) => ({
              ...d,
              bucketCards: [...d.bucketCards],
              sameBucketAlternativeClassIds: [...d.sameBucketAlternativeClassIds],
              representativeCardByClass: { ...d.representativeCardByClass }
            })),
            userPlays: src.replay.transcript.userPlays.map((u) => ({ ...u }))
          }
        }
      : {
          enabled: src.replay.enabled,
          cursor: src.replay.cursor,
          divergenceIndex: src.replay.divergenceIndex,
          forcedCard: src.replay.forcedCard,
          transcript: null
        }
  };
}

function cloneThreatContext(ctx: ThreatContext | null): ThreatContext | null {
  if (!ctx) return null;
  return {
    threatCardIds: [...ctx.threatCardIds],
    threatsBySuit: { ...ctx.threatsBySuit }
  };
}

function cloneThreatLabels(labels: DefenderLabels | null): DefenderLabels | null {
  if (!labels) return null;
  return {
    E: { busy: new Set(labels.E.busy), idle: new Set(labels.E.idle) },
    W: { busy: new Set(labels.W.busy), idle: new Set(labels.W.idle) }
  };
}

function cloneCompletedTrick(trick: Play[] | null): Play[] | null {
  if (!trick) return null;
  return trick.map((p) => ({ ...p }));
}

function makeSnapshot(play: Play): GameSnapshot {
  return {
    state: cloneStateForLog(state),
    currentProblemId,
    currentSeed,
    logs: [...logs],
    deferredLogLines: [...deferredLogLines],
    trickFrozen,
    lastCompletedTrick: cloneCompletedTrick(lastCompletedTrick),
    frozenViewState: frozenViewState ? cloneStateForLog(frozenViewState) : null,
    canLeadDismiss,
    threatCtx: cloneThreatContext(threatCtx),
    threatLabels: cloneThreatLabels(threatLabels),
    play: { ...play },
    runStatus,
    playAgainAvailable,
    playAgainUnavailableReason,
    playAgainLastCandidateIndex
  };
}

function restoreSnapshot(snapshot: GameSnapshot): void {
  state = cloneStateForLog(snapshot.state);
  currentProblemId = snapshot.currentProblemId;
  currentProblem = demoProblems.find((p) => p.id === currentProblemId)?.problem ?? currentProblem;
  currentSeed = snapshot.currentSeed;
  logs = [...snapshot.logs];
  deferredLogLines = [...snapshot.deferredLogLines];
  trickFrozen = snapshot.trickFrozen;
  lastCompletedTrick = cloneCompletedTrick(snapshot.lastCompletedTrick);
  frozenViewState = snapshot.frozenViewState ? cloneStateForLog(snapshot.frozenViewState) : null;
  canLeadDismiss = snapshot.canLeadDismiss;
  threatCtx = cloneThreatContext(snapshot.threatCtx);
  threatLabels = cloneThreatLabels(snapshot.threatLabels);
  runStatus = snapshot.runStatus;
  playAgainAvailable = snapshot.playAgainAvailable;
  playAgainUnavailableReason = snapshot.playAgainUnavailableReason;
  playAgainLastCandidateIndex = snapshot.playAgainLastCandidateIndex;
}

function totalCards(s: State, seat: Seat): number {
  const hand = s.hands[seat];
  return hand.S.length + hand.H.length + hand.D.length + hand.C.length;
}

function trickText(trick: Play[]): string {
  return trick.length > 0 ? trick.map(playText).join(' ') : '-';
}

function snapshotText(s: State): string {
  return [
    `snapshot phase=${s.phase}`,
    `turn=${s.turn}`,
    `leader=${s.leader}`,
    `trick=${trickText(s.trick)}`,
    `rem=N:${totalCards(s, 'N')} E:${totalCards(s, 'E')} S:${totalCards(s, 'S')} W:${totalCards(s, 'W')}`,
    `won=NS:${s.tricksWon.NS} EW:${s.tricksWon.EW}`
  ].join(' ');
}

function applyEventToShadow(s: State, event: EngineEvent): void {
  if (event.type === 'played' || event.type === 'autoplay') {
    const playedCard = toCardId(event.play.suit, event.play.rank) as CardId;
    const classId = classInfoForCard(s, event.play.seat, playedCard).classId;
    const hand = s.hands[event.play.seat][event.play.suit];
    const idx = hand.indexOf(event.play.rank);
    if (idx >= 0) {
      hand.splice(idx, 1);
    }
    s.trick.push({ ...event.play });
    s.trickClassIds.push(`${event.play.seat}:${classId}`);
    if (s.threat && s.threatLabels) {
      const next = updateClassificationAfterPlay(
        { threat: s.threat, labels: s.threatLabels, perCardRole: s.cardRoles },
        { hands: s.hands },
        toCardId(event.play.suit, event.play.rank) as CardId
      );
      s.threat = next.threat as State['threat'];
      s.threatLabels = next.labels as State['threatLabels'];
      s.cardRoles = { ...next.perCardRole };
    }
    s.turn = nextSeat(s.turn);
    return;
  }

  if (event.type === 'trickComplete') {
    s.trick = [];
    s.trickClassIds = [];
    s.leader = event.winner;
    s.turn = event.winner;
    s.tricksWon[seatSide(event.winner)] += 1;
    return;
  }

  if (event.type === 'handComplete') {
    s.phase = 'end';
    s.tricksWon = { ...event.tricksWon };
  }
}

function logLinesForStep(before: State, attemptedPlay: Play, events: EngineEvent[], after: State): string[] {
  const lines: string[] = [];
  const shadow = cloneStateForLog(before);

  for (const event of events) {
    if (verboseLog && event.type === 'autoplay') {
      if (event.replay?.action === 'forced') {
        lines.push(`[PLAYAGAIN] forcing index=${event.replay.index ?? '?'} card=${event.replay.card ?? `${event.play.suit}${event.play.rank}`}`);
      }
      if (event.replay?.action === 'disabled') {
        lines.push(`[PLAYAGAIN] replay disabled due to ${event.replay.reason ?? 'mismatch'}`);
      }
      if (event.preferredDiscard) {
        const pref = event.preferredDiscard;
        if (pref.applied && pref.chosen) {
          lines.push(`[PREFDISC] seat=${event.play.seat} applied preferred discard=${pref.chosen}`);
        } else {
          lines.push(
            `[PREFDISC] seat=${event.play.seat} preferred=${pref.preferred.join('/')} not-applied reason=${pref.reason}`
          );
        }
      }
      const leadSuit = shadow.trick[0]?.suit ?? 'none';
      const legalCount = legalPlays(shadow).length;
      lines.push(`autoplayDecision seat=${shadow.turn} leadSuit=${leadSuit} legal=${legalCount} chosen=${playText(event.play)}`);

      const policy = shadow.policies[shadow.turn];
      if (
        policy?.kind === 'threatAware' &&
        shadow.trick.length > 0 &&
        shadow.hands[shadow.turn][shadow.trick[0].suit].length > 0
      ) {
        const ls = shadow.trick[0].suit;
        const inSuit = legalPlays(shadow).map((p) => `${p.suit}${p.rank}`);
        const threshold = shadow.threat && shadow.threatLabels
          ? getIdleThreatThresholdRank(ls, shadow.threat as ThreatContext, shadow.threatLabels as DefenderLabels)
          : null;
        if (threshold) {
          const below = legalPlays(shadow).filter((p) => rankOrder.indexOf(p.rank) > rankOrder.indexOf(threshold)).map((p) => `${p.suit}${p.rank}`);
          const above = legalPlays(shadow).filter((p) => rankOrder.indexOf(p.rank) <= rankOrder.indexOf(threshold)).map((p) => `${p.suit}${p.rank}`);
          lines.push(`[THREAT:follow] defender=${shadow.turn} ledSuit=${ls} threshold=${threshold}`);
          lines.push(`inSuit=${inSuit.join(' ') || '-'} below=${below.join(' ') || '-'} above=${above.join(' ') || '-'} chosen=${event.play.suit}${event.play.rank}`);
        } else {
          lines.push(`[THREAT:follow] defender=${shadow.turn} ledSuit=${ls} threshold=- inSuit=${inSuit.join(' ') || '-'} chosen=${event.play.suit}${event.play.rank} (baseline)`);
        }
      }

      if (
        (shadow.turn === 'E' || shadow.turn === 'W') &&
        shadow.trick.length > 0 &&
        shadow.hands[shadow.turn][shadow.trick[0].suit].length === 0 &&
        shadow.threat &&
        shadow.threatLabels
      ) {
        const ledSuit = shadow.trick[0].suit;
        const localCtx = shadow.threat as ThreatContext;
        const localLabels = shadow.threatLabels as DefenderLabels;
        const tiers = computeDiscardTiers(shadow.turn, positionFromState(shadow), ledSuit, localCtx, localLabels);
        lines.push(
          formatDiscardDecisionBlock({
            defender: shadow.turn,
            ledSuit,
            trumpStrain: shadow.contract.strain,
            ctx: localCtx,
            labels: localLabels,
            legal: tiers.legal,
            tier1a: tiers.tier1a,
            tier1b: tiers.tier1b,
            tier1c: tiers.tier1c,
            tier2a: tiers.tier2a,
            tier2b: tiers.tier2b,
            tier3a: tiers.tier3a,
            tier3b: tiers.tier3b,
            tier4: tiers.tier4,
            chosen: toCardId(event.play.suit, event.play.rank),
            rngState: { seed: after.rng.seed, counter: after.rng.counter }
          })
        );
      }
    }

    lines.push(eventText(event));

    if (verboseLog && (event.type === 'played' || event.type === 'autoplay')) {
      const beforeCtx = shadow.threat as ThreatContext | null;
      const beforeLabels = shadow.threatLabels as DefenderLabels | null;
      applyEventToShadow(shadow, event);
      const afterCtx = shadow.threat as ThreatContext | null;
      const afterLabels = shadow.threatLabels as DefenderLabels | null;
      lines.push(
        formatAfterPlayBlock({
          play: event.play,
          beforeCtx,
          afterCtx,
          beforeLabels,
          afterLabels
        })
      );
    } else {
      applyEventToShadow(shadow, event);
    }

    if (verboseLog && event.type === 'illegal') {
      const leadSuit = shadow.trick[0]?.suit ?? 'none';
      const legal = legalPlays(shadow)
        .slice(0, 10)
        .map(playText)
        .join(' ');
      lines.push(
        `illegalContext attempted=${playText(attemptedPlay)} turn=${shadow.turn} leadSuit=${leadSuit} legal=${legal || '-'}`
      );
    }

    if (event.type === 'trickComplete' && verboseLog && shadow.threat && shadow.threatLabels) {
      const trickIndex = shadow.tricksWon.NS + shadow.tricksWon.EW + 1;
      lines.push(
        formatAfterTrickBlock({
          trickIndex,
          leader: shadow.leader,
          trick: event.trick,
          beforeCtx: shadow.threat as ThreatContext,
          afterCtx: shadow.threat as ThreatContext,
          beforeLabels: shadow.threatLabels as DefenderLabels,
          afterLabels: shadow.threatLabels as DefenderLabels,
          position: positionFromState(shadow)
        })
      );
    }
  }

  if (verboseLog) {
    lines.push(snapshotText(after));
  }

  return lines;
}

function appendTranscriptDecisions(before: State, events: EngineEvent[]): void {
  const shadow = cloneStateForLog(before);
  for (const event of events) {
    if (event.type === 'autoplay' && (event.play.seat === 'E' || event.play.seat === 'W') && event.decisionSig) {
      const chosenCard = toCardId(event.play.suit, event.play.rank);
      const bucketCards = event.bucketCards ? [...event.bucketCards] : [chosenCard];
      const classOrder: string[] = [];
      const representativeCardByClass: Record<string, CardId> = {};
      for (const card of bucketCards) {
        const info = classInfoForCard(shadow, event.play.seat, card);
        if (!classOrder.includes(info.classId)) classOrder.push(info.classId);
        if (!representativeCardByClass[info.classId]) representativeCardByClass[info.classId] = info.representative;
      }
      const chosenClassId = classInfoForCard(shadow, event.play.seat, chosenCard).classId;
      currentRunTranscript.push({
        index: currentRunTranscript.length,
        seat: event.play.seat,
        sig: event.decisionSig,
        chosenCard,
        chosenClassId,
        chosenBucket: event.chosenBucket ?? 'unknown',
        bucketCards,
        sameBucketAlternativeClassIds: classOrder.filter((id) => id !== chosenClassId),
        representativeCardByClass
      });
    }
    applyEventToShadow(shadow, event);
  }
}

function formatGoal(s: State): string {
  const g = s.goal;
  if (g.type === 'minTricks') {
    return `${g.side} ${g.n} tricks`;
  }
  return 'Unknown goal';
}

function currentViewState(): State {
  return trickFrozen && frozenViewState ? frozenViewState : state;
}

function unfreezeTrick(flushDeferredLogs: boolean): void {
  trickFrozen = false;
  lastCompletedTrick = null;
  frozenViewState = null;
  canLeadDismiss = false;
  if (flushDeferredLogs && deferredLogLines.length > 0) {
    logs = [...logs, ...deferredLogLines].slice(-500);
    deferredLogLines = [];
  }
}

function stateSingletonKey(s: State, play: Play): string {
  const handSig = seatOrder
    .map((seat) => `${seat}:${suitOrder.map((suit) => s.hands[seat][suit].join('')).join('/')}`)
    .join('|');
  const trickSig = s.trick.map((p) => `${p.seat}${p.suit}${p.rank}`).join(',');
  return `${s.phase}|${s.turn}|${s.leader}|${trickSig}|${handSig}|${play.seat}${play.suit}${play.rank}`;
}

function syncSingletonAutoplay(): void {
  const userControlledSeats = state.userControls;
  const userTurn = userControlledSeats.includes(state.turn);
  const canAutoplayNow =
    userTurn &&
    ((!trickFrozen && state.phase === 'awaitUser') || (trickFrozen && canLeadDismiss && state.phase !== 'end'));
  if (!autoplaySingletons || !canAutoplayNow) {
    clearSingletonAutoplayTimer();
    return;
  }

  const legal = legalPlays(state).filter((p) => p.seat === state.turn);
  if (legal.length !== 1) {
    clearSingletonAutoplayTimer();
    return;
  }

  const onlyPlay = legal[0];
  const key = stateSingletonKey(state, onlyPlay);
  if (singletonAutoplayTimer && singletonAutoplayKey === key) return;

  clearSingletonAutoplayTimer();
  singletonAutoplayKey = key;
  singletonAutoplayTimer = setTimeout(() => {
    const liveUserControlledSeats = state.userControls;
    const liveUserTurn = liveUserControlledSeats.includes(state.turn);
    const liveCanAutoplay =
      liveUserTurn &&
      ((!trickFrozen && state.phase === 'awaitUser') || (trickFrozen && canLeadDismiss && state.phase !== 'end'));
    if (!autoplaySingletons || !liveCanAutoplay) {
      clearSingletonAutoplayTimer();
      return;
    }
    const liveLegal = legalPlays(state).filter((p) => p.seat === state.turn);
    if (liveLegal.length !== 1) {
      clearSingletonAutoplayTimer();
      return;
    }
    const livePlay = liveLegal[0];
    if (stateSingletonKey(state, livePlay) !== key) {
      clearSingletonAutoplayTimer();
      return;
    }
    clearSingletonAutoplayTimer();
    runTurn(livePlay);
  }, 500);
}

function refreshThreatModel(problemId: string, clearLogs: boolean): void {
  if (clearLogs) logs = [];
  const rawThreats = getThreatCardIds(currentProblem as ProblemWithThreats);

  threatCtx = (state.threat as ThreatContext | null) ?? null;
  threatLabels = (state.threatLabels as DefenderLabels | null) ?? null;
  if (rawThreats.length === 0) return;

  if (verboseLog) {
    logs = [
      ...logs,
      formatInitBlock({
        problemId,
        threatCardIdsRaw: rawThreats,
        position: positionFromState(state),
        ctx: threatCtx,
        labels: threatLabels
      }),
      ...seatOrder.map((seat) => `[HAND:init] ${formatHandInitSummary(state, seat)}`)
    ].slice(-500);
  }
}

function resetGame(seed: number, reason: string): void {
  clearSingletonAutoplayTimer();
  currentSeed = seed >>> 0;
  state = init({ ...currentProblem, rngSeed: currentSeed });
  logs = [...logs, `${reason} seed=${currentSeed}`].slice(-500);
  runStatus = 'running';
  playAgainAvailable = false;
  playAgainUnavailableReason = null;
  playAgainLastCandidateIndex = null;
  currentRunTranscript = [];
  currentRunUserPlays = [];
  undoStack.length = 0;
  deferredLogLines = [];
  unfreezeTrick(false);
  refreshThreatModel(currentProblemId, false);
  render();
}

function selectProblem(problemId: string): void {
  clearSingletonAutoplayTimer();
  const entry = demoProblems.find((p) => p.id === problemId);
  if (!entry) return;
  currentProblem = entry.problem;
  currentProblemId = entry.id;
  currentSeed = currentProblem.rngSeed >>> 0;
  state = init({ ...currentProblem, rngSeed: currentSeed });
  runStatus = 'running';
  playAgainAvailable = false;
  playAgainUnavailableReason = null;
  playAgainLastCandidateIndex = null;
  currentRunTranscript = [];
  currentRunUserPlays = [];
  lastSuccessfulTranscript = null;
  triedAltClass.clear();
  undoStack.length = 0;
  deferredLogLines = [];
  unfreezeTrick(false);
  refreshThreatModel(currentProblemId, true);
  render();
}

function backupLastUserPlay(): void {
  clearSingletonAutoplayTimer();
  const snapshot = undoStack.pop();
  if (!snapshot) return;
  restoreSnapshot(snapshot);
  logs = [...logs, `[UNDO] restored snapshot before user play: ${snapshot.play.seat}:${toCardId(snapshot.play.suit, snapshot.play.rank)}`].slice(-500);
  render();
}

function runTurn(play: Play): void {
  clearSingletonAutoplayTimer();
  if (state.replay.enabled && state.replay.transcript && (play.seat === 'N' || play.seat === 'S')) {
    const playId = toCardId(play.suit, play.rank) as CardId;
    const actualClass = classInfoForCard(state, play.seat, playId).classId;
    const expected = state.replay.transcript.userPlays[currentRunUserPlays.length];
    if (expected && expected.playClassId !== actualClass) {
      state.replay.enabled = false;
      logs = [...logs, `[PLAYAGAIN] replay disabled due to user class mismatch expected=${expected.playClassId} actual=${actualClass}`].slice(-500);
    } else if (verboseLog) {
      const info = classInfoForCard(state, play.seat, playId);
      logs = [...logs, `[EQ] seat=${play.seat} played=${playId} class=${info.classId} rep=${info.representative}`].slice(-500);
    }
  }
  if (play.seat === 'N' || play.seat === 'S') {
    const playId = toCardId(play.suit, play.rank) as CardId;
    const cls = classInfoForCard(state, play.seat, playId).classId;
    currentRunUserPlays.push({ index: currentRunUserPlays.length, seat: play.seat, playClassId: cls });
  }
  undoStack.push(makeSnapshot(play));
  if (trickFrozen) {
    unfreezeTrick(true);
  }

  const before = state;
  const result = apply(state, play);
  state = result.state;
  threatCtx = (state.threat as ThreatContext | null) ?? null;
  threatLabels = (state.threatLabels as DefenderLabels | null) ?? null;

  const trickCompleteIndex = result.events.findIndex((event) => event.type === 'trickComplete');
  appendTranscriptDecisions(before, result.events);
  if (trickCompleteIndex >= 0) {
    const visibleEvents = result.events.slice(0, trickCompleteIndex + 1);
    const deferredEvents = result.events.slice(trickCompleteIndex + 1);

    const visibleShadow = cloneStateForLog(before);
    for (const event of visibleEvents) {
      applyEventToShadow(visibleShadow, event);
    }

    trickFrozen = true;
    frozenViewState = visibleShadow;
    const trickEvent = visibleEvents[visibleEvents.length - 1];
    if (trickEvent.type === 'trickComplete') {
      lastCompletedTrick = trickEvent.trick.map((p) => ({ ...p }));
    }

    canLeadDismiss = state.phase !== 'end' && state.trick.length === 0 && state.userControls.includes(state.turn);

    const visibleLines = logLinesForStep(before, play, visibleEvents, visibleShadow);
    logs = [...logs, ...visibleLines].slice(-500);

    if (deferredEvents.length > 0) {
      const deferredLines = logLinesForStep(visibleShadow, play, deferredEvents, state);
      deferredLogLines = [...deferredLogLines, ...deferredLines].slice(-500);
    }
  } else {
    const lines = logLinesForStep(before, play, result.events, state);
    logs = [...logs, ...lines].slice(-500);
  }

  const complete = result.events.find((e) => e.type === 'handComplete');
  if (complete?.type === 'handComplete' && complete.success) {
    lastSuccessfulTranscript = {
      problemId: currentProblemId,
      seed: currentSeed,
      decisions: currentRunTranscript.map((d) => ({
        ...d,
        bucketCards: [...d.bucketCards],
        sameBucketAlternativeClassIds: [...d.sameBucketAlternativeClassIds],
        representativeCardByClass: { ...d.representativeCardByClass }
      })),
      userPlays: currentRunUserPlays.map((u) => ({ ...u }))
    };
    logs = [...logs, `[PLAYAGAIN] recorded transcript ${lastSuccessfulTranscript.decisions.length} decisions`].slice(-500);
    for (const rec of lastSuccessfulTranscript.decisions) {
      triedAltClass.add(triedAltKey(lastSuccessfulTranscript.problemId, rec.index, rec.chosenBucket, rec.chosenClassId));
    }
    const availability = hasUntriedAlternatives(lastSuccessfulTranscript, triedAltClass);
    playAgainAvailable = availability.ok;
    playAgainUnavailableReason = availability.ok ? null : (availability.reason ?? 'no-untried-same-bucket-alternatives');
    playAgainLastCandidateIndex = availability.lastCandidateIndex ?? null;
    logs = [
      ...logs,
      availability.ok
        ? `[PLAYAGAIN] availability ok=true lastCandidateIndex=${availability.lastCandidateIndex}`
        : `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`
    ].slice(-500);
  }
  if (complete?.type === 'handComplete') {
    const nextStatus: RunStatus = complete.success ? 'success' : 'failure';
    if (verboseLog) {
      logs = [
        ...logs,
        `[GOAL] endOfRun=true NSwon=${complete.tricksWon.NS} EWwon=${complete.tricksWon.EW} required${state.goal.side}>=${state.goal.n} success=${complete.success}`,
        `[RUNSTATUS] ${runStatus} -> ${nextStatus}`
      ].slice(-500);
    }
    runStatus = nextStatus;
  }

  render();
}

function startPlayAgain(): void {
  clearSingletonAutoplayTimer();
  const availability = hasUntriedAlternatives(lastSuccessfulTranscript, triedAltClass);
  playAgainAvailable = availability.ok;
  playAgainUnavailableReason = availability.ok ? null : (availability.reason ?? 'no-untried-same-bucket-alternatives');
  playAgainLastCandidateIndex = availability.lastCandidateIndex ?? null;
  if (!availability.ok || !lastSuccessfulTranscript) {
    logs = [...logs, `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`].slice(-500);
    render();
    return;
  }

  const seed = lastSuccessfulTranscript?.seed ?? currentSeed;
  state = init({ ...currentProblem, rngSeed: seed });
  let divergenceIndex: number | null = null;
  let forcedCard: CardId | null = null;
  for (let i = lastSuccessfulTranscript.decisions.length - 1; i >= 0; i -= 1) {
    const rec = lastSuccessfulTranscript.decisions[i];
    const altClass = rec.sameBucketAlternativeClassIds.find(
      (classId) => !triedAltClass.has(triedAltKey(lastSuccessfulTranscript.problemId, rec.index, rec.chosenBucket, classId))
    );
    if (altClass) {
      divergenceIndex = rec.index;
      forcedCard = rec.representativeCardByClass[altClass] ?? null;
      triedAltClass.add(triedAltKey(lastSuccessfulTranscript.problemId, rec.index, rec.chosenBucket, altClass));
      if (!forcedCard) continue;
      logs = [...logs, `[PLAYAGAIN] divergenceIndex=${divergenceIndex} forcedCard=${forcedCard}`].slice(-500);
      break;
    }
  }
  if (!forcedCard || divergenceIndex === null) {
    playAgainAvailable = false;
    playAgainUnavailableReason = 'no-untried-same-bucket-alternatives';
    playAgainLastCandidateIndex = null;
    logs = [...logs, `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`].slice(-500);
    render();
    return;
  }
  state.replay = {
    enabled: true,
    transcript: {
      problemId: lastSuccessfulTranscript.problemId,
      seed: lastSuccessfulTranscript.seed,
      decisions: lastSuccessfulTranscript.decisions.map((d) => ({
        ...d,
        bucketCards: [...d.bucketCards],
        sameBucketAlternativeClassIds: [...d.sameBucketAlternativeClassIds],
        representativeCardByClass: { ...d.representativeCardByClass }
      })),
      userPlays: lastSuccessfulTranscript.userPlays.map((u) => ({ ...u }))
    },
    cursor: 0,
    divergenceIndex,
    forcedCard
  };
  currentSeed = seed;
  runStatus = 'running';
  playAgainAvailable = false;
  playAgainUnavailableReason = null;
  playAgainLastCandidateIndex = null;
  currentRunTranscript = [];
  currentRunUserPlays = [];
  deferredLogLines = [];
  unfreezeTrick(false);
  refreshThreatModel(currentProblemId, false);
  logs = [...logs, '[PLAYAGAIN] replay enabled'].slice(-500);
  render();
}

function renderSuitRow(view: State, seat: Seat, suit: Suit, legalSet: Set<string>, canAct: boolean): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'suit-row';

  const suitEl = document.createElement('span');
  suitEl.className = `suit-symbol suit-${suit}`;
  suitEl.textContent = suitSymbol[suit];
  row.appendChild(suitEl);

  const cards = document.createElement('div');
  cards.className = 'cards';

  const ranks = sortRanksDesc(view.hands[seat][suit]);
  const equivalentRanks = new Set<Rank>();
  if (teachingMode) {
    for (const cls of getSuitEquivalenceClasses(view, seat, suit)) {
      if (cls.length > 1) {
        for (const rank of cls) equivalentRanks.add(rank);
      }
    }
  }
  if (ranks.length > 0) {
    for (const rank of ranks) {
      const key = `${suit}${rank}`;
      const isLegal = canAct && legalSet.has(key);
      const isEquivalent = equivalentRanks.has(rank);

      if (isLegal) {
        const rankBtn = document.createElement('button');
        rankBtn.type = 'button';
        rankBtn.className = 'rank-text legal';
        appendRankContent(rankBtn, rank, rankColorClass(toCardId(suit, rank) as CardId), isEquivalent);
        rankBtn.onclick = () => runTurn({ seat, suit, rank });
        cards.appendChild(rankBtn);
      } else {
        const rankEl = document.createElement('span');
        rankEl.className = 'rank-text muted';
        appendRankContent(rankEl, rank, rankColorClass(toCardId(suit, rank) as CardId), isEquivalent);
        cards.appendChild(rankEl);
      }
    }
  }

  row.appendChild(cards);
  return row;
}

function renderSeatHand(view: State, seat: Seat): HTMLElement {
  const card = document.createElement('section');
  const active = view.turn === seat;
  card.className = `hand seat-${seat}`;

  const header = document.createElement('div');
  header.className = 'hand-head';
  header.innerHTML = `<strong class="seat-name${active ? ' active-seat-name' : ''}">${seatName[seat]}</strong>`;
  card.appendChild(header);

  const legal = !trickFrozen && active ? legalPlays(view) : [];
  const legalSet = new Set(legal.map((p) => `${p.suit}${p.rank}`));
  const canAct = !trickFrozen && view.phase !== 'end' && view.userControls.includes(seat) && active;

  if (trickFrozen && canLeadDismiss && state.userControls.includes(state.turn) && seat === state.turn) {
    const leadLegal = legalPlays(state);
    for (const play of leadLegal) {
      legalSet.add(`${play.suit}${play.rank}`);
    }
  }

  const effectiveCanAct = canAct || (trickFrozen && canLeadDismiss && seat === state.turn);

  for (const suit of suitOrder) {
    card.appendChild(renderSuitRow(view, seat, suit, legalSet, effectiveCanAct));
  }

  return card;
}

function renderTrickTable(view: State): HTMLElement {
  const table = document.createElement('section');
  table.className = `trick-table${trickFrozen ? ' frozen' : ''}`;
  if (trickFrozen) {
    table.title = 'Click to dismiss trick';
    table.onclick = () => {
      unfreezeTrick(true);
      render();
    };
  }

  const sourceTrick = trickFrozen && lastCompletedTrick ? lastCompletedTrick : view.trick;
  const bySeat = new Map(sourceTrick.map((p) => [p.seat, p] as const));

  for (const seat of seatOrder) {
    const slot = document.createElement('div');
    slot.className = `trick-slot slot-${seat}`;
    const play = bySeat.get(seat);
    if (play) {
      const text = document.createElement('span');
      text.className = 'played-text';
      const suitEl = document.createElement('span');
      suitEl.className = `played-suit suit-${play.suit}`;
      suitEl.textContent = suitSymbol[play.suit];
      const rankEl = document.createElement('span');
      rankEl.className = 'played-rank';
      appendRankContent(rankEl, play.rank, rankColorClass(toCardId(play.suit, play.rank) as CardId));
      text.append(suitEl, rankEl);
      slot.appendChild(text);
    }
    table.appendChild(slot);
  }

  return table;
}

function renderStatusPanel(view: State): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'status-panel';

  const head = document.createElement('div');
  head.className = 'status-head';

  const title = document.createElement('strong');
  title.textContent = 'Status';
  head.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'controls';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset';
  resetBtn.onclick = () => resetGame(currentSeed, 'reset');
  controls.appendChild(resetBtn);

  const backupBtn = document.createElement('button');
  backupBtn.type = 'button';
  backupBtn.textContent = 'Backup';
  backupBtn.disabled = undoStack.length === 0;
  backupBtn.onclick = () => backupLastUserPlay();
  controls.appendChild(backupBtn);

  const seedBtn = document.createElement('button');
  seedBtn.type = 'button';
  seedBtn.textContent = 'New seed';
  seedBtn.onclick = () => resetGame(Date.now() >>> 0, 'newSeed');
  controls.appendChild(seedBtn);

  const showLogLabel = document.createElement('label');
  const showLogBox = document.createElement('input');
  showLogBox.type = 'checkbox';
  showLogBox.checked = showLog;
  showLogBox.onchange = () => {
    showLog = showLogBox.checked;
    render();
  };
  showLogLabel.append(showLogBox, ' Show log');
  controls.appendChild(showLogLabel);

  const verboseLabel = document.createElement('label');
  const verboseBox = document.createElement('input');
  verboseBox.type = 'checkbox';
  verboseBox.checked = verboseLog;
  verboseBox.onchange = () => {
    verboseLog = verboseBox.checked;
    render();
  };
  verboseLabel.append(verboseBox, ' Verbose log');
  controls.appendChild(verboseLabel);

  head.appendChild(controls);
  panel.appendChild(head);

  const facts = document.createElement('div');
  facts.className = 'status-facts';
  facts.innerHTML = `
    <div><span class="k">Contract</span><span class="v">${view.contract.strain}</span></div>
    <div><span class="k">Goal</span><span class="v">${formatGoal(view)}</span></div>
    <div class="tricks"><span class="k">Tricks</span><span class="v heavy">NS ${view.tricksWon.NS} - EW ${view.tricksWon.EW}</span></div>
    <div class="meta-row"><span class="k">Leader</span><span class="v turn-meta">${view.leader}</span></div>
    <div class="meta-row"><span class="k">Turn</span><span class="v turn-meta turn-emph">${view.turn}</span></div>
    <div class="meta-row"><span class="k">Seed</span><span class="v seed">${currentSeed}</span></div>
  `;
  panel.appendChild(facts);

  return panel;
}

function render(): void {
  const view = currentViewState();

  root.innerHTML = '';

  const boardShell = document.createElement('section');
  boardShell.className = 'board-shell';

  const tableHost = document.createElement('div');
  tableHost.className = 'table-host';
  const tableTools = document.createElement('div');
  tableTools.className = 'table-tools';

  const puzzleLabel = document.createElement('label');
  puzzleLabel.textContent = 'Puzzle: ';
  const puzzleSelect = document.createElement('select');
  for (const p of demoProblems) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    opt.selected = p.id === currentProblemId;
    puzzleSelect.appendChild(opt);
  }
  puzzleSelect.onchange = () => {
    selectProblem(puzzleSelect.value);
  };
  puzzleLabel.appendChild(puzzleSelect);
  tableTools.appendChild(puzzleLabel);

  const guidesLabel = document.createElement('label');
  const guidesBox = document.createElement('input');
  guidesBox.type = 'checkbox';
  guidesBox.checked = showGuides;
  guidesBox.onchange = () => {
    showGuides = guidesBox.checked;
    render();
  };
  guidesLabel.append(guidesBox, ' Show guides');
  tableTools.appendChild(guidesLabel);

  const teachLabel = document.createElement('label');
  const teachBox = document.createElement('input');
  teachBox.type = 'checkbox';
  teachBox.checked = teachingMode;
  teachBox.onchange = () => {
    teachingMode = teachBox.checked;
    render();
  };
  teachLabel.append(teachBox, ' Teaching mode');
  tableTools.appendChild(teachLabel);

  const singletonLabel = document.createElement('label');
  const singletonBox = document.createElement('input');
  singletonBox.type = 'checkbox';
  singletonBox.checked = autoplaySingletons;
  singletonBox.onchange = () => {
    autoplaySingletons = singletonBox.checked;
    syncSingletonAutoplay();
    render();
  };
  singletonLabel.append(singletonBox, ' Autoplay singletons');
  tableTools.appendChild(singletonLabel);
  tableHost.appendChild(tableTools);

  const tableCanvas = document.createElement('main');
  tableCanvas.className = `table-canvas${showGuides ? ' show-guides' : ''}`;
  tableCanvas.appendChild(renderTrickTable(view));
  tableCanvas.appendChild(renderSeatHand(view, 'N'));
  tableCanvas.appendChild(renderSeatHand(view, 'W'));
  tableCanvas.appendChild(renderSeatHand(view, 'E'));
  tableCanvas.appendChild(renderSeatHand(view, 'S'));

  tableHost.appendChild(tableCanvas);
  boardShell.appendChild(tableHost);
  boardShell.appendChild(renderStatusPanel(view));
  root.appendChild(boardShell);

  if (runStatus === 'success' || runStatus === 'failure') {
    const banner = document.createElement('div');
    banner.className = `banner ${runStatus === 'success' ? 'ok' : 'fail'}`;
    banner.textContent = runStatus === 'success' ? 'Success - goal achieved' : 'Not enough tricks - try again';
    root.appendChild(banner);
  }
  if (runStatus === 'success' && playAgainAvailable) {
    const playAgainBtn = document.createElement('button');
    playAgainBtn.type = 'button';
    playAgainBtn.textContent = 'Play Again';
    playAgainBtn.onclick = () => startPlayAgain();
    root.appendChild(playAgainBtn);
  }
  if (runStatus === 'success' && !playAgainAvailable) {
    const note = document.createElement('div');
    note.className = 'banner';
    note.textContent = "No 'Play Again' variations available: defenders had no same-tier alternatives to explore.";
    root.appendChild(note);
  }

  if (showLog) {
    const panel = document.createElement('section');
    panel.className = 'log-panel';

    const title = document.createElement('strong');
    title.textContent = 'Log';
    panel.appendChild(title);

    const log = document.createElement('div');
    log.className = 'log';
    log.textContent = logs.length > 0 ? logs.join('\n') : 'No events yet';
    panel.appendChild(log);
    root.appendChild(panel);
    log.scrollTop = log.scrollHeight;
  }
  syncSingletonAutoplay();
}

refreshThreatModel(currentProblemId, false);
render();
