import { getDdsRuntimeStatus, queryDdsNextPlays, warmDdsRuntime } from '../ai/ddsBrowser';
import { buildDdsScoreByCard } from '../ai/ddsCardScores';
import { parseCardId, toCardId, type CardId } from '../ai/threatModel';
import { legalPlays, type Play, type Problem, type Seat, type State, type Suit } from '../core';
import {
  canReplayArticleScriptRememberedTail,
  chooseArticleScriptBranchOptionForProfile,
  explicitChoiceStepForBranch as explicitChoiceStepForBranchShared,
  isArticleScriptBranchComplete as isArticleScriptBranchCompleteShared,
  previousUnfinishedArticleScriptBranchCursor as previousUnfinishedArticleScriptBranchCursorShared,
  type ArticleScriptChoicePresentationLike
} from './articleScriptInteractionPolicy';
import {
  defaultArticleScriptHistory,
  matchArticleScriptHistory,
  replayArticleHistory,
  type ArticleScriptChoiceSelections,
  type ArticleScriptStateId
} from './articleScriptRuntime';
import {
  ARTICLE_SCRIPT_NAVIGATION_MODE,
  resolveArticleScriptCompanionNarrativeDefaultContent,
  resolveArticleScriptCompanionNarrativeSegmentIdsAtCursor,
  resolveArticleScriptAuthoredBranchName,
  resolveArticleScriptCheckpoint,
  resolveArticleScriptLength,
  resolveArticleScriptPlayStepCompanionAtCursor,
  resolveArticleScriptPlayStepDeviationCompanionAtCursor,
  resolveArticleScriptPlayStepMessageAtCursor,
  resolveArticleScriptStepAtCursor,
  resolveArticleScriptTerminalState,
  resolveNextArticleScriptCheckpoint,
  resolvePendingArticleScriptChoice,
  type ArticleScriptChoiceStep,
  type ArticleScriptDerivedPlayStep,
  type ArticleScriptFlexSegmentStep,
  type ArticleScriptSpec
} from './articleScripts';
import {
  clearFollowPrompt,
  startCompanionFutureTransition,
  markCompanionNarrativeSegmentsActive,
  markBranchOptionTried,
  resetArticleScriptTracking,
  setCompanionContent,
  setMessage,
  type HandDiagramCompanionContent,
  type HandDiagramSession
} from './handDiagramSession';
import type { InteractionProfile } from './interactionProfiles';

type RunStatus = 'running' | 'success' | 'failure';
type DisplayMode = 'analysis' | 'widget' | 'practice';
type ProblemWithThreats = Problem & { threatCardIds?: CardId[] };

export type ArticleScriptCoordinatorState = {
  spec: ArticleScriptSpec;
  checkpointId: string | null;
  initialCursor: number;
  cursor: number;
  history: CardId[];
  choiceSelections: ArticleScriptChoiceSelections;
  interactionProfileOverride: InteractionProfile | null;
};

type ArticleScriptDerivedCache = {
  history: CardId[];
  problemId: string;
  seed: number;
  checkpointId: string | null;
  matchByCursor: Map<number, ReturnType<typeof matchArticleScriptHistory>>;
  replayByCursor: Map<number, ReturnType<typeof replayArticleHistory>>;
};

export type AuthoredBranchTreeNode = {
  key: string;
  children: AuthoredBranchTreeNode[];
};

export type WidgetCompanionPanelState = {
  enabled: boolean;
  hidden: boolean;
  futureTransitioning: boolean;
  layout: 'compact' | 'split';
  textStyle: 'default' | 'article-prose';
  branchName: string | null;
  branchTree: AuthoredBranchTreeNode | null;
  content: HandDiagramCompanionContent | null;
};

export type ArticleScriptChoicePresentation = {
  choice: ArticleScriptChoiceStep;
  rawChoice: ArticleScriptChoiceStep;
  unresolvedOptions: CardId[];
  completedOptions: CardId[];
};

export type CreateArticleScriptCoordinatorDeps = {
  getDisplayMode: () => DisplayMode;
  getCurrentProblem: () => ProblemWithThreats;
  getCurrentProblemId: () => string;
  getCurrentSeed: () => number;
  getCurrentState: () => State;
  getRunStatus: () => RunStatus;
  getAutoplayEw: () => boolean;
  getArticleScriptState: () => ArticleScriptCoordinatorState | null;
  setArticleScriptState: (next: ArticleScriptCoordinatorState | null) => void;
  withDdSource: (problem: ProblemWithThreats) => ProblemWithThreats;
  handDiagramSession: HandDiagramSession;
  widgetCompanionPanelEnabledFromUrl: boolean;
  getWidgetCompanionPanelHidden: () => boolean;
  clearHint: () => void;
  chooseHintAdvanceCard: (options: CardId[]) => CardId | null;
  applyArticleScriptInteractionProfileDefaults: (profile: InteractionProfile) => void;
};

function rankStrengthForAdvance(rank: string): number {
  return { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 }[rank] ?? 99;
}

function suitStrengthForAdvance(suit: Suit): number {
  return { C: 0, D: 1, H: 2, S: 3 }[suit] ?? 99;
}

