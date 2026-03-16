import './style.css';

import {
  apply,
  classInfoForCard,
  CompositeSemanticReducer,
  getSuitEquivalenceClasses,
  InMemorySemanticEventCollector,
  init,
  legalPlays,
  RawSemanticReducer,
  TeachingReducer,
  type DecisionRecord,
  type EngineEvent,
  type Play,
  type Problem,
  type Policy,
  type Rank,
  type Seat,
  type State,
  type SuccessfulTranscript,
  type UserPlayRecord,
  type Suit
} from '../core';
import { computeDiscardTiers, getIdleThreatThresholdRank } from '../ai/defenderDiscard';
import { queryDdsNextPlays, warmDdsRuntime } from '../ai/ddsBrowser';
import {
  toCardId,
  updateClassificationAfterPlay,
  type CardId,
  type DefenderLabels,
  type Position,
  type ThreatContext,
} from '../ai/threatModel';
import { ensureDdDatasetLoaded } from '../ai/ddPolicy';
import { formatAfterPlayBlock, formatAfterTrickBlock, formatDiscardDecisionBlock, formatInitBlock } from '../ai/threatModelVerbose';
import { buildFeatureStateFromRuntime, getRankColorForFeatureRole } from '../ai/features';
import { computeCoverageCandidates, markDecisionCoverage, type ReplayCoverage } from './playAgain';
import { demoProblems, resolveDemoProblem } from './problems';

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
const ddSourceLabel: Record<'off' | 'runtime', string> = {
  off: 'Off',
  runtime: 'Runtime'
};
type HintState = {
  bestCards: CardId[];
  badCards: CardId[];
  textLine: string;
};
type DdErrorVisualState = {
  seat: Seat;
  goodCards: CardId[];
  badCard: CardId;
};
type DisplayMode = 'analysis' | 'widget' | 'practice';
type PracticeSession = {
  queue: string[];
  queueIndex: number;
  attempted: number;
  solved: number;
  perfect: number;
  currentUndoCount: number;
  perPuzzleUndoCount: Record<string, number>;
  isTerminal: boolean;
  terminalOutcome: 'success' | 'failure' | null;
  solutionMode: boolean;
  scoredThisRun: boolean;
};
type ClaimDebugSnapshot = {
  claimDecision: 'accepted' | 'rejected-practice' | 'rejected-bridge';
  claimMessage: string;
  onLead: boolean;
  needAllRemainingTricks: boolean;
  tricksRemaining: number;
  tricksStillNeeded: number | null;
  leaderSeat: Seat;
  userSideOnLead: boolean;
  reachableWinnerCount: number | null;
  claimBridgeValid: boolean | null;
  puzzleId: string;
  strain: string;
  nsTricks: number;
  ewTricks: number;
  runStatus: RunStatus;
  terminal: boolean;
  solutionMode: boolean;
};
type ProblemWithThreats = Problem & { threatCardIds?: CardId[] };
const displayMode: DisplayMode = (() => {
  if (typeof window === 'undefined') return 'analysis';
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode === 'practice' || mode === 'widget' || mode === 'analysis') return mode;
  const path = window.location.pathname.toLowerCase();
  if (path.endsWith('/practice') || path.endsWith('/practice/') || path.endsWith('/practice.html') || path.includes('/practice/')) {
    return 'practice';
  }
  return 'analysis';
})();
const compactWidgetLayout = displayMode !== 'analysis';
const isWidgetShellMode = displayMode !== 'analysis';

function shuffleArray<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

const maxSuitLineLen = Math.max(
  ...demoProblems.flatMap((entry) => {
    const problem = entry.problem;
    if (!problem) return [];
    return seatOrder.flatMap((seat) => suitOrder.map((suit) => problem.hands[seat][suit].length));
  })
);
const suitColWidth = 12;
const suitGap = 4;
const rankGlyphWidth = 9;
const rankGap = compactWidgetLayout ? 3 : 4;
const handPadX = compactWidgetLayout ? 3 : 4;
const handPadY = compactWidgetLayout ? 4 : 6;
const rowHeight = compactWidgetLayout ? 15 : 17;
const seatRowHeight = compactWidgetLayout ? 14 : 16;
const seatToSuitGap = compactWidgetLayout ? 2 : 3;
const suitRowSpacingTotal = compactWidgetLayout ? 12 : 16; // 4 rows with compact top/bottom margins.
const verticalGap = Math.round(rowHeight * 0.6);
const horizontalGap = Math.round(rowHeight * 0.6);
const handBoxWidth = suitColWidth + suitGap + maxSuitLineLen * rankGlyphWidth + Math.max(0, maxSuitLineLen - 1) * rankGap + handPadX;
const handBoxHeight = seatRowHeight + seatToSuitGap + rowHeight * 4 + suitRowSpacingTotal + handPadY;
const trickBoxSize = compactWidgetLayout ? Math.max(74, handBoxHeight + 2) : handBoxHeight + 6;
root.style.setProperty('--hand-box-w', `${handBoxWidth}px`);
root.style.setProperty('--hand-box-h', `${handBoxHeight}px`);
root.style.setProperty('--trick-box-w', `${trickBoxSize}px`);
root.style.setProperty('--trick-box-h', `${trickBoxSize}px`);
root.style.setProperty('--table-gap-y', `${verticalGap}px`);
root.style.setProperty('--table-gap-x', `${horizontalGap}px`);
root.style.setProperty('--slot-offset', '12%');
let busyBranching: 'strict' | 'sameLevel' | 'allBusy' = 'sameLevel';
// Legacy runtime ddPolicy backstop stays available behind DD source toggles,
// but browser DDS backstop is the active default in widget/analysis runtime.
let ddSourceMode: 'off' | 'runtime' = 'off';
const threatDetail = false;
const verboseCoverageDetail = false;
const browserDdsBackstopEnabled = true;
const initialProblemIdFromUrl: string = (() => {
  if (typeof window === 'undefined') return demoProblems[0].id;
  const requested = new URLSearchParams(window.location.search).get('problem');
  if (!requested) return demoProblems[0].id;
  return demoProblems.some((p) => p.id === requested) ? requested : demoProblems[0].id;
})();
const initialPracticeQueue: string[] =
  displayMode === 'practice'
    ? shuffleArray(demoProblems.filter((p) => p.id !== 'p002' && p.practiceEligible !== false).map((p) => p.id))
    : [];
const initialUserHistoryFromUrl: CardId[] = (() => {
  if (typeof window === 'undefined') return [];
  const raw = new URLSearchParams(window.location.search).get('history');
  if (!raw) return [];
  return raw
    .split('.')
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[SHDC](10|[AKQJT2-9])$/.test(token))
    .map((token) => `${token[0]}${token.slice(1) === '10' ? 'T' : token.slice(1)}` as CardId);
})();

const initialEntry = demoProblems.find((p) => p.id === (initialPracticeQueue[0] ?? initialProblemIdFromUrl)) ?? demoProblems[0];
let currentProblem = resolveDemoProblem(initialEntry);
let currentProblemId = initialEntry.id;
let currentSeed = currentProblem.rngSeed >>> 0;
let state: State = init({ ...withDdSource(currentProblem), rngSeed: currentSeed });
const rawSemanticReducer = new RawSemanticReducer();
const teachingReducer = new TeachingReducer();
teachingReducer.setTrumpSuit(state.trumpSuit);
const semanticReducer = new CompositeSemanticReducer([rawSemanticReducer, teachingReducer]);
const semanticCollector = new InMemorySemanticEventCollector();
semanticCollector.attachReducer(semanticReducer);
warmDdDataset(currentProblemId);
let logs: string[] = [];
let deferredLogLines: string[] = [];
let verboseLog = false;
let showLog = true;
let showGuides = false;
let showDebugSection = true;
let teachingMode = true;
let autoplaySingletons = false;
let alwaysHint = displayMode === 'widget';
let cardColoringEnabled = true;
let narrate = displayMode === 'widget';
let showWidgetTeachingPane = false;
let advancedPanelOpen = false;
let ddsPlayHistory: string[] = [];
let ddsTeachingSummaries: string[] = [];
let activeHint: HintState | null = null;
let activeHintKey: string | null = null;
let hintLoading = false;
let hintRequestSeq = 0;
let ddErrorVisual: DdErrorVisualState | null = null;
type WidgetStatusType = 'hint' | 'narration' | 'message' | 'default';
type WidgetStatus = { type: WidgetStatusType; text: string };
let widgetStatus: WidgetStatus = { type: 'default', text: '' };
type WidgetNarrationEntry = { text: string; seat: Seat | null; seq: number };
let widgetNarrationEntries: WidgetNarrationEntry[] = [];
let widgetNarrationLatest: WidgetNarrationEntry | null = null;
let widgetNarrationBySeat: Partial<Record<Seat, WidgetNarrationEntry>> = {};
let lastNarratedSeq = 0;
let singletonAutoplayTimer: ReturnType<typeof setTimeout> | null = null;
let singletonAutoplayKey: string | null = null;
let renderingNow = false;

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
  teachingEvents: TeachingEvent[];
  nextTeachingEventId: number;
  ddsPlayHistory: string[];
  ddsTeachingSummaries: string[];
  ddErrorVisual: DdErrorVisualState | null;
  userPlayHistory: CardId[];
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
let userPlayHistory: CardId[] = [];
let practiceSession: PracticeSession | null =
  displayMode === 'practice'
    ? {
        queue: [...initialPracticeQueue],
        queueIndex: 0,
        attempted: 0,
        solved: 0,
        perfect: 0,
        currentUndoCount: 0,
        perPuzzleUndoCount: {},
        isTerminal: false,
        terminalOutcome: null,
        solutionMode: false,
        scoredThisRun: false
      }
    : null;
let practiceClaimDebug: ClaimDebugSnapshot | null = null;
type TeachingEventKind = 'threatSummary' | 'recolor' | 'info';
type TeachingEvent = { id: number; kind: TeachingEventKind; label: string; detail?: string; at?: string };
let teachingEvents: TeachingEvent[] = [];
let nextTeachingEventId = 1;
let pulseUntilByCardKey = new Map<string, number>();
let pulseTimer: ReturnType<typeof setTimeout> | null = null;
const PULSE_MS = 360;
const userEqClassByCardId = new Map<CardId, string>();
const userEqRepByClassId = new Map<string, CardId>();
let invEqVersion = 0;
let currentLogRunId = 0;
let skipNextThreatInitRunIncrement = false;
const nodeVisitByRunKey = new Map<string, number>();
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

