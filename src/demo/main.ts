import './style.css';

import {
  apply,
  classInfoForCard,
  CompositeSemanticReducer,
  getSuitEquivalenceClasses,
  InMemorySemanticEventCollector,
  init,
  legalPlays,
  autoplayUntilUserOrEnd,
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
import { ensureDdsRuntime, getDdsRuntimeStatus, queryDdsNextPlays, warmDdsRuntime } from '../ai/ddsBrowser';
import { buildDdsScoreByCard } from '../ai/ddsCardScores';
import { evaluatePolicy } from '../ai/evaluatePolicy';
import {
  initClassification,
  parseCardId,
  toCardId,
  updateClassificationAfterPlay,
  type CardId,
  type Hand,
  type DefenderLabels,
  type Position,
  type ThreatContext,
} from '../ai/threatModel';
import { formatAfterPlayBlock, formatAfterTrickBlock, formatDiscardDecisionBlock, formatInitBlock } from '../ai/threatModelVerbose';
import { computeCoverageCandidates, markDecisionCoverage, type ReplayCoverage } from './playAgain';
import { demoProblems, normalizeDemoProblemVariantId, resolveDemoProblem } from './problems';
import { buildPracticeQueue, PRACTICE_SET_OPTIONS, type PracticeSetId } from './practiceSets';
import {
  buildCardStatusSnapshot,
  buildRegularCardDisplayProjection,
  buildRegularRankColorClass,
  type CardStatusSnapshotEntry,
  type RankColorVisual
} from './cardDisplay';
import { buildUnknownMergedRankColorVisual, fixedRanksForSeatSuit, unresolvedEwCardsBySuit } from './ewVariantView';
import { buildRegularPlayedCardDisplay, buildRegularSuitCardDisplays } from './regularDisplayView';
import { buildTeachingDisplayEntries, buildWidgetNarrationEntries } from './teachingDisplay';
import { mergeUnknownDdsSummaries, mergeUnknownTeachingEntries } from './unknownModeDisplay';
import { renderCardToken, renderSuitGlyph } from './cardPresentation';
import {
  buildUnknownModePlayedEvents,
  buildUnknownModeVariantReplayData as buildUnknownModeVariantReplayDataShared,
  type UnknownModeTeachingEntry,
  type UnknownModeVariantReplay
} from './unknownModeReplay';
import {
  createArticleScriptCoordinator,
  type ArticleScriptChoicePresentation,
  type ArticleScriptCoordinatorState,
  type AuthoredBranchTreeNode,
  type WidgetCompanionPanelState
} from './articleScriptCoordinator';
import {
  renderHandDiagramNavigationArea,
  type HandDiagramSecondaryActionRow
} from './handDiagramNavigation';
import {
  resolveArticleScript,
  resolveArticleScriptCheckpoint,
  resolveArticleScriptLength,
  resolvePreviousArticleScriptLandmarkCursor,
  resolvePendingArticleScriptChoice,
  type ArticleScriptChoiceStep,
} from './articleScripts';
import {
  defaultArticleScriptHistory,
  replayArticleHistory,
  type ArticleScriptStateId
} from './articleScriptRuntime';
import {
  canAutoplayArticleScriptDefender,
  resolveExplicitBranchAdvanceAction,
  shouldAutoAdvanceNonExplicitChoiceForProfile,
  shouldBlockArticleScriptUserAdvance
} from './articleScriptInteractionPolicy';
import {
  isSolutionViewingProfile,
  resolveNonStandardPracticeAssistToggles,
  resolveStandardPracticeAssistLevel,
  shouldRevealDdErrorAlternatives,
  shouldScorePracticeProfile,
  type InteractionProfile,
  type PracticeInteractionProfile
} from './interactionProfiles';
import {
  clearNarration as clearSessionNarration,
  clearNarrationFeed,
  clearDismissedOutcomeIfChanged,
  clearMessage,
  completeCompanionFutureTransition,
  createHandDiagramSession,
  dismissOutcome,
  resetReadingReveal,
  setMessage,
  type HandDiagramCompanionContent,
  type HandDiagramNarrationEntry,
  type HandDiagramStatus
} from './handDiagramSession';
import {
  closeSettingsPanel,
  createSettingsPanelSession,
  setSettingsNestedOptionsOpen,
  toggleSettingsPanel as toggleSettingsPanelSession,
  type SettingsPanelContext
} from './settingsPanelSession';
import { explainPositionInverse, inferPositionEncapsulationDetailed } from '../encapsulation';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app');
}
const root = app;

const seatOrder: Seat[] = ['N', 'E', 'S', 'W'];
const suitOrder: Suit[] = ['S', 'H', 'D', 'C'];
const rankOrder: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const suitSymbol: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const suitName: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const seatName: Record<Seat, string> = { N: 'North', E: 'East', S: 'South', W: 'West' };
const busyBranchingLabel: Record<'strict' | 'sameLevel' | 'allBusy', string> = {
  strict: 'Strict',
  sameLevel: 'Same level',
  allBusy: 'All busy'
};
type PuzzleModeId = 'standard' | 'single-dummy' | 'multi-ew' | 'scripted' | 'draft';
type AssistLevelId = 'sd' | 'puzzle' | 'light' | 'guided' | 'solution';
const PUZZLE_MODE_LABEL: Record<PuzzleModeId, string> = {
  standard: 'Double Dummy',
  'single-dummy': 'Single Dummy',
  'multi-ew': 'Multi-EW',
  scripted: 'DD-Par Style',
  draft: 'Draft'
};
const ASSIST_LEVELS_BY_MODE: Record<PuzzleModeId, Array<{ id: AssistLevelId; label: string }>> = {
  standard: [
    { id: 'puzzle', label: 'DD' },
    { id: 'light', label: 'Light' },
    { id: 'guided', label: 'Guided' },
    { id: 'solution', label: 'Solution' }
  ],
  'single-dummy': [
    { id: 'sd', label: 'SD' },
    { id: 'puzzle', label: 'DD' },
    { id: 'light', label: 'Light' },
    { id: 'guided', label: 'Guided' },
    { id: 'solution', label: 'Solution' }
  ],
  'multi-ew': [
    { id: 'puzzle', label: 'None' },
    { id: 'light', label: 'Light' },
    { id: 'guided', label: 'Guided' },
    { id: 'solution', label: 'Solution' }
  ],
  scripted: [
    { id: 'puzzle', label: 'DD' },
    { id: 'light', label: 'Light' },
    { id: 'guided', label: 'Guided' },
    { id: 'solution', label: 'Solution' }
  ],
  draft: [
    { id: 'puzzle', label: 'DD' },
    { id: 'light', label: 'Light' },
    { id: 'guided', label: 'Guided' },
    { id: 'solution', label: 'Solution' }
  ]
};
type AssistControlPreset = {
  showEw: boolean;
  cardColoring: boolean;
  alwaysHint: boolean;
  narrate: boolean;
};
const ASSIST_CONTROL_PRESETS: Record<PuzzleModeId, Partial<Record<AssistLevelId, AssistControlPreset>>> = {
  standard: {
    puzzle: { showEw: true, cardColoring: false, alwaysHint: false, narrate: false },
    light: { showEw: true, cardColoring: true, alwaysHint: false, narrate: false },
    guided: { showEw: true, cardColoring: true, alwaysHint: true, narrate: false },
    solution: { showEw: true, cardColoring: true, alwaysHint: true, narrate: true }
  },
  'single-dummy': {
    sd: { showEw: false, cardColoring: false, alwaysHint: false, narrate: false },
    puzzle: { showEw: true, cardColoring: false, alwaysHint: false, narrate: false },
    light: { showEw: true, cardColoring: true, alwaysHint: false, narrate: false },
    guided: { showEw: true, cardColoring: true, alwaysHint: true, narrate: false },
    solution: { showEw: true, cardColoring: true, alwaysHint: true, narrate: true }
  },
  'multi-ew': {
    puzzle: { showEw: true, cardColoring: false, alwaysHint: false, narrate: false },
    light: { showEw: true, cardColoring: true, alwaysHint: false, narrate: false },
    guided: { showEw: true, cardColoring: true, alwaysHint: true, narrate: false },
    solution: { showEw: true, cardColoring: true, alwaysHint: true, narrate: true }
  },
  scripted: {
    puzzle: { showEw: true, cardColoring: false, alwaysHint: false, narrate: false },
    light: { showEw: true, cardColoring: true, alwaysHint: false, narrate: false },
    guided: { showEw: true, cardColoring: true, alwaysHint: true, narrate: false },
    solution: { showEw: true, cardColoring: true, alwaysHint: true, narrate: true }
  },
  draft: {
    puzzle: { showEw: true, cardColoring: false, alwaysHint: false, narrate: false },
    light: { showEw: true, cardColoring: true, alwaysHint: false, narrate: false },
    guided: { showEw: true, cardColoring: true, alwaysHint: true, narrate: false },
    solution: { showEw: true, cardColoring: true, alwaysHint: true, narrate: true }
  }
};
type LogChannelId =
  | 'play'
  | 'threat'
  | 'dds'
  | 'variants'
  | 'replay'
  | 'hints'
  | 'teaching'
  | 'eq'
  | 'coverage'
  | 'lifecycle'
  | 'validation'
  | 'verboseInternals';
type LogChannelFamilyId = 'core' | 'diagnostics' | 'admin';
type LogChannelDef = {
  id: LogChannelId;
  label: string;
  family: LogChannelFamilyId;
};
const LOG_CHANNELS: LogChannelDef[] = [
  { id: 'play', label: 'Play', family: 'core' },
  { id: 'threat', label: 'Threat', family: 'core' },
  { id: 'dds', label: 'DDS', family: 'core' },
  { id: 'variants', label: 'Variants', family: 'core' },
  { id: 'replay', label: 'Replay', family: 'core' },
  { id: 'hints', label: 'Hints', family: 'diagnostics' },
  { id: 'teaching', label: 'Teaching', family: 'diagnostics' },
  { id: 'eq', label: 'Eq', family: 'diagnostics' },
  { id: 'coverage', label: 'Coverage', family: 'diagnostics' },
  { id: 'lifecycle', label: 'Lifecycle', family: 'admin' },
  { id: 'validation', label: 'Validation', family: 'admin' },
  { id: 'verboseInternals', label: 'Verbose internals', family: 'admin' }
];
const LOG_CHANNEL_FAMILY_LABEL: Record<LogChannelFamilyId, string> = {
  core: 'Core',
  diagnostics: 'Diagnostics',
  admin: 'Admin'
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
type WidgetUiMode = 'default' | 'dd-puzzle' | 'sd-puzzle';
type PracticeSession = {
  setId: PracticeSetId;
  queue: string[];
  queueIndex: number;
  attempted: number;
  solved: number;
  perfect: number;
  currentUndoCount: number;
  perPuzzleUndoCount: Record<string, number>;
  isTerminal: boolean;
  terminalOutcome: 'success' | 'failure' | null;
  interactionProfile: PracticeInteractionProfile;
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
  interactionProfile: PracticeInteractionProfile;
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
const widgetUiMode: WidgetUiMode = (() => {
  if (typeof window === 'undefined') return 'default';
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('uiMode') ?? params.get('ui') ?? '').trim().toLowerCase();
  if (raw === 'dd-puzzle') return 'dd-puzzle';
  if (raw === 'sd-puzzle') return 'sd-puzzle';
  return 'default';
})();
const widgetReadingProfileEnabledFromUrl = (() => {
  if (typeof window === 'undefined') return false;
  const raw = (new URLSearchParams(window.location.search).get('reading') ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
})();
const widgetCompanionPanelEnabledFromUrl = (() => {
  if (typeof window === 'undefined') return false;
  const raw = (new URLSearchParams(window.location.search).get('companionPanel') ?? '').trim().toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on' || raw === 'enabled' || raw === 'dd1';
})();
const compactWidgetLayout = displayMode !== 'analysis';
const isWidgetShellMode = displayMode !== 'analysis';

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
const verticalGap = Math.max(4, Math.round(rowHeight * 0.6) - 4);
const controlsGapY = 14;
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
root.style.setProperty('--controls-gap-y', `${controlsGapY}px`);
root.style.setProperty('--slot-offset', '12%');
let busyBranching: 'strict' | 'sameLevel' | 'allBusy' = 'sameLevel';
// Browser DDS backstop is the active DD path in widget/analysis runtime.
const threatDetail = false;
const verboseCoverageDetail = false;
const browserDdsBackstopEnabled = true;
const initialProblemIdFromUrl: string = (() => {
  if (typeof window === 'undefined') return demoProblems[0].id;
  const requested = new URLSearchParams(window.location.search).get('problem');
  if (!requested) return demoProblems[0].id;
  return demoProblems.some((p) => p.id === requested) ? requested : demoProblems[0].id;
})();
const initialVariantIdFromUrl: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const requested = new URLSearchParams(window.location.search).get('variant');
  return requested?.trim() ? requested.trim().toLowerCase() : null;
})();
let practiceSetId: PracticeSetId = 'set1';
const initialPracticeEntries = displayMode === 'practice' ? buildPracticeQueue(practiceSetId) : [];
let practiceProblemOverrides = new Map<string, ProblemWithThreats>(
  initialPracticeEntries.map((entry) => [entry.id, entry.problem as ProblemWithThreats] as const)
);
const initialPracticeQueue: string[] = displayMode === 'practice' ? initialPracticeEntries.map((entry) => entry.id) : [];
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
const initialOpeningFromUrl: CardId[] = (() => {
  if (typeof window === 'undefined') return [];
  const raw = new URLSearchParams(window.location.search).get('opening');
  if (!raw) return [];
  return raw
    .split('.')
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[SHDC](10|[AKQJT2-9])$/.test(token))
    .map((token) => `${token[0]}${token.slice(1) === '10' ? 'T' : token.slice(1)}` as CardId);
})();
const startupGateEnabledFromUrl: boolean = (() => {
  if (typeof window === 'undefined') return false;
  const raw = (new URLSearchParams(window.location.search).get('start') ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();
const initialArticleScriptIdFromUrl: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('articleScript');
  return raw?.trim() ? raw.trim() : null;
})();
const initialArticleCheckpointIdFromUrl: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('checkpoint');
  return raw?.trim() ? raw.trim() : null;
})();
const initialArticleScriptSpec = resolveArticleScript(initialArticleScriptIdFromUrl);
const readingWidgetEmbedCompactHeight = 326;
const readingWidgetEmbedFullHeight = 364;
const readingWidgetEmbedHeightMessageType = 'ds-widget-reading-height';
let lastReportedReadingWidgetEmbedHeight: number | null = null;
const initialArticleCursor = (() => {
  if (!initialArticleScriptSpec) return 0;
  return resolveArticleScriptCheckpoint(initialArticleScriptSpec, initialArticleCheckpointIdFromUrl ?? '1').cursor;
})();

function startupOpeningForProblem(problem: ProblemWithThreats): CardId[] {
  if (initialOpeningFromUrl.length > 0) return [...initialOpeningFromUrl];
  const scripted = problem.scriptedOpening ?? [];
  return scripted.flatMap((trick) => trick);
}

function articleScriptModeEnabled(): boolean {
  return articleScriptCoordinator.articleScriptModeEnabled();
}

function suitStrengthForAdvance(suit: Suit): number {
  return { C: 0, D: 1, H: 2, S: 3 }[suit];
}

function currentArticleScriptReplayAtCursor(cursor: number) {
  return articleScriptCoordinator.currentArticleScriptReplayAtCursor(cursor);
}

function matchCurrentArticleScriptHistory(cursor: number = articleScriptState?.cursor ?? 0) {
  return articleScriptCoordinator.matchCurrentArticleScriptHistory(cursor);
}

function ensureArticleScriptDdsLoading(): void {
  articleScriptCoordinator.ensureArticleScriptDdsLoading();
}

function articleScriptWaitingOnDds(): boolean {
  return articleScriptCoordinator.articleScriptWaitingOnDds();
}

function currentArticleScriptStatusMessage(): string | null {
  return articleScriptCoordinator.currentArticleScriptStatusMessage();
}

function resolveArticleScriptReplayCardAtCursor(cursor: number): CardId | null {
  return articleScriptCoordinator.resolveArticleScriptReplayCardAtCursor(cursor);
}

function pendingArticleScriptChoice(): ArticleScriptChoiceStep | null {
  return articleScriptCoordinator.pendingArticleScriptChoice();
}

function currentArticleScriptEndCursor(): number | null {
  return articleScriptCoordinator.currentArticleScriptEndCursor();
}

function currentArticleScriptStateId(): ArticleScriptStateId | null {
  return articleScriptCoordinator.currentArticleScriptStateId();
}

function currentArticleScriptTerminalLabel(): 'Complete' | 'End' | null {
  return articleScriptCoordinator.currentArticleScriptTerminalLabel();
}

function currentArticleScriptStateLabel(): string | null {
  return articleScriptCoordinator.currentArticleScriptStateLabel();
}

function currentArticleScriptBranchName(): string | null {
  return articleScriptCoordinator.currentArticleScriptBranchName();
}

function currentArticleScriptReplayCard(): CardId | null {
  return articleScriptCoordinator.currentArticleScriptReplayCard();
}

function clearArticleScriptFollowPrompt(): void {
  articleScriptCoordinator.clearArticleScriptFollowPrompt();
}

function currentArticleScriptHasRememberedTail(): boolean {
  return articleScriptCoordinator.currentArticleScriptHasRememberedTail();
}

function chooseArticleScriptHintCard(options: CardId[]): CardId | null {
  return chooseHintAdvanceCard(options) ?? options[0] ?? null;
}

function chooseCurrentArticleScriptBranchOption(): CardId | null {
  return articleScriptCoordinator.chooseCurrentArticleScriptBranchOption();
}

function articleScriptUndoTargetCursor(): number {
  return articleScriptCoordinator.articleScriptUndoTargetCursor();
}

function currentArticleScriptResolvedBranchName(): string {
  return articleScriptCoordinator.currentArticleScriptResolvedBranchName();
}

function currentArticleScriptInteractionProfile(): InteractionProfile {
  return articleScriptCoordinator.currentArticleScriptInteractionProfile();
}

function articleScriptIsStoryViewing(): boolean {
  return articleScriptCoordinator.articleScriptIsStoryViewing();
}

function currentPracticeInteractionProfile(): PracticeInteractionProfile {
  return practiceSession?.interactionProfile ?? 'puzzle-solving';
}

function shouldRevealDdErrorAlternativesCurrentContext(): boolean {
  if (articleScriptModeEnabled()) {
    return shouldRevealDdErrorAlternatives(currentArticleScriptInteractionProfile());
  }
  if (displayMode === 'practice') {
    return shouldRevealDdErrorAlternatives(currentPracticeInteractionProfile());
  }
  return true;
}

function applyArticleScriptInteractionProfileDefaults(profile: InteractionProfile): void {
  if (!articleScriptModeEnabled()) return;
  if (profile === 'solution-viewing') {
    assistLevelByMode = { ...assistLevelByMode, scripted: 'solution' };
    applyCurrentAssistLevelToControls();
    showWidgetTeachingPane = false;
    return;
  }
  if (profile === 'puzzle-solving') {
    assistLevelByMode = { ...assistLevelByMode, scripted: 'puzzle' };
    applyCurrentAssistLevelToControls();
    showWidgetTeachingPane = false;
  }
}

function setCurrentArticleScriptInteractionProfile(profile: InteractionProfile, options: { applyDefaults?: boolean } = {}): void {
  articleScriptCoordinator.setCurrentArticleScriptInteractionProfile(profile, options);
}

function applyArticleScriptPlayStepFeedbackAtCursor(cursor: number, playedCardId: CardId): void {
  articleScriptCoordinator.applyArticleScriptPlayStepFeedbackAtCursor(cursor, playedCardId);
}

function currentWidgetCompanionPanelState(): WidgetCompanionPanelState {
  return articleScriptCoordinator.currentWidgetCompanionPanelState();
}

function resetWidgetReadingControlsReveal(): void {
  resetReadingReveal(handDiagramSession);
}

function previousUnfinishedArticleScriptBranchCursor(
  cursor: number,
  choiceSelections: Partial<Record<number, CardId>>
): number | null {
  return articleScriptCoordinator.previousUnfinishedArticleScriptBranchCursor(cursor, choiceSelections);
}

function currentArticleScriptChoicePresentation(): ArticleScriptChoicePresentation | null {
  return articleScriptCoordinator.currentArticleScriptChoicePresentation();
}

function revealKnownArticleScriptBranchesFromCurrentPath(): void {
  articleScriptCoordinator.revealKnownArticleScriptBranchesFromCurrentPath();
}

function currentArticleScriptProgressSummary(): string {
  return articleScriptCoordinator.currentArticleScriptProgressSummary();
}

function syncArticleScriptCompletionProgress(): void {
  articleScriptCoordinator.syncArticleScriptCompletionProgress();
}

