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
import { computeCoverageCandidates, markDecisionCoverage, type ReplayCoverage } from './playAgain';
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
const busyBranchingLabel: Record<'strict' | 'sameLevel' | 'allBusy', string> = {
  strict: 'Strict',
  sameLevel: 'Same level',
  allBusy: 'All busy'
};
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
let busyBranching: 'strict' | 'sameLevel' | 'allBusy' = 'sameLevel';
const threatDetail = false;
const verboseCoverageDetail = false;

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
  replaySuppressedForRun: boolean;
};
const undoStack: GameSnapshot[] = [];
let currentRunTranscript: DecisionRecord[] = [];
let lastSuccessfulTranscript: SuccessfulTranscript | null = null;
const replayCoverage: ReplayCoverage = {
  triedByIdx: new Map<number, Set<string>>(),
  recordedRemainingByIdx: new Map<number, Set<string>>(),
  representativeByIdx: new Map<number, Map<string, CardId>>()
};
let currentRunUserPlays: UserPlayRecord[] = [];
let currentRunEqTokens: string[] = [];
type RunStatus = 'running' | 'success' | 'failure';
let runStatus: RunStatus = 'running';
let playAgainAvailable = false;
let playAgainUnavailableReason: string | null = null;
let playAgainLastCandidateIndex: number | null = null;
let runPlayCounter = 0;
let replayMismatchCutoffIdx: number | null = null;
let replaySuppressedForRun = false;
const userEqClassByCardId = new Map<CardId, string>();
const userEqRepByClassId = new Map<string, CardId>();
let invEqVersion = 0;
type DefenderEqInitRecord = {
  idx: number;
  seat: 'E' | 'W';
  bucket: string;
  classes: string[];
  remaining: string[];
  chosen: string;
  eqByTier: string;
};
const defenderEqInitByKey = new Map<string, DefenderEqInitRecord>();
let defenderEqInitPrinted = false;
rebuildUserEqClassMapping(state);

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
          forcedClassId: src.replay.forcedClassId,
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
          forcedClassId: src.replay.forcedClassId,
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
    playAgainLastCandidateIndex,
    replaySuppressedForRun
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
  replaySuppressedForRun = snapshot.replaySuppressedForRun;
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

function resetDefenderEqInitSnapshot(): void {
  defenderEqInitByKey.clear();
  defenderEqInitPrinted = false;
}

function maybeLogDefenderEqInitSnapshot(): void {
  if (!verboseLog || defenderEqInitPrinted || defenderEqInitByKey.size === 0) return;
  const entries = [...defenderEqInitByKey.values()].sort(
    (a, b) => a.idx - b.idx || (a.seat < b.seat ? -1 : a.seat > b.seat ? 1 : 0)
  );
  logs = [
    ...logs,
    '',
    '================= DEFENDER EQ (initial snapshot, first EQCs observed) =================',
    ...entries.map(
      (r) =>
        `idx=${r.idx} seat=${r.seat} bucket=${r.bucket} classes={${r.classes.join(',')}} remaining={${r.remaining.join(',')}} chosen=${r.chosen}`
    ),
    '=========================================================================================',
    ''
  ].slice(-500);
  defenderEqInitPrinted = true;
}

function formatUserEqClassLabels(s: State, seat: Seat): string[] {
  const labels: string[] = [];
  for (const suit of suitOrder) {
    for (const cls of getSuitEquivalenceClasses(s, seat, suit)) {
      labels.push(`${suit}${cls.join('')}`);
    }
  }
  return labels;
}

function rebuildUserEqClassMapping(s: State): void {
  userEqClassByCardId.clear();
  userEqRepByClassId.clear();
  for (const seat of s.userControls) {
    for (const suit of suitOrder) {
      const classes = getSuitEquivalenceClasses(s, seat, suit);
      for (const cls of classes) {
        if (cls.length === 0) continue;
        const rep = toCardId(suit, cls[0]) as CardId;
        const repInfo = classInfoForCard(s, seat, rep);
        const classId = repInfo.classId;
        if (!userEqRepByClassId.has(classId)) {
          userEqRepByClassId.set(classId, rep);
        }
        for (const rank of cls) {
          const cardId = toCardId(suit, rank) as CardId;
          userEqClassByCardId.set(cardId, classId);
        }
      }
    }
  }
}

function getImmutableUserEqClass(seat: Seat, cardId: CardId): string {
  if (seat !== 'N' && seat !== 'S') {
    return classInfoForCard(state, seat, cardId).classId;
  }
  return userEqClassByCardId.get(cardId) ?? classInfoForCard(state, seat, cardId).classId;
}

function getImmutableUserEqRep(classId: string, fallback: CardId): CardId {
  return userEqRepByClassId.get(classId) ?? fallback;
}

function formatUserEqInitBlock(s: State): string[] {
  const lines: string[] = [
    '',
    '================= USER EQ (initial) ================='
  ];
  for (const seat of s.userControls) {
    const labels = formatUserEqClassLabels(s, seat);
    lines.push(`seat=${seat} classes: ${labels.join('  ') || '-'}`);
  }
  lines.push('=====================================================');
  lines.push('');
  return lines;
}