function cardPulseKey(seat: Seat, cardId: CardId): string {
  return `${seat}:${cardId}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function clearPulseTimer(): void {
  if (pulseTimer) {
    clearTimeout(pulseTimer);
    pulseTimer = null;
  }
}

function schedulePulseRender(): void {
  clearPulseTimer();
  const now = Date.now();
  let nextExpiry = Infinity;
  for (const expiry of pulseUntilByCardKey.values()) {
    if (expiry > now && expiry < nextExpiry) nextExpiry = expiry;
  }
  if (!Number.isFinite(nextExpiry)) return;
  const delay = Math.max(16, nextExpiry - now + 8);
  pulseTimer = setTimeout(() => {
    const at = Date.now();
    for (const [key, expiry] of pulseUntilByCardKey.entries()) {
      if (expiry <= at) pulseUntilByCardKey.delete(key);
    }
    render();
    schedulePulseRender();
  }, delay);
}

function markCardPulse(seat: Seat, cardId: CardId): void {
  if (prefersReducedMotion()) return;
  pulseUntilByCardKey.set(cardPulseKey(seat, cardId), Date.now() + PULSE_MS);
  schedulePulseRender();
}

function addTeachingEvent(event: Omit<TeachingEvent, 'id'>): void {
  teachingEvents.push({ ...event, id: nextTeachingEventId++ });
  if (teachingEvents.length > 120) {
    teachingEvents = teachingEvents.slice(-120);
  }
}

function clearTeachingEvents(): void {
  teachingEvents = [];
  nextTeachingEventId = 1;
}

function startNewLogRun(): void {
  currentLogRunId += 1;
}

function nextVisitId(nodeKey: string): number {
  const key = `${currentLogRunId}|${nodeKey}`;
  const next = (nodeVisitByRunKey.get(key) ?? 0) + 1;
  nodeVisitByRunKey.set(key, next);
  return next;
}

function withRun(line: string): string {
  return `run=${currentLogRunId} ${line}`;
}

function withRunVisit(nodeKey: string, line: string): string {
  return `run=${currentLogRunId} visit=${nextVisitId(nodeKey)} ${line}`;
}

function warmDdDataset(problemId: string): void {
  if (ddSourceMode !== 'runtime') return;
  void ensureDdDatasetLoaded(problemId).then((loaded) => {
    if (!verboseLog) return;
    logs = [...logs, `[DD] browser preload problem=${problemId} loaded=${loaded ? 'yes' : 'no'}`].slice(-500);
    render();
  });
}

function clearHint(): void {
  activeHint = null;
  activeHintKey = null;
  hintLoading = false;
  if (widgetStatus.type === 'hint') widgetStatus = { type: 'default', text: '' };
}

function clearWidgetMessage(): void {
  if (widgetStatus.type === 'message') widgetStatus = { type: 'default', text: '' };
}

function clearDdErrorVisual(): void {
  ddErrorVisual = null;
}

function clearNarration(): void {
  if (widgetStatus.type === 'narration') widgetStatus = { type: 'default', text: '' };
  widgetNarrationLatest = null;
  widgetNarrationBySeat = {};
}

function clearWidgetNarrationFeed(): void {
  widgetNarrationEntries = [];
  widgetNarrationLatest = null;
  widgetNarrationBySeat = {};
  lastNarratedSeq = 0;
  if (widgetStatus.type === 'narration') widgetStatus = { type: 'default', text: '' };
}

function resetSemanticStreams(): void {
  semanticCollector.clear();
  rawSemanticReducer.reset();
  teachingReducer.reset();
}

function summarizeForNarration(summary: string): string {
  const trimmed = summary.replace(/^\s*#\d+\s*/, '').trim();
  return trimmed.replace(/\b([SHDC])(10|[AKQJT2-9])\b/g, (_m, suit: string, rank: string) => {
    const sym = suit === 'S' ? '♠' : suit === 'H' ? '♥' : suit === 'D' ? '♦' : '♣';
    const r = rank === '10' ? '10' : rank;
    return `${sym}${r}`;
  });
}

function syncWidgetNarrationFeedFromTeaching(): void {
  if (!isWidgetShellMode) return;
  const snapshot = teachingReducer.snapshot() as {
    entries: Array<{ seq: number; seat: string; summary: string }>;
  };
  const entries = snapshot.entries ?? [];
  for (const entry of entries) {
    if (entry.seq <= lastNarratedSeq) continue;
    const line = summarizeForNarration(entry.summary ?? '');
    if (!line) continue;
    const seat = seatOrder.includes(entry.seat as Seat) ? (entry.seat as Seat) : null;
    const narr: WidgetNarrationEntry = { text: line, seat, seq: entry.seq };
    widgetNarrationEntries.push(narr);
    if (widgetNarrationEntries.length > 500) widgetNarrationEntries = widgetNarrationEntries.slice(-500);
    widgetNarrationLatest = narr;
    if (seat) widgetNarrationBySeat[seat] = narr;
    lastNarratedSeq = entry.seq;
  }
  if (narrate && !activeHint && widgetNarrationLatest) {
    widgetStatus = { type: 'narration', text: widgetNarrationLatest.text };
  }
}

function widgetReadingMode(): boolean {
  if (!isWidgetShellMode) return false;
  return ddsPlayHistory.length === 0 && state.trick.length === 0 && !trickFrozen;
}

function hintDiag(message: string): void {
  console.info(`[HINT] ${message}`);
  if (!verboseLog) return;
  logs = [...logs, `[HINT] ${message}`].slice(-500);
}

function normalizeDdsRank(raw: unknown): Rank | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).toUpperCase();
  if (value === '10') return 'T';
  return rankOrder.includes(value as Rank) ? (value as Rank) : null;
}

function normalizeDdsCardId(suitRaw: unknown, rankRaw: unknown): CardId | null {
  const suit = typeof suitRaw === 'string' ? suitRaw.toUpperCase() : '';
  const rank = normalizeDdsRank(rankRaw);
  if (!['S', 'H', 'D', 'C'].includes(suit) || !rank) return null;
  return `${suit}${rank}` as CardId;
}

function buildBrowserDdsBackstop(playedCardIds: string[]): NonNullable<Parameters<typeof apply>[2]>['autoplayBackstop'] {
  return ({ state: liveState, legalPlays, autoChoice }) => {
    if (!browserDdsBackstopEnabled || !autoChoice.play) return null;
    if (liveState.turn !== 'E' && liveState.turn !== 'W') return null;
    const legalCandidates = legalPlays.map((p) => toCardId(p.suit, p.rank) as CardId);
    const policyChoice = toCardId(autoChoice.play.suit, autoChoice.play.rank) as CardId;
    const dds = queryDdsNextPlays({
      openingLeader: currentProblem.leader,
      initialHands: currentProblem.hands,
      contract: currentProblem.contract,
      playedCardIds
    });

    if (!dds.ok) {
      playedCardIds.push(policyChoice);
      return {
        play: autoChoice.play,
        trace: {
          source: 'browser-dds',
          legalCandidates,
          policyChoice,
          safeCandidates: [],
          finalChoice: policyChoice,
          overridden: false,
          reason: 'runtime-unavailable'
        }
      };
    }

    const scoreByCard = new Map<CardId, number>();
    for (const candidate of dds.result.plays ?? []) {
      const cardId = normalizeDdsCardId(candidate.suit, candidate.rank);
      if (!cardId || typeof candidate.score !== 'number') continue;
      scoreByCard.set(cardId, candidate.score);
    }

    const scoredLegal = legalCandidates.filter((card) => scoreByCard.has(card));
    if (scoredLegal.length === 0) {
      playedCardIds.push(policyChoice);
      return {
        play: autoChoice.play,
        trace: {
          source: 'browser-dds',
          legalCandidates,
          policyChoice,
          safeCandidates: [],
          finalChoice: policyChoice,
          overridden: false,
          reason: 'no-safe-match'
        }
      };
    }

    const maxScore = Math.max(...scoredLegal.map((card) => scoreByCard.get(card) ?? Number.NEGATIVE_INFINITY));
    const safeCandidates = legalCandidates.filter((card) => (scoreByCard.get(card) ?? Number.NEGATIVE_INFINITY) === maxScore);
    const finalChoice = safeCandidates.includes(policyChoice) ? policyChoice : safeCandidates[0];
    const finalPlay = legalPlays.find((p) => (toCardId(p.suit, p.rank) as CardId) === finalChoice) ?? autoChoice.play;
    playedCardIds.push(finalChoice);
    return {
      play: finalPlay,
      trace: {
        source: 'browser-dds',
        legalCandidates,
        policyChoice,
        safeCandidates,
        finalChoice,
        overridden: finalChoice !== policyChoice,
        reason: 'applied'
      }
    };
  };
}

function hintGateStatus(): {
  allowed: boolean;
  phase: State['phase'];
  trickFrozen: boolean;
  canLeadDismiss: boolean;
  turn: Seat;
  userTurn: boolean;
  legalCount: number;
} {
  const userTurn = state.userControls.includes(state.turn);
  const legalCount = legalPlays(state).filter((p) => p.seat === state.turn).length;
  const allowed = state.phase !== 'end' && userTurn && (!trickFrozen || canLeadDismiss) && legalCount > 0;
  return {
    allowed,
    phase: state.phase,
    trickFrozen,
    canLeadDismiss,
    turn: state.turn,
    userTurn,
    legalCount
  };
}

function hintPositionKey(): string | null {
  const gate = hintGateStatus();
  if (!gate.allowed) return null;
  const trickKey = state.trick.map((p) => `${p.seat}${p.suit}${p.rank}`).join(',');
  const handsKey = seatOrder
    .map((seat) => `${seat}:${suitOrder.map((suit) => state.hands[seat][suit].join('')).join('/')}`)
    .join('|');
  return `${state.phase}|${state.turn}|${trickKey}|${handsKey}`;
}

function classifyHintForCurrentPosition(): HintState | null {
  const gate = hintGateStatus();
  hintDiag(
    `classify gate phase=${gate.phase} trickFrozen=${gate.trickFrozen} canLeadDismiss=${gate.canLeadDismiss} turn=${gate.turn} userTurn=${gate.userTurn} legal=${gate.legalCount} allowed=${gate.allowed}`
  );
  if (!gate.allowed) return null;
  const legal = legalPlays(state).filter((p) => p.seat === state.turn);
  const legalCardIds = legal.map((p) => toCardId(p.suit, p.rank) as CardId);
  hintDiag(`dds query start legal=${legalCardIds.join(' ') || '-'}`);
  try {
    const dds = queryDdsNextPlays({
      openingLeader: currentProblem.leader,
      initialHands: currentProblem.hands,
      contract: state.contract,
      playedCardIds: ddsPlayHistory
    });
    if (!dds.ok) {
      hintDiag(`dds query result ok=no reason=${dds.reason}${dds.detail ? ` detail=${dds.detail}` : ''}`);
      return {
        bestCards: [],
        badCards: [],
        textLine: 'BEST: (DDS unavailable)'
      };
    }
    hintDiag(`dds query result ok=yes plays=${dds.result.plays?.length ?? 0}`);
    const compactBrowserDds = (dds.result.plays ?? [])
      .map((p) => `${String(p.suit).toUpperCase()}${String(p.rank).toUpperCase()}:${typeof p.score === 'number' ? p.score : '-'}`)
      .join(' ');
    hintDiag(`browser DDS result ${compactBrowserDds || '-'}`);

    const scoreByCard = new Map<CardId, number>();
    const rawDdsCards: string[] = [];
    for (const play of dds.result.plays ?? []) {
      rawDdsCards.push(`${play.suit}${String(play.rank)}`);
      const baseCard = normalizeDdsCardId(play.suit, play.rank);
      if (baseCard && typeof play.score === 'number') scoreByCard.set(baseCard, play.score);

      const equalsRaw = Array.isArray(play.equals)
        ? play.equals
        : (typeof play.equals === 'string' ? [play.equals] : []);
      for (const eq of equalsRaw) {
        if (!eq) continue;
        const normalized = String(eq).toUpperCase();
        if (normalized.length === 1) {
          const eqCard = normalizeDdsCardId(play.suit, normalized);
          if (eqCard && typeof play.score === 'number') scoreByCard.set(eqCard, play.score);
          continue;
        }
        const suitRank = normalizeDdsCardId(normalized.slice(0, 1), normalized.slice(1));
        const rankSuit = normalizeDdsCardId(normalized.slice(-1), normalized.slice(0, -1));
        const eqCard = suitRank ?? rankSuit;
        if (eqCard && typeof play.score === 'number') scoreByCard.set(eqCard, play.score);
      }
    }

    let bestScore = Number.NEGATIVE_INFINITY;
    for (const cardId of legalCardIds) {
      const score = scoreByCard.get(cardId);
      if (typeof score === 'number' && score > bestScore) bestScore = score;
    }

    if (!Number.isFinite(bestScore)) {
      hintDiag(`dds mapping empty legal=${legalCardIds.join(' ') || '-'} dds=${rawDdsCards.join(' ') || '-'}`);
      return {
        bestCards: [],
        badCards: [],
        textLine: 'BEST: (DDS unavailable)'
      };
    }

    const bestCards: CardId[] = [];
    const badCards: CardId[] = [];
    for (const cardId of legalCardIds) {
      const score = scoreByCard.get(cardId);
      if (typeof score === 'number' && score === bestScore) bestCards.push(cardId);
      else badCards.push(cardId);
    }

    const textLine = `BEST: ${bestCards.join(' ')}`;
    hintDiag(`classify result BEST=${bestCards.join(' ') || '-'} BAD=${badCards.join(' ') || '-'}`);
    return { bestCards, badCards, textLine };
  } catch (error) {
    hintDiag(`classify exception ${error instanceof Error ? error.message : String(error)}`);
    return {
      bestCards: [],
      badCards: [],
      textLine: 'BEST: (DDS unavailable)'
    };
  }
}

function classifyDdErrorForUserPlay(
  play: Play,
  playedCardIds: string[]
): { ddError: boolean; goodCards: CardId[] } | undefined {
  const legal = legalPlays(state).filter((p) => p.seat === state.turn);
  if (legal.length === 0) return undefined;
  const chosen = toCardId(play.suit, play.rank) as CardId;
  const legalCardIds = legal.map((p) => toCardId(p.suit, p.rank) as CardId);
  try {
    const dds = queryDdsNextPlays({
      openingLeader: currentProblem.leader,
      initialHands: currentProblem.hands,
      contract: state.contract,
      playedCardIds
    });
    if (!dds.ok) return undefined;
    const scoreByCard = new Map<CardId, number>();
    for (const candidate of dds.result.plays ?? []) {
      const cardId = normalizeDdsCardId(candidate.suit, candidate.rank);
      if (!cardId || typeof candidate.score !== 'number') continue;
      scoreByCard.set(cardId, candidate.score);
    }
    const scoredLegal = legalCardIds.filter((card) => scoreByCard.has(card));
    if (scoredLegal.length === 0) return undefined;
    const maxScore = Math.max(...scoredLegal.map((card) => scoreByCard.get(card) ?? Number.NEGATIVE_INFINITY));
    const safeCards = legalCardIds.filter((card) => (scoreByCard.get(card) ?? Number.NEGATIVE_INFINITY) === maxScore);
    const chosenScore = scoreByCard.get(chosen);
    if (typeof chosenScore !== 'number') return undefined;
    return {
      ddError: chosenScore < maxScore,
      goodCards: safeCards.filter((card) => card !== chosen)
    };
  } catch {
    return undefined;
  }
}

function encodeUserHistoryForUrl(history: CardId[]): string {
  return history.map((card) => `${card[0]}${card.slice(1) === 'T' ? '10' : card.slice(1)}`).join('.');
}

function requestHint(): void {
  hintDiag('requestHint start');
  const reqSeq = ++hintRequestSeq;
  hintLoading = true;
  render();
  setTimeout(() => {
    if (reqSeq !== hintRequestSeq) return;
    const key = hintPositionKey();
    const hint = classifyHintForCurrentPosition();
    hintLoading = false;
    if (!hint) {
      hintDiag('classify null');
      activeHint = {
        bestCards: [],
        badCards: [],
        textLine: 'BEST: (hint available on your turn)'
      };
      widgetStatus = { type: 'hint', text: activeHint.textLine };
      hintDiag('activeHint set (fallback)');
      render();
      return;
    }
    hintDiag(`classify ok BEST=${hint.bestCards.join(' ') || '-'} BAD=${hint.badCards.join(' ') || '-'}`);
    activeHint = hint;
    activeHintKey = key;
    widgetStatus = { type: 'hint', text: hint.textLine };
    hintDiag(`activeHint set best=${hint.bestCards.join(' ')} bad=${hint.badCards.join(' ') || '-'}`);
    render();
  }, 0);
}

function syncAlwaysHint(): void {
  if (!alwaysHint) return;
  const noPlayYet = ddsPlayHistory.length === 0 && state.trick.length === 0 && !trickFrozen;
  if (noPlayYet) return;
  const key = hintPositionKey();
  if (!key) {
    if (activeHint) {
      clearHint();
      if (!renderingNow) render();
    }
    return;
  }
  if (activeHint && activeHintKey === key) return;
  const hint = classifyHintForCurrentPosition();
  if (!hint) return;
  activeHint = hint;
  activeHintKey = key;
  widgetStatus = { type: 'hint', text: hint.textLine };
  hintDiag(`always-hint updated BEST=${hint.bestCards.join(' ') || '-'} BAD=${hint.badCards.join(' ') || '-'}`);
  if (!renderingNow) render();
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

function rankColorClass(cardId: CardId, featureSource: Pick<State, 'cardRoles' | 'threat' | 'threatLabels'> = state): string {
  if (!cardColoringEnabled) return 'rank--black';
  const features = buildFeatureStateFromRuntime({
    threat: (featureSource.threat as ThreatContext | null) ?? null,
    threatLabels: featureSource.threatLabels,
    cardRoles: featureSource.cardRoles,
    goalStatus: state.goalStatus
  });
  const color = getRankColorForFeatureRole(features.cardRoleById[cardId] ?? 'default', teachingMode);
  return color === 'purple'
    ? 'rank--purple'
    : color === 'green'
      ? 'rank--green'
      : color === 'blue'
        ? 'rank--blue'
        : color === 'grey'
          ? 'rank--grey'
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

function canonicalRunStatusText(status: typeof runStatus): string {
  if (status === 'success') return 'Success - Goal Achieved';
  if (status === 'failure') return 'Not enough tricks - try again';
  return 'Run in Progress';
}

function applyPracticeDisplayDefaults(solutionMode: boolean): void {
  if (!practiceSession) return;
  if (solutionMode) {
    alwaysHint = true;
    narrate = true;
    cardColoringEnabled = true;
    autoplaySingletons = true;
    showWidgetTeachingPane = false;
    return;
  }
  alwaysHint = false;
  narrate = false;
  cardColoringEnabled = false;
  autoplaySingletons = true;
  showWidgetTeachingPane = false;
}

function beginPracticeRun(solutionMode: boolean): void {
  if (!practiceSession) return;
  practiceSession.solutionMode = solutionMode;
  practiceSession.isTerminal = false;
  practiceSession.terminalOutcome = null;
  practiceSession.currentUndoCount = 0;
  practiceSession.perPuzzleUndoCount[currentProblemId] = 0;
  practiceSession.scoredThisRun = false;
  practiceClaimDebug = null;
  clearWidgetMessage();
  applyPracticeDisplayDefaults(solutionMode);
}

function onPracticeTerminal(outcome: 'success' | 'failure'): void {
  if (!practiceSession) return;
  practiceSession.isTerminal = true;
  practiceSession.terminalOutcome = outcome;
  if (practiceSession.scoredThisRun) return;
  practiceSession.scoredThisRun = true;
  if (practiceSession.solutionMode) return;
  practiceSession.attempted += 1;
  if (outcome === 'success') {
    practiceSession.solved += 1;
    if (practiceSession.currentUndoCount === 0) practiceSession.perfect += 1;
  }
}

function incrementPracticeUndoUsage(): void {
  if (!practiceSession) return;
  practiceSession.currentUndoCount += 1;
  practiceSession.perPuzzleUndoCount[currentProblemId] = practiceSession.currentUndoCount;
}

function practiceGoalSummary(view: State): string {
  if (view.goal.type === 'minTricks') return `take ${view.goal.n}`;
  return formatGoal(view);
}

function goToNextPracticePuzzle(): void {
  if (!practiceSession || practiceSession.queue.length === 0) return;
  practiceSession.queueIndex = (practiceSession.queueIndex + 1) % practiceSession.queue.length;
  const nextId = practiceSession.queue[practiceSession.queueIndex];
  beginPracticeRun(false);
  selectProblem(nextId);
}

function remainingTricksFromState(s: State): number {
  return Math.floor(
    (totalCards(s, 'N') + totalCards(s, 'E') + totalCards(s, 'S') + totalCards(s, 'W')) / 4
  );
}

function tricksNeededForGoalNow(s: State): number | null {
  if (s.goal.type !== 'minTricks') return null;
  const won = s.goal.side === 'NS' ? s.tricksWon.NS : s.tricksWon.EW;
  return Math.max(0, s.goal.n - won);
}

function countReachableUserWinnerCards(s: State): number {
  const cards = new Set<CardId>();
  for (const seat of s.userControls) {
    for (const suit of suitOrder) {
      for (const rank of s.hands[seat][suit]) {
        const cardId = toCardId(suit, rank) as CardId;
        const role = s.cardRoles[cardId];
        if (role === 'strandedThreat') continue;
        if (role === 'winner' || role === 'promotedWinner') cards.add(cardId);
      }
    }
  }
  return cards.size;
}

function attemptClaim(): void {
  if (!practiceSession || practiceSession.solutionMode) return;
  clearHint();
  clearWidgetMessage();
  const userSideOnLead = state.userControls.includes(state.turn);
  const onLead = state.trick.length === 0 && userSideOnLead;
  const remainingTricks = remainingTricksFromState(state);
  const tricksNeeded = tricksNeededForGoalNow(state);
  const needsAllRemaining = tricksNeeded !== null && tricksNeeded === remainingTricks;
  const baseDebug = {
    onLead,
    needAllRemainingTricks: needsAllRemaining,
    tricksRemaining: remainingTricks,
    tricksStillNeeded: tricksNeeded,
    leaderSeat: state.turn,
    userSideOnLead,
    puzzleId: currentProblemId,
    strain: state.contract.strain,
    nsTricks: state.tricksWon.NS,
    ewTricks: state.tricksWon.EW,
    runStatus,
    terminal: runStatus === 'success' || runStatus === 'failure',
    solutionMode: practiceSession.solutionMode
  } as const;
  if (!onLead || !needsAllRemaining) {
    const message = 'Claim is only available on lead for the remaining tricks';
    widgetStatus = { type: 'message', text: message };
    practiceClaimDebug = {
      ...baseDebug,
      claimDecision: 'rejected-practice',
      claimMessage: message,
      reachableWinnerCount: null,
      claimBridgeValid: null
    };
    render();
    return;
  }
  const reachableWinners = countReachableUserWinnerCards(state);
  if (reachableWinners >= remainingTricks) {
    const message = 'Success - Goal Achieved';
    state.phase = 'end';
    runStatus = 'success';
    onPracticeTerminal('success');
    practiceClaimDebug = {
      ...baseDebug,
      claimDecision: 'accepted',
      claimMessage: message,
      reachableWinnerCount: reachableWinners,
      claimBridgeValid: true
    };
    render();
    return;
  }
  incrementPracticeUndoUsage();
  const message = "You can't claim yet — keep playing";
  widgetStatus = { type: 'message', text: message };
  practiceClaimDebug = {
    ...baseDebug,
    claimDecision: 'rejected-bridge',
    claimMessage: message,
    reachableWinnerCount: reachableWinners,
    claimBridgeValid: false
  };
  render();
}

function renderPracticeClaimDebugPanel(): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'practice-claim-debug';
  const title = document.createElement('strong');
  title.textContent = 'Claim Debug';
  panel.appendChild(title);

  const body = document.createElement('pre');
  body.className = 'practice-claim-debug-body';
  if (!practiceClaimDebug) {
    body.textContent = 'No claim evaluation yet.';
  } else {
    body.textContent = [
      `decision: ${practiceClaimDebug.claimDecision}`,
      `message: ${practiceClaimDebug.claimMessage}`,
      `onLead: ${practiceClaimDebug.onLead}`,
      `needAllRemainingTricks: ${practiceClaimDebug.needAllRemainingTricks}`,
      `tricksRemaining: ${practiceClaimDebug.tricksRemaining}`,
      `tricksStillNeeded: ${practiceClaimDebug.tricksStillNeeded ?? 'null'}`,
      `leaderSeat: ${practiceClaimDebug.leaderSeat}`,
      `userSideOnLead: ${practiceClaimDebug.userSideOnLead}`,
      `reachableWinnerCount: ${practiceClaimDebug.reachableWinnerCount ?? 'null'}`,
      `claimBridgeValid: ${practiceClaimDebug.claimBridgeValid ?? 'null'}`,
      `puzzleId: ${practiceClaimDebug.puzzleId}`,
      `strain: ${practiceClaimDebug.strain}`,
      `nsTricks: ${practiceClaimDebug.nsTricks}`,
      `ewTricks: ${practiceClaimDebug.ewTricks}`,
      `runStatus: ${practiceClaimDebug.runStatus}`,
      `terminal: ${practiceClaimDebug.terminal}`,
      `solutionMode: ${practiceClaimDebug.solutionMode}`
    ].join('\n');
  }
  panel.appendChild(body);
  return panel;
}

function withDdSource(problem: ProblemWithThreats): ProblemWithThreats {
  const policies: Partial<Record<Seat, Policy>> = {};
  for (const seat of seatOrder) {
    const policy = problem.policies[seat];
    if (!policy) continue;
    const source = policy.ddSource ?? (policy.kind === 'threatAware' ? ddSourceMode : 'off');
    policies[seat] = { ...policy, ddSource: source };
  }
  return { ...problem, policies };
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
    replaySuppressedForRun,
    teachingEvents: teachingEvents.map((e) => ({ ...e })),
    nextTeachingEventId,
    ddsPlayHistory: [...ddsPlayHistory],
    ddsTeachingSummaries: [...ddsTeachingSummaries],
    ddErrorVisual: ddErrorVisual ? { ...ddErrorVisual, goodCards: [...ddErrorVisual.goodCards] } : null,
    userPlayHistory: [...userPlayHistory]
  };
}

function restoreSnapshot(snapshot: GameSnapshot): void {
  state = cloneStateForLog(snapshot.state);
  currentProblemId = snapshot.currentProblemId;
  currentProblem = resolveDemoProblem(demoProblems.find((p) => p.id === currentProblemId) ?? demoProblems[0]);
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
  teachingEvents = snapshot.teachingEvents.map((e) => ({ ...e }));
  nextTeachingEventId = snapshot.nextTeachingEventId;
  ddsPlayHistory = [...snapshot.ddsPlayHistory];
  ddsTeachingSummaries = [...snapshot.ddsTeachingSummaries];
  ddErrorVisual = snapshot.ddErrorVisual ? { ...snapshot.ddErrorVisual, goodCards: [...snapshot.ddErrorVisual.goodCards] } : null;
  userPlayHistory = [...snapshot.userPlayHistory];
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
  if ((chosenBucket.startsWith('tier3') || chosenBucket.startsWith('tier4')) && busyBranching !== 'strict') {
    const level = chosenBucket.startsWith('tier3') ? '3' : '4';
    const orderedKeys =
      busyBranching === 'sameLevel'
        ? ([`tier${level}a`, `tier${level}b`] as const)
        : (['tier3a', 'tier3b', 'tier4a', 'tier4b'] as const);
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
    if (chosenBucket === 'tier2') return `semiIdle:${card[0]}`;
    if (chosenBucket.startsWith('tier3') || chosenBucket.startsWith('tier4')) return `busy:${card[0]}`;
    if (chosenBucket === 'tier5') return `other:${card[0]}`;
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
  const order = ['tier1a', 'tier1b', 'tier2', 'tier3a', 'tier3b', 'tier4a', 'tier4b', 'tier5', 'follow:below', 'follow:above', 'follow:baseline', 'lead:none', 'legal', 'preferred'];
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
      ['tier2', tiers.tier2],
      ['tier3a', tiers.tier3a],
      ['tier3b', tiers.tier3b],
      ['tier4a', tiers.tier4a],
      ['tier4b', tiers.tier4b],
      ['tier5', tiers.tier5]
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
      else if (tier === 'tier2') eqClass = `semiIdle:${card[0]}`;
      else if (tier.startsWith('tier3') || tier.startsWith('tier4')) eqClass = `busy:${card[0]}`;
      else if (tier === 'tier5') eqClass = `other:${card[0]}`;
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
  const tierOrder = ['tier3a', 'tier3b', 'tier4a', 'tier4b'];

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
      const prefix = stopStatus === 'double' ? '3' : '4';
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
  const tierOrder = ['tier3a', 'tier3b', 'tier4a', 'tier4b'];
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
    const prefix = stopStatus === 'double' ? '3' : '4';
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

function cardStatusSnapshot(
  s: State,
  ctx: ThreatContext | null,
  labels: DefenderLabels | null
): Map<CardId, { color: 'green' | 'blue' | 'purple' | 'black' | 'grey'; role: string; seat: Seat }> {
  void ctx;
  void labels;
  const snap = new Map<CardId, { color: 'green' | 'blue' | 'purple' | 'black' | 'grey'; role: string; seat: Seat }>();
  const features = buildFeatureStateFromRuntime({
    threat: (s.threat as ThreatContext | null) ?? null,
    threatLabels: s.threatLabels,
    cardRoles: s.cardRoles,
    goalStatus: s.goalStatus
  });
  for (const seat of seatOrder) {
    for (const suit of suitOrder) {
      for (const rank of s.hands[seat][suit]) {
        const cardId = toCardId(suit, rank) as CardId;
        const color = getRankColorForFeatureRole(features.cardRoleById[cardId] ?? 'default', teachingMode);
        const role = s.cardRoles[cardId] ?? 'default';
        snap.set(cardId, { color, role, seat });
      }
    }
  }
  return snap;
}

function maybeEmitTeachingRecolorEvents(
  triggerCardId: CardId,
  beforeSnap: Map<CardId, { color: 'green' | 'blue' | 'purple' | 'black' | 'grey'; role: string; seat: Seat }>,
  afterSnap: Map<CardId, { color: 'green' | 'blue' | 'purple' | 'black' | 'grey'; role: string; seat: Seat }>
): void {
  const changes: string[] = [];
  const prettyCard = (cardId: CardId): string => `${cardId[0]}${displayRank(cardId.slice(1) as Rank)}`;
  for (const [cardId, before] of beforeSnap.entries()) {
    const after = afterSnap.get(cardId);
    if (!after) continue;
    if (before.color === after.color && before.role === after.role) continue;
    if (before.color !== after.color) {
      markCardPulse(before.seat, cardId);
    }
    if (after.role === 'idle' && before.role !== 'idle') {
      changes.push(`${prettyCard(cardId)} idle`);
      continue;
    }
    if (after.role === 'promotedWinner' && before.role !== 'promotedWinner') {
      changes.push(`${prettyCard(cardId)} promoted`);
      continue;
    }
    if (after.role === 'busy' && before.role !== 'busy') {
      changes.push(`${prettyCard(cardId)} busy`);
    }
  }
  if (changes.length === 0) return;
  const shown = changes.slice(0, 6);
  const extra = changes.length - shown.length;
  addTeachingEvent({
    kind: 'recolor',
    label: `${prettyCard(triggerCardId)} -> ${shown.join(', ')}${extra > 0 ? ` (+${extra} more)` : ''}`
  });
}

function collectTeachingRecolorEventsForTurn(
  before: State,
  events: EngineEvent[]
): void {
  const shadow = cloneStateForLog(before);
  for (const event of events) {
    if (event.type === 'played' || event.type === 'autoplay') {
      const beforeSnap = cardStatusSnapshot(
        shadow,
        (shadow.threat as ThreatContext | null) ?? null,
        (shadow.threatLabels as DefenderLabels | null) ?? null
      );
      applyEventToShadow(shadow, event);
      const afterSnap = cardStatusSnapshot(
        shadow,
        (shadow.threat as ThreatContext | null) ?? null,
        (shadow.threatLabels as DefenderLabels | null) ?? null
      );
      const triggerCardId = toCardId(event.play.suit, event.play.rank) as CardId;
      maybeEmitTeachingRecolorEvents(triggerCardId, beforeSnap, afterSnap);
      continue;
    }
    applyEventToShadow(shadow, event);
  }
}

function addInitialThreatTeachingSummary(s: State): void {
  const ctx = s.threat as ThreatContext | null;
  const labels = s.threatLabels as DefenderLabels | null;
  if (!ctx || !labels) {
    addTeachingEvent({ kind: 'info', at: 'Start', label: 'No teaching events yet.' });
    return;
  }
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const lines: string[] = [];
  for (const suit of suits) {
    const threat = ctx.threatsBySuit[suit];
    if (!threat) continue;
    const owner = seatName[threat.establishedOwner];
    const card = `${suitSymbol[suit]}${displayRank(threat.threatRank)}`;
    const busyE = [...labels.E.busy].some((id) => id[0] === suit);
    const busyW = [...labels.W.busy].some((id) => id[0] === suit);
    let stopText = 'unstopped';
    if (busyE && busyW) stopText = 'stopped by both';
    else if (busyW) stopText = 'stopped by West only';
    else if (busyE) stopText = 'stopped by East only';
    lines.push(`${owner} has ${card}, ${stopText}.`);
  }
  if (lines.length === 0) {
    addTeachingEvent({ kind: 'info', at: 'Start', label: 'No teaching events yet.' });
    return;
  }
  addTeachingEvent({
    kind: 'threatSummary',
    at: 'Start',
    label: 'Threats:',
    detail: lines.join('\n')
  });
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
        toCardId(event.play.suit, event.play.rank) as CardId,
        {
          trick: s.trick,
          trumpSuit: s.trumpSuit,
          goal: s.goal,
          tricksWon: s.tricksWon,
          goalStatus: s.goalStatus
        }
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

function logLinesForStep(before: State, attemptedPlay: Play, events: EngineEvent[], after: State, ddsHistory: string[]): string[] {
  const lines: string[] = [];
  const shadow = cloneStateForLog(before);

  for (const event of events) {
    if (event.type === 'played' || event.type === 'autoplay') {
      const dds = queryDdsNextPlays({
        openingLeader: currentProblem.leader,
        initialHands: currentProblem.hands,
        contract: currentProblem.contract,
        playedCardIds: ddsHistory
      });
      if (dds.ok) {
        const compact = (dds.result.plays ?? []).map((p) => `${typeof p.score === 'number' ? p.score : '-'}: ${p.suit}${p.rank}`);
        ddsTeachingSummaries.push(`DDS: ${compact.join(' ')}`.trim());
      } else {
        ddsTeachingSummaries.push(`DDS: unavailable (${dds.reason}${dds.detail ? `: ${dds.detail}` : ''})`);
      }

      if (verboseLog) {
        const trickNo = shadow.tricksWon.NS + shadow.tricksWon.EW + 1;
        const seat = event.play.seat;
        if (dds.ok) {
          lines.push(`[DDS] trick=${trickNo} seat=${seat}`);
          for (const p of dds.result.plays ?? []) {
            const score = typeof p.score === 'number' ? p.score : '-';
            lines.push(`${score}: ${p.suit}${p.rank}`);
          }
        } else {
          lines.push(`[DDS] trick=${trickNo} seat=${seat} unavailable: ${dds.reason}${dds.detail ? ` (${dds.detail})` : ''}`);
        }
      }
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
      if (event.browserDdBackstop) {
        lines.push(
          `[DDS-BACKSTOP] legal={${event.browserDdBackstop.legalCandidates.join(',') || '-'}} policy=${event.browserDdBackstop.policyChoice} safe={${event.browserDdBackstop.safeCandidates.join(',') || '-'}} final=${event.browserDdBackstop.finalChoice} override=${event.browserDdBackstop.overridden ? 'yes' : 'no'} reason=${event.browserDdBackstop.reason}`
        );
      }
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
      if (event.ddPolicy) {
        if (event.ddPolicy.bound) {
          lines.push(
            `[DD-POLICY] source=${event.ddPolicy.source} problem=${event.ddPolicy.problemId} bound=yes path=${event.ddPolicy.path} base={${event.ddPolicy.baseCandidates.join(',') || '-'}} allowed={${event.ddPolicy.allowedCandidates.join(',') || '-'}}`
          );
        } else if (event.ddPolicy.fallback) {
          lines.push(
            `[DD-POLICY] source=${event.ddPolicy.source} problem=${event.ddPolicy.problemId} bound=no path=${event.ddPolicy.path} base={${event.ddPolicy.baseCandidates.join(',') || '-'}} optimal={${event.ddPolicy.allowedCandidates.join(',') || '-'}} fallback=base`
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
          ['t2', tiers.tier2.length],
          ['t3a', tiers.tier3a.length],
          ['t3b', tiers.tier3b.length],
          ['t4a', tiers.tier4a.length],
          ['t4b', tiers.tier4b.length]
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
              tier2: tiers.tier2,
              tier3a: tiers.tier3a,
              tier3b: tiers.tier3b,
              tier4a: tiers.tier4a,
              tier4b: tiers.tier4b,
              tier5: tiers.tier5,
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

    if (event.type === 'played' || event.type === 'autoplay') {
      ddsHistory.push(toCardId(event.play.suit, event.play.rank));
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
      const nodeKey = currentRunEqTokens.join(' > ');
      if (verboseLog) {
        logs = [
          ...logs,
          withRunVisit(
            nodeKey || '-',
            `[INV_EQ:atDecision] idx=${currentRunTranscript.length} seat=${event.play.seat} nodeKey=${nodeKey || '-'} invEq=${formatDefenderInventoryEqSeat(shadow, event.play.seat)}`
          )
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
        if (eqRec.bucket === 'tier2') return `semiIdle:${card[0]}`;
        if (eqRec.bucket.startsWith('tier3') || eqRec.bucket.startsWith('tier4')) return `busy:${card[0]}`;
        if (eqRec.bucket === 'tier5') return `other:${card[0]}`;
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
          const availClasses = eqRec.classes;
          const invEqIdleSet = new Set(sourceRec.invEqIdleClasses);
          const branchableAvail = availClasses.filter((cls) => !cls.startsWith('idle') && !invEqIdleSet.has(cls));
          const replayReason = runtimeRemainingReason ?? (runtimeRemainingForLog && runtimeRemainingForLog.length > 0 ? 'ok' : 'singleton');
          logs = [
            ...logs,
            withRunVisit(
              sourceRec.nodeKey || '-',
              `[EQC:replay] idx=${event.replay.index} recordedRemaining=${sourceRec.sameBucketAlternativeClassIds.join(',') || '-'} runtimeRemaining=${runtimeText}`
            ),
            withRunVisit(
              sourceRec.nodeKey || '-',
              `[EQC:replayRemaining] idx=${event.replay.index} seat=${event.play.seat} nodeKey=${sourceRec.nodeKey || '-'} policyScope=${busyBranching} availClasses={${availClasses.join(',') || '-'}} branchableAvail={${branchableAvail.join(',') || '-'}} chosenClass=${chosenAltClassId} computedRemaining={${runtimeRemainingForLog?.join(',') || '-'}} reason=${replayReason}`
            )
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
          withRunVisit(
            nodeKey || '-',
            `[EQC] idx=${currentRunTranscript.length} seat=${event.play.seat} nodeKey=${nodeKey || '-'} scope=${busyBranching} bucket=${eqRec.bucket} classes=${classOrder.join(',') || '-'} chosen=${chosenAltClassId} covers=${coveredCards.join(',') || '-'} remaining=${remainingClasses.join(',') || '-'} invEqVersion=${invEqVersion}`
          )
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
        nodeKey,
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

function formatGoalStatus(s: State): string {
  if (s.goalStatus === 'assuredSuccess') return 'Assured success';
  if (s.goalStatus === 'assuredFailure') return 'Assured failure';
  return 'Live';
}

function handsAreEmpty(s: State): boolean {
  return seatOrder.every((seat) => suitOrder.every((suit) => s.hands[seat][suit].length === 0));
}

function currentViewState(): State {
  return trickFrozen && frozenViewState ? frozenViewState : state;
}

function unfreezeTrick(flushDeferredLogs: boolean): void {
  trickFrozen = false;
  lastCompletedTrick = null;
  frozenViewState = null;
  canLeadDismiss = false;
  // Clear active trick-scoped narration surfaces when the trick is dismissed.
  clearNarration();
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
      withRunVisit(
        rec.nodeKey || '-',
        `[PLAYAGAIN] candCheck idx=${rec.index} seat=${rec.seat} nodeKey=${rec.nodeKey || '-'} avail={${avail.join(',') || '-'}} invEqIdle={${invEqIdle.join(',') || '-'}} -> branchableAvail={${branchableAvail.join(',') || '-'}} branchable=${branchable} reason=${branchable ? reason : 'idleFiltered'}`
      )
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
  if (clearLogs) {
    semanticCollector.clear();
    semanticReducer.reset();
  }
  const rawThreats = getThreatCardIds(currentProblem as ProblemWithThreats);

  threatCtx = (state.threat as ThreatContext | null) ?? null;
  threatLabels = (state.threatLabels as DefenderLabels | null) ?? null;
  if (clearLogs) clearTeachingEvents();
  if (rawThreats.length === 0) {
    if (teachingEvents.length === 0) addTeachingEvent({ kind: 'info', at: 'Start', label: 'No teaching events yet.' });
    return;
  }
  if (!teachingEvents.some((e) => e.kind === 'threatSummary')) {
    addInitialThreatTeachingSummary(state);
  }

  if (verboseLog) {
    if (!skipNextThreatInitRunIncrement) startNewLogRun();
    skipNextThreatInitRunIncrement = false;
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
  clearPulseTimer();
  pulseUntilByCardKey.clear();
  const nextSeed = seed >>> 0;
  if (nextSeed !== (currentSeed >>> 0)) {
    replayCoverage.triedByIdx.clear();
    replayCoverage.recordedRemainingByIdx.clear();
    replayCoverage.representativeByIdx.clear();
  }
  currentSeed = nextSeed;
  state = init({ ...withDdSource(currentProblem), rngSeed: currentSeed });
  resetSemanticStreams();
  teachingReducer.setTrumpSuit(state.trumpSuit);
  warmDdDataset(currentProblemId);
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
  userPlayHistory = [];
  ddsPlayHistory = [];
  ddsTeachingSummaries = [];
  clearDdErrorVisual();
  clearWidgetNarrationFeed();
  clearHint();
  clearTeachingEvents();
  if (practiceSession) beginPracticeRun(practiceSession.solutionMode);
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
  clearPulseTimer();
  pulseUntilByCardKey.clear();
  const entry = demoProblems.find((p) => p.id === problemId);
  if (!entry) return;
  currentProblem = resolveDemoProblem(entry);
  currentProblemId = entry.id;
  currentSeed = currentProblem.rngSeed >>> 0;
  state = init({ ...withDdSource(currentProblem), rngSeed: currentSeed });
  resetSemanticStreams();
  teachingReducer.setTrumpSuit(state.trumpSuit);
  warmDdDataset(currentProblemId);
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
  userPlayHistory = [];
  ddsPlayHistory = [];
  ddsTeachingSummaries = [];
  clearDdErrorVisual();
  clearWidgetNarrationFeed();
  clearHint();
  clearTeachingEvents();
  if (practiceSession) beginPracticeRun(practiceSession.solutionMode);
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
  incrementPracticeUndoUsage();
  clearHint();
  clearWidgetMessage();
  restoreSnapshot(snapshot);
  clearPulseTimer();
  pulseUntilByCardKey.clear();
  logs = [...logs, `[UNDO] restored snapshot before user play: ${snapshot.play.seat}:${toCardId(snapshot.play.suit, snapshot.play.rank)}`].slice(-500);
  render();
}

function runTurn(play: Play): void {
  if (ddErrorVisual && !trickFrozen && state.turn === ddErrorVisual.seat) {
    clearDdErrorVisual();
  }
  clearSingletonAutoplayTimer();
  clearHint();
  clearWidgetMessage();
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
    userPlayHistory.push(playId);
  }
  undoStack.push(makeSnapshot(play));
  if (trickFrozen) {
    unfreezeTrick(true);
  }

  const before = state;
  const ddsHistoryForTurn = [...ddsPlayHistory];
  const backstopHistoryForTurn = [...ddsHistoryForTurn, `${play.suit}${play.rank}`];
  const userDdError = (play.seat === 'N' || play.seat === 'S')
    ? classifyDdErrorForUserPlay(play, ddsHistoryForTurn)
    : undefined;
  if (play.seat === 'N' || play.seat === 'S') {
    if (userDdError?.ddError) {
      ddErrorVisual = {
        seat: play.seat,
        goodCards: [...userDdError.goodCards],
        badCard: toCardId(play.suit, play.rank) as CardId
      };
    } else {
      clearDdErrorVisual();
    }
  }
  const result = apply(state, play, {
    eventCollector: semanticCollector,
    userDdError: userDdError?.ddError,
    autoplayBackstop: buildBrowserDdsBackstop(backstopHistoryForTurn)
  });
  state = result.state;
  threatCtx = (state.threat as ThreatContext | null) ?? null;
  threatLabels = (state.threatLabels as DefenderLabels | null) ?? null;
  collectTeachingRecolorEventsForTurn(before, result.events);

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

    const visibleLines = logLinesForStep(before, play, visibleEvents, visibleShadow, ddsHistoryForTurn);
    logs = [...logs, ...visibleLines].slice(-500);

    if (deferredEvents.length > 0) {
      const deferredLines = logLinesForStep(visibleShadow, play, deferredEvents, state, ddsHistoryForTurn);
      deferredLogLines = [...deferredLogLines, ...deferredLines].slice(-500);
    }
  } else {
    const lines = logLinesForStep(before, play, result.events, state, ddsHistoryForTurn);
    logs = [...logs, ...lines].slice(-500);
  }
  ddsPlayHistory = ddsHistoryForTurn;

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
          return withRun(
            `[PLAYAGAIN] offer available=true candidates=[${candidates.map((c) => c.index).join(',')}] chosenCandidate=${offered.index} forcedClass=${offeredClass} forcedCard=${offeredCard} reason=endOfRunSuccess`
          );
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
        `[GOAL] endOfRun=true goalStatus=${state.goalStatus} NSwon=${complete.tricksWon.NS} EWwon=${complete.tricksWon.EW} required${state.goal.side}>=${state.goal.n} success=${complete.success}`,
        `[RUNSTATUS] ${runStatus} -> ${nextStatus}`
      ].slice(-500);
    }
    runStatus = nextStatus;
    if (practiceSession) onPracticeTerminal(nextStatus);
  }

  render();
}

function renderDebugPanel(): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'debug-panel debug-subsection';

  const title = document.createElement('strong');
  title.textContent = 'Semantic reducer (raw)';
  panel.appendChild(title);

  const body = document.createElement('pre');
  body.className = 'debug-json';
  body.textContent = JSON.stringify(rawSemanticReducer.snapshot(), null, 2);
  panel.appendChild(body);
  return panel;
}

function renderDebugControls(): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'debug-controls debug-subsection';

  const title = document.createElement('strong');
  title.textContent = 'Admin/debug controls';
  panel.appendChild(title);

  const row = document.createElement('div');
  row.className = 'debug-controls-row';

  const guidesLabel = document.createElement('label');
  const guidesBox = document.createElement('input');
  guidesBox.type = 'checkbox';
  guidesBox.checked = showGuides;
  guidesBox.onchange = () => {
    showGuides = guidesBox.checked;
    render();
  };
  guidesLabel.append(guidesBox, ' Show boxes');
  row.appendChild(guidesLabel);

  const showLogLabel = document.createElement('label');
  const showLogBox = document.createElement('input');
  showLogBox.type = 'checkbox';
  showLogBox.checked = showLog;
  showLogBox.onchange = () => {
    showLog = showLogBox.checked;
    render();
  };
  showLogLabel.append(showLogBox, ' Show log');
  row.appendChild(showLogLabel);

  const verboseLabel = document.createElement('label');
  const verboseBox = document.createElement('input');
  verboseBox.type = 'checkbox';
  verboseBox.checked = verboseLog;
  verboseBox.onchange = () => {
    verboseLog = verboseBox.checked;
    render();
  };
  verboseLabel.append(verboseBox, ' Verbose log');
  row.appendChild(verboseLabel);

  const variationsLabel = document.createElement('label');
  variationsLabel.textContent = 'Variations: ';
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
  variationsLabel.appendChild(variationsSelect);
  row.appendChild(variationsLabel);

  const ddLabel = document.createElement('label');
  ddLabel.textContent = 'DD source: ';
  const ddSelect = document.createElement('select');
  (['off', 'runtime'] as const).forEach((source) => {
    const option = document.createElement('option');
    option.value = source;
    option.textContent = ddSourceLabel[source];
    if (source === ddSourceMode) option.selected = true;
    ddSelect.appendChild(option);
  });
  ddSelect.onchange = () => {
    const nextSource = ddSelect.value as 'off' | 'runtime';
    if (nextSource === ddSourceMode) return;
    ddSourceMode = nextSource;
    resetGame(currentSeed, `DD source changed: ${ddSourceLabel[nextSource]}`);
    if (nextSource === 'runtime') warmDdDataset(currentProblemId);
  };
  ddLabel.appendChild(ddSelect);
  row.appendChild(ddLabel);

  panel.appendChild(row);
  return panel;
}

function renderDebugSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'debug-section';
  section.appendChild(renderDebugControls());
  section.appendChild(renderDebugPanel());

  if (showLog) {
    const panel = document.createElement('section');
    panel.className = 'log-panel debug-subsection';

    const title = document.createElement('strong');
    title.textContent = 'Log';
    panel.appendChild(title);

    const log = document.createElement('div');
    log.className = 'log';
    log.textContent = logs.length > 0 ? logs.join('\n') : 'No events yet';
    panel.appendChild(log);
    section.appendChild(panel);
    log.scrollTop = log.scrollHeight;
  }
  return section;
}

function startPlayAgain(source: 'manual' | 'autoplay' = 'autoplay'): void {
  clearSingletonAutoplayTimer();
  clearWidgetNarrationFeed();
  clearHint();
  clearDdErrorVisual();
  if (practiceSession) beginPracticeRun(false);
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
    withRun(`[PLAYAGAIN] candidates=[${candidates.map((c) => c.index).join(',')}] cutoffIdx=${replayMismatchCutoffIdx ?? '-'}`),
    ...candidates.map((c) => `[PLAYAGAIN] idx=${c.index} remainingUntried=${c.remainingKeys.length} keys=${c.remainingKeys.join(',')}`)
  ].slice(-500);
  if (playAgainAvailable) {
    const offered = candidates[candidates.length - 1];
    const offeredClass = offered.remainingKeys[0] ?? '-';
    const offeredCard = replayCoverage.representativeByIdx.get(offered.index)?.get(offeredClass) ?? '-';
    logs = [
      ...logs,
      withRun(`[PLAYAGAIN] offer shown candidates=[${candidates.map((c) => c.index).join(',')}] reason=${source === 'manual' ? 'manualRequest' : 'other'}`),
      withRun(`[PLAYAGAIN] offer available=true candidates=[${candidates.map((c) => c.index).join(',')}] chosenCandidate=${offered.index} forcedClass=${offeredClass} forcedCard=${offeredCard} reason=${source === 'manual' ? 'manualRequest' : 'other'}`)
    ].slice(-500);
  }
  if (!playAgainAvailable) {
    logs = [...logs, `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`].slice(-500);
    render();
    return;
  }

  const seed = lastSuccessfulTranscript?.seed ?? currentSeed;
  state = init({ ...currentProblem, rngSeed: seed });
  resetSemanticStreams();
  teachingReducer.setTrumpSuit(state.trumpSuit);
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
  startNewLogRun();
  skipNextThreatInitRunIncrement = true;
  // Offer indicates replay is possible; selected indicates replay is actually starting.
  logs = [
    ...logs,
    withRun(`[PLAYAGAIN] offer selected chosenCandidate=${divergenceIndex} divergenceIdx=${divergenceIndex} forcedClass=${forcedClass} forcedCard=${forcedCard ?? '-'} source=${source === 'manual' ? 'uiClick' : 'other'}`),
    withRun(`[PLAYAGAIN] ${source === 'manual' ? 'manual' : 'autoplay'} selected=true source=${source === 'manual' ? 'uiClick' : 'other'} -> starting replay divergenceIdx=${divergenceIndex} forcedClass=${forcedClass} forcedCard=${forcedCard ?? '-'}`)
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
  userPlayHistory = [];
  clearTeachingEvents();
  rebuildUserEqClassMapping(state);
  resetDefenderEqInitSnapshot();
  deferredLogLines = [];
  unfreezeTrick(false);
  const replayNodeLines: string[] = [withRun('[PLAYAGAIN] replayStart candidates summary:')];
  for (const rec of lastSuccessfulTranscript.decisions) {
    const avail = [rec.chosenAltClassId ?? rec.chosenClassId, ...rec.sameBucketAlternativeClassIds]
      .filter((v, i, arr) => !!v && arr.indexOf(v) === i);
    const branchableAvail = avail.filter((cls) => !isIdleClassByRecord(rec, cls));
    if (branchableAvail.length < 2) continue;
    const forcing = rec.index === divergenceIndex ? ` FORCING=${forcedClass}` : '';
    replayNodeLines.push(
      withRunVisit(
        rec.nodeKey || '-',
        `[PLAYAGAIN] idx=${rec.index} seat=${rec.seat} nodeKey=${rec.nodeKey || '-'} avail={${avail.join(',')}} branchableAvail={${branchableAvail.join(',')}} chosen=${rec.chosenAltClassId} remaining={${rec.sameBucketAlternativeClassIds.filter((cls) => !isIdleClassByRecord(rec, cls)).join(',') || '-'}}${forcing}`
      )
    );
  }
  logs = [
    ...logs,
    withRun(`[PLAYAGAIN] replayStart plan divergenceIdx=${divergenceIndex} forcedClass=${forcedClass} forcedCard=${forcedCard ?? '-'} source=${source}`),
    ...replayNodeLines,
    withRun(`===== PLAY AGAIN REPLAY ===== divergenceIdx=${divergenceIndex} forced=${forcedCard ?? '-'} forcedClass=${forcedClass}`),
    withRun('[PLAYAGAIN] replay enabled'),
    ''
  ].slice(-500);
  refreshThreatModel(currentProblemId, false);
  clearWidgetNarrationFeed();
  render();
}

function renderSuitRow(
  view: State,
  seat: Seat,
  suit: Suit,
  legalSet: Set<string>,
  canAct: boolean,
  hintBestSet: Set<CardId>,
  ddErrorGoodSet: Set<CardId>
): HTMLDivElement {
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
        const cardId = toCardId(suit, rank) as CardId;
        if (hintBestSet.has(cardId)) rankBtn.classList.add('hint-best');
        if (ddErrorGoodSet.has(cardId)) rankBtn.classList.add('dd-error-good');
        if ((pulseUntilByCardKey.get(cardPulseKey(seat, cardId)) ?? 0) > Date.now()) {
          rankBtn.classList.add('card-pulse');
        }
        appendRankContent(rankBtn, rank, rankColorClass(cardId, view), isEquivalent);
        rankBtn.onclick = () => runTurn({ seat, suit, rank });
        cards.appendChild(rankBtn);
      } else {
        const rankEl = document.createElement('span');
        rankEl.className = 'rank-text muted';
        const cardId = toCardId(suit, rank) as CardId;
        if (ddErrorGoodSet.has(cardId)) rankEl.classList.add('dd-error-good');
        if ((pulseUntilByCardKey.get(cardPulseKey(seat, cardId)) ?? 0) > Date.now()) {
          rankEl.classList.add('card-pulse');
        }
        appendRankContent(rankEl, rank, rankColorClass(cardId, view), isEquivalent);
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
  if (isWidgetShellMode && narrate) {
    const entry = widgetNarrationBySeat[seat];
    if (entry?.text) {
      const bubble = document.createElement('aside');
      bubble.className = `narration-bubble seat-${seat}${widgetNarrationLatest?.seq === entry.seq ? ' is-latest' : ' is-stale'}`;
      bubble.textContent = entry.text;
      card.appendChild(bubble);
    }
  }

  const legal = !trickFrozen && active ? legalPlays(view) : [];
  const legalSet = new Set(legal.map((p) => `${p.suit}${p.rank}`));
  const canAct = !trickFrozen && view.phase !== 'end' && view.userControls.includes(seat) && active;
  const hintBestSet = new Set<CardId>();
  const ddErrorGoodSet = new Set<CardId>();

  if (trickFrozen && canLeadDismiss && state.userControls.includes(state.turn) && seat === state.turn) {
    const leadLegal = legalPlays(state);
    for (const play of leadLegal) {
      legalSet.add(`${play.suit}${play.rank}`);
    }
  }

  const effectiveCanAct = canAct || (trickFrozen && canLeadDismiss && seat === state.turn);
  if (effectiveCanAct && activeHint) {
    for (const card of activeHint.bestCards) hintBestSet.add(card);
  }
  if (activeHint && effectiveCanAct && seat === state.turn) {
    hintDiag(`highlight sets best=${hintBestSet.size} bad=0`);
  }
  if (ddErrorVisual && ddErrorVisual.seat === seat) {
    for (const card of ddErrorVisual.goodCards) ddErrorGoodSet.add(card);
  }

  for (const suit of suitOrder) {
    card.appendChild(renderSuitRow(view, seat, suit, legalSet, effectiveCanAct, hintBestSet, ddErrorGoodSet));
  }

  return card;
}

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function applyNarrationBubbleCollisionAvoidance(tableCanvas: HTMLElement): void {
  if (!isWidgetShellMode || !narrate) return;
  const trick = tableCanvas.querySelector<HTMLElement>('.trick-table');
  if (!trick) return;
  const trickRect = trick.getBoundingClientRect();
  const bubbles = tableCanvas.querySelectorAll<HTMLElement>('.narration-bubble');
  for (const bubble of bubbles) {
    bubble.classList.remove('shift-out');
    const bubbleRect = bubble.getBoundingClientRect();
    if (rectsOverlap(bubbleRect, trickRect)) {
      bubble.classList.add('shift-out');
    }
  }
}

function renderTrickTable(view: State, visuallyHidden = false): HTMLElement {
  const table = document.createElement('section');
  table.className = `trick-table${trickFrozen ? ' frozen' : ''}${visuallyHidden ? ' reading-hidden' : ''}`;
  if (trickFrozen) {
    if (!isWidgetShellMode) {
      table.title = 'Click to dismiss trick';
    }
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
      const cardId = toCardId(play.suit, play.rank) as CardId;
      if (ddErrorVisual && ddErrorVisual.badCard === cardId) text.classList.add('dd-error-bad');
      const suitEl = document.createElement('span');
      suitEl.className = `played-suit suit-${play.suit}`;
      suitEl.textContent = suitSymbol[play.suit];
      const rankEl = document.createElement('span');
      rankEl.className = 'played-rank';
      appendRankContent(rankEl, play.rank, rankColorClass(cardId, view));
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

  const title = document.createElement('strong');
  title.textContent = 'Status';
  panel.appendChild(title);

  const facts = document.createElement('div');
  facts.className = 'status-facts';
  facts.innerHTML = `
    <div><span class="k">Contract</span><span class="v">${view.contract.strain}</span></div>
    <div><span class="k">Goal</span><span class="v">${formatGoal(view)}</span></div>
    <div><span class="k">Goal state</span><span class="v">${formatGoalStatus(view)}</span></div>
    <div class="tricks"><span class="k">Tricks</span><span class="v heavy">NS ${view.tricksWon.NS} - EW ${view.tricksWon.EW}</span></div>
    <div class="meta-row"><span class="k">Leader</span><span class="v turn-meta">${view.leader}</span></div>
    <div class="meta-row"><span class="k">Turn</span><span class="v turn-meta turn-emph">${view.turn}</span></div>
  `;
  const seedRow = document.createElement('div');
  seedRow.className = 'meta-row';
  const seedKey = document.createElement('span');
  seedKey.className = 'k';
  seedKey.textContent = 'Seed';
  const seedValue = document.createElement('span');
  seedValue.className = 'v turn-meta';
  const seedText = document.createElement('span');
  seedText.className = 'seed';
  seedText.textContent = String(currentSeed);
  const seedBtn = document.createElement('button');
  seedBtn.type = 'button';
  seedBtn.className = 'seed-refresh-btn';
  seedBtn.textContent = 'New seed';
  seedBtn.onclick = () => resetGame(Date.now() >>> 0, 'newSeed');
  seedValue.append(seedText, seedBtn);
  seedRow.append(seedKey, seedValue);
  facts.appendChild(seedRow);

  const debugRow = document.createElement('div');
  debugRow.className = 'meta-row';
  const debugKey = document.createElement('span');
  debugKey.className = 'k';
  debugKey.textContent = 'Debug';
  const debugValue = document.createElement('span');
  debugValue.className = 'v turn-meta';
  const debugLabel = document.createElement('label');
  const debugBox = document.createElement('input');
  debugBox.type = 'checkbox';
  debugBox.checked = showDebugSection;
  debugBox.onchange = () => {
    showDebugSection = debugBox.checked;
    render();
  };
  debugLabel.append(debugBox, ' Show debug');
  debugValue.appendChild(debugLabel);
  debugRow.append(debugKey, debugValue);
  facts.appendChild(debugRow);

  panel.appendChild(facts);

  if (currentProblem.status === 'underConstruction') {
    const notice = document.createElement('div');
    notice.className = 'status-notice status-notice-warning';
    notice.textContent = 'Under construction: this puzzle may be buggy or incomplete.';
    panel.appendChild(notice);
  }

  return panel;
}

function renderControlsBanner(): HTMLElement {
  const bar = document.createElement('section');
  bar.className = 'controls-banner';

  const row = document.createElement('div');
  row.className = 'controls';

  const puzzleLabel = document.createElement('label');
  puzzleLabel.textContent = 'Puzzle: ';
  const puzzleSelect = document.createElement('select');
  const puzzleOptions = [...demoProblems].sort((a, b) => Number(!!a.experimental) - Number(!!b.experimental));
  for (const p of puzzleOptions) {
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
  row.appendChild(puzzleLabel);

  const currentEntry = demoProblems.find((p) => p.id === currentProblemId);
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const practiceLink = document.createElement('a');
  practiceLink.href = `${base}practice/`;
  practiceLink.className = 'controls-link';
  practiceLink.textContent = 'Practice mode';
  row.appendChild(practiceLink);

  if (currentEntry?.articlePath) {
    const articleLink = document.createElement('a');
    articleLink.href = `${base}${currentEntry.articlePath.replace(/^\/+/, '')}`;
    articleLink.target = '_blank';
    articleLink.rel = 'noopener noreferrer';
    articleLink.className = 'controls-link';
    articleLink.textContent = 'Open article';
    row.appendChild(articleLink);
  }

  const teachLabel = document.createElement('label');
  const teachBox = document.createElement('input');
  teachBox.type = 'checkbox';
  teachBox.checked = teachingMode;
  teachBox.onchange = () => {
    teachingMode = teachBox.checked;
    render();
  };
  teachLabel.append(teachBox, ' Teaching mode');
  row.appendChild(teachLabel);

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
  row.appendChild(singletonLabel);

  bar.appendChild(row);
  return bar;
}

function renderPracticeHeader(view: State): HTMLElement {
  const header = document.createElement('section');
  header.className = 'practice-header';
  if (!practiceSession) {
    header.textContent = `Practice Mode · Goal: ${practiceGoalSummary(view)}`;
    return header;
  }
  const queueSize = practiceSession.queue.length;
  const indexLabel = queueSize > 0 ? `${practiceSession.queueIndex + 1}/${queueSize}` : '-/-';
  const undoCount = practiceSession.perPuzzleUndoCount[currentProblemId] ?? practiceSession.currentUndoCount;
  header.textContent = `Practice Mode · Puzzle ${indexLabel} · Solved ${practiceSession.solved}/${practiceSession.attempted} · Perfect ${practiceSession.perfect} · Undo ${undoCount}`;
  return header;
}

function renderPracticePuzzleStateBar(view: State): HTMLElement {
  const bar = document.createElement('section');
  bar.className = 'practice-puzzle-state-bar';
  const strain = view.contract.strain;
  if (view.goal.type === 'minTricks') {
    const initialGoal = currentProblem.goal.type === 'minTricks' ? currentProblem.goal.n : view.goal.n;
    const currentGoal = view.goal.n;
    bar.textContent = `${strain} · Goal ${currentGoal}/${initialGoal} · NS ${view.tricksWon.NS} · EW ${view.tricksWon.EW}`;
  } else {
    bar.textContent = `${strain} · Goal ${formatGoal(view)} · NS ${view.tricksWon.NS} · EW ${view.tricksWon.EW}`;
  }
  return bar;
}

function renderBoardNavigationArea(view: State): HTMLElement {
  const section = document.createElement('section');
  section.className = `board-navigation-area mode-${displayMode}`;
  const practicePuzzleMode = displayMode === 'practice' && !!practiceSession && !practiceSession.solutionMode;

  const outcome = document.createElement('div');
  outcome.className = `outcome-module ${runStatus === 'success' ? 'ok' : runStatus === 'failure' ? 'fail' : 'neutral'}`;
  const noPlayYet = ddsPlayHistory.length === 0 && view.tricksWon.NS === 0 && view.tricksWon.EW === 0 && view.trick.length === 0;
  const canonicalStatus = canonicalRunStatusText(runStatus);
  const terminalCanonical = runStatus === 'success' || runStatus === 'failure';
  if (isWidgetShellMode && terminalCanonical) {
    outcome.textContent = canonicalStatus;
  } else if (activeHint) {
    outcome.classList.add('hint-active');
    const prefix = document.createElement('span');
    prefix.className = 'hint-prefix';
    prefix.textContent = 'BEST:';
    outcome.appendChild(prefix);
    if (activeHint.bestCards.length > 0) {
      for (const cardId of activeHint.bestCards) {
        const suit = cardId[0] as Suit;
        const rank = cardId.slice(1) as Rank;
        const chip = document.createElement('span');
        chip.className = `hint-card ${suit === 'H' ? 'heart' : suit === 'D' ? 'diamond' : suit === 'S' ? 'spade' : 'club'}`;
        chip.textContent = `${suitSymbol[suit]}${displayRank(rank)}`;
        outcome.appendChild(chip);
      }
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'hint-text';
      fallback.textContent = activeHint.textLine.replace(/^BEST:\s*/, '');
      outcome.appendChild(fallback);
    }
    hintDiag(`message area using activeHint lines=${activeHint.textLine}`);
  } else if (isWidgetShellMode) {
    if (hintLoading) {
      outcome.textContent = 'Calculating hint…';
      section.appendChild(outcome);
      return section;
    }
    if (widgetStatus.type === 'hint') {
      widgetStatus = { type: 'default', text: '' };
    }
    if (narrate && widgetNarrationLatest?.text) {
      widgetStatus = { type: 'narration', text: widgetNarrationLatest.text };
    } else if (!narrate && widgetStatus.type === 'narration') {
      widgetStatus = { type: 'default', text: '' };
    }
    if (widgetStatus.type === 'narration' && widgetStatus.text) {
      outcome.textContent = widgetStatus.text;
    } else if (widgetStatus.type === 'message' && widgetStatus.text) {
      outcome.textContent = widgetStatus.text;
    } else if (noPlayYet) {
      if (displayMode === 'practice') {
        outcome.textContent = `Practice Mode · Goal: ${practiceGoalSummary(view)}`;
      } else {
        const strain = view.contract.strain;
        const takeN = view.goal.type === 'minTricks' ? view.goal.n : '-';
        outcome.textContent = alwaysHint ? `${strain} take ${takeN} · Press 💡` : `${strain} take ${takeN}`;
      }
    } else {
      outcome.textContent = canonicalStatus;
    }
  } else {
    outcome.textContent = canonicalStatus;
  }
  section.appendChild(outcome);

  const transport = document.createElement('div');
  transport.className = `transport-bar mode-${displayMode}`;

  const restartBtn = document.createElement('button');
  restartBtn.type = 'button';
  restartBtn.textContent = isWidgetShellMode ? '⏮' : 'Restart';
  restartBtn.title = 'Restart';
  restartBtn.setAttribute('aria-label', 'Restart');
  if (isWidgetShellMode) restartBtn.classList.add('icon-btn');
  restartBtn.onclick = () => resetGame(currentSeed, 'reset');
  transport.appendChild(restartBtn);

  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.textContent = isWidgetShellMode ? '↩' : 'Undo';
  undoBtn.title = 'Undo';
  undoBtn.setAttribute('aria-label', 'Undo');
  if (isWidgetShellMode) undoBtn.classList.add('icon-btn', 'undo-btn');
  if (!isWidgetShellMode) undoBtn.disabled = undoStack.length === 0;
  undoBtn.onclick = () => {
    if (undoStack.length === 0) return;
    backupLastUserPlay();
  };
  transport.appendChild(undoBtn);

  if (displayMode === 'analysis') {
    const nextVariationBtn = document.createElement('button');
    nextVariationBtn.type = 'button';
    nextVariationBtn.textContent = 'Next variation';
    nextVariationBtn.disabled = !(runStatus === 'success' && playAgainAvailable);
    nextVariationBtn.onclick = () => startPlayAgain('manual');
    transport.appendChild(nextVariationBtn);
  }

  if (practicePuzzleMode) {
    const claimBtn = document.createElement('button');
    claimBtn.type = 'button';
    claimBtn.textContent = 'Claim';
    claimBtn.title = 'Claim remaining tricks';
    claimBtn.setAttribute('aria-label', 'Claim remaining tricks');
    claimBtn.classList.add('claim-btn');
    claimBtn.onclick = () => attemptClaim();
    transport.appendChild(claimBtn);
  } else {
    const hintBtn = document.createElement('button');
    hintBtn.type = 'button';
    hintBtn.textContent = isWidgetShellMode ? '💡' : 'Hint';
    hintBtn.title = 'Hint';
    hintBtn.setAttribute('aria-label', 'Hint');
    if (isWidgetShellMode) hintBtn.classList.add('icon-btn');
    hintBtn.onclick = (event) => {
      hintDiag('button click');
      event.preventDefault();
      event.stopPropagation();
      requestHint();
    };
    transport.appendChild(hintBtn);
  }

  if (isWidgetShellMode && typeof window !== 'undefined') {
    if (!practicePuzzleMode) {
      const pop = document.createElement('a');
      const u = new URL(window.location.href);
      u.searchParams.set('mode', 'analysis');
      u.searchParams.set('problem', currentProblemId);
      if (userPlayHistory.length > 0) u.searchParams.set('history', encodeUserHistoryForUrl(userPlayHistory));
      else u.searchParams.delete('history');
      pop.href = u.toString();
      pop.target = '_blank';
      pop.rel = 'noopener noreferrer';
      pop.className = 'transport-popout icon-btn';
      pop.textContent = '↗';
      pop.title = 'Pop Out (open full analysis)';
      pop.setAttribute('aria-label', 'Pop Out (open full analysis)');
      transport.appendChild(pop);
    }

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'icon-btn';
    moreBtn.textContent = '⋯';
    moreBtn.title = 'Advanced options';
    moreBtn.setAttribute('aria-label', 'More options');
    moreBtn.onclick = () => {
      advancedPanelOpen = !advancedPanelOpen;
      render();
    };
    const moreWrap = document.createElement('div');
    moreWrap.className = 'advanced-wrap';
    moreWrap.appendChild(moreBtn);
    transport.appendChild(moreWrap);

    if (advancedPanelOpen) {
      const panel = document.createElement('section');
      panel.className = 'advanced-panel widget-advanced-panel';

      const mkToggle = (label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement => {
        const row = document.createElement('label');
        row.className = 'advanced-toggle';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = checked;
        box.onchange = () => onChange(box.checked);
        const text = document.createElement('span');
        text.textContent = label;
        row.append(box, text);
        return row;
      };

      panel.appendChild(
        mkToggle('Autoplay singletons', autoplaySingletons, (checked) => {
          autoplaySingletons = checked;
          syncSingletonAutoplay();
          render();
        })
      );
      panel.appendChild(
        mkToggle('Always hint', alwaysHint, (checked) => {
          alwaysHint = checked;
          if (!checked) clearHint();
          render();
        })
      );
      panel.appendChild(
        mkToggle('Card coloring', cardColoringEnabled, (checked) => {
          cardColoringEnabled = checked;
          render();
        })
      );
      panel.appendChild(
        mkToggle('Narrate', narrate, (checked) => {
          narrate = checked;
          if (!checked) {
            clearNarration();
          } else {
            syncWidgetNarrationFeedFromTeaching();
          }
          render();
        })
      );
      panel.appendChild(
        mkToggle('Show teaching pane', showWidgetTeachingPane, (checked) => {
          showWidgetTeachingPane = checked;
          render();
        })
      );

      section.appendChild(panel);
    }
  }

  section.appendChild(transport);
  if (displayMode === 'practice' && practiceSession?.solutionMode) {
    const actions = document.createElement('div');
    actions.className = 'practice-actions';

    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.textContent = 'Replay';
    replayBtn.onclick = () => {
      beginPracticeRun(false);
      resetGame(currentSeed, 'practiceReplay');
    };
    actions.appendChild(replayBtn);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = 'Next Puzzle';
    nextBtn.onclick = () => goToNextPracticePuzzle();
    actions.appendChild(nextBtn);

    section.appendChild(actions);
  }

  if (displayMode === 'practice' && practiceSession?.isTerminal && !practiceSession.solutionMode) {
    const actions = document.createElement('div');
    actions.className = 'practice-actions';

    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.textContent = 'Replay';
    replayBtn.onclick = () => {
      beginPracticeRun(false);
      resetGame(currentSeed, 'practiceReplay');
    };
    actions.appendChild(replayBtn);

    const solutionBtn = document.createElement('button');
    solutionBtn.type = 'button';
    solutionBtn.textContent = 'Show Solution';
    solutionBtn.onclick = () => {
      beginPracticeRun(true);
      resetGame(currentSeed, 'practiceSolution');
    };
    actions.appendChild(solutionBtn);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = 'Next Puzzle';
    nextBtn.onclick = () => goToNextPracticePuzzle();
    actions.appendChild(nextBtn);

    section.appendChild(actions);
  }
  return section;
}

function renderTeachingEventsPane(mode: 'analysis' | 'widget' = 'analysis'): HTMLElement {
  const pane = document.createElement('aside');
  pane.className = mode === 'widget' ? 'teaching-pane widget-mirror-pane' : 'teaching-pane';

  const title = document.createElement('strong');
  title.textContent = 'Key teaching events';
  pane.appendChild(title);

  const list = document.createElement('div');
  list.className = 'teaching-events';
  const snapshot = teachingReducer.snapshot() as {
    entries: Array<{ seq: number; seat: string; card: string; summary: string; reasons: string[]; effects: string[] }>;
  };
  const entries = mode === 'widget'
    ? widgetNarrationEntries.map((entry) => ({
        seq: entry.seq,
        seat: entry.seat ?? '-',
        card: '',
        summary: entry.text,
        reasons: [],
        effects: []
      }))
    : (snapshot.entries ?? []);

  if (entries.length === 0) {
    const row = document.createElement('div');
    row.className = 'teaching-event teaching-info';

    const text = document.createElement('span');
    text.className = 'teaching-text';
    text.textContent = mode === 'widget' ? 'No teaching events yet.' : 'No teaching events yet.';
    row.appendChild(text);
    list.appendChild(row);
  } else {
    const parseDdReason = (reason: string): { short: string; full: string } | null => {
      if (!reason.startsWith('DD:')) return null;
      const full = reason.slice(3);
      const short = full.split('; alternatives')[0] ?? full;
      return { short: short.trim(), full: full.trim() };
    };
    const isIdleTransitionEffect = (effect: string): boolean =>
      effect.includes('becomes idle.') || effect.includes('becomes idle');

    for (const [idx, entry] of entries.entries()) {
      const row = document.createElement('div');
      row.className = 'teaching-event teaching-info';

      const text = document.createElement('span');
      text.className = 'teaching-text';
      if (mode === 'widget') {
        text.textContent = entry.summary;
        row.appendChild(text);
        list.appendChild(row);
        continue;
      }

      const marker = document.createElement('span');
      marker.className = 'teaching-at';
      marker.textContent = `#${entry.seq} ${entry.seat}`;
      row.appendChild(marker);

      const ddReasons = (entry.reasons ?? [])
        .map(parseDdReason)
        .filter((item): item is { short: string; full: string } => Boolean(item));
      const nonDdReasons = (entry.reasons ?? []).filter((reason) => !reason.startsWith('DD:'));
      const bracketParts: string[] = [];
      if (ddReasons.length > 0) {
        bracketParts.push(...ddReasons.map((item) => (verboseLog ? item.full : item.short)));
      }
      if (verboseLog && nonDdReasons.length > 0) {
        bracketParts.push(...nonDdReasons);
      }
      text.textContent = bracketParts.length > 0 ? `${entry.summary} [${bracketParts.join('; ')}]` : entry.summary;
      row.appendChild(text);

      const ddsSummary = ddsTeachingSummaries[idx];
      if (ddsSummary) {
        const ddsLine = document.createElement('div');
        ddsLine.className = 'teaching-dds';
        ddsLine.textContent = ddsSummary;
        row.appendChild(ddsLine);
      }

      const shownEffects = (entry.effects ?? []).filter((effect) => verboseLog || !isIdleTransitionEffect(effect));
      if (shownEffects.length > 0) {
        const detail = document.createElement('pre');
        detail.className = 'teaching-detail';
        const lines: string[] = [];
        for (const effect of shownEffects) lines.push(`Effect: ${effect}`);
        detail.textContent = lines.join('\n');
        row.appendChild(detail);
      }

      list.appendChild(row);
    }
  }

  pane.appendChild(list);
  return pane;
}