function followCurrentArticleScriptUserTurn(): boolean {
  const scriptState = articleScriptCoordinator.getArticleScriptState();
  if (!scriptState) return false;
  if (articleScriptWaitingOnDds()) return false;
  if (!currentProblem.userControls.includes(state.turn)) return false;
  const rememberedCardId = currentArticleScriptReplayCard();
  if (rememberedCardId) {
    handDiagramSession.hintCount += 1;
    clearArticleScriptFollowPrompt();
    return advanceOneWidgetCard();
  }
  const choicePresentation = currentArticleScriptChoicePresentation();
  const scriptedChoice = choicePresentation?.choice ?? null;
  if (!scriptedChoice || scriptedChoice.seat !== state.turn) return false;
  const chosenCardId = chooseArticleScriptHintCard(scriptedChoice.options ?? []);
  if (!chosenCardId) return false;
  const legal = legalPlays(state).filter((candidate) => candidate.seat === state.turn);
  const play = legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === chosenCardId);
  if (!play) return false;
  handDiagramSession.hintCount += 1;
  clearArticleScriptFollowPrompt();
  runTurn(play);
  return true;
}

function currentArticleScriptNarrativeTriggerCards(): Set<CardId> {
  const scriptState = articleScriptCoordinator.getArticleScriptState();
  if (!scriptState) return new Set<CardId>();
  const narrative = scriptState.spec.companionPanel?.narrative;
  if (!narrative) return new Set<CardId>();
  const activeProfile = currentArticleScriptInteractionProfile();
  if (narrative.activeProfiles?.length && !narrative.activeProfiles.includes(activeProfile)) {
    return new Set<CardId>();
  }
  return new Set<CardId>(Object.keys(narrative.activeSegmentByPlayCardId ?? {}) as CardId[]);
}

function nextArticleScriptRememberedPauseCursor(): number | null {
  const scriptState = articleScriptCoordinator.getArticleScriptState();
  if (!scriptState) return null;
  if (scriptState.cursor >= scriptState.history.length) return null;
  const triggerCards = currentArticleScriptNarrativeTriggerCards();
  const replayAtCursor = currentArticleScriptReplayAtCursor(scriptState.cursor);
  if (!replayAtCursor) return null;
  let previousState = replayAtCursor.state;
  for (let nextCursor = scriptState.cursor + 1; nextCursor <= scriptState.history.length; nextCursor += 1) {
    const replayed = currentArticleScriptReplayAtCursor(nextCursor);
    if (!replayed) break;
    const completedTrick = previousState.trick.length > 0 && replayed.state.trick.length === 0;
    const playedCardId = scriptState.history[nextCursor - 1] ?? null;
    if ((playedCardId && triggerCards.has(playedCardId)) || completedTrick || nextCursor === scriptState.history.length) {
      return nextCursor;
    }
    previousState = replayed.state;
  }
  return null;
}

function advanceArticleScriptToNextPauseOrEnd(): void {
  const scriptSession = articleScriptCoordinator.getArticleScriptState();
  if (!scriptSession) return;
  const scriptStateId = currentArticleScriptStateId();
  if (scriptStateId !== 'in-script' && scriptStateId !== 'pre-script') return;
  const endCursor = currentArticleScriptEndCursor() ?? resolveArticleScriptLength(scriptSession.spec);
  let cursor = scriptSession.cursor;
  const triggerCards = currentArticleScriptNarrativeTriggerCards();
  let previousReplay = currentArticleScriptReplayAtCursor(cursor);
  while (cursor < endCursor) {
    const nextCardId = resolveArticleScriptReplayCardAtCursor(cursor);
    if (nextCardId) {
      const playCursor = articleScriptCoordinator.appendReplayCardAtCursor(nextCardId);
      if (playCursor === null) break;
      cursor += 1;
      applyArticleScriptPlayStepFeedbackAtCursor(playCursor, nextCardId);
      const nextReplay = currentArticleScriptReplayAtCursor(cursor);
      const completedTrick = Boolean(
        previousReplay
        && nextReplay
        && previousReplay.state.trick.length > 0
        && nextReplay.state.trick.length === 0
      );
      if (triggerCards.has(nextCardId) || completedTrick) break;
      if (resolvePendingArticleScriptChoice(scriptSession.spec, cursor, matchCurrentArticleScriptHistory(cursor)?.choiceSelections ?? {})) break;
      previousReplay = nextReplay;
      continue;
    }
    if (resolvePendingArticleScriptChoice(scriptSession.spec, cursor, matchCurrentArticleScriptHistory(cursor)?.choiceSelections ?? {})) break;
    break;
  }
  clearArticleScriptFollowPrompt();
  replayArticleScriptToCursor(cursor);
}

function resolveProblemById(problemId: string, variantId?: string | null): ProblemWithThreats {
  const override = practiceProblemOverrides.get(problemId);
  if (override) return override;
  const entry = demoProblems.find((p) => p.id === problemId) ?? demoProblems[0];
  return resolveDemoProblem(entry, variantId) as ProblemWithThreats;
}

function resolveProblemVariantId(problemId: string, variantId?: string | null): string | null {
  if (!variantId?.trim()) return null;
  const entry = demoProblems.find((p) => p.id === problemId);
  if (!entry) return null;
  return normalizeDemoProblemVariantId(entry, variantId);
}

function versionUnknownModeEnabled(): boolean {
  return !currentProblemVariantId && Boolean(currentProblem.ewVariants && currentProblem.ewVariants.length > 0);
}

function configuredUserControls(base: Seat[] = currentProblem.userControls): Seat[] {
  if (articleScriptModeEnabled()) return ['N', 'E', 'S', 'W'];
  return autoplayEw ? [...base] : ['N', 'E', 'S', 'W'];
}

function syncConfiguredUserControls(): void {
  state.userControls = configuredUserControls();
  if (frozenViewState) frozenViewState.userControls = configuredUserControls();
}

const initialProblemId = initialPracticeQueue[0] ?? initialArticleScriptSpec?.parentProblemId ?? initialProblemIdFromUrl;
let currentProblemVariantId = resolveProblemVariantId(initialProblemId, initialVariantIdFromUrl);
let currentProblem = resolveProblemById(initialProblemId, currentProblemVariantId);
let currentProblemId = initialProblemId;
let currentSeed = currentProblem.rngSeed >>> 0;
let state: State = init({ ...withDdSource(currentProblem), rngSeed: currentSeed });
const rawSemanticReducer = new RawSemanticReducer();
const teachingReducer = new TeachingReducer();
teachingReducer.setTrumpSuit(state.trumpSuit);
const semanticReducer = new CompositeSemanticReducer([rawSemanticReducer, teachingReducer]);
const semanticCollector = new InMemorySemanticEventCollector();
semanticCollector.attachReducer(semanticReducer);
let logs: string[] = [];
let deferredLogLines: string[] = [];
let showLog = false;
let showGuides = false;
let showDebugSection = false;
let showSemanticReducer = false;
let expandedLogFamilies = new Set<LogChannelFamilyId>(['core', 'diagnostics', 'admin']);
let enabledLogChannels = new Set<LogChannelId>(['play', 'threat', 'dds', 'variants', 'replay']);
let teachingMode = true;
let autoplaySingletons = displayMode !== 'widget';
let autoplayEw = true;
let unknownModeVariantReplayData: Map<string, UnknownModeVariantReplay> | null = null;
let westInitialContentWidth: number | null = null;
let nsInitialFitWidth: number | null = null;
let diagramRowHeightPx: number | null = null;
let assistLevelByMode: Record<PuzzleModeId, AssistLevelId> = {
  standard: displayMode === 'practice' ? 'puzzle' : 'solution',
  'single-dummy': 'sd',
  'multi-ew': 'puzzle',
  scripted: 'puzzle',
  draft: displayMode === 'practice' ? 'puzzle' : 'solution'
};
let articleScriptState: ArticleScriptCoordinatorState | null =
  initialArticleScriptSpec
    ? {
        spec: initialArticleScriptSpec,
        checkpointId: resolveArticleScriptCheckpoint(initialArticleScriptSpec, initialArticleCheckpointIdFromUrl).id,
        initialCursor: initialArticleCursor,
        cursor: initialArticleCursor,
        history: defaultArticleScriptHistory(initialArticleScriptSpec, initialArticleCursor),
        choiceSelections: {},
        interactionProfileOverride: null
      }
    : null;
const handDiagramSession = createHandDiagramSession();
const articleScriptCoordinator = createArticleScriptCoordinator({
  getDisplayMode: () => displayMode,
  getCurrentProblem: () => currentProblem,
  getCurrentProblemId: () => currentProblemId,
  getCurrentSeed: () => currentSeed,
  getCurrentState: () => state,
  getRunStatus: () => runStatus,
  getAutoplayEw: () => autoplayEw,
  getArticleScriptState: () => articleScriptState,
  setArticleScriptState: (next) => {
    articleScriptState = next;
  },
  withDdSource,
  handDiagramSession,
  widgetCompanionPanelEnabledFromUrl,
  getWidgetCompanionPanelHidden: () => widgetCompanionPanelHidden,
  clearHint,
  chooseHintAdvanceCard,
  applyArticleScriptInteractionProfileDefaults
});
let alwaysHint = displayMode === 'widget';
let cardColoringEnabled = true;
let narrate = displayMode === 'analysis';
let alertMistakes = true;
let hintsEnabled = true;
let hideEastWest = false;
if (displayMode === 'widget' && (widgetUiMode === 'dd-puzzle' || widgetUiMode === 'sd-puzzle')) {
  alwaysHint = false;
  cardColoringEnabled = false;
  narrate = widgetUiMode === 'dd-puzzle';
  hintsEnabled = true;
  hideEastWest = widgetUiMode === 'sd-puzzle';
}
applyWidgetProblemDefaults();
applyCurrentAssistLevelToControls();
if (articleScriptModeEnabled()) {
  autoplaySingletons = false;
  autoplayEw = false;
}
let showWidgetTeachingPane = false;
let widgetCompanionPanelHidden = false;
const settingsPanelSession = createSettingsPanelSession();
let ddsPlayHistory: string[] = [];
let ddsTeachingSummaries: string[] = [];
let activeHint: HintState | null = null;
let activeHintKey: string | null = null;
let hintLoading = false;
let ddsLoadingForHint = false;
let hintRequestSeq = 0;
let ddErrorVisual: DdErrorVisualState | null = null;
let inevitableFailureAlert = false;
function applyWidgetProblemDefaults(): void {
  if (displayMode !== 'widget') return;
  if (widgetUiMode === 'sd-puzzle') {
    narrate = false;
    return;
  }
  if (widgetUiMode === 'dd-puzzle') {
    narrate = true;
    return;
  }
  if (versionUnknownModeEnabled()) {
    alwaysHint = false;
    cardColoringEnabled = false;
    narrate = false;
    return;
  }
  narrate = true;
}
let inversePrimaryBySuit: Partial<Record<Suit, 'N' | 'S'>> = {};
let singletonAutoplayTimer: ReturnType<typeof setTimeout> | null = null;
let singletonAutoplayKey: string | null = null;
let widgetCompanionFutureTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let renderingNow = false;
let startPending = startupGateEnabledFromUrl;

let trickFrozen = false;
let lastCompletedTrick: Play[] | null = null;
let frozenViewState: State | null = null;
let canLeadDismiss = false;
let threatCtx: ThreatContext | null = null;
let threatLabels: DefenderLabels | null = null;
type GameSnapshot = {
  state: State;
  currentProblemId: string;
  currentProblemVariantId: string | null;
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
        setId: practiceSetId,
        queue: [...initialPracticeQueue],
        queueIndex: 0,
        attempted: 0,
        solved: 0,
        perfect: 0,
        currentUndoCount: 0,
        perPuzzleUndoCount: {},
        isTerminal: false,
        terminalOutcome: null,
        interactionProfile: 'puzzle-solving',
        scoredThisRun: false
      }
    : null;
let practiceClaimDebug: ClaimDebugSnapshot | null = null;
type TeachingEventKind = 'threatSummary' | 'recolor' | 'info';
type TeachingEvent = { id: number; kind: TeachingEventKind; label: string; detail?: string; at?: string };
let teachingEvents: TeachingEvent[] = [];
let nextTeachingEventId = 1;
type TeachingEntryView = UnknownModeTeachingEntry;
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

function clearWidgetCompanionFutureTransitionTimer(): void {
  if (!widgetCompanionFutureTransitionTimer) return;
  clearTimeout(widgetCompanionFutureTransitionTimer);
  widgetCompanionFutureTransitionTimer = null;
}