function computeEqcForAutoplayEvent(shadow: State, event: Extract<EngineEvent, { type: 'autoplay' }>, idx: number): DefenderEqInitRecord | null {
  if ((event.play.seat !== 'E' && event.play.seat !== 'W') || !event.decisionSig) return null;
  const chosenCard = toCardId(event.play.suit, event.play.rank);
  const bucketCards = event.bucketCards ? [...event.bucketCards] : [chosenCard];
  const policyClassByCard = event.policyClassByCard ?? {};
  const chosenBucket = event.chosenBucket ?? 'unknown';
  const tierBuckets = event.tierBuckets ?? {};
  let explorationCards = [...bucketCards];
  if ((chosenBucket.startsWith('tier2') || chosenBucket.startsWith('tier3')) && busyBranching !== 'strict') {
    const orderedKeys =
      busyBranching === 'sameLevel'
        ? ([`tier${chosenBucket.startsWith('tier2') ? '2' : '3'}a`, `tier${chosenBucket.startsWith('tier2') ? '2' : '3'}b`] as const)
        : (['tier2a', 'tier2b', 'tier3a', 'tier3b'] as const);
    const merged: CardId[] = [];
    for (const key of orderedKeys) {
      for (const card of tierBuckets[key] ?? []) {
        if (!merged.includes(card)) merged.push(card);
      }
    }
    if (merged.length > 0) explorationCards = merged;
  }
  const toAltClassId = (card: CardId): string => {
    if (chosenBucket.startsWith('tier1')) return 'idle:tier1';
    if (chosenBucket.startsWith('tier2') || chosenBucket.startsWith('tier3')) return `busy:${card[0]}`;
    if (chosenBucket === 'tier4') return `other:${card[0]}`;
    const labels = shadow.threatLabels as DefenderLabels | null;
    if (labels) {
      if (labels[event.play.seat].busy.has(card)) return `busy:${card[0]}`;
      if (labels[event.play.seat].idle.has(card)) return 'idle:tier1';
    }
    const mapped = policyClassByCard[card];
    if (mapped) return mapped;
    return classInfoForCard(shadow, event.play.seat, card).classId;
  };
  const classOrder: string[] = [];
  const chosenAltClassId = toAltClassId(chosenCard);
  for (const card of explorationCards) {
    const classId = toAltClassId(card);
    if (!classOrder.includes(classId)) classOrder.push(classId);
  }
  const remaining = classOrder.filter((id) => id !== chosenAltClassId);
  return {
    idx,
    seat: event.play.seat,
    bucket: chosenBucket,
    classes: classOrder,
    remaining,
    chosen: chosenAltClassId,
    eqByTier: computeEqByTierSummary(shadow, event)
  };
}

function chooseDeterministicUserRepPlay(s: State): Play | null {
  const legal = legalPlays(s).filter((p) => p.seat === s.turn);
  if (legal.length === 0) return null;
  const legalByCard = new Map(legal.map((p) => [toCardId(p.suit, p.rank), p] as const));
  const byClass = new Map<string, Play>();
  for (const p of legal) {
    const cardId = toCardId(p.suit, p.rank);
    const info = classInfoForCard(s, p.seat, cardId);
    const repPlay = legalByCard.get(info.representative as CardId);
    if (!byClass.has(info.classId)) {
      byClass.set(info.classId, repPlay ?? p);
    }
  }
  const classIds = [...byClass.keys()].sort();
  return byClass.get(classIds[0]) ?? legal[0];
}

function prefetchDefenderEqInitSummary(problem: ProblemWithThreats, seed: number): DefenderEqInitRecord[] {
  // PREFETCH EQ DEBUG: shadow dry-run, no real-state/log mutations.
  let shadowState = init({ ...problem, rngSeed: seed });
  const firstByIdx = new Map<number, DefenderEqInitRecord>();
  let idxCounter = 0;
  let plies = 0;
  const maxPlies = 50;

  while (shadowState.phase !== 'end' && plies < maxPlies) {
    const before = cloneStateForLog(shadowState);
    const play = shadowState.userControls.includes(shadowState.turn)
      ? chooseDeterministicUserRepPlay(shadowState)
      : legalPlays(shadowState)[0] ?? null;
    if (!play) break;

    const result = apply(shadowState, play);
    shadowState = result.state;

    const eventShadow = cloneStateForLog(before);
    for (const event of result.events) {
      if (event.type === 'autoplay' && (event.play.seat === 'E' || event.play.seat === 'W')) {
        const rec = computeEqcForAutoplayEvent(eventShadow, event, idxCounter);
        if (rec && !firstByIdx.has(idxCounter)) {
          firstByIdx.set(idxCounter, rec);
        }
        idxCounter += 1;
      }
      applyEventToShadow(eventShadow, event);
    }

    plies += result.events.filter((e) => e.type === 'played' || e.type === 'autoplay').length;
  }

  return [...firstByIdx.values()].sort((a, b) => a.idx - b.idx || (a.seat < b.seat ? -1 : a.seat > b.seat ? 1 : 0));
}

function formatDefenderEqPrefetchBlock(records: DefenderEqInitRecord[]): string[] {
  return [
    '',
    '================= DEFENDER ACTION EQ (prefetch, before play) =================',
    ...records.map(
      (r) =>
        `idx=${r.idx} seat=${r.seat} bucket=${r.bucket} classes={${r.classes.join(',')}} remaining={${r.remaining.join(',')}} chosen=${r.chosen} | eqByTier: ${r.eqByTier}`
    ),
    '=============================================================================',
    ''
  ];
}

function sortCardIdsDesc(cards: CardId[]): CardId[] {
  const suitStrength: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
  return [...cards].sort((a, b) => {
    const ra = rankOrder.indexOf(a[1] as Rank);
    const rb = rankOrder.indexOf(b[1] as Rank);
    if (ra !== rb) return ra - rb;
    return suitStrength[a[0] as Suit] - suitStrength[b[0] as Suit];
  });
}

function tierOrderKey(tier: string): number {
  const order = ['tier1a', 'tier1b', 'tier1c', 'tier2a', 'tier2b', 'tier3a', 'tier3b', 'tier4', 'follow:below', 'follow:above', 'follow:baseline', 'lead:none', 'legal', 'preferred'];
  const idx = order.indexOf(tier);
  return idx >= 0 ? idx : 999;
}

function compactTierName(tier: string): string {
  if (tier.startsWith('tier')) return tier.slice(4);
  if (tier.startsWith('follow:')) return tier.slice(7);
  if (tier === 'lead:none') return 'lead';
  return tier;
}