function render(): void {
  renderingNow = true;
  hintDiag(`render with activeHint=${activeHint ? 'yes' : 'no'}`);
  syncWidgetNarrationFeedFromTeaching();
  if (ddErrorVisual && !trickFrozen && state.turn === ddErrorVisual.seat) {
    clearDdErrorVisual();
  }
  const view = currentViewState();
  const isWidgetReadingMode = widgetReadingMode();

  root.innerHTML = '';
  root.classList.toggle('mode-widget', isWidgetShellMode);
  root.classList.toggle('mode-analysis', displayMode === 'analysis');
  root.classList.toggle('mode-practice', displayMode === 'practice');
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('mode-widget', isWidgetShellMode);
    document.documentElement.classList.toggle('mode-analysis', displayMode === 'analysis');
    document.documentElement.classList.toggle('mode-practice', displayMode === 'practice');
    document.body.classList.toggle('mode-widget', isWidgetShellMode);
    document.body.classList.toggle('mode-analysis', displayMode === 'analysis');
    document.body.classList.toggle('mode-practice', displayMode === 'practice');
  }

  if (displayMode === 'analysis') {
    root.appendChild(renderControlsBanner());
  }
  if (displayMode === 'practice') {
    root.appendChild(renderPracticeHeader(view));
    root.appendChild(renderPracticePuzzleStateBar(view));
  }

  const mainRow = document.createElement('section');
  mainRow.className = `main-row mode-${displayMode}${isWidgetShellMode && showWidgetTeachingPane ? ' with-widget-pane' : ''}`;

  const tableHost = document.createElement('div');
  tableHost.className = 'table-host';

  const tableCanvas = document.createElement('main');
  tableCanvas.className = `table-canvas${showGuides ? ' show-guides' : ''}`;
  tableCanvas.appendChild(renderTrickTable(view, isWidgetReadingMode));
  tableCanvas.appendChild(renderSeatHand(view, 'N'));
  tableCanvas.appendChild(renderSeatHand(view, 'W'));
  tableCanvas.appendChild(renderSeatHand(view, 'E'));
  tableCanvas.appendChild(renderSeatHand(view, 'S'));

  tableHost.appendChild(tableCanvas);
  if (displayMode === 'analysis') {
    mainRow.appendChild(renderTeachingEventsPane('analysis'));
  }
  mainRow.appendChild(tableHost);
  if (isWidgetShellMode && showWidgetTeachingPane) {
    mainRow.appendChild(renderTeachingEventsPane('widget'));
  }
  if (displayMode === 'analysis') {
    mainRow.appendChild(renderStatusPanel(view));
  }
  root.appendChild(mainRow);
  root.appendChild(renderBoardNavigationArea(view));
  if (displayMode === 'practice') {
    root.appendChild(renderPracticeClaimDebugPanel());
  }
  applyNarrationBubbleCollisionAvoidance(tableCanvas);
  if (displayMode === 'analysis' && (showLog || showDebugSection)) {
    root.appendChild(renderDebugSection());
  }
  renderingNow = false;
  syncSingletonAutoplay();
  syncAlwaysHint();
}