function syncWidgetCompanionFutureTransitionTimer(panelState: WidgetCompanionPanelState): void {
  if (displayMode !== 'widget' || !panelState.futureTransitioning) {
    clearWidgetCompanionFutureTransitionTimer();
    return;
  }
  if (widgetCompanionFutureTransitionTimer) return;
  widgetCompanionFutureTransitionTimer = setTimeout(() => {
    widgetCompanionFutureTransitionTimer = null;
    completeCompanionFutureTransition(handDiagramSession);
    render();
  }, 180);
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
  if (!cardColoringEnabled) return;
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

function clearHint(): void {
  activeHint = null;
  activeHintKey = null;
  hintLoading = false;
  ddsLoadingForHint = false;
  if (handDiagramSession.status.type === 'hint') handDiagramSession.status = { type: 'default', text: '' };
}

function clearWidgetMessage(): void {
  clearMessage(handDiagramSession);
}

function currentDismissibleWidgetOutcomeKey(view: State): string | null {
  if (handDiagramSession.status.type === 'message' && handDiagramSession.status.text) {
    return `message:${articleScriptState?.cursor ?? -1}:${handDiagramSession.status.html ? 'html:' : 'text:'}${handDiagramSession.status.text}`;
  }
  if (displayMode !== 'widget') return null;
  if (runStatus === 'success' || runStatus === 'failure') return `run:${runStatus}:${state.phase}`;
  if (inevitableFailureAlert && runStatus !== 'success' && runStatus !== 'failure') return 'warning:inevitable-failure';
  if (articleScriptState) {
    const terminalLabel = currentArticleScriptTerminalLabel();
    if (terminalLabel === 'Complete') return `script-complete:${articleScriptState.cursor}:${currentArticleScriptStateLabel() ?? ''}`;
    const statusMessage = currentArticleScriptStatusMessage();
    if (statusMessage) return `script-status:${articleScriptState.cursor}:${statusMessage}`;
  }
  void view;
  return null;
}

function dismissTransientWidgetOutcome(view: State): void {
  clearWidgetMessage();
  const key = currentDismissibleWidgetOutcomeKey(view);
  dismissOutcome(handDiagramSession, key);
}

function clearDismissedWidgetOutcomeIfChanged(view: State): void {
  const key = currentDismissibleWidgetOutcomeKey(view);
  clearDismissedOutcomeIfChanged(handDiagramSession, key);
}

function clearDdErrorVisual(): void {
  ddErrorVisual = null;
}

function clearNarration(): void {
  clearSessionNarration(handDiagramSession);
}

function clearWidgetNarrationFeed(): void {
  clearNarrationFeed(handDiagramSession);
}

function resetSemanticStreams(): void {
  semanticCollector.clear();
  rawSemanticReducer.reset();
  teachingReducer.reset();
}

function variantLabelPrefix(variantId: string): string {
  return variantId.trim().toUpperCase();
}

function currentEntryIsDraft(problemId = currentProblemId): boolean {
  const entry = demoProblems.find((problem) => problem.id === problemId);
  return entry?.puzzleModeId === 'draft';
}

function currentPuzzleModeId(problemId = currentProblemId): PuzzleModeId {
  if (articleScriptModeEnabled() && problemId === currentProblemId) return 'scripted';
  if (widgetUiMode === 'sd-puzzle') return 'single-dummy';
  const entry = demoProblems.find((problem) => problem.id === problemId);
  if (entry?.variants && entry.variants.length > 0) return 'multi-ew';
  if (entry?.puzzleModeId === 'draft') return 'standard';
  if (entry?.puzzleModeId) return entry.puzzleModeId;
  return 'standard';
}

function currentAssistOptions(problemId = currentProblemId): Array<{ id: AssistLevelId; label: string }> {
  return ASSIST_LEVELS_BY_MODE[currentPuzzleModeId(problemId)];
}

function currentAssistLevel(problemId = currentProblemId): AssistLevelId {
  const puzzleMode = currentPuzzleModeId(problemId);
  const configured = assistLevelByMode[puzzleMode];
  return currentAssistOptions(problemId).some((option) => option.id === configured)
    ? configured
    : currentAssistOptions(problemId)[0]?.id ?? 'guided';
}

function shouldHighlightScriptNextForSeat(seat: Seat): boolean {
  if (!articleScriptModeEnabled()) return true;
  if (currentAssistLevel() !== 'puzzle') return true;
  return !currentProblem.userControls.includes(seat);
}

function shouldHighlightScriptChoiceForSeat(seat: Seat): boolean {
  if (!articleScriptModeEnabled()) return true;
  if (currentAssistLevel() !== 'puzzle') return true;
  return !currentProblem.userControls.includes(seat);
}

function shouldShowEquivalentUnderlinesCurrentSurface(): boolean {
  return displayMode === 'analysis';
}

function applyCurrentAssistLevelToControls(problemId = currentProblemId): void {
  const puzzleMode = currentPuzzleModeId(problemId);
  const level = currentAssistLevel(problemId);
  const preset = ASSIST_CONTROL_PRESETS[puzzleMode][level];
  if (!preset) return;
  hideEastWest = !preset.showEw;
  cardColoringEnabled = preset.cardColoring;
  alwaysHint = preset.alwaysHint;
  narrate = preset.narrate;
}

function syncAssistLevelFromControls(problemId = currentProblemId): void {
  const puzzleMode = currentPuzzleModeId(problemId);
  const options = currentAssistOptions(problemId);
  const nextLevel = options.find((option) => {
    const preset = ASSIST_CONTROL_PRESETS[puzzleMode][option.id];
    return preset
      && hideEastWest === !preset.showEw
      && cardColoringEnabled === preset.cardColoring
      && alwaysHint === preset.alwaysHint
      && narrate === preset.narrate;
  })?.id;
  if (nextLevel) assistLevelByMode = { ...assistLevelByMode, [puzzleMode]: nextLevel };
}

function setAssistLevel(level: AssistLevelId, problemId = currentProblemId): void {
  const puzzleMode = currentPuzzleModeId(problemId);
  if (!currentAssistOptions(problemId).some((option) => option.id === level)) return;
  assistLevelByMode = { ...assistLevelByMode, [puzzleMode]: level };
  if (problemId === currentProblemId) applyCurrentAssistLevelToControls(problemId);
  render();
}

function renderAssistLevelControl(context: 'analysis' | 'practice' | 'widget'): HTMLElement {
  const puzzleMode = currentPuzzleModeId();
  const options = currentAssistOptions();
  const currentLevel = currentAssistLevel();
  const currentIndex = Math.max(0, options.findIndex((option) => option.id === currentLevel));
  const compact = context === 'widget';

  const wrap = document.createElement('section');
  wrap.className = `assist-level-control assist-context-${context}`;

  const meta = document.createElement('div');
  meta.className = 'assist-meta';

  if (!compact) {
    const modeLine = document.createElement('span');
    modeLine.className = 'assist-mode';
    modeLine.textContent = `Puzzle Mode: ${PUZZLE_MODE_LABEL[puzzleMode]}`;
    meta.appendChild(modeLine);
  }

  const levelLine = document.createElement('strong');
  levelLine.className = 'assist-current';
  levelLine.textContent = `Assist: ${options[currentIndex]?.label ?? ''}`;
  meta.appendChild(levelLine);
  wrap.appendChild(meta);

  const controls = document.createElement('div');
  controls.className = 'assist-controls';

  const minusBtn = document.createElement('button');
  minusBtn.type = 'button';
  minusBtn.className = 'assist-step-btn';
  minusBtn.textContent = '–';
  minusBtn.disabled = currentIndex <= 0;
  minusBtn.onclick = () => {
    const next = options[currentIndex - 1];
    if (next) setAssistLevel(next.id);
  };
  controls.appendChild(minusBtn);

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'assist-slider-wrap';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'assist-slider';
  slider.min = '0';
  slider.max = String(Math.max(0, options.length - 1));
  slider.step = '1';
  slider.value = String(currentIndex);
  slider.setAttribute('aria-label', 'Assist Level');
  slider.oninput = () => {
    const next = options[Math.max(0, Math.min(options.length - 1, Number(slider.value)))];
    if (next) setAssistLevel(next.id);
  };
  sliderWrap.appendChild(slider);

  const ticks = document.createElement('div');
  ticks.className = 'assist-ticks';
  ticks.style.gridTemplateColumns = `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))`;
  for (const option of options) {
    const tick = document.createElement('span');
    tick.className = `assist-tick${option.id === currentLevel ? ' active' : ''}`;
    tick.textContent = compact ? '•' : option.label;
    tick.title = option.label;
    tick.setAttribute('aria-label', option.label);
    ticks.appendChild(tick);
  }
  sliderWrap.appendChild(ticks);
  controls.appendChild(sliderWrap);

  const plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.className = 'assist-step-btn';
  plusBtn.textContent = '+';
  plusBtn.disabled = currentIndex >= options.length - 1;
  plusBtn.onclick = () => {
    const next = options[currentIndex + 1];
    if (next) setAssistLevel(next.id);
  };
  controls.appendChild(plusBtn);

  wrap.appendChild(controls);
  return wrap;
}

function toggleSettingsPanel(context: SettingsPanelContext): void {
  toggleSettingsPanelSession(settingsPanelSession, context);
  render();
}

function ensureSettingsOutsideDismiss(): void {
  if (settingsPanelSession.outsideDismissBound || typeof document === 'undefined') return;
  settingsPanelSession.outsideDismissBound = true;
  document.addEventListener('pointerdown', (event) => {
    if (!settingsPanelSession.context) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.settings-wrap')) return;
    closeSettingsPanel(settingsPanelSession);
    render();
  });
}

function renderSettingsToggle(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  options?: { disabled?: boolean }
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'advanced-toggle';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.disabled = options?.disabled === true;
  box.onchange = () => onChange(box.checked);
  const text = document.createElement('span');
  text.textContent = label;
  row.append(box, text);
  return row;
}

function renderSettingsToggles(context: SettingsPanelContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'advanced-body';

  const assistGroup = document.createElement('div');
  assistGroup.className = 'advanced-group assist-group';
  assistGroup.appendChild(
    renderSettingsToggle('Show E/W', !hideEastWest, (checked) => {
      hideEastWest = !checked;
      syncAssistLevelFromControls();
      render();
    })
  );
  assistGroup.appendChild(
    renderSettingsToggle('Alert Mistakes', alertMistakes, (checked) => {
      alertMistakes = checked;
      if (!checked) clearDdErrorVisual();
      render();
    })
  );
  assistGroup.appendChild(
    renderSettingsToggle('Card coloring', cardColoringEnabled, (checked) => {
      cardColoringEnabled = checked;
      if (!checked) {
        clearPulseTimer();
        pulseUntilByCardKey.clear();
      }
      syncAssistLevelFromControls();
      render();
    })
  );
  assistGroup.appendChild(
    renderSettingsToggle('Always hint', alwaysHint, (checked) => {
      alwaysHint = checked;
      if (!checked) clearHint();
      syncAssistLevelFromControls();
      render();
    })
  );
  assistGroup.appendChild(
    renderSettingsToggle('Narrate', narrate, (checked) => {
      narrate = checked;
      if (!checked) {
        clearNarration();
      } else {
        syncWidgetNarrationFeedFromTeaching();
      }
      syncAssistLevelFromControls();
      render();
    })
  );
  body.appendChild(assistGroup);

  const divider = document.createElement('div');
  divider.className = 'advanced-divider';
  body.appendChild(divider);

  const otherGroup = document.createElement('div');
  otherGroup.className = 'advanced-group other-group';
  if (context !== 'analysis') {
    otherGroup.appendChild(
      renderSettingsToggle('Show boxes', showGuides, (checked) => {
        showGuides = checked;
        render();
      })
    );
  }
  otherGroup.appendChild(
    renderSettingsToggle('Autoplay singletons', autoplaySingletons, (checked) => {
      autoplaySingletons = checked;
      syncSingletonAutoplay();
      render();
    })
  );
  otherGroup.appendChild(
    renderSettingsToggle('Autoplay E/W', autoplayEw, (checked) => {
      autoplayEw = checked;
      syncConfiguredUserControls();
      if (autoplayEw && !trickFrozen && state.phase !== 'end' && !currentProblem.userControls.includes(state.turn)) {
        advanceAutoplayFromCurrentState();
      }
      syncSingletonAutoplay();
      render();
    })
  );
  body.appendChild(otherGroup);

  return body;
}

function renderSettingsButton(context: SettingsPanelContext): HTMLElement {
  ensureSettingsOutsideDismiss();
  const wrap = document.createElement('div');
  wrap.className = `advanced-wrap settings-wrap context-${context}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = context === 'widget' ? 'icon-btn settings-more-btn' : 'settings-more-btn';
  button.textContent = '⋯';
  button.title = `Assist options (${currentAssistOptions().find((option) => option.id === currentAssistLevel())?.label ?? ''})`;
  button.setAttribute('aria-label', 'Assist and display options');
  button.onclick = () => toggleSettingsPanel(context);
  wrap.appendChild(button);

  if (settingsPanelSession.context === context) {
    const panel = document.createElement('section');
    panel.className = `advanced-panel settings-panel settings-primary-panel settings-panel-${context}`;

    panel.appendChild(renderAssistLevelControl(context));
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'settings-more-row';
    moreBtn.textContent = settingsPanelSession.nestedOptionsOpen ? 'Hide options…' : 'More options…';
    moreBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      setSettingsNestedOptionsOpen(settingsPanelSession, !settingsPanelSession.nestedOptionsOpen);
      render();
    };
    panel.appendChild(moreBtn);

    if (settingsPanelSession.nestedOptionsOpen) {
      const secondary = document.createElement('section');
      secondary.className = `advanced-panel settings-panel settings-secondary-panel settings-panel-${context}${context === 'analysis' ? '' : ' settings-secondary-inline'}`;
      const secondaryTitle = document.createElement('strong');
      secondaryTitle.className = 'settings-secondary-title';
      secondaryTitle.textContent = 'Advanced settings';
      secondary.appendChild(secondaryTitle);
      secondary.appendChild(renderSettingsToggles(context));
      if (context === 'analysis') {
        panel.appendChild(secondary);
      } else {
        panel.appendChild(secondary);
      }
    }
    wrap.appendChild(panel);
  }

  return wrap;
}

function applyInlineSettingsPlacement(): void {
  if (typeof document === 'undefined' || !settingsPanelSession.nestedOptionsOpen) return;
  for (const context of ['widget', 'practice'] as const) {
    if (settingsPanelSession.context !== context) continue;
    const wrap = root.querySelector<HTMLElement>(`.settings-wrap.context-${context}`);
    const primary = wrap?.querySelector<HTMLElement>(`.settings-primary-panel.settings-panel-${context}`);
    const secondary = wrap?.querySelector<HTMLElement>(`.settings-secondary-inline.settings-panel-${context}`);
    const moreRow = wrap?.querySelector<HTMLElement>('.settings-more-row');
    if (!wrap || !primary || !secondary || !moreRow) continue;

    primary.classList.remove('inline-up-safe', 'inline-down-safe', 'inline-up-overlap');
    const primaryRect = primary.getBoundingClientRect();
    const secondaryRect = secondary.getBoundingClientRect();
    const eastRect = root.querySelector<HTMLElement>('.seat-E')?.getBoundingClientRect() ?? null;
    const footprintRect = root.querySelector<HTMLElement>('.board-navigation-area')?.getBoundingClientRect() ?? null;
    const eastBottom = eastRect?.bottom ?? Number.NEGATIVE_INFINITY;
    const footprintBottom = footprintRect?.bottom ?? window.innerHeight;
    const expansionHeight = secondaryRect.height;
    const canExpandUpSafely = primaryRect.top - expansionHeight >= eastBottom;
    const canExpandDownSafely = primaryRect.bottom + expansionHeight <= footprintBottom;

    if (canExpandUpSafely) {
      primary.insertBefore(secondary, moreRow);
      primary.classList.add('inline-up-safe');
    } else if (canExpandDownSafely) {
      primary.appendChild(secondary);
      primary.classList.add('inline-down-safe');
    } else {
      primary.insertBefore(secondary, moreRow);
      primary.classList.add('inline-up-overlap');
    }
  }
}

function cloneHandForVariantSync(hand: Hand): Hand {
  return {
    S: [...hand.S],
    H: [...hand.H],
    D: [...hand.D],
    C: [...hand.C]
  };
}

function cardExistsInHandsForVariantSync(hands: Record<Seat, Hand>, cardId: CardId): boolean {
  const { suit, rank } = parseCardId(cardId);
  return seatOrder.some((seat) => hands[seat][suit].includes(rank));
}

function syncRepresentativeVariantWorld(viewState: State): void {
  const representativeId = viewState.ewVariantState?.representativeVariantId;
  const representative = viewState.ewVariantState?.variants.find((variant) => variant.id === representativeId);
  if (!representative) return;

  viewState.hands.E = cloneHandForVariantSync(representative.hands.E);
  viewState.hands.W = cloneHandForVariantSync(representative.hands.W);

  const threatCardIds = (viewState.threat?.threatCardIds ?? []).filter((cardId) => cardExistsInHandsForVariantSync(viewState.hands, cardId));
  const resourceCardIds = (viewState.resource?.resourceCardIds ?? []).filter((cardId) => cardExistsInHandsForVariantSync(viewState.hands, cardId));
  if (threatCardIds.length === 0 && resourceCardIds.length === 0) return;

  const threatSymbolByCardId = Object.fromEntries(
    Object.values(viewState.threat?.threatsBySuit ?? {})
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => [entry.threatCardId, entry.symbol])
      .filter(([cardId]) => threatCardIds.includes(cardId as CardId))
      .filter(([, symbol]) => typeof symbol === 'string')
  ) as Partial<Record<CardId, string>>;

  const classification = initClassification(
    { hands: viewState.hands },
    threatCardIds,
    resourceCardIds,
    undefined,
    threatSymbolByCardId
  );
  viewState.threat = classification.threat as State['threat'];
  viewState.resource = classification.resource as State['resource'];
  viewState.threatLabels = classification.labels as State['threatLabels'];
  viewState.cardRoles = { ...classification.perCardRole };
}

function pruneVariantsByUserDdError(viewState: State, survivingVariantIds: string[]): void {
  if (!viewState.ewVariantState) return;
  if (survivingVariantIds.length === 0 || survivingVariantIds.length === viewState.ewVariantState.activeVariantIds.length) return;

  viewState.ewVariantState.activeVariantIds = [...survivingVariantIds];
  viewState.ewVariantState.committedVariantId = survivingVariantIds.length === 1 ? survivingVariantIds[0] ?? null : null;
  if (!survivingVariantIds.includes(viewState.ewVariantState.representativeVariantId)) {
    viewState.ewVariantState.representativeVariantId = survivingVariantIds[0] ?? viewState.ewVariantState.representativeVariantId;
  }
  syncRepresentativeVariantWorld(viewState);
}

function classifyDdErrorForReplay(
  replayState: State,
  replayProblem: ProblemWithThreats,
  play: Play,
  playedCardIds: string[]
): boolean | undefined {
  const legal = legalPlays(replayState).filter((candidate) => candidate.seat === replayState.turn);
  if (legal.length === 0) return undefined;
  const chosen = toCardId(play.suit, play.rank) as CardId;
  const legalCardIds = legal.map((candidate) => toCardId(candidate.suit, candidate.rank) as CardId);
  try {
    const dds = queryDdsNextPlays({
      openingLeader: replayProblem.leader,
      initialHands: replayProblem.hands,
      contract: replayState.contract,
      playedCardIds
    });
    if (!dds.ok) return undefined;
    const scoreByCard = buildDdsScoreByCard(dds.result.plays);
    const scoredLegal = legalCardIds.filter((card) => scoreByCard.has(card));
    if (scoredLegal.length === 0) return undefined;
    const maxScore = Math.max(...scoredLegal.map((card) => scoreByCard.get(card) ?? Number.NEGATIVE_INFINITY));
    const chosenScore = scoreByCard.get(chosen);
    if (typeof chosenScore !== 'number') return undefined;
    return chosenScore < maxScore;
  } catch {
    return undefined;
  }
}

function classifyHintForReplay(
  replayState: State,
  replayProblem: ProblemWithThreats,
  playedCardIds: string[]
): HintState | null {
  const legal = legalPlays(replayState).filter((candidate) => candidate.seat === replayState.turn);
  if (legal.length === 0) return null;
  const legalCardIds = legal.map((candidate) => toCardId(candidate.suit, candidate.rank) as CardId);
  const dds = queryDdsNextPlays({
    openingLeader: replayProblem.leader,
    initialHands: replayProblem.hands,
    contract: replayState.contract,
    playedCardIds
  });
  if (!dds.ok) return {
    bestCards: [],
    badCards: [],
    textLine: 'BEST: (DDS unavailable)'
  };
  const scoreByCard = buildDdsScoreByCard(dds.result.plays);
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const cardId of legalCardIds) {
    const score = scoreByCard.get(cardId);
    if (typeof score === 'number' && score > bestScore) bestScore = score;
  }
  if (!Number.isFinite(bestScore)) {
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
  return {
    bestCards,
    badCards,
    textLine: `BEST: ${bestCards.join(' ')}`
  };
}

function buildUnknownModeVariantReplayData(
  activeVariantIds: string[]
): Map<string, UnknownModeVariantReplay> | null {
  if (activeVariantIds.length <= 1) return null;
  const rawEvents = (rawSemanticReducer.snapshot() as { events: Array<{ type: string; seat?: Seat; card?: CardId; details?: Record<string, unknown> }> }).events;
  const playedEvents = buildUnknownModePlayedEvents(rawEvents);
  return buildUnknownModeVariantReplayDataShared(
    activeVariantIds,
    playedEvents,
    (variantId) => resolveProblemById(currentProblemId, variantId),
    classifyDdErrorForReplay
  );
}

function unknownModeVariantReplayMap(): Map<string, UnknownModeVariantReplay> | null {
  if (!versionUnknownModeEnabled()) {
    unknownModeVariantReplayData = null;
    return null;
  }
  const activeVariantIds = currentViewState().ewVariantState?.activeVariantIds ?? [];
  unknownModeVariantReplayData = buildUnknownModeVariantReplayData(activeVariantIds);
  return unknownModeVariantReplayData;
}

function teachingEntriesForUnknownMode(): TeachingEntryView[] | null {
  const perVariant = unknownModeVariantReplayMap();
  if (!perVariant || perVariant.size <= 1) return null;
  return mergeUnknownTeachingEntries(perVariant as any, variantLabelPrefix) as TeachingEntryView[];
}

function ddsTeachingSummariesForUnknownMode(): Array<string | { labels: string[]; text: string }[]> | null {
  const perVariant = unknownModeVariantReplayMap();
  if (!perVariant || perVariant.size <= 1) return null;
  return mergeUnknownDdsSummaries(perVariant as any, variantLabelPrefix);
}

function syncWidgetNarrationFeedFromTeaching(): void {
  if (!isWidgetShellMode) return;
  const unknownEntries = teachingEntriesForUnknownMode();
  const snapshot = teachingReducer.snapshot() as {
    entries: Array<{ seq: number; seat: string; card: string; summary: string; reasons: string[]; effects: string[] }>;
  };
  const semanticEntries: TeachingEntryView[] = unknownEntries ?? (snapshot.entries ?? []);
  const displayEntries = buildTeachingDisplayEntries(semanticEntries, verboseDetailEnabled());
  const entries = buildWidgetNarrationEntries(displayEntries).map((entry) => ({
    ...entry,
    seat: seatOrder.includes(entry.seat as Seat) ? (entry.seat as Seat) : null,
    seq: entry.seq ?? 0
  }));
  for (const entry of entries) {
    if (entry.seq <= handDiagramSession.lastNarratedSeq) continue;
    const narr: HandDiagramNarrationEntry = entry;
    handDiagramSession.narrationEntries.push(narr);
    if (handDiagramSession.narrationEntries.length > 500) {
      handDiagramSession.narrationEntries = handDiagramSession.narrationEntries.slice(-500);
    }
    handDiagramSession.narrationLatest = narr;
    if (entry.seat) handDiagramSession.narrationBySeat[entry.seat] = narr;
    handDiagramSession.lastNarratedSeq = entry.seq;
  }
  if (narrate && !activeHint && handDiagramSession.narrationLatest) {
    handDiagramSession.status = { type: 'narration', text: handDiagramSession.narrationLatest.text };
  }
}

function widgetReadingMode(): boolean {
  if (!isWidgetShellMode) return false;
  return ddsPlayHistory.length === 0 && state.trick.length === 0 && !trickFrozen;
}

function hintDiag(message: string): void {
  console.info(`[HINT] ${message}`);
  if (!enabledLogChannels.has('hints')) return;
  logs = [...logs, `[HINT] ${message}`].slice(-500);
}

function verboseDetailEnabled(): boolean {
  return enabledLogChannels.has('verboseInternals');
}

function channelForLogLine(line: string): LogChannelId | null {
  if (!line.trim()) return null;
  if (line.startsWith('----- PLAY') || line.startsWith('play ')) return 'play';
  if (line.startsWith('[DDS') || line.startsWith('[DD-POLICY]')) return 'dds';
  if (line.startsWith('[EW-VARIANT')) return 'variants';
  if (line.startsWith('[PLAYAGAIN]')) return line.includes('coverage') ? 'coverage' : 'replay';
  if (line.startsWith('[EQ]') || line.startsWith('[EQC') || line.includes('DEFENDER EQ')) return 'eq';
  if (line.startsWith('[THREAT')) return 'threat';
  if (line.startsWith('[HINT]')) return 'hints';
  if (line.startsWith('[UNDO]') || line.startsWith('[RUNSTATUS]') || line.startsWith('[GOAL]')) return 'lifecycle';
  if (line.startsWith('[INV ') || line.startsWith('INV ')) return 'verboseInternals';
  if (line.startsWith('[PREFDISC]') || line.startsWith('[DDS-BACKSTOP]')) return 'dds';
  if (line.startsWith('[WARN]') || line.startsWith('[ERROR]') || line.startsWith('[VALIDATION]')) return 'validation';
  if (line.startsWith('autoplayDecision ') || line.startsWith('snapshot=')) return 'verboseInternals';
  return 'play';
}

function filteredLogLines(lines: string[]): string[] {
  return lines.filter((line) => {
    const channel = channelForLogLine(line);
    return !channel || enabledLogChannels.has(channel);
  });
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

    const scoreByCard = buildDdsScoreByCard(dds.result.plays);

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
  if (versionUnknownModeEnabled() && state.ewVariantState) {
    const activeVariantIds = state.ewVariantState.activeVariantIds;
    if (activeVariantIds.length > 0) {
      const replayMap = unknownModeVariantReplayMap();
      const hintSets: CardId[][] = [];
      for (const variantId of activeVariantIds) {
        const replayProblem = resolveProblemById(currentProblemId, variantId);
        const replayState = replayMap?.get(variantId)?.state ?? state;
        const hint = classifyHintForReplay(replayState, replayProblem, ddsPlayHistory);
        if (!hint || hint.textLine === 'BEST: (DDS unavailable)') {
          hintDiag(`dds query result variant=${variantId} ok=no reason=runtime-unavailable`);
          return {
            bestCards: [],
            badCards: [],
            textLine: 'BEST: (DDS unavailable)'
          };
        }
        hintDiag(`dds query result variant=${variantId} ok=yes best=${hint.bestCards.join(' ') || '-'}`);
        hintSets.push(hint.bestCards);
      }
      const commonBestCards = legalCardIds.filter((cardId) => hintSets.every((cards) => cards.includes(cardId)));
      if (commonBestCards.length === 0) {
        hintDiag(`classify result ST commonBest=- legal=${legalCardIds.join(' ') || '-'}`);
        return {
          bestCards: [],
          badCards: [...legalCardIds],
          textLine: 'BEST: (no common DDS move)'
        };
      }
      const badCards = legalCardIds.filter((cardId) => !commonBestCards.includes(cardId));
      hintDiag(`classify result ST BEST=${commonBestCards.join(' ') || '-'} BAD=${badCards.join(' ') || '-'}`);
      return {
        bestCards: commonBestCards,
        badCards,
        textLine: `BEST: ${commonBestCards.join(' ')}`
      };
    }
  }
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

    const scoreByCard = buildDdsScoreByCard(dds.result.plays);
    const rawDdsCards: string[] = [];
    for (const play of dds.result.plays ?? []) {
      rawDdsCards.push(`${play.suit}${String(play.rank)}`);
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
    const scoreByCard = buildDdsScoreByCard(dds.result.plays);
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

function rankStrengthForAdvance(rank: Rank): number {
  return { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 }[rank];
}

function chooseHintAdvanceCard(bestCards: CardId[]): CardId | null {
  if (bestCards.length === 0) return null;
  const suits = [...new Set(bestCards.map((cardId) => cardId[0] as Suit))].sort();
  const key = hintPositionKey() ?? `${currentSeed}:${ddsPlayHistory.join(',')}:${state.turn}`;
  let hash = currentSeed >>> 0;
  for (let i = 0; i < key.length; i += 1) hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
  const chosenSuit = suits[hash % suits.length] ?? suits[0];
  const suitCards = bestCards.filter((cardId) => (cardId[0] as Suit) === chosenSuit);
  suitCards.sort((a, b) => rankStrengthForAdvance(parseCardId(a).rank) - rankStrengthForAdvance(parseCardId(b).rank));
  return suitCards[0] ?? null;
}

function chooseSingleDefenderAdvancePlay(): Play | null {
  const seat = state.turn;
  if (seat !== 'E' && seat !== 'W') return null;
  if (articleScriptModeEnabled()) {
    const choicePresentation = currentArticleScriptChoicePresentation();
    const scriptedChoice = choicePresentation?.choice ?? null;
    if (scriptedChoice && scriptedChoice.seat === seat) {
      const chosenCardId = chooseCurrentArticleScriptBranchOption();
      if (!chosenCardId) return null;
      const legal = legalPlays(state).filter((candidate) => candidate.seat === seat);
      return legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === chosenCardId) ?? null;
    }
  }
  const legal = legalPlays(state).filter((candidate) => candidate.seat === seat);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0] ?? null;
  const policy = state.policies[seat];
  if (!policy) return legal[0] ?? null;
  const evaluated = evaluatePolicy({
    policy,
    seat,
    problemId: currentProblem.id,
    contractStrain: state.contract.strain,
    hands: state.hands,
    trick: state.trick,
    threat: state.threat as ThreatContext | null,
    resource: state.resource as any,
    threatLabels: state.threatLabels as DefenderLabels | null,
    ewVariantState: state.ewVariantState,
    rng: state.rng
  });
  const chosenCardId = evaluated.chosenCardId;
  if (!chosenCardId) return legal[0] ?? null;
  return legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === chosenCardId) ?? legal[0] ?? null;
}

function currentScriptedOpeningReplayCard(): CardId | null {
  if (articleScriptModeEnabled()) return null;
  const opening = startupOpeningForProblem(currentProblem);
  if (opening.length === 0) return null;
  const played = ddsPlayHistory;
  if (played.length >= opening.length) return null;
  for (let i = 0; i < played.length; i += 1) {
    if (opening[i] !== played[i]) return null;
  }
  return opening[played.length] ?? null;
}

function advanceOneWidgetCard(): boolean {
  if (trickFrozen) {
    unfreezeTrick(true);
  }
  if (state.phase === 'end') {
    render();
    return false;
  }
  if (articleScriptModeEnabled()) {
    const scriptStateId = currentArticleScriptStateId();
    const scriptSession = articleScriptCoordinator.getArticleScriptState();
    const nextCard = currentArticleScriptReplayCard();
    if (nextCard && scriptSession && (scriptStateId === 'in-script' || scriptStateId === 'pre-script')) {
      const playCursor = articleScriptCoordinator.appendReplayCardAtCursor(nextCard);
      if (playCursor !== null) {
        clearArticleScriptFollowPrompt();
        replayArticleScriptToCursor(scriptSession.cursor + 1);
        applyArticleScriptPlayStepFeedbackAtCursor(playCursor, nextCard);
        render();
        return true;
      }
    }
    const scriptedChoice = pendingArticleScriptChoice();
    if (scriptedChoice && (scriptStateId === 'in-script' || scriptStateId === 'pre-script')) {
      if (shouldAutoAdvanceNonExplicitChoiceForProfile({
        profile: currentArticleScriptInteractionProfile(),
        choice: scriptedChoice
      })) {
        const chosenCardId =
          chooseArticleScriptHintCard(scriptedChoice.options ?? []);
        const legal = chosenCardId
          ? legalPlays(state).filter((candidate) => candidate.seat === state.turn)
          : [];
        const play = chosenCardId
          ? legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === chosenCardId)
          : null;
        if (play) {
          runTurn(play);
          return true;
        }
      }
      render();
      return false;
    }
  }

  const scriptedOpeningCard = currentScriptedOpeningReplayCard();
  if (scriptedOpeningCard) {
    const legal = legalPlays(state).filter((candidate) => candidate.seat === state.turn);
    const play = legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === scriptedOpeningCard);
    if (!play) {
      render();
      return false;
    }
    runTurn(play);
    return true;
  }

  syncConfiguredUserControls();
  const userTurn = state.userControls.includes(state.turn);
  if (!userTurn) {
    const play = chooseSingleDefenderAdvancePlay();
    if (!play) {
      render();
      return false;
    }
    runTurn(play);
    return true;
  }

  const hint = classifyHintForCurrentPosition();
  if (!hint || hint.bestCards.length === 0) {
    requestHint();
    return false;
  }
  const chosenCardId = chooseHintAdvanceCard(hint.bestCards);
  if (!chosenCardId) {
    render();
    return false;
  }
  const legal = legalPlays(state).filter((candidate) => candidate.seat === state.turn);
  const play = legal.find((candidate) => (toCardId(candidate.suit, candidate.rank) as CardId) === chosenCardId);
  if (!play) {
    render();
    return false;
  }
  runTurn(play);
  return true;
}

function advanceWidgetToNextPauseBoundary(): void {
  if (articleScriptModeEnabled()) {
    const scriptState = currentArticleScriptStateId();
    if (scriptState === 'in-script' || scriptState === 'pre-script') {
      const rememberedBoundary = nextArticleScriptRememberedPauseCursor();
      if (rememberedBoundary !== null) {
        clearArticleScriptFollowPrompt();
        replayArticleScriptToCursor(rememberedBoundary);
        render();
        return;
      }
      advanceArticleScriptToNextPauseOrEnd();
      render();
      return;
    }
  }
  let advanced = false;
  if (trickFrozen) {
    unfreezeTrick(true);
    advanced = true;
  }
  const guard = 32;
  for (let i = 0; i < guard; i += 1) {
    if (state.phase === 'end') break;
    const moved = advanceOneWidgetCard();
    advanced = advanced || moved;
    if (!moved || trickFrozen) break;
  }
  if (!advanced) render();
}

function encodeUserHistoryForUrl(history: CardId[]): string {
  return history.map((card) => `${card[0]}${card.slice(1) === 'T' ? '10' : card.slice(1)}`).join('.');
}

function requestHint(): void {
  if (!hintsEnabled) return;
  hintDiag('requestHint start');
  const reqSeq = ++hintRequestSeq;
  const continueWithHint = (): void => {
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
        handDiagramSession.status = { type: 'hint', text: activeHint.textLine };
        hintDiag('activeHint set (fallback)');
        render();
        return;
      }
      hintDiag(`classify ok BEST=${hint.bestCards.join(' ') || '-'} BAD=${hint.badCards.join(' ') || '-'}`);
      activeHint = hint;
      activeHintKey = key;
      handDiagramSession.status = { type: 'hint', text: hint.textLine };
      hintDiag(`activeHint set best=${hint.bestCards.join(' ')} bad=${hint.badCards.join(' ') || '-'}`);
      render();
    }, 0);
  };

  if (getDdsRuntimeStatus() !== 'ready') {
    ddsLoadingForHint = true;
    hintLoading = false;
    render();
    void ensureDdsRuntime().then((ready) => {
      if (reqSeq !== hintRequestSeq) return;
      ddsLoadingForHint = false;
      if (!ready) {
        activeHint = {
          bestCards: [],
          badCards: [],
          textLine: 'BEST: (DDS unavailable)'
        };
        handDiagramSession.status = { type: 'hint', text: activeHint.textLine };
        render();
        return;
      }
      continueWithHint();
    });
    return;
  }

  continueWithHint();
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
  handDiagramSession.status = { type: 'hint', text: hint.textLine };
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

function rankPalette(colorClass: string): { text: string; background: string } {
  if (colorClass === 'rank--purple') return { text: '#8a5db5', background: 'rgba(138, 93, 181, 0.06)' };
  if (colorClass === 'rank--green') return { text: '#197f4b', background: 'rgba(25, 127, 75, 0.06)' };
  if (colorClass === 'rank--blue') return { text: '#315fb9', background: 'rgba(49, 95, 185, 0.06)' };
  if (colorClass === 'rank--amber') return { text: '#a86416', background: 'rgba(168, 100, 22, 0.06)' };
  if (colorClass === 'rank--grey') return { text: '#6a655d', background: 'rgba(106, 101, 93, 0.16)' };
  return { text: '#1c1917', background: 'transparent' };
}

function rankColorVisualForCard(
  view: State,
  seat: Seat,
  cardId: CardId
): RankColorVisual {
  if (!versionUnknownModeEnabled()) {
    return buildRegularCardDisplayProjection(
      cardId,
      view,
      view.goalStatus,
      teachingMode,
      cardColoringEnabled
    ).visual;
  }
  const replayData = unknownModeVariantReplayData ?? unknownModeVariantReplayMap();
  return buildUnknownMergedRankColorVisual(
    view,
    seat,
    cardId,
    teachingMode,
    cardColoringEnabled,
    replayData && replayData.size > 1
      ? [...replayData.values()].map((variant) => ({
          threat: variant.state.threat as any,
          threatLabels: variant.state.threatLabels as any,
          cardRoles: variant.state.cardRoles as any,
          goalStatus: variant.state.goalStatus
        }))
      : undefined
  );
}

function applyRankVisual(target: HTMLElement, visual: RankColorVisual): void {
  if (visual.kind === 'solid') {
    target.classList.add(visual.colorClass);
    return;
  }
  const palettes = visual.colors.map(rankPalette);
  target.classList.add('rank--mixed');
  target.style.color = '#1c1917';
  if (visual.kind === 'split') {
    target.style.backgroundImage = `linear-gradient(135deg, ${palettes[0]?.background ?? 'transparent'} 0 50%, ${palettes[1]?.background ?? 'transparent'} 50% 100%)`;
    return;
  }
  const step = 100 / palettes.length;
  const stops = palettes.flatMap((palette, index) => {
    const start = Number((index * step).toFixed(2));
    const end = Number(((index + 1) * step).toFixed(2));
    return [`${palette.background} ${start}%`, `${palette.background} ${end}%`];
  });
  target.style.backgroundImage = `linear-gradient(180deg, ${stops.join(', ')})`;
}

function appendRankContent(target: HTMLElement, rank: Rank, colorVisual: RankColorVisual, isEquivalent = false): void {
  const wrap = document.createElement('span');
  wrap.className = `rank${isEquivalent ? ' eq-underline' : ''}`;
  applyRankVisual(wrap, colorVisual);

  if (rank !== 'T') {
    wrap.textContent = displayRank(rank);
    target.appendChild(wrap);
    return;
  }

  const ten = document.createElement('span');
  ten.className = `rank ten${isEquivalent ? ' eq-underline' : ''}`;
  applyRankVisual(ten, colorVisual);
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

function withHintPrompt(text: string, view: State): string {
  const shouldPrompt =
    alwaysHint &&
    hintsEnabled &&
    !activeHint &&
    runStatus !== 'success' &&
    runStatus !== 'failure' &&
    state.userControls.includes(view.turn) &&
    (!trickFrozen || canLeadDismiss) &&
    (displayMode === 'practice' || isWidgetShellMode);
  if (!shouldPrompt) return text;
  if (displayMode === 'practice' && isSolutionViewingProfile(currentPracticeInteractionProfile())) {
    return `${text} Press 💡 for hint or > to advance one card`;
  }
  return `${text} Press 💡 for hint`;
}

function positionEncapsulationForLog(view: State): string {
  const hands = {
    N: { S: [...view.hands.N.S], H: [...view.hands.N.H], D: [...view.hands.N.D], C: [...view.hands.N.C] },
    E: { S: [...view.hands.E.S], H: [...view.hands.E.H], D: [...view.hands.E.D], C: [...view.hands.E.C] },
    S: { S: [...view.hands.S.S], H: [...view.hands.S.H], D: [...view.hands.S.D], C: [...view.hands.S.C] },
    W: { S: [...view.hands.W.S], H: [...view.hands.W.H], D: [...view.hands.W.D], C: [...view.hands.W.C] }
  };
  const detailed = inferPositionEncapsulationDetailed({
    hands,
    turn: view.turn,
    suitOrder: ['S', 'H', 'D', 'C'],
    threatCardIds: view.threat?.threatCardIds ?? [],
    preferredPrimaryBySuit: inversePrimaryBySuit
  });
  inversePrimaryBySuit = { ...inversePrimaryBySuit, ...detailed.primaryBySuit };
  return detailed.text;
}

function inverseLongDebugLines(view: State): string[] {
  if (!(verboseDetailEnabled() && showDebugSection)) return [];
  const hands = {
    N: { S: [...view.hands.N.S], H: [...view.hands.N.H], D: [...view.hands.N.D], C: [...view.hands.N.C] },
    E: { S: [...view.hands.E.S], H: [...view.hands.E.H], D: [...view.hands.E.D], C: [...view.hands.E.C] },
    S: { S: [...view.hands.S.S], H: [...view.hands.S.H], D: [...view.hands.S.D], C: [...view.hands.S.C] },
    W: { S: [...view.hands.W.S], H: [...view.hands.W.H], D: [...view.hands.W.D], C: [...view.hands.W.C] }
  };
  const explained = explainPositionInverse({
    hands,
    turn: view.turn,
    suitOrder: ['S', 'H', 'D', 'C'],
    threatCardIds: view.threat?.threatCardIds ?? [],
    preferredPrimaryBySuit: inversePrimaryBySuit
  });
  inversePrimaryBySuit = { ...inversePrimaryBySuit, ...explained.primaryBySuit };

  const lines: string[] = [];
  for (const suit of explained.suits) {
    const cards = `N:${suit.cards.N.join('') || '-'} S:${suit.cards.S.join('') || '-'} W:${suit.cards.W.join('') || '-'} E:${suit.cards.E.join('') || '-'}`;
    lines.push(`INV ${suit.suit} slot=${suit.slotIndex}/${suit.totalSlots} header=${suit.header} chosen=${suit.finalText}`);
    lines.push(`      cards=${cards}`);
    lines.push(
      `      primary=${suit.chosenPrimary}${suit.preferredPrimary ? ` (preferred=${suit.preferredPrimary})` : ''}`
    );
    lines.push(
      `      winners=${suit.winners.join(' ') || '-'} structuralLows=${suit.structuralLows.join(' ') || '-'} threats=${suit.threatCandidates.join(' ') || '-'}`
    );
    lines.push(`      bindings=${suit.bindingLabels.join(' ') || '-'}`);
    const stopperSummary =
      suit.stopChecks.map((c) => `${c.seat}${c.rank}[W:${c.westStops ? 'Y' : 'N'} E:${c.eastStops ? 'Y' : 'N'} b${c.backing}]`).join(' ') || '-';
    lines.push(`      stops=${stopperSummary}`);
    lines.push(
      `      count=${suit.countSummary} tieBreak=${suit.threatCardTieBreakUsed ? 'threatCardIds' : 'none'} lineageOU=${suit.lineageOuResolutionUsed ? 'used' : 'no'}`
    );
  }
  return lines;
}

function rebuildPracticeSession(setId: PracticeSetId): void {
  if (!practiceSession) return;
  const entries = buildPracticeQueue(setId);
  practiceSetId = setId;
  practiceProblemOverrides = new Map(entries.map((entry) => [entry.id, entry.problem as ProblemWithThreats] as const));
  practiceSession.setId = setId;
  practiceSession.queue = entries.map((entry) => entry.id);
  practiceSession.queueIndex = 0;
  practiceSession.attempted = 0;
  practiceSession.solved = 0;
  practiceSession.perfect = 0;
  practiceSession.currentUndoCount = 0;
  practiceSession.perPuzzleUndoCount = {};
  practiceSession.isTerminal = false;
  practiceSession.terminalOutcome = null;
  practiceSession.interactionProfile = 'puzzle-solving';
  practiceSession.scoredThisRun = false;

  const firstId = practiceSession.queue[0];
  if (!firstId) return;
  selectProblem(firstId);
}

function applyPracticeDisplayDefaults(profile: PracticeInteractionProfile): void {
  if (!practiceSession) return;
  autoplayEw = true;
  autoplaySingletons = true;
  if (currentPuzzleModeId() === 'standard') {
    assistLevelByMode = { ...assistLevelByMode, standard: resolveStandardPracticeAssistLevel(profile) };
    applyCurrentAssistLevelToControls();
    showWidgetTeachingPane = false;
    return;
  }
  const toggles = resolveNonStandardPracticeAssistToggles(profile);
  alwaysHint = toggles.alwaysHint;
  narrate = toggles.narrate;
  cardColoringEnabled = toggles.cardColoring;
  autoplaySingletons = true;
  showWidgetTeachingPane = false;
}

function beginPracticeRun(profile: PracticeInteractionProfile): void {
  if (!practiceSession) return;
  practiceSession.interactionProfile = profile;
  practiceSession.isTerminal = false;
  practiceSession.terminalOutcome = null;
  practiceSession.currentUndoCount = 0;
  practiceSession.perPuzzleUndoCount[currentProblemId] = 0;
  practiceSession.scoredThisRun = false;
  practiceClaimDebug = null;
  clearWidgetMessage();
  resetWidgetReadingControlsReveal();
  applyPracticeDisplayDefaults(profile);
}

function onPracticeTerminal(outcome: 'success' | 'failure'): void {
  if (!practiceSession) return;
  practiceSession.isTerminal = true;
  practiceSession.terminalOutcome = outcome;
  if (practiceSession.scoredThisRun) return;
  practiceSession.scoredThisRun = true;
  if (!shouldScorePracticeProfile(currentPracticeInteractionProfile())) return;
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
  beginPracticeRun('puzzle-solving');
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
  if (!practiceSession || !shouldScorePracticeProfile(currentPracticeInteractionProfile())) return;
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
    interactionProfile: practiceSession.interactionProfile
  } as const;
  if (!onLead || !needsAllRemaining) {
    const message = 'Claim is only available on lead for the remaining tricks';
    setMessage(handDiagramSession, message);
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
  setMessage(handDiagramSession, message);
  practiceClaimDebug = {
    ...baseDebug,
    claimDecision: 'rejected-bridge',
    claimMessage: message,
    reachableWinnerCount: reachableWinners,
    claimBridgeValid: false
  };
  render();
}

function endPracticeRun(): void {
  if (!practiceSession || !shouldScorePracticeProfile(currentPracticeInteractionProfile())) return;
  if (practiceSession.isTerminal || runStatus === 'success' || runStatus === 'failure') return;
  clearHint();
  clearWidgetMessage();
  state.phase = 'end';
  runStatus = 'failure';
  onPracticeTerminal('failure');
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
      `interactionProfile: ${practiceClaimDebug.interactionProfile}`
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
    policies[seat] = { ...policy, ddSource: 'off' };
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
    ewVariantState: src.ewVariantState
      ? {
          variants: src.ewVariantState.variants.map((variant) => ({
            id: variant.id,
            label: variant.label,
            hands: {
              E: { S: [...variant.hands.E.S], H: [...variant.hands.E.H], D: [...variant.hands.E.D], C: [...variant.hands.E.C] },
              W: { S: [...variant.hands.W.S], H: [...variant.hands.W.H], D: [...variant.hands.W.D], C: [...variant.hands.W.C] }
            }
          })),
          activeVariantIds: [...src.ewVariantState.activeVariantIds],
          committedVariantId: src.ewVariantState.committedVariantId,
          representativeVariantId: src.ewVariantState.representativeVariantId
        }
      : null,
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
    currentProblemVariantId,
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
  currentProblemVariantId = snapshot.currentProblemVariantId;
  currentProblem = resolveProblemById(currentProblemId, currentProblemVariantId);
  syncConfiguredUserControls();
  currentSeed = snapshot.currentSeed;
  logs = [...snapshot.logs];
  deferredLogLines = [...snapshot.deferredLogLines];
  trickFrozen = snapshot.trickFrozen;
  lastCompletedTrick = cloneCompletedTrick(snapshot.lastCompletedTrick);
  frozenViewState = snapshot.frozenViewState ? cloneStateForLog(snapshot.frozenViewState) : null;
  syncConfiguredUserControls();
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
  if (!enabledLogChannels.has('eq') || defenderEqInitPrinted || defenderEqInitByKey.size === 0) return;
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
        ? ([`tier${level}a`, `tier${level}b`, `tier${level}c`] as const)
        : (['tier3a', 'tier3b', 'tier3c', 'tier4a', 'tier4b', 'tier4c'] as const);
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
    if (chosenBucket === 'tier2a' || chosenBucket === 'tier2b') return `semiIdle:${card[0]}`;
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

function policyClassForTier(shadow: State, seat: 'E' | 'W', card: CardId, tier: string): string {
  if (tier.startsWith('tier1') || tier === 'follow:idle-cheap-win') return 'idle:tier1';
  if (tier === 'tier2' || tier === 'tier2a' || tier === 'tier2b') return `semiIdle:${card[0]}`;
  if (tier.startsWith('tier3') || tier.startsWith('tier4') || tier === 'follow:busy-protect-threat') return `busy:${card[0]}`;
  return classInfoForCard(shadow, seat, card).classId;
}

function manualDefenderDecisionContext(shadow: State, play: Play): {
  source: string;
  chosenBucket?: string;
  bucketCards?: CardId[];
  policyClassByCard?: Record<string, string>;
  ddPolicy?: {
    mode: 'strict';
    source: 'runtime';
    problemId: string;
    signature: string;
    baseCandidates: CardId[];
    allowedCandidates: CardId[];
    optimalMoves: CardId[];
    bound: boolean;
    fallback: boolean;
    path: 'intersection' | 'dd-fallback' | 'base-fallback';
  };
  legalCount?: number;
} | undefined {
  if ((play.seat !== 'E' && play.seat !== 'W') || autoplayEw) return undefined;
  const policy = shadow.policies[play.seat];
  if (!policy) return undefined;

  const legal = legalPlays(shadow).filter((candidate) => candidate.seat === play.seat);
  const chosenCardId = toCardId(play.suit, play.rank) as CardId;
  if (policy.kind === 'threatAware' || policy.kind === 'randomLegal') {
    const evaluated = evaluatePolicy({
      policy,
      seat: play.seat,
      problemId: shadow.id,
      contractStrain: shadow.contract.strain,
      hands: shadow.hands,
      trick: shadow.trick,
      threat: shadow.threat as any,
      resource: shadow.resource as any,
      threatLabels: shadow.threatLabels as any,
      ewVariantState: shadow.ewVariantState,
      rng: shadow.rng
    });
    const fabricatedEvent: Extract<EngineEvent, { type: 'autoplay' }> = {
      type: 'autoplay',
      play,
      chosenBucket: evaluated.chosenBucket,
      bucketCards: evaluated.bucketCards,
      policyClassByCard: evaluated.policyClassByCard,
      tierBuckets: evaluated.tierBuckets,
      ddPolicy: evaluated.ddPolicy,
      ewVariantTrace: evaluated.ewVariantTrace
    };
    const tierByCard = computeTierByCardForDecision(shadow, fabricatedEvent);
    const chosenTier = tierByCard.get(chosenCardId) ?? evaluated.chosenBucket ?? 'manual';
    const bucketCards = [...tierByCard.entries()]
      .filter(([, tier]) => tier === chosenTier)
      .map(([card]) => card);
    const policyClassByCard: Record<string, string> = { ...(evaluated.policyClassByCard ?? {}) };
    for (const card of bucketCards) {
      if (!policyClassByCard[card]) {
        policyClassByCard[card] = policyClassForTier(shadow, play.seat, card, chosenTier);
      }
    }
    if (!policyClassByCard[chosenCardId]) {
      policyClassByCard[chosenCardId] = policyClassForTier(shadow, play.seat, chosenCardId, chosenTier);
    }
    return {
      source: 'manual-ew',
      chosenBucket: chosenTier,
      bucketCards,
      policyClassByCard,
      ddPolicy: evaluated.ddPolicy,
      legalCount: legal.length
    };
  }
  return {
    source: 'manual-ew',
    chosenBucket: 'manual',
    bucketCards: [chosenCardId],
    policyClassByCard: { [chosenCardId]: classInfoForCard(shadow, play.seat, chosenCardId).classId },
    legalCount: legal.length
  };
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
): Map<CardId, CardStatusSnapshotEntry> {
  void ctx;
  void labels;
  return buildCardStatusSnapshot(s, teachingMode);
}

function maybeEmitTeachingRecolorEvents(
  triggerCardId: CardId,
  beforeSnap: Map<CardId, CardStatusSnapshotEntry>,
  afterSnap: Map<CardId, CardStatusSnapshotEntry>
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
    const leadSuit = s.trick[0]?.suit ?? null;
    const hand = s.hands[event.play.seat][event.play.suit];
    const idx = hand.indexOf(event.play.rank);
    if (idx >= 0) {
      hand.splice(idx, 1);
    }
    if (s.ewVariantState && (event.play.seat === 'E' || event.play.seat === 'W')) {
      for (const variant of s.ewVariantState.variants) {
        if (!s.ewVariantState.activeVariantIds.includes(variant.id)) continue;
        const variantHand = variant.hands[event.play.seat][event.play.suit];
        const variantIdx = variantHand.indexOf(event.play.rank);
        if (variantIdx >= 0) {
          variantHand.splice(variantIdx, 1);
        }
      }
      if (leadSuit && event.play.suit !== leadSuit) {
        const survivingVariantIds = s.ewVariantState.activeVariantIds.filter((variantId) => {
          const variant = s.ewVariantState?.variants.find((item) => item.id === variantId);
          return variant ? variant.hands[event.play.seat][leadSuit].length === 0 : false;
        });
        pruneVariantsByUserDdError(s, survivingVariantIds);
      }
    }
    s.trick.push({ ...event.play });
    s.trickClassIds.push(`${event.play.seat}:${classId}`);
    if (s.threat && s.threatLabels) {
      const next = updateClassificationAfterPlay(
        {
          threat: s.threat,
          resource: (s.resource as NonNullable<State['resource']>) ?? { resourceCardIds: [], resourcesBySuit: {} },
          labels: s.threatLabels,
          perCardRole: s.cardRoles
        },
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
      s.resource = next.resource as State['resource'];
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

      if (enabledLogChannels.has('dds')) {
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
        if (event.browserDdBackstop) {
          const bs = event.browserDdBackstop;
          playLine += ` | ddsBackstop=${bs.overridden ? 'override' : 'pass'} (policy=${bs.policyChoice}; final=${bs.finalChoice}; safe=${bs.safeCandidates.join(',') || '-'})`;
        }
        if (event.ddPolicy) {
          playLine += ` | ddPolicy=${event.ddPolicy.bound ? 'bound' : 'fallback'}:${event.ddPolicy.path}`;
        }
      }
      lines.push(playLine);
    }

    if (event.type === 'autoplay') {
      if (enabledLogChannels.has('dds') && event.browserDdBackstop) {
        lines.push(
          `[DDS-BACKSTOP] legal={${event.browserDdBackstop.legalCandidates.join(',') || '-'}} policy=${event.browserDdBackstop.policyChoice} safe={${event.browserDdBackstop.safeCandidates.join(',') || '-'}} final=${event.browserDdBackstop.finalChoice} override=${event.browserDdBackstop.overridden ? 'yes' : 'no'} reason=${event.browserDdBackstop.reason}`
        );
      }
      if (enabledLogChannels.has('replay') && event.replay?.action === 'forced') {
        lines.push(`[PLAYAGAIN] forcing index=${event.replay.index ?? '?'} card=${event.replay.card ?? `${event.play.suit}${event.play.rank}`}`);
      }
      if (enabledLogChannels.has('replay') && event.replay?.action === 'disabled') {
        if (event.replay.reason === 'class-not-legal') {
          lines.push(
            `[PLAYAGAIN] force failed idx=${event.replay.index ?? '?'} forcedClass=${event.replay.forcedClassId ?? '-'} reason=class-not-legal; continuing unforced`
          );
        } else {
          lines.push(`[PLAYAGAIN] replay disabled due to ${event.replay.reason ?? 'mismatch'}`);
        }
      }
      if (enabledLogChannels.has('dds') && event.preferredDiscard) {
        const pref = event.preferredDiscard;
        if (pref.applied && pref.chosen) {
          lines.push(`[PREFDISC] seat=${event.play.seat} applied preferred discard=${pref.chosen}`);
        } else {
          lines.push(
            `[PREFDISC] seat=${event.play.seat} preferred=${pref.preferred.join('/')} not-applied reason=${pref.reason}`
          );
        }
      }
      if (enabledLogChannels.has('dds') && event.ddPolicy) {
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
      if (event.ewVariantTrace) {
        const trace = event.ewVariantTrace;
        lines.push(
          `[EW-VARIANTS] active={${trace.activeVariantIds.join(',') || '-'}} arbitration=${trace.arbitration} intersection={${trace.intersection.join(',') || '-'}} chosenVariant=${trace.chosenVariantId ?? '-'} chosenCard=${trace.chosenCardId ?? '-'}`
        );
        for (const variant of trace.perVariant) {
          lines.push(
            `[EW-VARIANT:${variant.variantId}] bucket=${variant.chosenBucket ?? '-'} preferred=${variant.chosenCardId ?? '-'} A={${variant.a.join(',') || '-'}} B[${variant.bBuckets.join(',') || '-'}]={${variant.b.join(',') || '-'}} C={${variant.c.join(',') || '-'}} D={${variant.d.join(',') || '-'}} playable={${variant.playable.join(',') || '-'}}`
          );
        }
        if (trace.arbitration === 'eliminate') {
          lines.push(`[EW-VARIANTS] no common playable card; eliminating all but ${trace.chosenVariantId ?? '-'}`);
        } else if (trace.arbitration === 'intersection') {
          lines.push(`[EW-VARIANTS] common playable set used; seeded choice=${trace.chosenCardId ?? '-'}`);
        }
      }
      if (threatDetail && verboseDetailEnabled()) {
        const leadSuit = shadow.trick[0]?.suit ?? 'none';
        const legalCount = legalPlays(shadow).length;
        lines.push(`autoplayDecision seat=${shadow.turn} leadSuit=${leadSuit} legal=${legalCount} chosen=${playText(event.play)}`);
      }

      const policy = shadow.policies[shadow.turn];
      if (
        enabledLogChannels.has('threat') &&
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
        if (threatDetail && verboseDetailEnabled()) {
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

    if (verboseDetailEnabled() && threatDetail && (event.type === 'played' || event.type === 'autoplay')) {
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

    if (enabledLogChannels.has('validation') && event.type === 'illegal') {
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
      if (verboseDetailEnabled()) {
        lines.push(`ENCAP ${positionEncapsulationForLog(shadow)}`);
        lines.push(...inverseLongDebugLines(shadow));
      }
      lines.push('');
      if (verboseDetailEnabled() && threatDetail && shadow.threat && shadow.threatLabels) {
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

  if (verboseDetailEnabled() && threatDetail) {
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
      if (enabledLogChannels.has('eq')) {
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
          enabledLogChannels.has('coverage') &&
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
      if (enabledLogChannels.has('eq')) {
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

function formatStrainText(strain: State['contract']['strain']): string {
  return strain === 'NT' ? 'NT' : suitSymbol[strain];
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
  if (articleScriptModeEnabled()) {
    syncConfiguredUserControls();
    const scriptedChoice = pendingArticleScriptChoice();
    const activeProfile = currentArticleScriptInteractionProfile();
    const storyAtInitialCursor = Boolean(
      articleScriptState
      && articleScriptState.cursor === articleScriptState.initialCursor
      && activeProfile === 'story-viewing'
    );
    const canAutoplayScript = canAutoplayArticleScriptDefender({
      autoplayEw,
      isUserTurn: currentProblem.userControls.includes(state.turn),
      profile: activeProfile,
      atInitialCursor: storyAtInitialCursor,
      phase: state.phase,
      trickFrozen,
      canLeadDismiss,
      choice: scriptedChoice,
      hasRememberedTail: currentArticleScriptHasRememberedTail()
    });
    if (!canAutoplayScript) {
      clearSingletonAutoplayTimer();
    } else {
      const key = `article:${articleScriptState?.cursor ?? 0}:${state.turn}:${trickFrozen ? 'frozen' : 'live'}`;
      if (!(singletonAutoplayTimer && singletonAutoplayKey === key)) {
        clearSingletonAutoplayTimer();
        singletonAutoplayKey = key;
        singletonAutoplayTimer = setTimeout(() => {
          if (!articleScriptModeEnabled() || !autoplayEw || currentProblem.userControls.includes(state.turn) || state.phase === 'end') {
            clearSingletonAutoplayTimer();
            return;
          }
          const liveChoice = pendingArticleScriptChoice();
          const liveProfile = currentArticleScriptInteractionProfile();
          if (!canAutoplayArticleScriptDefender({
            autoplayEw,
            isUserTurn: currentProblem.userControls.includes(state.turn),
            profile: liveProfile,
            atInitialCursor: Boolean(
              articleScriptState
              && articleScriptState.cursor === articleScriptState.initialCursor
              && liveProfile === 'story-viewing'
            ),
            phase: state.phase,
            trickFrozen,
            canLeadDismiss,
            choice: liveChoice,
            hasRememberedTail: currentArticleScriptHasRememberedTail()
          })) {
            clearSingletonAutoplayTimer();
            render();
            return;
          }
          clearSingletonAutoplayTimer();
          const moved = advanceOneWidgetCard();
          if (!moved) render();
        }, 150);
      }
      return;
    }
  }
  syncConfiguredUserControls();
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
    if (enabledLogChannels.has('threat') || enabledLogChannels.has('eq') || verboseDetailEnabled()) {
      if (!skipNextThreatInitRunIncrement) startNewLogRun();
      skipNextThreatInitRunIncrement = false;
      logs = [
        ...logs,
        `[THREAT:init] problem=${problemId} raw=- validation=OK`,
        `ENCAP ${positionEncapsulationForLog(state)}`,
        ...inverseLongDebugLines(state)
      ].slice(-500);
    }
    if (teachingEvents.length === 0) addTeachingEvent({ kind: 'info', at: 'Start', label: 'No teaching events yet.' });
    return;
  }
  if (!teachingEvents.some((e) => e.kind === 'threatSummary')) {
    addInitialThreatTeachingSummary(state);
  }

  if (enabledLogChannels.has('threat') || enabledLogChannels.has('eq') || verboseDetailEnabled()) {
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
    logs = [...logs, `ENCAP ${positionEncapsulationForLog(state)}`, ...inverseLongDebugLines(state)].slice(-500);
    logs = [...logs, ...formatUserEqInitBlock(state)].slice(-500);
    logs = [...logs, ...formatDefenderInventoryEqBlock(state)].slice(-500);
  }
}

function advanceAutoplayFromCurrentState(): void {
  const before = state;
  const ddsHistoryForTurn = [...ddsPlayHistory];
  const result = autoplayUntilUserOrEnd(state, {
    eventCollector: semanticCollector,
    autoplayBackstop: buildBrowserDdsBackstop(ddsHistoryForTurn)
  });
  state = result.state;
  syncConfiguredUserControls();
  threatCtx = (state.threat as ThreatContext | null) ?? null;
  threatLabels = (state.threatLabels as DefenderLabels | null) ?? null;
  collectTeachingRecolorEventsForTurn(before, result.events);
  const trickCompleteIndex = result.events.findIndex((event) => event.type === 'trickComplete');
  if (trickCompleteIndex >= 0) {
    const visibleEvents = result.events.slice(0, trickCompleteIndex + 1);
    const visibleShadow = cloneStateForLog(before);
    for (const event of visibleEvents) applyEventToShadow(visibleShadow, event);
    trickFrozen = true;
    frozenViewState = visibleShadow;
    const trickEvent = visibleEvents[visibleEvents.length - 1];
    if (trickEvent.type === 'trickComplete') {
      lastCompletedTrick = trickEvent.trick.map((p) => ({ ...p }));
    }
    canLeadDismiss = state.phase !== 'end' && state.trick.length === 0 && state.userControls.includes(state.turn);
  }
  const complete = result.events.find((e) => e.type === 'handComplete');
  if (complete?.type === 'handComplete') {
    runStatus = complete.success ? 'success' : 'failure';
  }
  clearDdErrorVisual();
  refreshThreatModel(currentProblemId, false);
}

function resetGame(seed: number, reason: string): void {
  clearSingletonAutoplayTimer();
  clearPulseTimer();
  pulseUntilByCardKey.clear();
  westInitialContentWidth = null;
  nsInitialFitWidth = null;
  diagramRowHeightPx = null;
  const nextSeed = seed >>> 0;
  if (nextSeed !== (currentSeed >>> 0)) {
    replayCoverage.triedByIdx.clear();
    replayCoverage.recordedRemainingByIdx.clear();
    replayCoverage.representativeByIdx.clear();
  }
  currentSeed = nextSeed;
  state = init({ ...withDdSource(currentProblem), rngSeed: currentSeed });
  syncConfiguredUserControls();
  resetSemanticStreams();
  teachingReducer.setTrumpSuit(state.trumpSuit);
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
  inevitableFailureAlert = false;
  clearWidgetNarrationFeed();
  clearHint();
  clearTeachingEvents();
  resetWidgetReadingControlsReveal();
  inversePrimaryBySuit = {};
  startPending = startupGateEnabledFromUrl;
  if (practiceSession) beginPracticeRun(practiceSession.interactionProfile);
  rebuildUserEqClassMapping(state);
  resetDefenderEqInitSnapshot();
  undoStack.length = 0;
  deferredLogLines = [];
  unfreezeTrick(false);
  refreshThreatModel(currentProblemId, false);
  if (articleScriptModeEnabled()) {
    autoplaySingletons = false;
    autoplayEw = false;
    resetToCurrentArticleCheckpoint();
  }
  render();
}

function selectProblem(problemId: string, variantId?: string | null): void {
  clearSingletonAutoplayTimer();
  clearPulseTimer();
  pulseUntilByCardKey.clear();
  westInitialContentWidth = null;
  nsInitialFitWidth = null;
  diagramRowHeightPx = null;
  const entry = demoProblems.find((p) => p.id === problemId);
  if (!entry && !practiceProblemOverrides.has(problemId)) return;
  currentProblemVariantId = practiceProblemOverrides.has(problemId) ? null : resolveProblemVariantId(problemId, variantId);
  currentProblem = resolveProblemById(problemId, currentProblemVariantId);
  currentProblemId = problemId;
  applyWidgetProblemDefaults();
  applyCurrentAssistLevelToControls();
  currentSeed = currentProblem.rngSeed >>> 0;
  state = init({ ...withDdSource(currentProblem), rngSeed: currentSeed });
  syncConfiguredUserControls();
  resetSemanticStreams();
  teachingReducer.setTrumpSuit(state.trumpSuit);
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
  inevitableFailureAlert = false;
  clearWidgetNarrationFeed();
  clearHint();
  clearTeachingEvents();
  inversePrimaryBySuit = {};
  startPending = startupGateEnabledFromUrl;
  if (practiceSession) beginPracticeRun(practiceSession.interactionProfile);
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
  if (articleScriptModeEnabled()) {
    autoplaySingletons = false;
    autoplayEw = false;
    resetToCurrentArticleCheckpoint();
  }
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
  if (articleScriptModeEnabled() && articleScriptWaitingOnDds()) {
    ensureArticleScriptDdsLoading();
    render();
    return;
  }
  if (ddErrorVisual && !trickFrozen && state.turn === ddErrorVisual.seat) {
    clearDdErrorVisual();
  }
  clearSingletonAutoplayTimer();
  clearHint();
  clearWidgetMessage();
  articleScriptCoordinator.applyTurnPlay(play);
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
    } else if (enabledLogChannels.has('eq')) {
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
  const manualDecision = manualDefenderDecisionContext(state, play);
  const userDdError = (play.seat === 'N' || play.seat === 'S')
    ? classifyDdErrorForUserPlay(play, ddsHistoryForTurn)
    : undefined;
  const variantDdErrorById =
    (play.seat === 'N' || play.seat === 'S') && versionUnknownModeEnabled() && state.ewVariantState && state.ewVariantState.activeVariantIds.length > 1
      ? Object.fromEntries(
          state.ewVariantState.activeVariantIds.map((variantId) => {
            const replayProblem = resolveProblemById(currentProblemId, variantId);
            return [variantId, classifyDdErrorForReplay(state, replayProblem, play, ddsHistoryForTurn)];
          })
        ) as Record<string, boolean | undefined>
      : null;
  if (play.seat === 'N' || play.seat === 'S') {
    if (alertMistakes && userDdError?.ddError) {
      if (articleScriptModeEnabled()) handDiagramSession.mistakeCount += 1;
      ddErrorVisual = {
        seat: play.seat,
        goodCards: [...userDdError.goodCards],
        badCard: toCardId(play.suit, play.rank) as CardId
      };
      inevitableFailureAlert = true;
    } else {
      clearDdErrorVisual();
    }
  }
  const result = apply(state, play, {
    eventCollector: semanticCollector,
    userDdError: userDdError?.ddError,
    manualDecision,
    autoplayBackstop: buildBrowserDdsBackstop(backstopHistoryForTurn)
  });
  state = result.state;
  if (variantDdErrorById) {
    const errorVariants = Object.entries(variantDdErrorById)
      .filter((entry): entry is [string, boolean] => entry[1] === true)
      .map(([variantId]) => variantId);
    const cleanVariants = Object.entries(variantDdErrorById)
      .filter((entry): entry is [string, boolean] => entry[1] === false)
      .map(([variantId]) => variantId);
    if (errorVariants.length > 0 && cleanVariants.length > 0) {
      pruneVariantsByUserDdError(state, errorVariants);
    }
  }
  syncConfiguredUserControls();
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
    if (variantDdErrorById) {
      const errorVariants = Object.entries(variantDdErrorById)
        .filter((entry): entry is [string, boolean] => entry[1] === true)
        .map(([variantId]) => variantId);
      const cleanVariants = Object.entries(variantDdErrorById)
        .filter((entry): entry is [string, boolean] => entry[1] === false)
        .map(([variantId]) => variantId);
      if (errorVariants.length > 0 && cleanVariants.length > 0) {
        pruneVariantsByUserDdError(visibleShadow, errorVariants);
      }
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
    if (enabledLogChannels.has('lifecycle')) {
      logs = [
        ...logs,
        `[GOAL] endOfRun=true goalStatus=${state.goalStatus} NSwon=${complete.tricksWon.NS} EWwon=${complete.tricksWon.EW} required${state.goal.side}>=${state.goal.n} success=${complete.success}`,
        `[RUNSTATUS] ${runStatus} -> ${nextStatus}`
      ].slice(-500);
    }
    runStatus = nextStatus;
    if (practiceSession) onPracticeTerminal(nextStatus);
  }

  clearArticleScriptFollowPrompt();
  syncArticleScriptCompletionProgress();
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

  const semanticLabel = document.createElement('label');
  const semanticBox = document.createElement('input');
  semanticBox.type = 'checkbox';
  semanticBox.checked = showSemanticReducer;
  semanticBox.onchange = () => {
    showSemanticReducer = semanticBox.checked;
    render();
  };
  semanticLabel.append(semanticBox, ' Show Semantic Reducer');
  row.appendChild(semanticLabel);

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

  panel.appendChild(row);
  return panel;
}

function renderLogChannelControls(): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'log-channel-panel debug-subsection';

  const title = document.createElement('strong');
  title.textContent = 'Log channels';
  panel.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'log-channel-actions';
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.textContent = 'All';
  allBtn.onclick = () => {
    enabledLogChannels = new Set(LOG_CHANNELS.map((channel) => channel.id));
    render();
  };
  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.textContent = 'None';
  noneBtn.onclick = () => {
    enabledLogChannels = new Set();
    render();
  };
  actions.append(allBtn, noneBtn);
  panel.appendChild(actions);

  for (const family of ['core', 'diagnostics', 'admin'] as const) {
    const familyChannels = LOG_CHANNELS.filter((channel) => channel.family === family);
    const familyWrap = document.createElement('details');
    familyWrap.className = 'log-channel-family';
    familyWrap.open = expandedLogFamilies.has(family);
    familyWrap.ontoggle = () => {
      if (familyWrap.open) expandedLogFamilies.add(family);
      else expandedLogFamilies.delete(family);
    };

    const summary = document.createElement('summary');
    const familyToggle = document.createElement('input');
    familyToggle.type = 'checkbox';
    const enabledCount = familyChannels.filter((channel) => enabledLogChannels.has(channel.id)).length;
    familyToggle.checked = enabledCount === familyChannels.length;
    familyToggle.indeterminate = enabledCount > 0 && enabledCount < familyChannels.length;
    familyToggle.onclick = (event) => event.stopPropagation();
    familyToggle.onchange = () => {
      if (familyToggle.checked) {
        familyChannels.forEach((channel) => enabledLogChannels.add(channel.id));
      } else {
        familyChannels.forEach((channel) => enabledLogChannels.delete(channel.id));
      }
      render();
    };
    const familyLabel = document.createElement('span');
    familyLabel.textContent = LOG_CHANNEL_FAMILY_LABEL[family];
    summary.append(familyToggle, familyLabel);
    familyWrap.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'log-channel-list';
    for (const channel of familyChannels) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = enabledLogChannels.has(channel.id);
      box.onchange = () => {
        if (box.checked) enabledLogChannels.add(channel.id);
        else enabledLogChannels.delete(channel.id);
        render();
      };
      label.append(box, ` ${channel.label}`);
      list.appendChild(label);
    }
    familyWrap.appendChild(list);
    panel.appendChild(familyWrap);
  }

  return panel;
}

function renderDebugSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'debug-section';
  section.appendChild(renderDebugControls());
  if (showLog) section.appendChild(renderLogChannelControls());

  if (showSemanticReducer) {
    section.appendChild(renderDebugPanel());
  }

  if (showLog) {
    const panel = document.createElement('section');
    panel.className = 'log-panel debug-subsection';

    const title = document.createElement('strong');
    title.textContent = 'Log';
    panel.appendChild(title);

    const log = document.createElement('div');
    log.className = 'log';
    const visibleLogs = filteredLogLines(logs);
    log.textContent = visibleLogs.length > 0 ? visibleLogs.join('\n') : 'No matching log lines';
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
  if (practiceSession) beginPracticeRun('puzzle-solving');
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
  if (enabledLogChannels.has('coverage')) {
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
  displayRanks: Rank[],
  legalSet: Set<string>,
  canAct: boolean,
  hintBestSet: Set<CardId>,
  ddErrorGoodSet: Set<CardId>,
  scriptedNextSet: Set<CardId>,
  scriptedChoiceSet: Set<CardId>,
  scriptedChoiceCompletedSet: Set<CardId>
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'suit-row';

  const suitEl = createSuitGlyph(suit);
  row.appendChild(suitEl);

  const cards = document.createElement('div');
  cards.className = 'cards holding';

  const regularDisplays = !versionUnknownModeEnabled()
    ? buildRegularSuitCardDisplays(
        view,
        seat,
        suit,
        teachingMode,
        cardColoringEnabled,
        shouldShowEquivalentUnderlinesCurrentSurface()
      )
    : null;
  const ranks = regularDisplays ? regularDisplays.map((item) => item.rank) : [...displayRanks];
  if (ranks.length > 0) {
    const hideSeatCards = hideEastWest && (seat === 'E' || seat === 'W');
    for (const rank of ranks) {
      if (hideSeatCards) {
        const hiddenEl = document.createElement('span');
        hiddenEl.className = 'rank-text muted rank-hidden';
        hiddenEl.textContent = '•';
        cards.appendChild(hiddenEl);
        continue;
      }
      const key = `${suit}${rank}`;
      const isLegal = canAct && legalSet.has(key);
      const cardId = toCardId(suit, rank) as CardId;
      const regularDisplay = regularDisplays?.find((item) => item.cardId === cardId) ?? null;
      const isEquivalent = regularDisplay?.isEquivalent ?? false;
      const colorVisual = regularDisplay?.visual ?? rankColorVisualForCard(view, seat, cardId);

      if (isLegal) {
        const rankBtn = document.createElement('button');
        rankBtn.type = 'button';
        rankBtn.className = 'rank-text legal';
        if (hintBestSet.has(cardId)) rankBtn.classList.add('hint-best');
        if (scriptedChoiceSet.has(cardId)) rankBtn.classList.add('script-choice');
        if (scriptedChoiceCompletedSet.has(cardId)) rankBtn.classList.add('script-choice-complete');
        if (scriptedNextSet.has(cardId)) rankBtn.classList.add('script-next');
        if (ddErrorGoodSet.has(cardId)) rankBtn.classList.add('dd-error-good');
        if ((pulseUntilByCardKey.get(cardPulseKey(seat, cardId)) ?? 0) > Date.now()) {
          rankBtn.classList.add('card-pulse');
        }
        appendRankContent(rankBtn, rank, colorVisual, isEquivalent);
        rankBtn.onclick = () => runTurn({ seat, suit, rank });
        cards.appendChild(rankBtn);
      } else {
        const rankEl = document.createElement('span');
        rankEl.className = 'rank-text muted';
        if (scriptedChoiceSet.has(cardId)) rankEl.classList.add('script-choice');
        if (scriptedChoiceCompletedSet.has(cardId)) rankEl.classList.add('script-choice-complete');
        if (scriptedNextSet.has(cardId)) rankEl.classList.add('script-next');
        if (ddErrorGoodSet.has(cardId)) rankEl.classList.add('dd-error-good');
        if ((pulseUntilByCardKey.get(cardPulseKey(seat, cardId)) ?? 0) > Date.now()) {
          rankEl.classList.add('card-pulse');
        }
        appendRankContent(rankEl, rank, colorVisual, isEquivalent);
        cards.appendChild(rankEl);
      }
    }
  }

  row.appendChild(cards);
  return row;
}

function createSuitGlyph(suit: Suit, extraClass = ''): HTMLSpanElement {
  const suitEl = document.createElement('span');
  suitEl.className = `suit-symbol suit-${suit}${extraClass ? ` ${extraClass}` : ''}`;
  suitEl.setAttribute('aria-label', suitName[suit]);
  const glyph = document.createElement('span');
  glyph.className = 'suit-glyph';
  glyph.textContent = suitSymbol[suit];
  suitEl.appendChild(glyph);
  return suitEl;
}

function renderSeatHand(view: State, seat: Seat): HTMLElement {
  const card = document.createElement('section');
  const active = view.turn === seat;
  card.className = `hand seat-${seat}`;

  const content = document.createElement('div');
  content.className = `hand-content${
    seat === 'W'
      ? ' hand-content-west'
      : seat === 'E'
        ? ' hand-content-east'
        : seat === 'N' || seat === 'S'
          ? ' hand-content-ns'
          : ''
  }`;

  const header = document.createElement('div');
  header.className = 'hand-head';
  header.innerHTML = `<strong class="seat-name${active ? ' active-seat-name' : ''}">${seatName[seat]}</strong>`;
  content.appendChild(header);
  if (isWidgetShellMode && narrate) {
    const entry = handDiagramSession.narrationBySeat[seat];
    if (entry?.text) {
      const bubble = document.createElement('aside');
      bubble.className = `narration-bubble seat-${seat}${handDiagramSession.narrationLatest?.seq === entry.seq ? ' is-latest' : ' is-stale'}`;
      bubble.textContent = entry.text;
      card.appendChild(bubble);
    }
  }

  const startBlocked = startPending && !trickFrozen;
  const legal = !trickFrozen && !startBlocked && active ? legalPlays(view) : [];
  const legalSet = new Set(legal.map((p) => `${p.suit}${p.rank}`));
  const canAct = !trickFrozen && !startBlocked && view.phase !== 'end' && view.userControls.includes(seat) && active;
  const hintBestSet = new Set<CardId>();
  const ddErrorGoodSet = new Set<CardId>();
  const scriptedChoiceBestSet = new Set<CardId>();
  const scriptedChoiceCompletedSet = new Set<CardId>();
  const scriptedNextSet = new Set<CardId>();

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
  if (ddErrorVisual && ddErrorVisual.seat === seat && shouldRevealDdErrorAlternativesCurrentContext()) {
    for (const card of ddErrorVisual.goodCards) ddErrorGoodSet.add(card);
  }
  const scriptedChoicePresentation = currentArticleScriptChoicePresentation();
  const scriptedChoice = scriptedChoicePresentation?.choice ?? null;
  if (scriptedChoicePresentation && scriptedChoicePresentation.rawChoice.seat === seat && seat === view.turn && shouldHighlightScriptChoiceForSeat(seat)) {
    for (const card of scriptedChoicePresentation.unresolvedOptions) scriptedChoiceBestSet.add(card);
    for (const card of scriptedChoicePresentation.completedOptions) scriptedChoiceCompletedSet.add(card);
  }
  const scriptedNextCard = currentArticleScriptReplayCard();
  if (!scriptedChoice && scriptedNextCard && seat === view.turn && shouldHighlightScriptNextForSeat(seat)) {
    scriptedNextSet.add(scriptedNextCard);
  }

  for (const suit of suitOrder) {
    const displayRanks =
      versionUnknownModeEnabled() && (seat === 'E' || seat === 'W')
        ? fixedRanksForSeatSuit(view.ewVariantState, seat, suit)
        : sortRanksDesc(view.hands[seat][suit]);
    const effectiveLegalSet = scriptedChoiceBestSet.size > 0 ? scriptedChoiceBestSet : legalSet;
    const effectiveHintBestSet = new Set<CardId>([...hintBestSet]);
    const effectiveScriptNextSet = new Set<CardId>([...scriptedNextSet]);
    content.appendChild(renderSuitRow(view, seat, suit, displayRanks, effectiveLegalSet, effectiveCanAct, effectiveHintBestSet, ddErrorGoodSet, effectiveScriptNextSet, scriptedChoiceBestSet, scriptedChoiceCompletedSet));
  }

  if (seat === 'W') {
    const anchor = document.createElement('div');
    anchor.className = 'hand-content-anchor hand-content-anchor-west';
    anchor.appendChild(content);
    card.appendChild(anchor);
  } else {
    card.appendChild(content);
  }

  return card;
}

function renderUnknownSlashLine(view: State): HTMLElement | null {
  if (!versionUnknownModeEnabled()) return null;
  const unresolved = unresolvedEwCardsBySuit(view.ewVariantState);
  const visibleSuits = suitOrder.filter((suit) => unresolved[suit].length > 0);
  const total = visibleSuits.reduce((sum, suit) => sum + unresolved[suit].length, 0);
  if (total === 0) return null;

  const line = document.createElement('aside');
  line.className = 'unknown-slash-line';
  line.setAttribute('aria-label', 'Unknown E/W cards across versions');

  const title = document.createElement('span');
  title.className = 'unknown-title';
  title.textContent = 'Unknown';
  line.appendChild(title);

  for (const suit of visibleSuits) {
    const chunk = document.createElement('span');
    chunk.className = `unknown-suit suit-${suit}`;
    const ranks = unresolved[suit].map((cardId) => displayRank(cardId.slice(1) as Rank)).join('');
    chunk.textContent = `${suitSymbol[suit]}${ranks || '-'}`;
    line.appendChild(chunk);
  }

  return line;
}

function renderBoardMeta(view: State): HTMLElement {
  const meta = document.createElement('aside');
  meta.className = 'board-meta';

  if (displayMode === 'practice') {
    const puzzleMode = currentPuzzleModeId();
    if (puzzleMode !== 'standard') {
      const modeLine = document.createElement('div');
      modeLine.className = 'board-meta-line board-meta-mode';
      modeLine.textContent = PUZZLE_MODE_LABEL[puzzleMode];
      meta.appendChild(modeLine);
    }
  }

  const initialTricksInDeal = seatOrder
    .filter((seat) => seat === 'N' || seat === 'S')
    .map((seat) => suitOrder.reduce((sum, suit) => sum + currentProblem.hands[seat][suit].length, 0))
    .reduce((max, count) => Math.max(max, count), 0);
  const showContractLine = view.goal.type === 'minTricks' && initialTricksInDeal === 13;

  if (showContractLine) {
    const contractLine = document.createElement('div');
    contractLine.className = 'board-meta-line';
    contractLine.appendChild(document.createTextNode('Contract: '));
    const levelValue = document.createElement('span');
    levelValue.className = 'board-meta-strain';
    const contractLevel = Math.max(0, view.goal.n - 6);
    if (view.contract.strain === 'NT') {
      levelValue.textContent = `${contractLevel}${formatStrainText(view.contract.strain)}`;
    } else {
      levelValue.textContent = String(contractLevel);
      levelValue.appendChild(renderSuitGlyph(view.contract.strain, { context: 'contract-strain' }));
    }
    contractLine.appendChild(levelValue);
    meta.appendChild(contractLine);
  } else {
    const strainLine = document.createElement('div');
    strainLine.className = 'board-meta-line';
    strainLine.appendChild(document.createTextNode('Strain: '));
    const strainValue = document.createElement('span');
    strainValue.className = 'board-meta-strain';
    if (view.contract.strain === 'NT') strainValue.textContent = formatStrainText(view.contract.strain);
    else strainValue.appendChild(renderSuitGlyph(view.contract.strain, { context: 'contract-strain' }));
    strainLine.appendChild(strainValue);
    meta.appendChild(strainLine);

    const goalLine = document.createElement('div');
    goalLine.className = 'board-meta-line';
    if (view.goal.type === 'minTricks') {
      goalLine.textContent = `Goal: ${view.goal.n}/${initialTricksInDeal}`;
    } else {
      goalLine.textContent = `Goal: ${formatGoal(view)}`;
    }
    meta.appendChild(goalLine);
  }

  const tricksLine = document.createElement('div');
  tricksLine.className = 'board-meta-line board-meta-line-tricks';
  tricksLine.appendChild(document.createTextNode('NS '));
  const nsTricks = document.createElement('span');
  nsTricks.className = 'board-meta-live-value';
  nsTricks.textContent = String(view.tricksWon.NS);
  tricksLine.appendChild(nsTricks);
  tricksLine.appendChild(document.createTextNode(' · EW '));
  const ewTricks = document.createElement('span');
  ewTricks.className = 'board-meta-live-value';
  ewTricks.textContent = String(view.tricksWon.EW);
  tricksLine.appendChild(ewTricks);
  meta.appendChild(tricksLine);

  return meta;
}

function renderDraftNotes(): HTMLElement | null {
  if (!currentEntryIsDraft()) return null;
  const notes = currentProblem.draftNotes ?? [];
  if (notes.length === 0) return null;

  const box = document.createElement('aside');
  box.className = 'draft-notes';

  const title = document.createElement('strong');
  title.textContent = 'Draft concerns';
  box.appendChild(title);

  const list = document.createElement('ul');
  for (const note of notes) {
    const item = document.createElement('li');
    item.textContent = note;
    list.appendChild(item);
  }
  box.appendChild(list);
  return box;
}

type BranchTreeSummary = {
  knownNodeCount: number;
  resolvedLeafCount: number;
  mistakes: number;
  hints: number;
};

type BranchTreeRow = {
  prefixText: string;
  branchKeyPart: string;
  suffixText: string;
  key: string;
  isCurrent: boolean;
  isCurrentPath: boolean;
  isCompletedLeaf: boolean;
};

const SUIT_CHARS = new Set(['S', 'H', 'D', 'C']);
const RANK_CHARS = new Set(['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']);
const INLINE_CARD_TOKEN_PATTERN = /[SHDC](?:10|[AKQJT2-9])/g;

function parseCardToken(rawToken: string): CardId | null {
  const token = rawToken.trim().toUpperCase();
  if (token.length < 2) return null;
  const suit = token[0];
  if (!SUIT_CHARS.has(suit)) return null;
  const rankToken = token.slice(1) === '10' ? 'T' : token.slice(1);
  if (!RANK_CHARS.has(rankToken)) return null;
  return `${suit}${rankToken}` as CardId;
}

function appendBranchKeyWithCardTokens(target: HTMLElement, branchKey: string, cardClassName = ''): void {
  let cursor = 0;
  while (cursor < branchKey.length) {
    const suit = branchKey[cursor]?.toUpperCase() ?? '';
    if (SUIT_CHARS.has(suit)) {
      const twoChar = branchKey.slice(cursor, cursor + 2).toUpperCase();
      const threeChar = branchKey.slice(cursor, cursor + 3).toUpperCase();
      const rawCard = threeChar[1] === '1' && threeChar[2] === '0' ? threeChar : twoChar;
      const cardId = parseCardToken(rawCard);
      if (cardId) {
        target.appendChild(
          renderCardToken(cardId, {
            context: 'inline-card',
            mode: 'base',
            className: cardClassName
          })
        );
        cursor += rawCard.length;
        continue;
      }
    }
    target.appendChild(document.createTextNode(branchKey[cursor]));
    cursor += 1;
  }
}

function isCardTokenBoundary(text: string, start: number, end: number): boolean {
  const prev = start > 0 ? text[start - 1] : '';
  const next = end < text.length ? text[end] : '';
  return !/[A-Za-z0-9]/.test(prev) && !/[A-Za-z0-9]/.test(next);
}

function appendInlineTextWithCardTokens(target: HTMLElement, text: string, cardClassName = ''): void {
  let cursor = 0;
  for (const match of text.matchAll(INLINE_CARD_TOKEN_PATTERN)) {
    const token = match[0] ?? '';
    const index = match.index ?? -1;
    if (index < 0) continue;
    const end = index + token.length;
    if (!isCardTokenBoundary(text, index, end)) continue;
    if (index > cursor) target.appendChild(document.createTextNode(text.slice(cursor, index)));
    const cardId = parseCardToken(token);
    if (cardId) {
      target.appendChild(
        renderCardToken(cardId, {
          context: 'inline-card',
          mode: 'base',
          className: cardClassName
        })
      );
    } else {
      target.appendChild(document.createTextNode(token));
    }
    cursor = end;
  }
  if (cursor < text.length) target.appendChild(document.createTextNode(text.slice(cursor)));
}

function summarizeKnownBranchTree(
  node: AuthoredBranchTreeNode,
  knownBranches: Set<string>
): BranchTreeSummary {
  if (!knownBranches.has(node.key)) {
    return { knownNodeCount: 0, resolvedLeafCount: 0, mistakes: 0, hints: 0 };
  }
  const stats = handDiagramSession.leafStatsByBranch.get(node.key);
  let knownNodeCount = 1;
  let resolvedLeafCount = stats ? 1 : 0;
  let mistakes = 0;
  let hints = 0;
  if (stats) {
    mistakes += stats.mistakes;
    hints += stats.hints;
  }
  for (const child of node.children) {
    const childSummary = summarizeKnownBranchTree(child, knownBranches);
    knownNodeCount += childSummary.knownNodeCount;
    resolvedLeafCount += childSummary.resolvedLeafCount;
    mistakes += childSummary.mistakes;
    hints += childSummary.hints;
  }
  return { knownNodeCount, resolvedLeafCount, mistakes, hints };
}

function deepestKnownCurrentBranchNodeKey(
  tree: AuthoredBranchTreeNode,
  knownBranches: Set<string>,
  currentBranch: string
): string {
  let node = tree;
  let deepest = tree.key;
  while (true) {
    const next = node.children.find((child) => currentBranch.startsWith(child.key) && knownBranches.has(child.key));
    if (!next) break;
    deepest = next.key;
    node = next;
  }
  return deepest;
}

function collectKnownBranchTreeRows(args: {
  node: AuthoredBranchTreeNode;
  knownBranches: Set<string>;
  currentBranch: string;
  currentTipKey: string;
  liveTipMistakes: number;
  liveTipHints: number;
  prefix?: string;
  isLast?: boolean;
  parentKey?: string;
}): BranchTreeRow[] {
  const { node, knownBranches, currentBranch, currentTipKey, liveTipMistakes, liveTipHints } = args;
  const prefix = args.prefix ?? '';
  const isLast = args.isLast ?? true;
  const parentKey = args.parentKey ?? null;
  if (!knownBranches.has(node.key)) return [];

  const nodeLabel = parentKey ? node.key.slice(parentKey.length) : node.key;
  const linePrefix = parentKey ? `${prefix}${isLast ? '└─ ' : '├─ '}` : '';
  const leafStats = handDiagramSession.leafStatsByBranch.get(node.key) ?? null;
  const terminalSuffix = leafStats
    ? `${leafStats.outcome === 'success' ? ' ✓' : ' x'} m${leafStats.mistakes} h${leafStats.hints}`
    : '';
  const liveTipSuffix =
    !leafStats && node.key === currentTipKey && (liveTipMistakes > 0 || liveTipHints > 0)
      ? ` · m${liveTipMistakes} h${liveTipHints}`
      : '';
  const rows: BranchTreeRow[] = [
    {
      prefixText: linePrefix,
      branchKeyPart: nodeLabel,
      suffixText: `${terminalSuffix}${liveTipSuffix}`,
      key: node.key,
      isCurrent: currentBranch === node.key,
      isCurrentPath: currentBranch.startsWith(node.key),
      isCompletedLeaf: Boolean(leafStats)
    }
  ];

  const nextPrefix = parentKey ? `${prefix}${isLast ? '   ' : '│  '}` : '';
  const knownChildren = node.children.filter((child) => knownBranches.has(child.key));
  for (const [idx, child] of knownChildren.entries()) {
    rows.push(
      ...collectKnownBranchTreeRows({
        node: child,
        knownBranches,
        currentBranch,
        currentTipKey,
        liveTipMistakes,
        liveTipHints,
        prefix: nextPrefix,
        isLast: idx === knownChildren.length - 1,
        parentKey: node.key
      })
    );
  }
  return rows;
}

function renderWidgetBranchTree(args: {
  tree: AuthoredBranchTreeNode;
  knownBranches: Set<string>;
  currentBranch: string | null;
}): HTMLElement {
  const { tree, knownBranches, currentBranch } = args;
  const current = currentBranch ?? tree.key;
  const summary = summarizeKnownBranchTree(tree, knownBranches);
  const liveTipMistakes = Math.max(0, handDiagramSession.mistakeCount - handDiagramSession.attributedLeafMistakes);
  const liveTipHints = Math.max(0, handDiagramSession.hintCount - handDiagramSession.attributedLeafHints);
  const currentTipKey = deepestKnownCurrentBranchNodeKey(tree, knownBranches, current);
  const rows = collectKnownBranchTreeRows({
    node: tree,
    knownBranches,
    currentBranch: current,
    currentTipKey,
    liveTipMistakes,
    liveTipHints
  });

  const section = document.createElement('section');
  section.className = 'hand-diagram-branch-map';

  const heading = document.createElement('strong');
  heading.className = 'hand-diagram-branch-map-title';
  heading.textContent = 'Branch Map';
  section.appendChild(heading);

  const summaryLine = document.createElement('div');
  summaryLine.className = 'hand-diagram-branch-map-summary';
  summaryLine.textContent =
    `Resolved ${summary.resolvedLeafCount} · Known ${summary.knownNodeCount} · M ${summary.mistakes + liveTipMistakes} · H ${summary.hints + liveTipHints}`;
  section.appendChild(summaryLine);

  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'hand-diagram-branch-map-rows';
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'hand-diagram-branch-map-row';
    if (row.isCurrentPath) rowEl.classList.add('is-current-path');
    if (row.isCurrent) rowEl.classList.add('is-current');
    if (row.isCompletedLeaf) rowEl.classList.add('is-complete-leaf');
    if (row.prefixText) {
      const prefix = document.createElement('span');
      prefix.className = 'hand-diagram-branch-map-prefix';
      prefix.textContent = row.prefixText;
      rowEl.appendChild(prefix);
    }
    appendBranchKeyWithCardTokens(rowEl, row.branchKeyPart, 'hand-diagram-inline-card hand-diagram-branch-card');
    if (row.suffixText) {
      const suffix = document.createElement('span');
      suffix.className = 'hand-diagram-branch-map-suffix';
      suffix.textContent = row.suffixText;
      rowEl.appendChild(suffix);
    }
    rowsWrap.appendChild(rowEl);
  }
  section.appendChild(rowsWrap);
  return section;
}

function renderWidgetCompanionPanel(args: {
  layout: 'compact' | 'split';
  textStyle: 'default' | 'article-prose';
  futureTransitioning: boolean;
  branchName: string | null;
  branchTree: AuthoredBranchTreeNode | null;
  content: HandDiagramCompanionContent | null;
  onHide: () => void;
}): HTMLElement {
  const { layout, textStyle, futureTransitioning, branchName, branchTree, content, onHide } = args;
  const panel = document.createElement('aside');
  panel.className = 'hand-diagram-companion-panel';
  panel.classList.add(layout === 'split' ? 'layout-split' : 'layout-compact');
  if (textStyle === 'article-prose') panel.classList.add('text-article-prose');
  if (futureTransitioning) panel.classList.add('is-transitioning');

  const head = document.createElement('div');
  head.className = 'hand-diagram-companion-head';
  const showBranchHeader = Boolean(branchName || branchTree);

  if (showBranchHeader) {
    const branch = document.createElement('div');
    branch.className = 'hand-diagram-companion-branch';
    const branchLabel = document.createElement('strong');
    branchLabel.className = 'hand-diagram-companion-branch-label';
    branchLabel.textContent = 'BRANCH';
    const branchValue = document.createElement('div');
    branchValue.className = 'hand-diagram-companion-branch-value';
    if (branchName) appendBranchKeyWithCardTokens(branchValue, branchName, 'hand-diagram-inline-card hand-diagram-branch-card');
    else branchValue.textContent = '-';
    branch.append(branchLabel, branchValue);
    head.appendChild(branch);
  } else {
    head.classList.add('without-branch');
  }

  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'hand-diagram-companion-hide';
  hideBtn.textContent = 'Hide';
  hideBtn.title = 'Hide companion panel';
  hideBtn.setAttribute('aria-label', 'Hide companion panel');
  hideBtn.onclick = () => onHide();
  head.appendChild(hideBtn);
  panel.appendChild(head);

  if (branchTree && handDiagramSession.knownBranches.has(branchTree.key)) {
    panel.appendChild(
      renderWidgetBranchTree({
        tree: branchTree,
        knownBranches: handDiagramSession.knownBranches,
        currentBranch: branchName
      })
    );
  }

  if (content?.title?.trim()) {
    const title = document.createElement('strong');
    title.className = 'hand-diagram-companion-title';
    appendInlineTextWithCardTokens(title, content.title.trim(), 'hand-diagram-inline-card');
    panel.appendChild(title);
  }

  if (content?.text?.trim()) {
    const body = document.createElement('div');
    body.className = 'hand-diagram-companion-body';
    if (content.html) body.innerHTML = content.text;
    else appendInlineTextWithCardTokens(body, content.text, 'hand-diagram-inline-card');
    panel.appendChild(body);
  }

  return panel;
}

function currentWidgetSecondaryActionRow(): HandDiagramSecondaryActionRow | null {
  if (displayMode !== 'widget') return null;
  if (!articleScriptModeEnabled() || !articleScriptState) return null;
  if (articleScriptState.spec.id !== 'double-dummy-01') return null;
  const inSolutionViewing = currentArticleScriptInteractionProfile() === 'solution-viewing';
  return {
    className: 'widget-profile-secondary-actions',
    buttons: [
      {
        id: 'widget-replay',
        label: 'Replay',
        onClick: () => {
          dismissTransientWidgetOutcome(currentViewState());
          clearHint();
          clearWidgetMessage();
          setCurrentArticleScriptInteractionProfile('puzzle-solving', { applyDefaults: true });
          resetCurrentArticleScriptToBeginning();
          render();
        }
      },
      {
        id: 'widget-next-puzzle',
        label: 'Next Puzzle',
        disabled: true,
        title: 'Next Puzzle is not available in article widgets yet.'
      },
      {
        id: 'widget-show-solution',
        label: 'Show Solution',
        disabled: inSolutionViewing,
        title: inSolutionViewing ? 'Solution viewing is already active.' : 'Enter solution viewing',
        onClick: () => {
          dismissTransientWidgetOutcome(currentViewState());
          setCurrentArticleScriptInteractionProfile('solution-viewing', { applyDefaults: true });
          clearHint();
          clearWidgetMessage();
          render();
        }
      }
    ]
  };
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

function applyCompactTableAlignment(tableCanvas: HTMLElement): void {
  const handBoxWidth = Number.parseFloat(getComputedStyle(root).getPropertyValue('--hand-box-w')) || 0;
  if (!handBoxWidth) return;
  const northWidth = tableCanvas.querySelector<HTMLElement>('.seat-N .hand-content')?.getBoundingClientRect().width ?? handBoxWidth;
  const southWidth = tableCanvas.querySelector<HTMLElement>('.seat-S .hand-content')?.getBoundingClientRect().width ?? handBoxWidth;
  const westWidth = tableCanvas.querySelector<HTMLElement>('.seat-W .hand-content')?.getBoundingClientRect().width ?? handBoxWidth;
  if (nsInitialFitWidth === null) nsInitialFitWidth = Math.max(northWidth, southWidth);
  if (westInitialContentWidth === null) westInitialContentWidth = westWidth;
  const westSlack = handBoxWidth - westInitialContentWidth;

  const westSnugShift = westSlack >= 18 ? Math.min(8, Math.round((westSlack - 12) / 3)) : 0;
  const nsFitWidth = Math.min(handBoxWidth, nsInitialFitWidth);

  tableCanvas.style.setProperty('--ns-fit-width', `${Math.round(nsFitWidth)}px`);
  tableCanvas.style.setProperty('--west-anchor-width', `${Math.round(westInitialContentWidth)}px`);
  tableCanvas.style.setProperty('--west-snug-shift', `${westSnugShift}px`);
  tableCanvas.style.setProperty('--table-axis-shift', '0px');
}

function measureDiagramRowHeight(tableCanvas: HTMLElement): number {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  probe.style.top = '0';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.display = 'grid';
  probe.style.gridTemplateColumns = 'max-content';
  probe.style.gridAutoRows = 'max-content';

  tableCanvas.appendChild(probe);
  let maxHeight = 0;

  for (const suit of suitOrder) {
    const suitProbe = createSuitGlyph(suit);
    probe.appendChild(suitProbe);
    maxHeight = Math.max(maxHeight, suitProbe.getBoundingClientRect().height);
  }

  const neutralVisual: RankColorVisual = { kind: 'solid', colorClass: 'rank--black' };
  for (const rank of rankOrder) {
    const rankProbe = document.createElement('span');
    rankProbe.className = 'rank-text muted';
    appendRankContent(rankProbe, rank, neutralVisual);
    probe.appendChild(rankProbe);
    maxHeight = Math.max(maxHeight, rankProbe.getBoundingClientRect().height);
  }

  probe.remove();
  return Math.max(16, Math.ceil(maxHeight + 1));
}

function applyFrozenDiagramRowHeight(tableCanvas: HTMLElement): void {
  if (diagramRowHeightPx === null) {
    diagramRowHeightPx = measureDiagramRowHeight(tableCanvas);
  }
  tableCanvas.style.setProperty('--diagram-row-h', `${diagramRowHeightPx}px`);
}

function applyUnknownSlashLinePlacement(tableCanvas: HTMLElement): void {
  const line = tableCanvas.querySelector<HTMLElement>('.unknown-slash-line');
  if (!line) return;
  const tableRect = tableCanvas.getBoundingClientRect();
  const westAnchorRect =
    tableCanvas.querySelector<HTMLElement>('.seat-W .hand-content-anchor-west')?.getBoundingClientRect() ??
    tableCanvas.querySelector<HTMLElement>('.seat-W')?.getBoundingClientRect();
  const southRect = tableCanvas.querySelector<HTMLElement>('.seat-S')?.getBoundingClientRect();
  if (!westAnchorRect || !southRect) return;

  const currentRect = line.getBoundingClientRect();
  const preferredLeft = westAnchorRect.left - tableRect.left;
  const maxRight = southRect.left - tableRect.left - 6;
  const adjustedLeft = Math.min(preferredLeft, maxRight - currentRect.width);
  line.style.left = `${Math.max(0, Math.round(adjustedLeft))}px`;
}

function renderTrickTable(view: State, visuallyHidden = false): HTMLElement {
  const table = document.createElement('section');
  const hideTrickVisual = visuallyHidden && !startPending;
  table.className = `trick-table${trickFrozen ? ' frozen' : ''}${hideTrickVisual ? ' reading-hidden' : ''}`;
  if (trickFrozen) {
    if (!isWidgetShellMode) {
      table.title = 'Click to dismiss trick';
    }
    table.onclick = () => {
      dismissTransientWidgetOutcome(currentViewState());
      unfreezeTrick(true);
      render();
    };
  }

  const sourceTrick = trickFrozen && lastCompletedTrick ? lastCompletedTrick : view.trick;
  const bySeat = new Map(sourceTrick.map((p) => [p.seat, p] as const));
  const resolvedWinner = trickFrozen && lastCompletedTrick ? view.turn : null;

  for (const seat of seatOrder) {
    const slot = document.createElement('div');
    slot.className = `trick-slot slot-${seat}`;
    const play = bySeat.get(seat);
    if (play) {
      if (resolvedWinner === seat) slot.classList.add('resolved-winner');
      else if (resolvedWinner) slot.classList.add('resolved-nonwinner');
      const regularDisplay = buildRegularPlayedCardDisplay(view, play, teachingMode, cardColoringEnabled);
      const cardId = regularDisplay.cardId;
      const text = renderCardToken(cardId, { context: 'played-card', mode: 'semantic-color', className: 'played-text' });
      if (ddErrorVisual && ddErrorVisual.badCard === cardId) text.classList.add('dd-error-bad');
      const rankEl = text.querySelector<HTMLElement>('.card-rank');
      if (rankEl) {
        rankEl.classList.add('rank');
        applyRankVisual(rankEl, regularDisplay.visual);
      }
      slot.appendChild(text);
    }
    table.appendChild(slot);
  }

  if (startPending && !trickFrozen && sourceTrick.length === 0 && view.phase !== 'end') {
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'start-overlay-btn';
    startBtn.textContent = 'Start';
    startBtn.onclick = () => {
      dismissTransientWidgetOutcome(currentViewState());
      launchStartSequence();
    };
    table.appendChild(startBtn);
  }

  return table;
}

function renderStatusPanel(view: State): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'status-panel';

  const title = document.createElement('strong');
  title.className = 'status-title';
  title.textContent = 'Status';
  panel.appendChild(title);

  const facts = document.createElement('div');
  facts.className = 'status-facts';
  const contractRow = document.createElement('div');
  contractRow.className = 'status-row status-row-contract';
  const contractKey = document.createElement('span');
  contractKey.className = 'k';
  contractKey.textContent = 'Contract';
  const contractValue = document.createElement('span');
  contractValue.className = 'v contract-value';
  if (view.contract.strain === 'NT') contractValue.textContent = formatStrainText(view.contract.strain);
  else contractValue.appendChild(renderSuitGlyph(view.contract.strain, { context: 'contract-strain' }));
  contractRow.append(contractKey, contractValue);
  facts.appendChild(contractRow);

  const goalRow = document.createElement('div');
  goalRow.className = 'status-row';
  goalRow.innerHTML = `<span class="k">Goal</span><span class="v">${formatGoal(view)}</span>`;
  facts.appendChild(goalRow);

  const goalStateRow = document.createElement('div');
  goalStateRow.className = 'status-row';
  goalStateRow.innerHTML = `<span class="k">Goal state</span><span class="v">${formatGoalStatus(view)}</span>`;
  facts.appendChild(goalStateRow);

  const tricksRow = document.createElement('div');
  tricksRow.className = 'status-row tricks';
  tricksRow.innerHTML = `<span class="k">Tricks</span><span class="v heavy">NS ${view.tricksWon.NS} - EW ${view.tricksWon.EW}</span>`;
  facts.appendChild(tricksRow);

  const leaderRow = document.createElement('div');
  leaderRow.className = 'status-row meta-row';
  leaderRow.innerHTML = `<span class="k">Leader</span><span class="v turn-meta">${view.leader}</span>`;
  facts.appendChild(leaderRow);

  const turnRow = document.createElement('div');
  turnRow.className = 'status-row meta-row';
  turnRow.innerHTML = `<span class="k">Turn</span><span class="v turn-meta turn-emph">${view.turn}</span>`;
  facts.appendChild(turnRow);
  const seedRow = document.createElement('div');
  seedRow.className = 'status-row meta-row';
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
  debugRow.className = 'status-row meta-row';
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
  if (currentEntry?.variants && currentEntry.variants.length > 0) {
    const variantLabel = document.createElement('label');
    variantLabel.textContent = 'Version: ';
    const variantSelect = document.createElement('select');
    const unknownOpt = document.createElement('option');
    unknownOpt.value = 'unknown';
    unknownOpt.textContent = 'Version Unknown';
    unknownOpt.selected = currentProblemVariantId === null;
    variantSelect.appendChild(unknownOpt);
    for (const variant of currentEntry.variants) {
      const opt = document.createElement('option');
      opt.value = variant.id;
      opt.textContent = variant.label;
      opt.selected = variant.id === currentProblemVariantId;
      variantSelect.appendChild(opt);
    }
    variantSelect.onchange = () => {
      selectProblem(currentProblemId, variantSelect.value === 'unknown' ? null : variantSelect.value);
    };
    variantLabel.appendChild(variantSelect);
    row.appendChild(variantLabel);
  }
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

  if (currentEntry?.articlePath) {
    const articleLink = document.createElement('a');
    articleLink.href = `${base}${currentEntry.articlePath.replace(/^\/+/, '')}`;
    articleLink.target = '_blank';
    articleLink.rel = 'noopener noreferrer';
    articleLink.className = 'controls-link';
    articleLink.textContent = 'Open article';
    row.appendChild(articleLink);
  }

  const goalStateLabel = document.createElement('span');
  goalStateLabel.className = 'controls-meta';
  goalStateLabel.textContent = `Goal state: ${formatGoalStatus(state)}`;
  row.appendChild(goalStateLabel);

  const seedLabel = document.createElement('span');
  seedLabel.className = 'controls-meta';
  seedLabel.textContent = `Seed: ${currentSeed}`;
  row.appendChild(seedLabel);

  const seedBtn = document.createElement('button');
  seedBtn.type = 'button';
  seedBtn.textContent = 'New seed';
  seedBtn.onclick = () => resetGame(Date.now() >>> 0, 'newSeed');
  row.appendChild(seedBtn);

  const debugLabel = document.createElement('label');
  debugLabel.className = 'controls-meta-toggle';
  const debugBox = document.createElement('input');
  debugBox.type = 'checkbox';
  debugBox.checked = showDebugSection;
  debugBox.onchange = () => {
    showDebugSection = debugBox.checked;
    render();
  };
  debugLabel.append(debugBox, ' Show debug');
  row.appendChild(debugLabel);

  row.appendChild(renderSettingsButton('analysis'));

  bar.appendChild(row);
  if (currentProblem.status === 'underConstruction') {
    const notice = document.createElement('div');
    notice.className = 'status-notice status-notice-warning';
    notice.textContent = 'Under construction: this puzzle may be buggy or incomplete.';
    bar.appendChild(notice);
  }
  return bar;
}

function renderPracticeHeader(view: State): HTMLElement {
  const header = document.createElement('section');
  header.className = 'practice-header';
  if (!practiceSession) {
    header.textContent = `Practice Mode · Goal: ${practiceGoalSummary(view)}`;
    return header;
  }

  const setLabel = document.createElement('label');
  setLabel.className = 'practice-set-label';
  setLabel.textContent = 'Practice set: ';
  const setSelect = document.createElement('select');
  setSelect.className = 'practice-set-select';
  for (const option of PRACTICE_SET_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = option.id;
    opt.textContent = option.label;
    opt.selected = option.id === practiceSession.setId;
    setSelect.appendChild(opt);
  }
  setSelect.onchange = () => {
    const nextSet = setSelect.value as PracticeSetId;
    if (nextSet === practiceSession.setId) return;
    rebuildPracticeSession(nextSet);
  };
  setLabel.appendChild(setSelect);
  header.appendChild(setLabel);

  const summary = document.createElement('span');
  summary.className = 'practice-session-summary';
  const queueSize = practiceSession.queue.length;
  const indexLabel = queueSize > 0 ? `${practiceSession.queueIndex + 1}/${queueSize}` : '-/-';
  const undoCount = practiceSession.perPuzzleUndoCount[currentProblemId] ?? practiceSession.currentUndoCount;
  summary.textContent = ` Practice Mode · Puzzle ${indexLabel} · Solved ${practiceSession.solved}/${practiceSession.attempted} · Perfect ${practiceSession.perfect} · Undo ${undoCount}`;
  header.appendChild(summary);
  return header;
}

function renderPracticePuzzleStateBar(view: State): HTMLElement {
  const bar = document.createElement('section');
  bar.className = 'practice-puzzle-state-bar';
  const appendGoalLine = (goalText: string): void => {
    bar.appendChild(document.createTextNode(`Take ${goalText} tricks `));
    if (view.contract.strain === 'NT') {
      bar.appendChild(document.createTextNode('in NT'));
    } else {
      bar.appendChild(document.createTextNode('with '));
      const strainEl = document.createElement('span');
      strainEl.className = `suit-${view.contract.strain}`;
      strainEl.textContent = suitSymbol[view.contract.strain];
      bar.appendChild(strainEl);
      bar.appendChild(document.createTextNode(' as trumps'));
    }
    bar.appendChild(document.createTextNode(` · NS ${view.tricksWon.NS} · EW ${view.tricksWon.EW}`));
  };
  if (view.goal.type === 'minTricks') {
    const initialTricksInDeal = seatOrder
      .filter((seat) => seat === 'N' || seat === 'S')
      .map((seat) => suitOrder.reduce((sum, suit) => sum + currentProblem.hands[seat][suit].length, 0))
      .reduce((max, count) => Math.max(max, count), 0);
    const currentGoal = view.goal.n;
    appendGoalLine(`${currentGoal}/${initialTricksInDeal}`);
  } else {
    appendGoalLine(formatGoal(view));
  }
  return bar;
}

function renderTeachingEventsPane(mode: 'analysis' | 'widget' = 'analysis'): HTMLElement {
  // Guard rail: this renderer should consume semantic display projections only.
  // Do not add new semantic derivation from raw state/hands here without asking first.
  const pane = document.createElement('aside');
  pane.className = mode === 'widget' ? 'teaching-pane widget-mirror-pane' : 'teaching-pane';

  const title = document.createElement('strong');
  title.textContent = 'Key teaching events';
  pane.appendChild(title);

  const list = document.createElement('div');
  list.className = 'teaching-events';
  if (!narrate) {
    const row = document.createElement('div');
    row.className = 'teaching-event teaching-info';
    const text = document.createElement('span');
    text.className = 'teaching-text';
    text.textContent = 'Narration is off.';
    row.appendChild(text);
    list.appendChild(row);
    pane.appendChild(list);
    return pane;
  }
  const unknownEntries = teachingEntriesForUnknownMode();
  const snapshot = teachingReducer.snapshot() as {
    entries: Array<{ seq: number; seat: string; card: string; summary: string; reasons: string[]; effects: string[] }>;
  };
  const semanticEntries: TeachingEntryView[] = unknownEntries ?? (snapshot.entries ?? []);
  const displayEntries = buildTeachingDisplayEntries(semanticEntries, verboseDetailEnabled());

  if (displayEntries.length === 0) {
    const row = document.createElement('div');
    row.className = 'teaching-event teaching-info';

    const text = document.createElement('span');
    text.className = 'teaching-text';
    text.textContent = mode === 'widget' ? 'No teaching events yet.' : 'No teaching events yet.';
    row.appendChild(text);
    list.appendChild(row);
  } else {
    const isIdleTransitionEffect = (effect: string): boolean =>
      effect.includes('becomes idle.') || effect.includes('becomes idle');

    for (const [idx, entry] of displayEntries.entries()) {
      const row = document.createElement('div');
      row.className = 'teaching-event teaching-info';

      const text = document.createElement('span');
      text.className = 'teaching-text';
      if (mode === 'widget') {
        text.textContent = entry.variantLines.length > 0
          ? entry.variantLines.slice(0, 2).map((group) => `${group.labels.join('/')}: ${group.summary}${group.ddError ? ` ${group.ddError}` : ''}`).join('\n')
          : `${entry.summary}${entry.ddError ? ` ${entry.ddError}` : ''}`;
        row.appendChild(text);
        list.appendChild(row);
        continue;
      }
      const marker = document.createElement('span');
      marker.className = 'teaching-at';
      marker.textContent = `#${entry.seq} ${entry.seat}`;
      row.appendChild(marker);

      if (entry.variantLines.length > 0) {
        text.classList.add('teaching-text-variants');
        for (const group of entry.variantLines) {
          const line = document.createElement('div');
          line.className = 'teaching-variant-line';
          line.textContent = `${group.labels.join('/')}: ${group.summary}`;
          text.appendChild(line);
        }
        row.appendChild(text);
      } else {
        text.textContent = entry.bracketText ? `${entry.summary} [${entry.bracketText}]` : entry.summary;
        row.appendChild(text);
      }

      if (entry.variantLines.length > 0) {
        const ddErrorGroups = entry.variantLines
          .filter((group): group is { labels: string[]; summary: string; ddError: string } => Boolean(group.ddError));
        for (const group of ddErrorGroups) {
          const ddsLine = document.createElement('div');
          ddsLine.className = 'teaching-dds';
          ddsLine.textContent = `${group.labels.join('/')}: ${group.ddError}`;
          row.appendChild(ddsLine);
        }
      } else {
        const ddError = entry.ddError;
        if (ddError) {
          const ddsLine = document.createElement('div');
          ddsLine.className = 'teaching-dds';
          ddsLine.textContent = ddError;
          row.appendChild(ddsLine);
        }
      }

      const shownEffects = entry.variantLines.length > 0
        ? []
        : entry.effects.filter((effect) => verboseDetailEnabled() || !isIdleTransitionEffect(effect));
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

function publishReadingWidgetEmbedHeight(readingRevealEnabled: boolean): void {
  if (!readingRevealEnabled) {
    lastReportedReadingWidgetEmbedHeight = null;
    return;
  }
  if (!isWidgetShellMode || displayMode !== 'widget' || typeof window === 'undefined' || window.parent === window) return;
  const height = handDiagramSession.readingControlsRevealStage === 'full'
    ? readingWidgetEmbedFullHeight
    : readingWidgetEmbedCompactHeight;
  if (lastReportedReadingWidgetEmbedHeight === height) return;
  lastReportedReadingWidgetEmbedHeight = height;
  window.parent.postMessage(
    {
      type: readingWidgetEmbedHeightMessageType,
      height
    },
    window.location.origin
  );
}

function render(): void {
  renderingNow = true;
  // Unknown-mode card visuals and teaching display must read the same replay snapshot.
  // Reset here so early render consumers do not reuse stale per-variant replay data
  // from the previous frame.
  unknownModeVariantReplayData = null;
  hintDiag(`render with activeHint=${activeHint ? 'yes' : 'no'}`);
  syncWidgetNarrationFeedFromTeaching();
  if (ddErrorVisual && !trickFrozen && state.turn === ddErrorVisual.seat) {
    clearDdErrorVisual();
  }
  const view = currentViewState();
  clearDismissedWidgetOutcomeIfChanged(view);
  const isWidgetReadingMode = widgetReadingMode();
  revealKnownArticleScriptBranchesFromCurrentPath();
  const widgetCompanionPanel = currentWidgetCompanionPanelState();
  syncWidgetCompanionFutureTransitionTimer(widgetCompanionPanel);
  const widgetCompanionPanelVisible = widgetCompanionPanel.enabled && !widgetCompanionPanel.hidden;
  const widgetCompanionPanelSplit = widgetCompanionPanelVisible && widgetCompanionPanel.layout === 'split';

  root.innerHTML = '';
  root.classList.toggle('mode-widget', isWidgetShellMode);
  root.classList.toggle('mode-analysis', displayMode === 'analysis');
  root.classList.toggle('mode-practice', displayMode === 'practice');
  root.classList.toggle('with-companion-panel', widgetCompanionPanelVisible);
  root.classList.toggle('with-companion-panel-split', widgetCompanionPanelSplit);
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
  }

  const mainRow = document.createElement('section');
  mainRow.className = `main-row mode-${displayMode}${isWidgetShellMode && showWidgetTeachingPane ? ' with-widget-pane' : ''}`;

  const tableHost = document.createElement('div');
  tableHost.className = 'table-host';

  const tableCanvas = document.createElement('main');
  tableCanvas.className = `table-canvas${showGuides ? ' show-guides' : ''}`;
  tableCanvas.appendChild(renderBoardMeta(view));
  tableCanvas.appendChild(renderTrickTable(view, isWidgetReadingMode));
  tableCanvas.appendChild(renderSeatHand(view, 'N'));
  tableCanvas.appendChild(renderSeatHand(view, 'W'));
  tableCanvas.appendChild(renderSeatHand(view, 'E'));
  tableCanvas.appendChild(renderSeatHand(view, 'S'));
  const unknownSlashLine = renderUnknownSlashLine(view);
  if (unknownSlashLine) tableCanvas.appendChild(unknownSlashLine);

  tableHost.appendChild(tableCanvas);
  const readingRevealEnabled = isWidgetShellMode && (articleScriptIsStoryViewing() || widgetReadingProfileEnabledFromUrl);
  const handDiagramNavigationDeps = {
    displayMode,
    showGuides,
    practiceSession,
    inevitableFailureAlert,
    runStatus,
    pendingArticleScriptChoice,
    currentArticleScriptChoicePresentation,
    articleScriptState,
    currentArticleScriptEndCursor,
    resolveArticleScriptLength,
    currentArticleScriptHasRememberedTail,
    currentArticleScriptStateLabel,
    currentArticleScriptTerminalLabel,
    shouldBlockArticleScriptUserAdvance,
    currentArticleScriptInteractionProfile,
    currentProblem,
    trickFrozen,
    canLeadDismiss,
    state,
    currentDismissibleWidgetOutcomeKey,
    canonicalRunStatusText,
    isWidgetShellMode,
    hintLoading,
    ddsLoadingForHint,
    activeHint,
    hintDiag,
    handDiagramSession,
    narrate,
    currentArticleScriptStatusMessage,
    withHintPrompt,
    seatName,
    startPending,
    renderSettingsButton,
    articleScriptIsStoryViewing,
    resolvePreviousArticleScriptLandmarkCursor,
    matchCurrentArticleScriptHistory,
    replayArticleScriptToCursor,
    previousUnfinishedArticleScriptBranchCursor,
    currentSeed,
    resetGame,
    dismissTransientWidgetOutcome,
    currentViewState,
    articleScriptUndoTargetCursor,
    backupLastUserPlay,
    undoStack,
    followCurrentArticleScriptUserTurn,
    legalPlays,
    toCardId,
    chooseCurrentArticleScriptBranchOption,
    clearArticleScriptFollowPrompt,
    runTurn,
    advanceOneWidgetCard,
    advanceWidgetToNextPauseBoundary,
    playAgainAvailable,
    startPlayAgain,
    endPracticeRun,
    attemptClaim,
    hintsEnabled,
    requestHint,
    currentProblemId,
    currentProblemVariantId,
    userPlayHistory,
    encodeUserHistoryForUrl,
    beginPracticeRun,
    goToNextPracticePuzzle,
    readingRevealEnabled,
    render,
    currentArticleScriptStateId,
    currentArticleScriptReplayCard,
    resolveExplicitBranchAdvanceAction,
    secondaryActionRow: currentWidgetSecondaryActionRow()
  };
  const navigationArea = renderHandDiagramNavigationArea(view, handDiagramNavigationDeps);
  if (displayMode === 'practice' || displayMode === 'analysis') {
    tableHost.appendChild(navigationArea);
  }
  const draftNotes = renderDraftNotes();
  if (draftNotes) tableHost.appendChild(draftNotes);
  if (displayMode === 'analysis') {
    mainRow.appendChild(tableHost);
    mainRow.appendChild(renderTeachingEventsPane('analysis'));
  } else if (displayMode === 'widget') {
    const widgetFrame = document.createElement('section');
    widgetFrame.className = `hand-diagram-widget-frame${widgetCompanionPanelVisible ? ' with-companion-panel' : ''}${widgetCompanionPanelSplit ? ' with-companion-panel-split' : ''}`;
    const widgetStack = document.createElement('div');
    widgetStack.className = 'hand-diagram-widget-stack';
    widgetStack.appendChild(tableHost);
    widgetStack.appendChild(navigationArea);
    widgetFrame.appendChild(widgetStack);
    if (widgetCompanionPanelVisible) {
      widgetFrame.appendChild(
        renderWidgetCompanionPanel({
          layout: widgetCompanionPanel.layout,
          textStyle: widgetCompanionPanel.textStyle,
          futureTransitioning: widgetCompanionPanel.futureTransitioning,
          branchName: widgetCompanionPanel.branchName,
          branchTree: widgetCompanionPanel.branchTree,
          content: widgetCompanionPanel.content,
          onHide: () => {
            widgetCompanionPanelHidden = true;
            render();
          }
        })
      );
    } else if (widgetCompanionPanel.enabled) {
      const reopenBtn = document.createElement('button');
      reopenBtn.type = 'button';
      reopenBtn.className = 'hand-diagram-companion-reopen';
      reopenBtn.textContent = 'Show Panel';
      reopenBtn.title = 'Show companion panel';
      reopenBtn.setAttribute('aria-label', 'Show companion panel');
      reopenBtn.onclick = () => {
        widgetCompanionPanelHidden = false;
        render();
      };
      widgetFrame.appendChild(reopenBtn);
    }
    mainRow.appendChild(widgetFrame);
  } else {
    mainRow.appendChild(tableHost);
  }
  if (isWidgetShellMode && showWidgetTeachingPane) {
    mainRow.appendChild(renderTeachingEventsPane('widget'));
  }
  root.appendChild(mainRow);
  applyFrozenDiagramRowHeight(tableCanvas);
  applyCompactTableAlignment(tableCanvas);
  applyUnknownSlashLinePlacement(tableCanvas);
  applyNarrationBubbleCollisionAvoidance(tableCanvas);
  publishReadingWidgetEmbedHeight(readingRevealEnabled);
  if (displayMode === 'analysis' && (showLog || showDebugSection)) {
    root.appendChild(renderDebugSection());
  }
  applyInlineSettingsPlacement();
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

function launchStartSequence(): void {
  if (!startPending) return;
  startPending = false;
  const startupOpening = startupOpeningForProblem(currentProblem);
  if (startupOpening.length === 0) {
    const before = state;
    const ddsHistoryForTurn = [...ddsPlayHistory];
    const result = autoplayUntilUserOrEnd(state, {
      eventCollector: semanticCollector,
      autoplayBackstop: buildBrowserDdsBackstop(ddsHistoryForTurn)
    });
    state = result.state;
    threatCtx = (state.threat as ThreatContext | null) ?? null;
    threatLabels = (state.threatLabels as DefenderLabels | null) ?? null;
    collectTeachingRecolorEventsForTurn(before, result.events);
    const trickCompleteIndex = result.events.findIndex((event) => event.type === 'trickComplete');
    if (trickCompleteIndex >= 0) {
      const visibleEvents = result.events.slice(0, trickCompleteIndex + 1);
      const visibleShadow = cloneStateForLog(before);
      for (const event of visibleEvents) applyEventToShadow(visibleShadow, event);
      trickFrozen = true;
      frozenViewState = visibleShadow;
      const trickEvent = visibleEvents[visibleEvents.length - 1];
      if (trickEvent.type === 'trickComplete') {
        lastCompletedTrick = trickEvent.trick.map((p) => ({ ...p }));
      }
      canLeadDismiss = state.phase !== 'end' && state.trick.length === 0 && state.userControls.includes(state.turn);
    }
    const complete = result.events.find((e) => e.type === 'handComplete');
    if (complete?.type === 'handComplete') {
      runStatus = complete.success ? 'success' : 'failure';
    }
    clearDdErrorVisual();
    refreshThreatModel(currentProblemId, false);
    render();
    return;
  }

  let appliedAny = false;
  const originalUserControls = [...state.userControls];
  const forcedManualUserControls: Seat[] = ['N', 'E', 'S', 'W'];
  for (const cardId of startupOpening) {
    if (state.phase === 'end') break;
    const legal = legalPlays(state).filter((p) => p.seat === state.turn);
    const play = legal.find((p) => (toCardId(p.suit, p.rank) as CardId) === cardId);
    if (!play) break;
    const before = state;
    const steppedState: State = { ...state, userControls: forcedManualUserControls };
    const result = apply(steppedState, play, { eventCollector: semanticCollector });
    state = result.state;
    state.userControls = [...originalUserControls];
    collectTeachingRecolorEventsForTurn(before, result.events);
    const trickCompleteIndex = result.events.findIndex((event) => event.type === 'trickComplete');
    if (trickCompleteIndex >= 0) {
      const visibleEvents = result.events.slice(0, trickCompleteIndex + 1);
      const visibleShadow = cloneStateForLog(before);
      for (const event of visibleEvents) applyEventToShadow(visibleShadow, event);
      trickFrozen = true;
      frozenViewState = visibleShadow;
      const trickEvent = visibleEvents[visibleEvents.length - 1];
      if (trickEvent.type === 'trickComplete') {
        lastCompletedTrick = trickEvent.trick.map((p) => ({ ...p }));
      }
      canLeadDismiss = state.phase !== 'end' && state.trick.length === 0 && state.userControls.includes(state.turn);
    }
    const complete = result.events.find((e) => e.type === 'handComplete');
    appliedAny = true;
    if (complete?.type === 'handComplete') {
      runStatus = complete.success ? 'success' : 'failure';
      break;
    }
  }
  if (!appliedAny) return;
  clearDdErrorVisual();
  threatCtx = (state.threat as ThreatContext | null) ?? null;
  threatLabels = (state.threatLabels as DefenderLabels | null) ?? null;
  refreshThreatModel(currentProblemId, false);
  render();
}

function replayArticleScriptToCursor(cursor: number): void {
  if (!articleScriptState) return;
  const bounded = Math.max(0, Math.min(cursor, articleScriptState.history.length));
  articleScriptState.cursor = bounded;
  const replayed = replayArticleHistory(withDdSource(currentProblem), articleScriptState.history, bounded, currentSeed);
  state = replayed.state;
  syncConfiguredUserControls();
  resetSemanticStreams();
  teachingReducer.setTrumpSuit(state.trumpSuit);
  ddsPlayHistory = replayed.playedCardIds.map((cardId) => `${cardId[0]}${cardId.slice(1)}`);
  ddsTeachingSummaries = [];
  clearDdErrorVisual();
  inevitableFailureAlert = false;
  clearWidgetNarrationFeed();
  clearHint();
  clearTeachingEvents();
  inversePrimaryBySuit = {};
  deferredLogLines = [];
  unfreezeTrick(false);
  runStatus = 'running';
  runPlayCounter = bounded;
  let frozenShadowForReplay: State | null = null;
  let completedTrickForReplay: Play[] | null = null;
  let replayCanLeadDismiss = false;
  if (bounded > 0) {
    let semanticReplayState = init({ ...withDdSource(currentProblem), rngSeed: currentSeed });
    semanticReplayState.userControls = ['N', 'E', 'S', 'W'];
    for (let i = 0; i < bounded; i += 1) {
      const expectedCardId = articleScriptState.history[i];
      if (!expectedCardId) break;
      const legal = legalPlays(semanticReplayState).filter((p) => p.seat === semanticReplayState.turn);
      const play = legal.find((p) => (toCardId(p.suit, p.rank) as CardId) === expectedCardId);
      if (!play) break;
      const before = semanticReplayState;
      const result = apply({ ...semanticReplayState, userControls: ['N', 'E', 'S', 'W'] }, play, { eventCollector: semanticCollector });
      semanticReplayState = result.state;
      semanticReplayState.userControls = ['N', 'E', 'S', 'W'];
      if (i === bounded - 1) {
        const trickCompleteIndex = result.events.findIndex((event) => event.type === 'trickComplete');
        if (trickCompleteIndex >= 0) {
          const visibleEvents = result.events.slice(0, trickCompleteIndex + 1);
          const visibleShadow = cloneStateForLog(before);
          for (const event of visibleEvents) applyEventToShadow(visibleShadow, event);
          frozenShadowForReplay = visibleShadow;
          const trickEvent = visibleEvents[visibleEvents.length - 1];
          if (trickEvent.type === 'trickComplete') {
            completedTrickForReplay = trickEvent.trick.map((p) => ({ ...p }));
          }
          replayCanLeadDismiss =
            semanticReplayState.phase !== 'end'
            && semanticReplayState.trick.length === 0
            && semanticReplayState.userControls.includes(semanticReplayState.turn);
        }
      }
    }
    semanticCollector.clear();
    rawSemanticReducer.reset();
    teachingReducer.clearEntries();
  }
  if (frozenShadowForReplay && completedTrickForReplay) {
    trickFrozen = true;
    frozenViewState = frozenShadowForReplay;
    lastCompletedTrick = completedTrickForReplay;
    canLeadDismiss = replayCanLeadDismiss;
  }
  syncArticleScriptCompletionProgress();
  rebuildUserEqClassMapping(state);
  resetDefenderEqInitSnapshot();
  refreshThreatModel(currentProblemId, false);
}

function resetToCurrentArticleCheckpoint(): void {
  const scriptState = articleScriptCoordinator.getArticleScriptState();
  if (!scriptState) return;
  articleScriptCoordinator.resetToCurrentCheckpoint();
  resetWidgetReadingControlsReveal();
  replayArticleScriptToCursor(scriptState.initialCursor);
}

function resetCurrentArticleScriptToBeginning(): void {
  const scriptState = articleScriptCoordinator.getArticleScriptState();
  if (!scriptState) return;
  articleScriptCoordinator.resetToBeginning();
  resetWidgetReadingControlsReveal();
  replayArticleScriptToCursor(scriptState.initialCursor);
}

if (practiceSession) beginPracticeRun('puzzle-solving');
refreshThreatModel(currentProblemId, false);
if (articleScriptModeEnabled()) {
  autoplaySingletons = false;
  autoplayEw = false;
  resetToCurrentArticleCheckpoint();
}
replayInitialUserHistoryIfPresent();
warmDdsRuntime();
render();