function computeTierByCardForDecision(shadow: State, event: Extract<EngineEvent, { type: 'autoplay' }>): Map<CardId, string> {
  const out = new Map<CardId, string>();
  const legal = legalPlays(shadow).filter((p) => p.seat === event.play.seat).map((p) => toCardId(p.suit, p.rank));
  const leadSuit = shadow.trick[0]?.suit ?? null;

  if (!leadSuit) {
    for (const c of legal) out.set(c, 'lead:none');
    return out;
  }

  const isVoidDiscard = shadow.hands[shadow.turn][leadSuit].length === 0;
  if (isVoidDiscard && shadow.threat && shadow.threatLabels) {
    const tiers = computeDiscardTiers(shadow.turn, positionFromState(shadow), leadSuit, shadow.threat as ThreatContext, shadow.threatLabels as DefenderLabels);
    const priority: Array<[string, CardId[]]> = [
      ['tier1a', tiers.tier1a],
      ['tier1b', tiers.tier1b],
      ['tier1c', tiers.tier1c],
      ['tier2a', tiers.tier2a],
      ['tier2b', tiers.tier2b],
      ['tier3a', tiers.tier3a],
      ['tier3b', tiers.tier3b],
      ['tier4', tiers.tier4]
    ];
    // Best-tier only assignment to keep the debug cross-tab compact.
    for (const [tier, cards] of priority) {
      for (const c of cards) {
        if (!out.has(c)) out.set(c, tier);
      }
    }
    return out;
  }

  if (shadow.hands[shadow.turn][leadSuit].length > 0) {
    const inSuit = legalPlays(shadow).filter((p) => p.seat === shadow.turn).map((p) => toCardId(p.suit, p.rank));
    if (!shadow.threat || !shadow.threatLabels) {
      for (const c of inSuit) out.set(c, 'follow:baseline');
      return out;
    }
    const threshold = getIdleThreatThresholdRank(leadSuit, shadow.threat as ThreatContext, shadow.threatLabels as DefenderLabels);
    if (!threshold) {
      for (const c of inSuit) out.set(c, 'follow:baseline');
      return out;
    }
    for (const c of inSuit) {
      const r = c[1] as Rank;
      out.set(c, rankOrder.indexOf(r) > rankOrder.indexOf(threshold) ? 'follow:below' : 'follow:above');
    }
    return out;
  }

  for (const c of legal) out.set(c, event.chosenBucket ?? 'unknown');
  return out;
}

function computeEqByTierSummary(shadow: State, event: Extract<EngineEvent, { type: 'autoplay' }>): string {
  const tierByCard = computeTierByCardForDecision(shadow, event);
  const eqToTier = new Map<string, Map<string, CardId[]>>();
  for (const [card, tier] of tierByCard.entries()) {
    let eqClass = event.policyClassByCard?.[card];
    if (!eqClass) {
      if (tier.startsWith('tier1')) eqClass = 'idle:tier1';
      else if (tier.startsWith('tier2') || tier.startsWith('tier3')) eqClass = `busy:${card[0]}`;
      else if (tier === 'tier4') eqClass = `other:${card[0]}`;
      else eqClass = classInfoForCard(shadow, event.play.seat, card).classId;
    }
    const tierMap = eqToTier.get(eqClass) ?? new Map<string, CardId[]>();
    const cards = tierMap.get(tier) ?? [];
    cards.push(card);
    tierMap.set(tier, cards);
    eqToTier.set(eqClass, tierMap);
  }

  const busyOrder = ['busy:S', 'busy:H', 'busy:D', 'busy:C'];
  const all = [...eqToTier.entries()];
  const idle = all.find(([k]) => k.startsWith('idle'));
  const busy = busyOrder
    .map((k) => all.find(([ek]) => ek === k))
    .filter((v): v is [string, Map<string, CardId[]>] => !!v);
  const others = all
    .filter(([k]) => !k.startsWith('idle') && !busyOrder.includes(k))
    .sort((a, b) => a[0].localeCompare(b[0]));

  const renderEq = (k: string, tiers: Map<string, CardId[]>) => {
    const parts = [...tiers.entries()]
      .sort((a, b) => tierOrderKey(a[0]) - tierOrderKey(b[0]))
      .map(([t, cards]) => `${compactTierName(t)}:{${sortCardIdsDesc(cards).join(' ')}}`)
      .join(' ');
    return `${k}(${parts})`;
  };

  const out: string[] = [];
  if (idle) out.push(renderEq(idle[0], idle[1]));
  else out.push('idle:None');
  for (const [k, tiers] of [...busy, ...others]) out.push(renderEq(k, tiers));
  return out.join(', ');
}

function isBelowThreshold(cardId: CardId, threshold: Rank): boolean {
  const rank = cardId[1] as Rank;
  return rankOrder.indexOf(rank) > rankOrder.indexOf(threshold);
}