function replayInitialUserHistoryIfPresent(): void {
  if (displayMode !== 'analysis' || initialUserHistoryFromUrl.length === 0) return;
  const applied: CardId[] = [];
  for (const cardId of initialUserHistoryFromUrl) {
    if (state.phase === 'end') break;
    if (!state.userControls.includes(state.turn)) break;
    const legal = legalPlays(state).filter((p) => p.seat === state.turn);
    const play = legal.find((p) => (toCardId(p.suit, p.rank) as CardId) === cardId);
    if (!play) break;
    undoStack.push(makeSnapshot(play));
    const ddsHistoryForTurn = [...ddsPlayHistory];
    const backstopHistoryForTurn = [...ddsHistoryForTurn, `${play.suit}${play.rank}`];
    const userDdError = classifyDdErrorForUserPlay(play, ddsHistoryForTurn);
    const result = apply(state, play, {
      eventCollector: semanticCollector,
      userDdError: userDdError?.ddError,
      autoplayBackstop: buildBrowserDdsBackstop(backstopHistoryForTurn)
    });
    state = result.state;
    ddsPlayHistory = ddsHistoryForTurn;
    applied.push(cardId);
    const complete = result.events.find((e) => e.type === 'handComplete');
    if (complete?.type === 'handComplete') {
      runStatus = complete.success ? 'success' : 'failure';
      break;
    }
  }
  userPlayHistory = applied;
  clearDdErrorVisual();
  threatCtx = (state.threat as ThreatContext | null) ?? null;
  threatLabels = (state.threatLabels as DefenderLabels | null) ?? null;
  refreshThreatModel(currentProblemId, false);
}

if (practiceSession) beginPracticeRun(false);
refreshThreatModel(currentProblemId, false);
replayInitialUserHistoryIfPresent();
warmDdsRuntime();
render();