export function createArticleScriptCoordinator(deps: CreateArticleScriptCoordinatorDeps) {
  let articleScriptDerivedCache: ArticleScriptDerivedCache | null = null;
  const authoredBranchTreeCache = new Map<string, AuthoredBranchTreeNode | null>();

  const stateRef = (): ArticleScriptCoordinatorState | null => deps.getArticleScriptState();
  const handDiagramSession = deps.handDiagramSession;

  function articleScriptModeEnabled(): boolean {
    return deps.getDisplayMode() === 'widget'
      && stateRef()?.spec.navigationMode === ARTICLE_SCRIPT_NAVIGATION_MODE;
  }

  function resolveLowestLegalCard(view: State, seat: Seat): CardId | null {
    const legal = legalPlays(view).filter((candidate) => candidate.seat === seat);
    if (legal.length === 0) return null;
    legal.sort((a, b) => {
      const rankDelta = rankStrengthForAdvance(a.rank) - rankStrengthForAdvance(b.rank);
      if (rankDelta !== 0) return rankDelta;
      return suitStrengthForAdvance(a.suit) - suitStrengthForAdvance(b.suit);
    });
    const chosen = legal[0];
    return chosen ? (toCardId(chosen.suit, chosen.rank) as CardId) : null;
  }

  function resolveDdsAccurateOptionsForStep(step: ArticleScriptChoiceStep, view: State, playedCardIds: string[]): CardId[] {
    const currentProblem = deps.getCurrentProblem();
    const legal = legalPlays(view)
      .filter((candidate) => candidate.seat === step.seat)
      .map((candidate) => toCardId(candidate.suit, candidate.rank) as CardId);
    const filteredLegal = step.suit ? legal.filter((cardId) => (cardId[0] as Suit) === step.suit) : legal;
    if (step.optionMode !== 'dd-accurate') return step.options ?? filteredLegal;
    const dds = queryDdsNextPlays({
      openingLeader: currentProblem.leader,
      initialHands: currentProblem.hands,
      contract: currentProblem.contract,
      playedCardIds
    });
    if (!dds.ok) return filteredLegal;
    const scoreByCard = buildDdsScoreByCard(dds.result.plays);
    const scoredLegal = legal.filter((cardId) => scoreByCard.has(cardId));
    if (scoredLegal.length === 0) return filteredLegal;
    const maxScore = Math.max(...scoredLegal.map((cardId) => scoreByCard.get(cardId) ?? Number.NEGATIVE_INFINITY));
    return filteredLegal.filter((cardId) => (scoreByCard.get(cardId) ?? Number.NEGATIVE_INFINITY) === maxScore);
  }

  function resolveArticleScriptChoiceOptions(
    step: ArticleScriptChoiceStep,
    historyPrefix: CardId[],
    cursor: number
  ): ArticleScriptChoiceStep {
    if ((step.optionMode ?? 'explicit') === 'explicit') return { ...step, options: step.options ?? [] };
    const replayed = replayArticleHistory(
      deps.withDdSource(deps.getCurrentProblem()),
      historyPrefix,
      cursor,
      deps.getCurrentSeed()
    );
    return {
      ...step,
      options: resolveDdsAccurateOptionsForStep(step, replayed.state, replayed.playedCardIds)
    };
  }

  function resolveArticleScriptDerivedPlayCard(step: ArticleScriptDerivedPlayStep, view: State, playedCardIds: CardId[] = []): CardId | null {
    const legal = legalPlays(view).filter((candidate) => candidate.seat === step.seat && (!step.suit || candidate.suit === step.suit));
    if (legal.length === 0) return null;
    if (step.rule === 'dd-min' || step.rule === 'dd-max') {
      const options = resolveDdsAccurateOptionsForStep({ kind: 'choice', seat: step.seat, optionMode: 'dd-accurate', suit: step.suit }, view, playedCardIds);
      const sortedOptions = [...options].sort((a, b) => {
        const rankDelta = rankStrengthForAdvance(parseCardId(a).rank) - rankStrengthForAdvance(parseCardId(b).rank);
        if (rankDelta !== 0) return rankDelta;
        return suitStrengthForAdvance(parseCardId(a).suit) - suitStrengthForAdvance(parseCardId(b).suit);
      });
      const lastOption = sortedOptions.length > 0 ? sortedOptions[sortedOptions.length - 1] : null;
      return step.rule === 'dd-max' ? lastOption : (sortedOptions[0] ?? null);
    }
    if (step.rule === 'cover') {
      const coverHeartTen = view.trick.some((played) => toCardId(played.suit, played.rank) === 'HT');
      if (coverHeartTen) {
        const jackCover = legal.find((candidate) => candidate.suit === 'H' && candidate.rank === 'J');
        if (jackCover) return toCardId(jackCover.suit, jackCover.rank) as CardId;
      }
    }
    legal.sort((a, b) => {
      const rankDelta = rankStrengthForAdvance(a.rank) - rankStrengthForAdvance(b.rank);
      if (rankDelta !== 0) return rankDelta;
      return suitStrengthForAdvance(a.suit) - suitStrengthForAdvance(b.suit);
    });
    const chosen = legal[0];
    return chosen ? (toCardId(chosen.suit, chosen.rank) as CardId) : null;
  }

  function resolveArticleScriptFlexCard(step: ArticleScriptFlexSegmentStep, view: State, playedCardIds: CardId[]): CardId | null {
    void step;
    const currentProblem = deps.getCurrentProblem();
    const seat = view.turn;
    if (currentProblem.userControls.includes(seat)) {
      const options = resolveDdsAccurateOptionsForStep({ kind: 'choice', seat, optionMode: 'dd-accurate' }, view, playedCardIds);
      return options[0] ?? null;
    }
    return resolveLowestLegalCard(view, seat);
  }

  function currentArticleScriptReplayAtCursor(cursor: number) {
    const scriptState = stateRef();
    if (!scriptState) return null;
    const checkpointId = scriptState.checkpointId ?? null;
    if (
      !articleScriptDerivedCache
      || articleScriptDerivedCache.history !== scriptState.history
      || articleScriptDerivedCache.problemId !== deps.getCurrentProblemId()
      || articleScriptDerivedCache.seed !== deps.getCurrentSeed()
      || articleScriptDerivedCache.checkpointId !== checkpointId
    ) {
      articleScriptDerivedCache = {
        history: scriptState.history,
        problemId: deps.getCurrentProblemId(),
        seed: deps.getCurrentSeed(),
        checkpointId,
        matchByCursor: new Map(),
        replayByCursor: new Map()
      };
    }
    const cached = articleScriptDerivedCache.replayByCursor.get(cursor);
    if (cached) return cached;
    const replayed = replayArticleHistory(
      deps.withDdSource(deps.getCurrentProblem()),
      scriptState.history,
      cursor,
      deps.getCurrentSeed()
    );
    articleScriptDerivedCache.replayByCursor.set(cursor, replayed);
    return replayed;
  }

  function matchCurrentArticleScriptHistory(cursor: number = stateRef()?.cursor ?? 0) {
    const scriptState = stateRef();
    if (!scriptState) return null;
    const checkpointId = scriptState.checkpointId ?? null;
    if (
      !articleScriptDerivedCache
      || articleScriptDerivedCache.history !== scriptState.history
      || articleScriptDerivedCache.problemId !== deps.getCurrentProblemId()
      || articleScriptDerivedCache.seed !== deps.getCurrentSeed()
      || articleScriptDerivedCache.checkpointId !== checkpointId
    ) {
      articleScriptDerivedCache = {
        history: scriptState.history,
        problemId: deps.getCurrentProblemId(),
        seed: deps.getCurrentSeed(),
        checkpointId,
        matchByCursor: new Map(),
        replayByCursor: new Map()
      };
    }
    const cached = articleScriptDerivedCache.matchByCursor.get(cursor);
    if (cached) return cached;
    const matched = matchArticleScriptHistory(
      scriptState.spec,
      scriptState.checkpointId,
      scriptState.history,
      cursor,
      {
        resolveChoiceStep: (step, historyPrefix, stepCursor) => resolveArticleScriptChoiceOptions(step, historyPrefix, stepCursor),
        matchDerivedPlay: (history, stepCursor, step) => {
          const replayed = history === scriptState.history
            ? currentArticleScriptReplayAtCursor(stepCursor)
            : replayArticleHistory(deps.withDdSource(deps.getCurrentProblem()), history, stepCursor, deps.getCurrentSeed());
          if (!replayed) return false;
          const expectedDerived = resolveArticleScriptDerivedPlayCard(step, replayed.state, replayed.playedCardIds);
          return Boolean(expectedDerived && history[stepCursor] === expectedDerived);
        },
        matchFlexSegment: (history, stepCursor) => {
          const replayed = history === scriptState.history
            ? currentArticleScriptReplayAtCursor(stepCursor)
            : replayArticleHistory(deps.withDdSource(deps.getCurrentProblem()), history, stepCursor, deps.getCurrentSeed());
          if (!replayed) return false;
          const seat = replayed.state.turn;
          const played = history[stepCursor];
          if (!played) return false;
          if (deps.getCurrentProblem().userControls.includes(seat)) {
            const ddOptions = resolveDdsAccurateOptionsForStep({ kind: 'choice', seat, optionMode: 'dd-accurate' }, replayed.state, replayed.playedCardIds);
            return ddOptions.includes(played);
          }
          const expectedFlex = resolveLowestLegalCard(replayed.state, seat);
          return Boolean(expectedFlex && played === expectedFlex);
        },
        replayHistory: (history, replayCursor) => (
          history === scriptState.history
            ? currentArticleScriptReplayAtCursor(replayCursor)
            : replayArticleHistory(deps.withDdSource(deps.getCurrentProblem()), history, replayCursor, deps.getCurrentSeed())
        )
      }
    );
    articleScriptDerivedCache.matchByCursor.set(cursor, matched);
    return matched;
  }

  function rawArticleScriptStepAtCursor(cursor: number = stateRef()?.cursor ?? 0) {
    const scriptState = stateRef();
    if (!scriptState) return null;
    return resolveArticleScriptStepAtCursor(scriptState.spec, cursor, scriptState.choiceSelections);
  }

  function rawPendingArticleScriptChoiceAtCursor(cursor: number = stateRef()?.cursor ?? 0) {
    const scriptState = stateRef();
    if (!scriptState) return null;
    return resolvePendingArticleScriptChoice(scriptState.spec, cursor, scriptState.choiceSelections);
  }

  function articleScriptStepNeedsDds(cursor: number = stateRef()?.cursor ?? 0): boolean {
    const pending = rawPendingArticleScriptChoiceAtCursor(cursor);
    if (pending && pending.optionMode === 'dd-accurate') return true;
    const step = rawArticleScriptStepAtCursor(cursor);
    return step?.kind === 'derived-play' && (step.rule === 'dd-min' || step.rule === 'dd-max');
  }

  function ensureArticleScriptDdsLoading(): void {
    if (!articleScriptStepNeedsDds()) return;
    if (getDdsRuntimeStatus() === 'ready' || getDdsRuntimeStatus() === 'loading') return;
    warmDdsRuntime();
  }

  function articleScriptWaitingOnDds(): boolean {
    if (!articleScriptStepNeedsDds()) return false;
    const status = getDdsRuntimeStatus();
    return status === 'idle' || status === 'loading' || status === 'failed';
  }

  function currentArticleScriptAssertionFailure() {
    return matchCurrentArticleScriptHistory()?.assertionFailure ?? null;
  }

  function currentArticleScriptStatusMessage(): string | null {
    if (articleScriptWaitingOnDds()) {
      ensureArticleScriptDdsLoading();
      return getDdsRuntimeStatus() === 'failed' ? 'Waiting for DDS…' : 'Loading DDS…';
    }
    const assertionFailure = currentArticleScriptAssertionFailure();
    if (assertionFailure?.kind === 'choice-options') {
      return `Script Error: expected options ${assertionFailure.expected.join(', ')}; got ${assertionFailure.actual.join(', ') || '-'}`;
    }
    if (assertionFailure?.kind === 'choice-suits') {
      return `Script Error: expected suits ${assertionFailure.expected.join(', ')}; got ${assertionFailure.actual.join(', ') || '-'}`;
    }
    if (assertionFailure?.kind === 'trick-winner') {
      return `Script Error: expected winner ${assertionFailure.expected.join(', ')}; got ${assertionFailure.actual.join(', ') || '-'}`;
    }
    return null;
  }

  function resolveArticleScriptReplayCardAtCursor(cursor: number): CardId | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    const matched = matchCurrentArticleScriptHistory(cursor);
    const choiceSelections = matched?.choiceSelections ?? {};
    const pending = resolvePendingArticleScriptChoice(scriptState.spec, cursor, choiceSelections);
    if (canReplayArticleScriptRememberedTail({
      hasPendingChoice: Boolean(pending),
      cursorInRememberedHistory: cursor < scriptState.history.length
    })) {
      return scriptState.history[cursor] ?? null;
    }
    if (pending) return null;
    const step = resolveArticleScriptStepAtCursor(scriptState.spec, cursor, choiceSelections);
    const replayed = currentArticleScriptReplayAtCursor(cursor);
    if (!replayed) return null;
    if (step?.kind === 'play') return step.cardId;
    if (step?.kind === 'derived-play') return resolveArticleScriptDerivedPlayCard(step, replayed.state, replayed.playedCardIds);
    if (step?.kind === 'flex-segment') return resolveArticleScriptFlexCard(step, replayed.state, replayed.playedCardIds);
    return null;
  }

  function pendingArticleScriptChoice(): ArticleScriptChoiceStep | null {
    return currentArticleScriptChoicePresentation()?.choice ?? null;
  }

  function currentArticleScriptEndCursor(): number | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    const matchedEnd = matchCurrentArticleScriptHistory()?.endCursor ?? resolveArticleScriptLength(scriptState.spec);
    const nextCheckpoint = resolveNextArticleScriptCheckpoint(scriptState.spec, scriptState.checkpointId);
    return nextCheckpoint ? Math.min(nextCheckpoint.cursor, matchedEnd) : matchedEnd;
  }

  function currentArticleScriptHasPendingChoiceAtCursor(): boolean {
    const scriptState = stateRef();
    if (!scriptState) return false;
    const matched = matchCurrentArticleScriptHistory();
    return Boolean(
      resolvePendingArticleScriptChoice(
        scriptState.spec,
        scriptState.cursor,
        matched?.choiceSelections ?? {}
      )
    );
  }

  function currentArticleScriptStateId(): ArticleScriptStateId | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    return matchCurrentArticleScriptHistory()?.stateId ?? null;
  }

  function currentArticleScriptTerminalLabel(): 'Complete' | 'End' | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    if (currentArticleScriptHasPendingChoiceAtCursor()) return null;
    const endCursor = currentArticleScriptEndCursor();
    if (endCursor === null || scriptState.cursor < endCursor) return null;
    const terminalState = resolveArticleScriptTerminalState(
      scriptState.spec,
      matchCurrentArticleScriptHistory()?.choiceSelections ?? {}
    );
    return terminalState === 'complete' ? 'Complete' : 'End';
  }

  function currentArticleScriptProgressSummary(): string {
    const scriptState = stateRef();
    const rootBranch = scriptState ? rootAuthoredBranchKey(scriptState.spec) : '';
    const countCompleted = (branchName: string, includeSelf: boolean): number => {
      const explicitChoice = scriptState ? explicitChoiceStepForBranchShared(scriptState.spec, branchName) : null;
      if (!explicitChoice) return isArticleScriptBranchComplete(branchName) ? (includeSelf ? 1 : 0) : 0;
      const childCount = (explicitChoice.options ?? []).reduce((sum, option) => sum + countCompleted(`${branchName}${option}`, true), 0);
      const selfCount = includeSelf && isArticleScriptBranchComplete(branchName) ? 1 : 0;
      return selfCount + childCount;
    };
    const completedCount = rootBranch ? countCompleted(rootBranch, false) : handDiagramSession.completedBranches.size;
    return `Branches ${completedCount} · Mistakes ${handDiagramSession.mistakeCount} · Hints ${handDiagramSession.hintCount}`;
  }

  function currentArticleScriptStateLabel(): string | null {
    if (currentArticleScriptAssertionFailure()) return 'Script Error';
    const terminalLabel = currentArticleScriptTerminalLabel();
    if (terminalLabel === 'Complete') return `Success! ${currentArticleScriptProgressSummary()}`;
    if (terminalLabel) return terminalLabel;
    const stateId = currentArticleScriptStateId();
    if (!stateId) return null;
    if (stateId === 'pre-script') return 'Pre';
    if (stateId === 'in-script') return 'In';
    if (stateId === 'off-script') return 'Off';
    return 'Post';
  }

  function currentArticleScriptResolvedBranchName(): string {
    const scriptState = stateRef();
    if (!scriptState) return '';
    return resolveArticleScriptAuthoredBranchName(
      scriptState.spec,
      matchCurrentArticleScriptHistory()?.choiceSelections ?? {},
      scriptState.cursor
    );
  }

  function currentArticleScriptBranchName(): string | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    const branchName = currentArticleScriptResolvedBranchName();
    return branchName || null;
  }

  function currentArticleScriptReplayCard(): CardId | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    if (currentArticleScriptStateId() !== 'in-script') return null;
    if (articleScriptWaitingOnDds()) return null;
    return resolveArticleScriptReplayCardAtCursor(scriptState.cursor);
  }

  function clearArticleScriptFollowPrompt(): void {
    clearFollowPrompt(handDiagramSession);
  }

  function currentArticleScriptHasRememberedTail(): boolean {
    const scriptState = stateRef();
    return Boolean(scriptState && scriptState.cursor < scriptState.history.length);
  }

  function chooseArticleScriptHintCard(options: CardId[]): CardId | null {
    return deps.chooseHintAdvanceCard(options) ?? options[0] ?? null;
  }

  function chooseCurrentArticleScriptBranchOption(): CardId | null {
    return chooseArticleScriptBranchOptionForProfile({
      profile: currentArticleScriptInteractionProfile(),
      choicePresentation: currentArticleScriptChoicePresentation() as ArticleScriptChoicePresentationLike | null,
      branchName: currentArticleScriptResolvedBranchName(),
      triedBranchOptions: handDiagramSession.triedBranchOptions
    });
  }

  function recordArticleScriptBranchOptionChoice(branchName: string, cardId: CardId): void {
    markBranchOptionTried(handDiagramSession, branchName, cardId);
  }

  function seatAtHistoryCursor(history: CardId[], cursor: number): Seat | null {
    const scriptState = stateRef();
    const replayed = scriptState && history === scriptState.history
      ? currentArticleScriptReplayAtCursor(cursor)
      : replayArticleHistory(deps.withDdSource(deps.getCurrentProblem()), history, cursor, deps.getCurrentSeed());
    if (!replayed) return null;
    return replayed.cursor === cursor ? replayed.state.turn : null;
  }

  function articleScriptUndoTargetCursor(): number {
    const scriptState = stateRef();
    if (!scriptState) return 0;
    const history = scriptState.history;
    let target = scriptState.cursor;
    let removedSignificant = false;
    while (target > 0) {
      const stepCursor = target - 1;
      const seat = seatAtHistoryCursor(history, stepCursor);
      target = stepCursor;
      if (!seat) break;
      if (deps.getCurrentProblem().userControls.includes(seat)) {
        removedSignificant = true;
        break;
      }
      if (!deps.getAutoplayEw()) {
        removedSignificant = true;
        break;
      }
    }
    return removedSignificant ? target : Math.max(0, scriptState.cursor - 1);
  }

  function currentArticleScriptInteractionProfile(): InteractionProfile {
    const scriptState = stateRef();
    if (!scriptState) return 'puzzle-solving';
    return scriptState.interactionProfileOverride ?? scriptState.spec.interactionProfile;
  }

  function articleScriptIsStoryViewing(): boolean {
    return currentArticleScriptInteractionProfile() === 'story-viewing';
  }

  function setCurrentArticleScriptInteractionProfile(profile: InteractionProfile, options: { applyDefaults?: boolean } = {}): void {
    const scriptState = stateRef();
    if (!scriptState) return;
    scriptState.interactionProfileOverride =
      profile === scriptState.spec.interactionProfile
        ? null
        : profile;
    clearArticleScriptFollowPrompt();
    if (options.applyDefaults) deps.applyArticleScriptInteractionProfileDefaults(profile);
  }

  function applyArticleScriptPlayStepFeedbackAtCursor(cursor: number, playedCardId: CardId): void {
    const scriptState = stateRef();
    if (!scriptState) return;
    const activeProfile = currentArticleScriptInteractionProfile();
    if (
      activeProfile === 'story-viewing'
      && cursor === scriptState.initialCursor
      && Boolean(scriptState.spec.companionPanel?.narrative?.segments.length)
    ) {
      startCompanionFutureTransition(handDiagramSession);
    }
    const narrativeSegmentIds = resolveArticleScriptCompanionNarrativeSegmentIdsAtCursor({
      spec: scriptState.spec,
      cursor,
      choiceSelections: scriptState.choiceSelections,
      playedCardId,
      activeProfile
    });
    if (narrativeSegmentIds.length > 0) {
      markCompanionNarrativeSegmentsActive(handDiagramSession, narrativeSegmentIds);
    }
    const message = resolveArticleScriptPlayStepMessageAtCursor({
      spec: scriptState.spec,
      cursor,
      choiceSelections: scriptState.choiceSelections,
      playedCardId
    });
    const companion = resolveArticleScriptPlayStepCompanionAtCursor({
      spec: scriptState.spec,
      cursor,
      choiceSelections: scriptState.choiceSelections,
      playedCardId,
      activeProfile
    });
    const deviationCompanion = resolveArticleScriptPlayStepDeviationCompanionAtCursor({
      spec: scriptState.spec,
      cursor,
      choiceSelections: scriptState.choiceSelections,
      playedCardId,
      activeProfile
    });
    const hasFeedbackUpdate = Boolean(message || companion || deviationCompanion || narrativeSegmentIds.length > 0);
    if (!hasFeedbackUpdate) return;
    if (message || companion || deviationCompanion) deps.clearHint();
    if (message) setMessage(handDiagramSession, message.text, message.html);
    if (companion) setCompanionContent(handDiagramSession, companion);
    if (deviationCompanion) setCompanionContent(handDiagramSession, deviationCompanion);
  }

  function applyTurnPlay(play: Play): void {
    const scriptState = stateRef();
    if (!scriptState) return;
    const scriptedChoice = pendingArticleScriptChoice();
    const chosenCardId = toCardId(play.suit, play.rank) as CardId;
    if (scriptedChoice) {
      if (play.seat === scriptedChoice.seat && scriptedChoice.options?.includes(chosenCardId)) {
        const choiceMessage = scriptedChoice.choiceMessages?.[chosenCardId];
        const authoredBranchName =
          (scriptedChoice.optionMode ?? 'explicit') === 'explicit' && (scriptedChoice.branchRole ?? 'authored') === 'authored'
            ? currentArticleScriptResolvedBranchName()
            : '';
        if (authoredBranchName) recordArticleScriptBranchOptionChoice(authoredBranchName, chosenCardId);
        scriptState.history = scriptState.history.slice(0, scriptState.cursor);
        scriptState.history.push(chosenCardId);
        scriptState.choiceSelections[scriptState.cursor] = chosenCardId;
        scriptState.cursor = Math.max(
          0,
          Math.min(
            scriptState.cursor + 1,
            resolveArticleScriptLength(scriptState.spec, scriptState.choiceSelections)
          )
        );
        if (choiceMessage) setMessage(handDiagramSession, choiceMessage, true);
      } else {
        scriptState.history = scriptState.history.slice(0, scriptState.cursor);
        scriptState.history.push(chosenCardId);
        scriptState.cursor = scriptState.history.length;
      }
      return;
    }
    applyArticleScriptPlayStepFeedbackAtCursor(scriptState.cursor, chosenCardId);
    scriptState.history = scriptState.history.slice(0, scriptState.cursor);
    scriptState.history.push(chosenCardId);
    scriptState.cursor = scriptState.history.length;
  }

  function rootAuthoredBranchKey(spec: ArticleScriptSpec): string {
    return spec.steps[0]?.kind === 'play' ? spec.steps[0].cardId : '';
  }

  function buildAuthoredBranchTree(spec: ArticleScriptSpec, branchName: string): AuthoredBranchTreeNode {
    const explicitChoice = explicitChoiceStepForBranchShared(spec, branchName);
    const options = explicitChoice?.options ?? [];
    return {
      key: branchName,
      children: options.map((option) => buildAuthoredBranchTree(spec, `${branchName}${option}`))
    };
  }

  function currentAuthoredBranchTree(): AuthoredBranchTreeNode | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    const cached = authoredBranchTreeCache.get(scriptState.spec.id);
    if (cached !== undefined) return cached;
    const rootBranch = rootAuthoredBranchKey(scriptState.spec);
    const tree = rootBranch ? buildAuthoredBranchTree(scriptState.spec, rootBranch) : null;
    authoredBranchTreeCache.set(scriptState.spec.id, tree);
    return tree;
  }

  function currentWidgetCompanionPanelState(): WidgetCompanionPanelState {
    if (deps.getDisplayMode() !== 'widget') {
      return {
        enabled: false,
        hidden: false,
        futureTransitioning: false,
        layout: 'compact',
        textStyle: 'default',
        branchName: null,
        branchTree: null,
        content: null
      };
    }
    const scriptState = stateRef();
    const scripted = articleScriptModeEnabled();
    const scriptedPuzzleProfile = scripted && !articleScriptIsStoryViewing();
    const activeProfile = currentArticleScriptInteractionProfile();
    const companionPanelConfig = scriptState?.spec.companionPanel;
    const profileEnabledByScript = scripted
      && Boolean(companionPanelConfig?.enabledProfiles?.includes(activeProfile))
      && (activeProfile !== 'story-viewing' || deps.widgetCompanionPanelEnabledFromUrl);
    const sessionContent = handDiagramSession.companionContent?.text?.trim()
      ? handDiagramSession.companionContent
      : null;
    const scriptNarrativeContent = profileEnabledByScript && scriptState
      ? resolveArticleScriptCompanionNarrativeDefaultContent({
          spec: scriptState.spec,
          activeProfile,
          activeSegmentIds: handDiagramSession.companionNarrativeActiveSegmentIds,
          hideFutureSegments: handDiagramSession.companionFuturePruned
        })
      : null;
    const scriptDefaultContent =
      scriptNarrativeContent
      ?? (
        profileEnabledByScript && companionPanelConfig?.defaultContent?.text?.trim()
        ? companionPanelConfig.defaultContent
        : null
      );
    const content = sessionContent ?? scriptDefaultContent;
    const enabled = scriptedPuzzleProfile || profileEnabledByScript || (deps.widgetCompanionPanelEnabledFromUrl && Boolean(content));
    if (!enabled) {
      return {
        enabled: false,
        hidden: false,
        futureTransitioning: false,
        layout: 'compact',
        textStyle: 'default',
        branchName: null,
        branchTree: null,
        content: null
      };
    }
    const branchName = scriptedPuzzleProfile ? currentArticleScriptBranchName() : null;
    const branchTree = scriptedPuzzleProfile ? currentAuthoredBranchTree() : null;
    const layout = profileEnabledByScript
      ? (companionPanelConfig?.layout ?? 'compact')
      : 'compact';
    const textStyle = profileEnabledByScript
      ? (companionPanelConfig?.textStyle ?? 'default')
      : 'default';
    return {
      enabled: true,
      hidden: deps.getWidgetCompanionPanelHidden(),
      futureTransitioning: handDiagramSession.companionFutureTransitioning,
      layout,
      textStyle,
      branchName,
      branchTree,
      content
    };
  }

  function isArticleScriptBranchComplete(branchName: string): boolean {
    const scriptState = stateRef();
    if (!scriptState) return false;
    return isArticleScriptBranchCompleteShared(scriptState.spec, handDiagramSession.completedBranches, branchName);
  }

  function previousUnfinishedArticleScriptBranchCursor(
    cursor: number,
    choiceSelections: Partial<Record<number, CardId>>
  ): number | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    return previousUnfinishedArticleScriptBranchCursorShared({
      spec: scriptState.spec,
      initialCursor: scriptState.initialCursor,
      cursor,
      choiceSelections,
      completedBranches: handDiagramSession.completedBranches
    });
  }

  function currentArticleScriptChoicePresentation(): ArticleScriptChoicePresentation | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    if (articleScriptWaitingOnDds()) return null;
    const matched = matchCurrentArticleScriptHistory();
    const stateId = matched?.stateId ?? null;
    if (stateId !== 'in-script' && stateId !== 'pre-script') return null;
    const pending = resolvePendingArticleScriptChoice(scriptState.spec, scriptState.cursor, matched?.choiceSelections ?? {});
    if (!pending) return null;
    const rawChoice = resolveArticleScriptChoiceOptions(pending, scriptState.history.slice(0, scriptState.cursor), scriptState.cursor);
    if ((rawChoice.optionMode ?? 'explicit') !== 'explicit' || (rawChoice.branchRole ?? 'authored') !== 'authored') {
      return {
        choice: rawChoice,
        rawChoice,
        unresolvedOptions: [...(rawChoice.options ?? [])],
        completedOptions: []
      };
    }
    const branchName = currentArticleScriptResolvedBranchName();
    const options = rawChoice.options ?? [];
    const completedOptions = options.filter((cardId) => isArticleScriptBranchComplete(`${branchName}${cardId}`));
    const unresolvedOptions = options.filter((cardId) => !isArticleScriptBranchComplete(`${branchName}${cardId}`));
    return {
      choice: { ...rawChoice, options: unresolvedOptions },
      rawChoice,
      unresolvedOptions,
      completedOptions
    };
  }

  function currentPendingAuthoredChoiceBranchKey(): string | null {
    const scriptState = stateRef();
    if (!scriptState) return null;
    const choicePresentation = currentArticleScriptChoicePresentation();
    const choice = choicePresentation?.rawChoice;
    if (!choice) return null;
    if ((choice.optionMode ?? 'explicit') !== 'explicit') return null;
    if ((choice.branchRole ?? 'authored') !== 'authored') return null;
    return choice.branchPrefix ?? rootAuthoredBranchKey(scriptState.spec);
  }

  function revealKnownArticleScriptBranchesFromCurrentPath(): void {
    const scriptState = stateRef();
    if (!scriptState || articleScriptIsStoryViewing()) return;
    const tree = currentAuthoredBranchTree();
    if (!tree) return;
    const pendingChoiceBranchKey = currentPendingAuthoredChoiceBranchKey();
    const currentBranch = currentArticleScriptBranchName() ?? tree.key;
    let node: AuthoredBranchTreeNode | null = tree;
    handDiagramSession.knownBranches.add(tree.key);
    while (node) {
      handDiagramSession.knownBranches.add(node.key);
      if (node.children.length > 0) {
        const selectedChildShown = node.children.some((child) => currentBranch.startsWith(child.key));
        const pendingChoiceAtNode = pendingChoiceBranchKey === node.key;
        const childAlreadyKnown = node.children.some((child) => handDiagramSession.knownBranches.has(child.key));
        if (selectedChildShown || pendingChoiceAtNode || childAlreadyKnown) {
          for (const child of node.children) {
            handDiagramSession.knownBranches.add(child.key);
          }
        }
      }
      const next: AuthoredBranchTreeNode | undefined = node.children.find((child) => currentBranch.startsWith(child.key));
      if (!next) break;
      node = next;
    }
  }

  function syncArticleScriptCompletionProgress(): void {
    const scriptState = stateRef();
    if (!scriptState) return;
    const branchName = currentArticleScriptBranchName();
    if (!branchName) return;
    const terminalLabel = currentArticleScriptTerminalLabel();
    const currentState = deps.getCurrentState();
    const terminalOutcome =
      terminalLabel === 'Complete'
        ? 'success'
        : (deps.getRunStatus() === 'failure' && currentState.phase === 'end' ? 'failure' : null);
    if (!terminalOutcome) return;
    if (!handDiagramSession.leafStatsByBranch.has(branchName)) {
      const deltaMistakes = Math.max(0, handDiagramSession.mistakeCount - handDiagramSession.attributedLeafMistakes);
      const deltaHints = Math.max(0, handDiagramSession.hintCount - handDiagramSession.attributedLeafHints);
      handDiagramSession.leafStatsByBranch.set(branchName, {
        mistakes: deltaMistakes,
        hints: deltaHints,
        outcome: terminalOutcome
      });
      handDiagramSession.attributedLeafMistakes = handDiagramSession.mistakeCount;
      handDiagramSession.attributedLeafHints = handDiagramSession.hintCount;
    }
    if (terminalOutcome === 'success') handDiagramSession.completedBranches.add(branchName);
  }

  function createInitialState(spec: ArticleScriptSpec, checkpointIdFromUrl: string | null): ArticleScriptCoordinatorState {
    const checkpoint = resolveArticleScriptCheckpoint(spec, checkpointIdFromUrl);
    return {
      spec,
      checkpointId: checkpoint.id,
      initialCursor: checkpoint.cursor,
      cursor: checkpoint.cursor,
      history: defaultArticleScriptHistory(spec, checkpoint.cursor),
      choiceSelections: {},
      interactionProfileOverride: null
    };
  }

  return {
    getArticleScriptState: stateRef,
    setArticleScriptState: deps.setArticleScriptState,
    createInitialState,
    articleScriptModeEnabled,
    ensureArticleScriptDdsLoading,
    articleScriptWaitingOnDds,
    matchCurrentArticleScriptHistory,
    currentArticleScriptReplayAtCursor,
    currentArticleScriptStatusMessage,
    currentArticleScriptEndCursor,
    currentArticleScriptStateId,
    currentArticleScriptStateLabel,
    currentArticleScriptTerminalLabel,
    currentArticleScriptBranchName,
    currentArticleScriptResolvedBranchName,
    currentArticleScriptReplayCard,
    currentArticleScriptHasRememberedTail,
    currentArticleScriptInteractionProfile,
    articleScriptIsStoryViewing,
    setCurrentArticleScriptInteractionProfile,
    applyArticleScriptPlayStepFeedbackAtCursor,
    pendingArticleScriptChoice,
    currentArticleScriptChoicePresentation,
    chooseCurrentArticleScriptBranchOption,
    articleScriptUndoTargetCursor,
    clearArticleScriptFollowPrompt,
    currentWidgetCompanionPanelState,
    previousUnfinishedArticleScriptBranchCursor,
    revealKnownArticleScriptBranchesFromCurrentPath,
    syncArticleScriptCompletionProgress,
    currentArticleScriptProgressSummary,
    resolveArticleScriptReplayCardAtCursor,
    applyTurnPlay,
    resetToCurrentCheckpoint(): void {
      const scriptState = stateRef();
      if (!scriptState) return;
      for (const key of Object.keys(scriptState.choiceSelections)) {
        if (Number(key) >= scriptState.initialCursor) delete scriptState.choiceSelections[Number(key)];
      }
      scriptState.history = defaultArticleScriptHistory(scriptState.spec, scriptState.initialCursor);
      resetArticleScriptTracking(handDiagramSession);
    },
    resetToBeginning(): void {
      const scriptState = stateRef();
      if (!scriptState) return;
      const firstCheckpoint = resolveArticleScriptCheckpoint(scriptState.spec, scriptState.spec.checkpoints[0]?.id ?? null);
      scriptState.checkpointId = firstCheckpoint.id;
      scriptState.initialCursor = firstCheckpoint.cursor;
      scriptState.choiceSelections = {};
      scriptState.history = defaultArticleScriptHistory(scriptState.spec, firstCheckpoint.cursor);
      resetArticleScriptTracking(handDiagramSession);
    },
    appendReplayCardAtCursor(nextCardId: CardId): number | null {
      const scriptState = stateRef();
      if (!scriptState) return null;
      const playCursor = scriptState.cursor;
      scriptState.history = scriptState.history.slice(0, scriptState.cursor);
      scriptState.history.push(nextCardId);
      return playCursor;
    }
  };
}