function formatDefenderInventoryEqBlock(s: State): string[] {
  const ctx = s.threat as ThreatContext | null;
  const labels = s.threatLabels as DefenderLabels | null;
  const seatRows: string[] = [];
  const defenderOrder: Array<'E' | 'W'> = ['E', 'W'];
  const idleSuitOrder: Suit[] = ['C', 'D', 'H', 'S'];
  const busySuitOrder: Suit[] = ['S', 'H', 'D', 'C'];
  const tierOrder = ['tier2a', 'tier2b', 'tier3a', 'tier3b'];

  for (const seat of defenderOrder) {
    const threatSuits = busySuitOrder.filter((suit) => !!ctx?.threatsBySuit[suit]);
    const idleParts: string[] = [];
    for (const suit of idleSuitOrder) {
      if (threatSuits.includes(suit)) continue;
      const cards = sortCardIdsDesc(s.hands[seat][suit].map((rank) => toCardId(suit, rank) as CardId));
      if (cards.length > 0) idleParts.push(`idle:${suit}{${cards.join(' ')}}`);
    }
    const idleSummary = idleParts.length > 0 ? idleParts.join(' ') : 'idle:(None)';

    const busyParts: string[] = [];
    for (const suit of threatSuits) {
      const cards = sortCardIdsDesc(s.hands[seat][suit].map((rank) => toCardId(suit, rank) as CardId));
      if (cards.length === 0) {
        busyParts.push(`busy:${suit}(None)`);
        continue;
      }

      const threshold = ctx && labels ? getIdleThreatThresholdRank(suit, ctx, labels) : null;
      const stopStatus = ctx?.threatsBySuit[suit]?.stopStatus;
      const prefix = stopStatus === 'double' ? '2' : '3';
      const tiers = new Map<string, CardId[]>();
      for (const card of cards) {
        const tier =
          threshold && isBelowThreshold(card, threshold)
            ? `tier${prefix}a`
            : `tier${prefix}b`;
        const list = tiers.get(tier) ?? [];
        list.push(card);
        tiers.set(tier, list);
      }
      const tierParts = tierOrder
        .filter((tier) => (tiers.get(tier)?.length ?? 0) > 0)
        .map((tier) => `${tier.slice(4)}:{${sortCardIdsDesc(tiers.get(tier) ?? []).join(' ')}}`);
      busyParts.push(`busy:${suit}(${tierParts.join(' ') || 'None'})`);
    }

    seatRows.push(`seat=${seat} | ${idleSummary} | ${busyParts.join(' | ') || 'busy:(None)'}`);
  }

  return [
    '',
    '================= DEFENDER INVENTORY EQ (initial) =================',
    ...seatRows,
    '===================================================================',
    ''
  ];
}

function formatDefenderInventoryEqSeat(s: State, seat: 'E' | 'W'): string {
  const ctx = s.threat as ThreatContext | null;
  const labels = s.threatLabels as DefenderLabels | null;
  const idleSuitOrder: Suit[] = ['C', 'D', 'H', 'S'];
  const busySuitOrder: Suit[] = ['S', 'H', 'D', 'C'];
  const tierOrder = ['tier2a', 'tier2b', 'tier3a', 'tier3b'];
  const threatSuits = busySuitOrder.filter((suit) => !!ctx?.threatsBySuit[suit]);

  const idleParts: string[] = [];
  for (const suit of idleSuitOrder) {
    const cards = sortCardIdsDesc(
      [...(labels?.[seat].idle ?? new Set<CardId>())].filter((card) => card[0] === suit)
    );
    if (cards.length > 0) idleParts.push(`idle:${suit}{${cards.join(' ')}}`);
  }
  const idleSummary = idleParts.length > 0 ? idleParts.join(' ') : 'idle:(None)';

  const busyParts: string[] = [];
  for (const suit of threatSuits) {
    const cards = sortCardIdsDesc(
      [...(labels?.[seat].busy ?? new Set<CardId>())].filter((card) => card[0] === suit)
    );
    if (cards.length === 0) {
      busyParts.push(`busy:${suit}(None)`);
      continue;
    }
    const threshold = ctx && labels ? getIdleThreatThresholdRank(suit, ctx, labels) : null;
    const stopStatus = ctx?.threatsBySuit[suit]?.stopStatus;
    const prefix = stopStatus === 'double' ? '2' : '3';
    const tiers = new Map<string, CardId[]>();
    for (const card of cards) {
      const tier = threshold && isBelowThreshold(card, threshold) ? `tier${prefix}a` : `tier${prefix}b`;
      const list = tiers.get(tier) ?? [];
      list.push(card);
      tiers.set(tier, list);
    }
    const tierParts = tierOrder
      .filter((tier) => (tiers.get(tier)?.length ?? 0) > 0)
      .map((tier) => `${tier.slice(4)}:{${sortCardIdsDesc(tiers.get(tier) ?? []).join(' ')}}`);
    busyParts.push(`busy:${suit}(${tierParts.join(' ') || 'None'})`);
  }

  return `${idleSummary} | ${busyParts.join(' | ') || 'busy:(None)'}`;
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
    if (event.type === 'played' || event.type === 'autoplay') {
      if (runPlayCounter > 0) {
        lines.push('');
      }
      runPlayCounter += 1;
      lines.push(`----- PLAY ${runPlayCounter} -----`);
      const cardId = toCardId(event.play.suit, event.play.rank) as CardId;
      let playLine = `play ${event.play.seat}:${cardId} (${event.type === 'played' ? 'user' : 'auto'})`;
      if (event.type === 'played') {
        const userEqClass = getImmutableUserEqClass(event.play.seat, cardId);
        playLine += ` | eq=${userEqClass}`;
      } else {
        const eqRec = computeEqcForAutoplayEvent(shadow, event, -1);
        if (eqRec) {
          playLine += ` | eq=${eqRec.chosen} (card=${cardId}; bucket=${eqRec.bucket}; remaining=${eqRec.remaining.join(',') || '-'})`;
        } else {
          const classId = classInfoForCard(shadow, event.play.seat, cardId).classId;
          playLine += ` | eq=${classId}${event.chosenBucket ? ` (card=${cardId}; bucket=${event.chosenBucket})` : ''}`;
        }
      }
      lines.push(playLine);
    }

    if (verboseLog && event.type === 'autoplay') {
      if (event.replay?.action === 'forced') {
        lines.push(`[PLAYAGAIN] forcing index=${event.replay.index ?? '?'} card=${event.replay.card ?? `${event.play.suit}${event.play.rank}`}`);
      }
      if (event.replay?.action === 'disabled') {
        if (event.replay.reason === 'class-not-legal') {
          lines.push(
            `[PLAYAGAIN] force failed idx=${event.replay.index ?? '?'} forcedClass=${event.replay.forcedClassId ?? '-'} reason=class-not-legal; continuing unforced`
          );
        } else {
          lines.push(`[PLAYAGAIN] replay disabled due to ${event.replay.reason ?? 'mismatch'}`);
        }
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
      if (threatDetail) {
        const leadSuit = shadow.trick[0]?.suit ?? 'none';
        const legalCount = legalPlays(shadow).length;
        lines.push(`autoplayDecision seat=${shadow.turn} leadSuit=${leadSuit} legal=${legalCount} chosen=${playText(event.play)}`);
      }

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
          const below = legalPlays(shadow).filter((p) => rankOrder.indexOf(p.rank) > rankOrder.indexOf(threshold));
          const above = legalPlays(shadow).filter((p) => rankOrder.indexOf(p.rank) <= rankOrder.indexOf(threshold));
          lines.push(
            `[THREAT] follow seat=${shadow.turn} ledSuit=${ls} threshold=${threshold} inSuit=${inSuit.length} chosen=${event.play.suit}${event.play.rank} below=${below.length} above=${above.length}`
          );
        } else {
          lines.push(
            `[THREAT] follow seat=${shadow.turn} ledSuit=${ls} threshold=- inSuit=${inSuit.length} chosen=${event.play.suit}${event.play.rank} mode=baseline`
          );
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
        const tierCounts = [
          ['t2a', tiers.tier2a.length],
          ['t2b', tiers.tier2b.length],
          ['t3a', tiers.tier3a.length],
          ['t3b', tiers.tier3b.length]
        ].filter(([, count]) => count > 0).map(([name, count]) => `${name}:${count}`).join(' ');
        lines.push(
          `[THREAT] discard seat=${shadow.turn} ledSuit=${ledSuit} legal=${tiers.legal.length} chosen=${event.play.suit}${event.play.rank} bucket=${event.chosenBucket ?? '-'} tiers=${tierCounts || '-'}`
        );
        if (threatDetail) {
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
    }

    if (event.type === 'illegal' || event.type === 'handComplete') {
      lines.push(eventText(event));
    }

    if (verboseLog && threatDetail && (event.type === 'played' || event.type === 'autoplay')) {
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

    if (event.type === 'trickComplete') {
      lines.push(`----- TRICK COMPLETE ----- winner=${event.winner} trick=${event.trick.map(playText).join(' ')}`);
      lines.push('');
      if (verboseLog && threatDetail && shadow.threat && shadow.threatLabels) {
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
  }

  if (verboseLog && threatDetail) {
    lines.push(snapshotText(after));
  }

  return lines;
}

function appendTranscriptDecisions(before: State, events: EngineEvent[]): void {
  const shadow = cloneStateForLog(before);
  for (const event of events) {
    if (event.type === 'autoplay' && (event.play.seat === 'E' || event.play.seat === 'W') && event.decisionSig) {
      invEqVersion += 1;
      if (verboseLog) {
        logs = [
          ...logs,
          `[INV_EQ:atDecision] idx=${currentRunTranscript.length} seat=${event.play.seat} invEq=${formatDefenderInventoryEqSeat(shadow, event.play.seat)}`
        ].slice(-500);
      }
      const eqRec = computeEqcForAutoplayEvent(shadow, event, currentRunTranscript.length);
      if (!eqRec) {
        applyEventToShadow(shadow, event);
        continue;
      }
      const chosenCard = toCardId(event.play.suit, event.play.rank);
      const chosenClassId = classInfoForCard(shadow, event.play.seat, chosenCard).classId;
      const chosenAltClassId = eqRec.chosen;
      const classOrder = [...eqRec.classes];
      const remainingClasses = [...eqRec.remaining];
      const bucketCards = event.bucketCards ? [...event.bucketCards] : [chosenCard];
      const toDecisionClass = (card: CardId): string => {
        if (eqRec.bucket.startsWith('tier1')) return 'idle:tier1';
        if (eqRec.bucket.startsWith('tier2') || eqRec.bucket.startsWith('tier3')) return `busy:${card[0]}`;
        if (eqRec.bucket === 'tier4') return `other:${card[0]}`;
        const labels = shadow.threatLabels as DefenderLabels | null;
        if (labels) {
          if (labels[event.play.seat].busy.has(card)) return `busy:${card[0]}`;
          if (labels[event.play.seat].idle.has(card)) return 'idle:tier1';
        }
        return event.policyClassByCard?.[card] ?? classInfoForCard(shadow, event.play.seat, card).classId;
      };
      const representativeCardByClass: Record<string, CardId> = {};
      for (const card of bucketCards) {
        const mapped = toDecisionClass(card);
        if (!representativeCardByClass[mapped]) representativeCardByClass[mapped] = card;
      }
      if (classOrder.includes(chosenAltClassId)) {
        representativeCardByClass[chosenAltClassId] = chosenCard;
      }
      const seatLabels = shadow.threatLabels as DefenderLabels | null;
      const invEqIdleClasses = classOrder.filter((classId) => {
        if (classId.startsWith('idle')) return true;
        const classCards = bucketCards.filter((card) => toDecisionClass(card) === classId);
        return classCards.length > 0 && !!seatLabels && classCards.every((card) => seatLabels[event.play.seat].idle.has(card));
      });
      const sourceRec =
        event.replay?.action === 'forced' && shadow.replay.transcript && typeof event.replay.index === 'number'
          ? shadow.replay.transcript.decisions[event.replay.index]
          : null;
      const runtimeRemainingForLog: string[] | null = [...eqRec.remaining];
      const runtimeRemainingReason: string | null = null;
      if (sourceRec && sourceRec.seat === event.play.seat) {
        const recordedClasses = [sourceRec.chosenAltClassId ?? sourceRec.chosenClassId, ...sourceRec.sameBucketAlternativeClassIds]
          .filter((v, idx, arr) => v && arr.indexOf(v) === idx);
        classOrder.splice(0, classOrder.length, ...recordedClasses);
        for (const [cls, card] of Object.entries(sourceRec.representativeCardByClass)) {
          representativeCardByClass[cls] = card;
        }
        if (!classOrder.includes(chosenAltClassId)) classOrder.push(chosenAltClassId);
        representativeCardByClass[chosenAltClassId] = chosenCard;
        if (
          verboseLog &&
          (
            (runtimeRemainingForLog && runtimeRemainingForLog.join(',') !== sourceRec.sameBucketAlternativeClassIds.join(','))
            || (!runtimeRemainingForLog && runtimeRemainingReason)
          )
        ) {
          const runtimeText = runtimeRemainingForLog
            ? (runtimeRemainingForLog.join(',') || '-')
            : `unavailable:${runtimeRemainingReason ?? 'unknown'}`;
          logs = [
            ...logs,
            `[EQC:replay] idx=${event.replay.index} recordedRemaining=${sourceRec.sameBucketAlternativeClassIds.join(',') || '-'} runtimeRemaining=${runtimeText}`
          ].slice(-500);
        }
      }
      const coveredCards = bucketCards.filter((card) => {
        const mapped = toDecisionClass(card);
        return mapped === chosenAltClassId;
      });
      if (verboseLog) {
        logs = [
          ...logs,
          `[EQC] idx=${currentRunTranscript.length} seat=${event.play.seat} scope=${busyBranching} bucket=${eqRec.bucket} classes=${classOrder.join(',') || '-'} chosen=${chosenAltClassId} covers=${coveredCards.join(',') || '-'} remaining=${remainingClasses.join(',') || '-'} invEqVersion=${invEqVersion}`
        ].slice(-500);
      }
      const eqIdx = currentRunTranscript.length;
      const eqSeat = event.play.seat;
      const eqKey = `${eqIdx}:${eqSeat}`;
      if (!defenderEqInitByKey.has(eqKey)) {
        defenderEqInitByKey.set(eqKey, {
          idx: eqIdx,
          seat: eqSeat,
          bucket: eqRec.bucket,
          classes: [...classOrder],
          remaining: [...remainingClasses],
          chosen: chosenAltClassId,
          eqByTier: eqRec.eqByTier
        });
      }
      maybeLogDefenderEqInitSnapshot();
      currentRunTranscript.push({
        index: currentRunTranscript.length,
        seat: event.play.seat,
        nodeKey: currentRunEqTokens.join(' > '),
        sig: event.decisionSig,
        chosenCard,
        chosenClassId,
        chosenAltClassId,
        invEqIdleClasses,
        chosenBucket: eqRec.bucket,
        bucketCards,
        sameBucketAlternativeClassIds: classOrder.filter((id) => id !== chosenAltClassId),
        representativeCardByClass
      });
      currentRunEqTokens.push(chosenAltClassId);
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

type BranchableCandidate = {
  index: number;
  seat: 'E' | 'W';
  nodeKey: string;
  avail: string[];
  invEqIdle: string[];
  branchableAvail: string[];
  remainingKeys: string[];
};

function isIdleClassByRecord(rec: DecisionRecord, classId: string): boolean {
  return classId.startsWith('idle') || rec.invEqIdleClasses.includes(classId);
}

function computeBranchableCandidates(
  transcript: SuccessfulTranscript,
  coverage: ReplayCoverage,
  cutoff: number | null,
  reason: string
): { candidates: BranchableCandidate[]; logsOut: string[] } {
  const allowedIndices = new Set(transcript.decisions.map((d) => d.index));
  const raw = computeCoverageCandidates(coverage, allowedIndices, cutoff);
  const logsOut: string[] = [];
  const out: BranchableCandidate[] = [];

  for (const rec of transcript.decisions) {
    const avail = [rec.chosenAltClassId ?? rec.chosenClassId, ...rec.sameBucketAlternativeClassIds]
      .filter((v, i, arr) => !!v && arr.indexOf(v) === i);
    const invEqIdle = avail.filter((cls) => isIdleClassByRecord(rec, cls));
    const branchableAvail = avail.filter((cls) => !isIdleClassByRecord(rec, cls));
    const rawRemaining = raw.find((c) => c.index === rec.index)?.remainingKeys ?? [];
    const remainingBranchable = rawRemaining.filter((cls) => !isIdleClassByRecord(rec, cls));
    const branchable = branchableAvail.length >= 2 && remainingBranchable.length > 0;
    logsOut.push(
      `[PLAYAGAIN] candCheck idx=${rec.index} seat=${rec.seat} nodeKey=${rec.nodeKey || '-'} avail={${avail.join(',') || '-'}} invEqIdle={${invEqIdle.join(',') || '-'}} -> branchableAvail={${branchableAvail.join(',') || '-'}} branchable=${branchable} reason=${branchable ? reason : 'idleFiltered'}`
    );
    if (branchable) {
      out.push({
        index: rec.index,
        seat: rec.seat,
        nodeKey: rec.nodeKey || '-',
        avail,
        invEqIdle,
        branchableAvail,
        remainingKeys: remainingBranchable
      });
    }
  }

  return { candidates: out, logsOut };
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
    if (threatDetail) {
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
    } else {
      logs = [...logs, `[THREAT:init] problem=${problemId} raw=${rawThreats.join(',')} validation=OK`].slice(-500);
    }
    logs = [...logs, ...formatUserEqInitBlock(state)].slice(-500);
    logs = [...logs, ...formatDefenderInventoryEqBlock(state)].slice(-500);
  }
}

function resetGame(seed: number, reason: string): void {
  clearSingletonAutoplayTimer();
  const nextSeed = seed >>> 0;
  if (nextSeed !== (currentSeed >>> 0)) {
    replayCoverage.triedByIdx.clear();
    replayCoverage.recordedRemainingByIdx.clear();
    replayCoverage.representativeByIdx.clear();
  }
  currentSeed = nextSeed;
  state = init({ ...currentProblem, rngSeed: currentSeed });
  logs = [...logs, `${reason} seed=${currentSeed}`].slice(-500);
  runStatus = 'running';
  runPlayCounter = 0;
  invEqVersion = 0;
  replayMismatchCutoffIdx = null;
  replaySuppressedForRun = false;
  playAgainAvailable = false;
  playAgainUnavailableReason = null;
  playAgainLastCandidateIndex = null;
  currentRunTranscript = [];
  currentRunUserPlays = [];
  currentRunEqTokens = [];
  rebuildUserEqClassMapping(state);
  resetDefenderEqInitSnapshot();
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
  runPlayCounter = 0;
  invEqVersion = 0;
  replayMismatchCutoffIdx = null;
  replaySuppressedForRun = false;
  playAgainAvailable = false;
  playAgainUnavailableReason = null;
  playAgainLastCandidateIndex = null;
  currentRunTranscript = [];
  currentRunUserPlays = [];
  currentRunEqTokens = [];
  rebuildUserEqClassMapping(state);
  resetDefenderEqInitSnapshot();
  lastSuccessfulTranscript = null;
  replayCoverage.triedByIdx.clear();
  replayCoverage.recordedRemainingByIdx.clear();
  replayCoverage.representativeByIdx.clear();
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
    const actualClass = getImmutableUserEqClass(play.seat, playId);
    const expected = state.replay.transcript.userPlays[currentRunUserPlays.length];
    if (expected && expected.playClassId !== actualClass) {
      // Replay semantics: user divergence is allowed. Stop forcing future decisions,
      // continue this run normally, and only mark coverage if this run later succeeds.
      const divergedAt = state.replay.cursor;
      state.replay.enabled = false;
      replaySuppressedForRun = true;
      logs = [
        ...logs,
        `[PLAYAGAIN] user diverged at decisionIdx=${divergedAt} expectedClass=${expected.playClassId} actualClass=${actualClass}; continuing without forcing further decisions`
      ].slice(-500);
    } else if (verboseLog) {
      const classId = getImmutableUserEqClass(play.seat, playId);
      const rep = getImmutableUserEqRep(classId, playId);
      logs = [...logs, `[EQ] seat=${play.seat} played=${playId} class=${classId} rep=${rep}`].slice(-500);
    }
  }
  if (play.seat === 'N' || play.seat === 'S') {
    const playId = toCardId(play.suit, play.rank) as CardId;
    const cls = getImmutableUserEqClass(play.seat, playId);
    currentRunUserPlays.push({ index: currentRunUserPlays.length, seat: play.seat, playClassId: cls });
    currentRunEqTokens.push(cls);
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
      markDecisionCoverage(replayCoverage, rec);
    }
    const { candidates, logsOut } = computeBranchableCandidates(
      lastSuccessfulTranscript,
      replayCoverage,
      replayMismatchCutoffIdx,
      'endOfRunSuccess'
    );
    playAgainAvailable = candidates.length > 0;
    playAgainUnavailableReason = playAgainAvailable
      ? null
      : (replayMismatchCutoffIdx !== null ? 'user-mismatch-exhausted' : 'exhausted-all-variations');
    playAgainLastCandidateIndex = playAgainAvailable ? candidates[candidates.length - 1].index : null;
    const offerLine = playAgainAvailable
      ? (() => {
          const offered = candidates[candidates.length - 1];
          const offeredClass = offered.remainingKeys[0] ?? '-';
          const offeredCard = replayCoverage.representativeByIdx.get(offered.index)?.get(offeredClass) ?? '-';
          return `[PLAYAGAIN] offer available=true candidates=[${candidates.map((c) => c.index).join(',')}] chosenCandidate=${offered.index} forcedClass=${offeredClass} forcedCard=${offeredCard} reason=endOfRunSuccess`;
        })()
      : null;
    logs = [
      ...logs,
      ...logsOut,
      `[PLAYAGAIN] candidates=[${candidates.map((c) => c.index).join(',')}] cutoffIdx=${replayMismatchCutoffIdx ?? '-'}`,
      ...candidates.map((c) => `[PLAYAGAIN] idx=${c.index} remainingUntried=${c.remainingKeys.length} keys=${c.remainingKeys.join(',')}`),
      ...(offerLine ? [offerLine] : []),
      playAgainAvailable
        ? `[PLAYAGAIN] availability ok=true lastCandidateIndex=${playAgainLastCandidateIndex}`
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

function startPlayAgain(source: 'manual' | 'autoplay' = 'autoplay'): void {
  clearSingletonAutoplayTimer();
  if (!lastSuccessfulTranscript) {
    playAgainAvailable = false;
    playAgainUnavailableReason = 'exhausted-all-variations';
    playAgainLastCandidateIndex = null;
    logs = [...logs, `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`].slice(-500);
    render();
    return;
  }
  const { candidates, logsOut } = computeBranchableCandidates(
    lastSuccessfulTranscript,
    replayCoverage,
    replayMismatchCutoffIdx,
    source === 'manual' ? 'manualRequest' : 'offerCheck'
  );
  playAgainAvailable = candidates.length > 0;
  playAgainUnavailableReason = playAgainAvailable
    ? null
    : (replayMismatchCutoffIdx !== null ? 'user-mismatch-exhausted' : 'exhausted-all-variations');
  playAgainLastCandidateIndex = playAgainAvailable ? candidates[candidates.length - 1].index : null;
  logs = [
    ...logs,
    ...logsOut,
    `[PLAYAGAIN] candidates=[${candidates.map((c) => c.index).join(',')}] cutoffIdx=${replayMismatchCutoffIdx ?? '-'}`,
    ...candidates.map((c) => `[PLAYAGAIN] idx=${c.index} remainingUntried=${c.remainingKeys.length} keys=${c.remainingKeys.join(',')}`)
  ].slice(-500);
  if (playAgainAvailable) {
    const offered = candidates[candidates.length - 1];
    const offeredClass = offered.remainingKeys[0] ?? '-';
    const offeredCard = replayCoverage.representativeByIdx.get(offered.index)?.get(offeredClass) ?? '-';
    logs = [
      ...logs,
      `[PLAYAGAIN] offer shown candidates=[${candidates.map((c) => c.index).join(',')}] reason=${source === 'manual' ? 'manualRequest' : 'other'}`,
      `[PLAYAGAIN] offer available=true candidates=[${candidates.map((c) => c.index).join(',')}] chosenCandidate=${offered.index} forcedClass=${offeredClass} forcedCard=${offeredCard} reason=${source === 'manual' ? 'manualRequest' : 'other'}`
    ].slice(-500);
  }
  if (!playAgainAvailable) {
    logs = [...logs, `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`].slice(-500);
    render();
    return;
  }

  const seed = lastSuccessfulTranscript?.seed ?? currentSeed;
  state = init({ ...currentProblem, rngSeed: seed });
  let divergenceIndex: number | null = null;
  let forcedClass: string | null = null;
  let forcedCard: CardId | null = null;
  const coverageLines: string[] = [];
  for (const c of candidates) {
    if (verboseCoverageDetail || c.remainingKeys.length > 0) {
      coverageLines.push(`[EQC:playagain] idx=${c.index} remaining=${c.remainingKeys.join(',') || '-'}`);
    }
  }
  const chosenCandidate = candidates[candidates.length - 1];
  divergenceIndex = chosenCandidate.index;
  forcedClass = chosenCandidate.remainingKeys[0] ?? null;
  if (forcedClass) {
    const rep = replayCoverage.representativeByIdx.get(divergenceIndex);
    forcedCard = rep?.get(forcedClass) ?? null;
    logs = [...logs, `[PLAYAGAIN] candidates=[${candidates.map((c) => c.index).join(',')}] chosen=${divergenceIndex}`].slice(-500);
    logs = [...logs, `[PLAYAGAIN] divergenceIndex=${divergenceIndex} forcedClass=${forcedClass} forcedCard=${forcedCard ?? '-'}`].slice(-500);
  }
  if (verboseLog) {
    logs = [...logs, '----- PLAY AGAIN COVERAGE -----', ...(coverageLines.length > 0 ? coverageLines : ['[EQC:playagain] none'])].slice(-500);
  }
  if (!forcedClass || divergenceIndex === null) {
    playAgainAvailable = false;
    playAgainUnavailableReason = 'exhausted-all-variations';
    playAgainLastCandidateIndex = null;
    logs = [...logs, `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`].slice(-500);
    render();
    return;
  }
  // Offer indicates replay is possible; selected indicates replay is actually starting.
  logs = [
    ...logs,
    `[PLAYAGAIN] offer selected chosenCandidate=${divergenceIndex} divergenceIdx=${divergenceIndex} forcedClass=${forcedClass} forcedCard=${forcedCard ?? '-'} source=${source === 'manual' ? 'uiClick' : 'other'}`,
    `[PLAYAGAIN] ${source === 'manual' ? 'manual' : 'autoplay'} selected=true source=${source === 'manual' ? 'uiClick' : 'other'} -> starting replay divergenceIdx=${divergenceIndex} forcedClass=${forcedClass} forcedCard=${forcedCard ?? '-'}`
  ].slice(-500);
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
    forcedCard,
    forcedClassId: forcedClass
  };
  currentSeed = seed;
  runStatus = 'running';
  runPlayCounter = 0;
  invEqVersion = 0;
  replaySuppressedForRun = false;
  playAgainAvailable = false;
  playAgainUnavailableReason = null;
  playAgainLastCandidateIndex = null;
  currentRunTranscript = [];
  currentRunUserPlays = [];
  currentRunEqTokens = [];
  rebuildUserEqClassMapping(state);
  resetDefenderEqInitSnapshot();
  deferredLogLines = [];
  unfreezeTrick(false);
  const replayNodeLines: string[] = ['[PLAYAGAIN] replayStart candidates summary:'];
  for (const rec of lastSuccessfulTranscript.decisions) {
    const avail = [rec.chosenAltClassId ?? rec.chosenClassId, ...rec.sameBucketAlternativeClassIds]
      .filter((v, i, arr) => !!v && arr.indexOf(v) === i);
    const branchableAvail = avail.filter((cls) => !isIdleClassByRecord(rec, cls));
    if (branchableAvail.length < 2) continue;
    const forcing = rec.index === divergenceIndex ? ` FORCING=${forcedClass}` : '';
    replayNodeLines.push(
      `[PLAYAGAIN] idx=${rec.index} seat=${rec.seat} nodeKey=${rec.nodeKey || '-'} avail={${avail.join(',')}} branchableAvail={${branchableAvail.join(',')}} chosen=${rec.chosenAltClassId} remaining={${rec.sameBucketAlternativeClassIds.filter((cls) => !isIdleClassByRecord(rec, cls)).join(',') || '-'}}${forcing}`
    );
  }
  logs = [
    ...logs,
    `[PLAYAGAIN] replayStart plan divergenceIdx=${divergenceIndex} forcedClass=${forcedClass} forcedCard=${forcedCard ?? '-'} source=${source}`,
    ...replayNodeLines,
    `===== PLAY AGAIN REPLAY ===== divergenceIdx=${divergenceIndex} forced=${forcedCard ?? '-'} forcedClass=${forcedClass}`,
    '[PLAYAGAIN] replay enabled',
    ''
  ].slice(-500);
  refreshThreatModel(currentProblemId, false);
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
  const variationsRow = document.createElement('div');
  variationsRow.className = 'meta-row';
  const variationsKey = document.createElement('span');
  variationsKey.className = 'k';
  variationsKey.textContent = 'Variations';
  const variationsValue = document.createElement('span');
  variationsValue.className = 'v turn-meta';
  const variationsSelect = document.createElement('select');
  (['strict', 'sameLevel', 'allBusy'] as const).forEach((mode) => {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = busyBranchingLabel[mode];
    if (mode === busyBranching) option.selected = true;
    variationsSelect.appendChild(option);
  });
  variationsSelect.onchange = () => {
    const nextMode = variationsSelect.value as 'strict' | 'sameLevel' | 'allBusy';
    if (nextMode === busyBranching) return;
    busyBranching = nextMode;
    resetGame(currentSeed, `Variation mode changed: ${busyBranchingLabel[nextMode]}`);
  };
  variationsValue.appendChild(variationsSelect);
  variationsRow.append(variationsKey, variationsValue);
  facts.appendChild(variationsRow);
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
    playAgainBtn.onclick = () => startPlayAgain('manual');
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
