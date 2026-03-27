import type { State } from '../core';
import type { CardId } from '../ai/threatModel';
import { setMessage, setReadingControlsRevealed, type HandDiagramSession } from './handDiagramSession';
import { renderCardToken } from './cardPresentation';
import {
  canGuidedAdvanceByProfile,
  shouldScorePracticeProfile,
  type InteractionProfile,
  type PracticeInteractionProfile
} from './interactionProfiles';

export type HandDiagramSecondaryActionButton = {
  id: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
};

export type HandDiagramSecondaryActionRow = {
  buttons: HandDiagramSecondaryActionButton[];
  className?: string;
};

type HandDiagramNavigationDeps = {
  displayMode: string;
  showGuides: boolean;
  practiceSession: { interactionProfile: PracticeInteractionProfile; isTerminal?: boolean } | null;
  inevitableFailureAlert: boolean;
  runStatus: 'idle' | 'success' | 'failure';
  pendingArticleScriptChoice: () => any;
  currentArticleScriptChoicePresentation: () => any;
  articleScriptState: { cursor: number; initialCursor: number; spec: any; checkpointId?: string | null } | null;
  currentArticleScriptEndCursor: () => number | null;
  resolveArticleScriptLength: (spec: any) => number;
  currentArticleScriptHasRememberedTail: () => boolean;
  currentArticleScriptStateLabel: () => string | null;
  currentArticleScriptTerminalLabel: () => string | null;
  shouldBlockArticleScriptUserAdvance: (args: {
    profile: InteractionProfile;
    isUserTurn: boolean;
    hasRememberedTail: boolean;
    trickFrozen: boolean;
    canLeadDismiss: boolean;
    phase: 'play' | 'end';
  }) => boolean;
  currentArticleScriptInteractionProfile: () => InteractionProfile;
  currentProblem: { userControls: Array<'N' | 'E' | 'S' | 'W'> };
  trickFrozen: boolean;
  canLeadDismiss: boolean;
  state: State;
  currentDismissibleWidgetOutcomeKey: (view: State) => string | null;
  canonicalRunStatusText: (status: 'idle' | 'success' | 'failure') => string;
  isWidgetShellMode: boolean;
  hintLoading: boolean;
  ddsLoadingForHint: boolean;
  activeHint: { bestCards: CardId[]; textLine: string } | null;
  hintDiag: (message: string) => void;
  handDiagramSession: HandDiagramSession;
  narrate: boolean;
  currentArticleScriptStatusMessage: () => string | null;
  withHintPrompt: (text: string, view: State) => string;
  seatName: Record<'N' | 'E' | 'S' | 'W', string>;
  startPending: boolean;
  renderSettingsButton: (placement: 'widget') => HTMLElement;
  articleScriptIsStoryViewing: () => boolean;
  resolvePreviousArticleScriptLandmarkCursor: (spec: any, cursor: number, choiceSelections: Partial<Record<number, CardId>>) => number | null;
  matchCurrentArticleScriptHistory: () => { choiceSelections?: Partial<Record<number, CardId>> } | null;
  replayArticleScriptToCursor: (cursor: number) => void;
  previousUnfinishedArticleScriptBranchCursor: (
    cursor: number,
    choiceSelections: Partial<Record<number, CardId>>
  ) => number | null;
  currentSeed: number;
  resetGame: (seed: number, reason: string) => void;
  dismissTransientWidgetOutcome: (view: State) => void;
  currentViewState: () => State;
  articleScriptUndoTargetCursor: () => number;
  backupLastUserPlay: () => void;
  undoStack: unknown[];
  followCurrentArticleScriptUserTurn: () => boolean;
  legalPlays: typeof import('../core').legalPlays;
  toCardId: (suit: string, rank: string) => CardId;
  chooseCurrentArticleScriptBranchOption: () => CardId | null;
  clearArticleScriptFollowPrompt: () => void;
  runTurn: (play: any) => void;
  advanceOneWidgetCard: () => boolean;
  advanceWidgetToNextPauseBoundary: () => void;
  playAgainAvailable: boolean;
  startPlayAgain: (mode: 'manual') => void;
  endPracticeRun: () => void;
  attemptClaim: () => void;
  hintsEnabled: boolean;
  requestHint: () => void;
  currentProblemId: string;
  currentProblemVariantId: string | null;
  userPlayHistory: unknown[];
  encodeUserHistoryForUrl: (history: unknown[]) => string;
  beginPracticeRun: (profile: PracticeInteractionProfile) => void;
  goToNextPracticePuzzle: () => void;
  readingRevealEnabled: boolean;
  render: () => void;
  currentArticleScriptStateId: () => string | null;
  currentArticleScriptReplayCard: () => CardId | null;
  resolveExplicitBranchAdvanceAction: (args: { unresolvedOptionCount: number; followPromptActive: boolean }) => 'prompt' | 'choose' | 'choose-single' | 'none';
  secondaryActionRow: HandDiagramSecondaryActionRow | null;
};

function currentTurnPrompt(view: State, deps: HandDiagramNavigationDeps): string {
  return deps.withHintPrompt(`${deps.seatName[view.turn]} to play.`, view);
}

function renderOutcomeModule(args: {
  view: State;
  deps: HandDiagramNavigationDeps;
  scriptedChoice: any;
  widgetArticleScript: HandDiagramNavigationDeps['articleScriptState'];
  articleScriptTerminalLabel: string | null;
  articleScriptStateLabel: string | null;
  scriptedPrefix: string;
  warningStatusActive: boolean;
  suppressDismissedOutcome: boolean;
}): HTMLElement | null {
  const {
    view,
    deps,
    scriptedChoice,
    widgetArticleScript,
    articleScriptTerminalLabel,
    articleScriptStateLabel,
    scriptedPrefix,
    warningStatusActive,
    suppressDismissedOutcome
  } = args;
  const {
    runStatus,
    canonicalRunStatusText,
    isWidgetShellMode,
    ddsLoadingForHint,
    activeHint,
    hintDiag,
    handDiagramSession,
    narrate,
    currentArticleScriptStatusMessage,
    startPending,
    trickFrozen,
    canLeadDismiss,
    state,
    seatName,
    hintLoading
  } = deps;
  const widgetStatus = handDiagramSession.status;
  const hasStatusMessage = handDiagramSession.status.type === 'message' && Boolean(handDiagramSession.status.text);

  const outcome = document.createElement('div');
  const outcomeTone =
    runStatus === 'success' || articleScriptTerminalLabel === 'Complete'
      ? 'ok'
      : runStatus === 'failure'
        ? 'fail'
        : warningStatusActive
          ? 'warn'
          : 'neutral';
  outcome.className = `outcome-module ${outcomeTone}`;
  const canonicalStatus = canonicalRunStatusText(runStatus);
  const terminalCanonical = runStatus === 'success' || runStatus === 'failure';

  if (suppressDismissedOutcome) {
    if (state.userControls.includes(view.turn) && (!trickFrozen || canLeadDismiss) && !(widgetArticleScript && articleScriptTerminalLabel === 'Complete')) {
      outcome.textContent = currentTurnPrompt(view, deps);
    } else if (!startPending) {
      outcome.textContent = `${seatName[view.turn]} to play.`;
    } else {
      outcome.textContent = 'Press Start';
    }
    return outcome;
  }

  if (isWidgetShellMode && terminalCanonical) {
    outcome.textContent = canonicalStatus;
    return outcome;
  }

  if (warningStatusActive) {
    outcome.textContent = 'Failure is inevitable';
    return outcome;
  }

  if (ddsLoadingForHint) {
    outcome.classList.add('dds-loading');
    const label = document.createElement('span');
    label.className = 'dds-loading-label';
    label.textContent = 'Loading DDS';
    const meter = document.createElement('span');
    meter.className = 'dds-loading-meter';
    const fill = document.createElement('span');
    fill.className = 'dds-loading-fill';
    meter.appendChild(fill);
    outcome.append(label, meter);
    return outcome;
  }

  if (activeHint && !hasStatusMessage) {
    outcome.classList.add('hint-active');
    const prefix = document.createElement('span');
    prefix.className = 'hint-prefix';
    prefix.textContent = 'BEST:';
    outcome.appendChild(prefix);
    if (activeHint.bestCards.length > 0) {
      for (const cardId of activeHint.bestCards) {
        const chip = renderCardToken(cardId, { context: 'best-chip', mode: 'base', className: 'hint-card' });
        outcome.appendChild(chip);
      }
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'hint-text';
      fallback.textContent = activeHint.textLine.replace(/^BEST:\s*/, '');
      outcome.appendChild(fallback);
    }
    hintDiag(`message area using activeHint lines=${activeHint.textLine}`);
    return outcome;
  }

  if (isWidgetShellMode) {
    if (hintLoading) {
      outcome.textContent = 'Calculating hint…';
      return outcome;
    }
    if (widgetStatus.type === 'hint') {
      handDiagramSession.status = { type: 'default', text: '' };
    }
    if (!widgetArticleScript && narrate && handDiagramSession.narrationLatest?.text) {
      handDiagramSession.status = { type: 'narration', text: handDiagramSession.narrationLatest.text };
    } else if ((!narrate || widgetArticleScript) && widgetStatus.type === 'narration') {
      handDiagramSession.status = { type: 'default', text: '' };
    }
    if (handDiagramSession.status.type === 'message' && handDiagramSession.status.text) {
      outcome.classList.add('article-script-message');
      if (handDiagramSession.status.html) outcome.innerHTML = handDiagramSession.status.text;
      else outcome.textContent = handDiagramSession.status.text;
    } else if (widgetArticleScript && scriptedChoice?.prompt) {
      outcome.textContent = `${scriptedPrefix}${scriptedChoice.prompt}`;
    } else if (widgetArticleScript && currentArticleScriptStatusMessage()) {
      outcome.classList.add('article-script-status');
      outcome.textContent = currentArticleScriptStatusMessage();
    } else if (widgetArticleScript && articleScriptStateLabel) {
      if (articleScriptTerminalLabel === 'Complete') {
        outcome.textContent = articleScriptStateLabel;
      } else if (state.userControls.includes(view.turn) && (!trickFrozen || canLeadDismiss)) {
        outcome.textContent = `${scriptedPrefix}${currentTurnPrompt(view, deps)}`;
      } else {
        outcome.textContent = articleScriptStateLabel;
      }
    } else if (handDiagramSession.status.type === 'narration' && handDiagramSession.status.text) {
      outcome.textContent = handDiagramSession.status.text;
    } else if (state.userControls.includes(view.turn) && (!trickFrozen || canLeadDismiss)) {
      outcome.textContent = currentTurnPrompt(view, deps);
    } else if (!startPending) {
      outcome.textContent = `${seatName[view.turn]} to play.`;
    } else {
      outcome.textContent = 'Press Start';
    }
    return outcome;
  }

  if (terminalCanonical) {
    outcome.textContent = canonicalStatus;
  } else if (handDiagramSession.status.type === 'message' && handDiagramSession.status.text) {
    outcome.classList.add('article-script-message');
    if (handDiagramSession.status.html) outcome.innerHTML = handDiagramSession.status.text;
    else outcome.textContent = handDiagramSession.status.text;
  } else if (scriptedChoice?.prompt) {
    outcome.textContent = `${scriptedPrefix}${scriptedChoice.prompt}`;
  } else if (currentArticleScriptStatusMessage()) {
    outcome.classList.add('article-script-status');
    outcome.textContent = currentArticleScriptStatusMessage();
  } else if (articleScriptStateLabel) {
    if (articleScriptTerminalLabel === 'Complete') {
      outcome.textContent = articleScriptStateLabel;
    } else if (state.userControls.includes(view.turn) && (!trickFrozen || canLeadDismiss)) {
      outcome.textContent = `${scriptedPrefix}${currentTurnPrompt(view, deps)}`;
    } else {
      outcome.textContent = articleScriptStateLabel;
    }
  } else if (state.userControls.includes(view.turn) && (!trickFrozen || canLeadDismiss)) {
    outcome.textContent = currentTurnPrompt(view, deps);
  } else if (!startPending) {
    outcome.textContent = `${seatName[view.turn]} to play.`;
  } else {
    outcome.textContent = 'Press Start';
  }
  return outcome;
}

function renderReadingRevealEdge(args: {
  slot: HTMLElement;
  deps: HandDiagramNavigationDeps;
  handDiagramSession: HandDiagramSession;
}): HTMLElement {
  const { slot, deps, handDiagramSession } = args;
  slot.classList.add('reading-collapsed');
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'reading-reveal-edge';
  reveal.setAttribute('aria-label', 'Show controls');
  const line = document.createElement('span');
  line.className = 'reading-reveal-line';
  line.setAttribute('aria-hidden', 'true');
  const chevron = document.createElement('span');
  chevron.className = 'reading-reveal-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '⌄';
  reveal.append(line, chevron);
  reveal.onclick = () => {
    setReadingControlsRevealed(handDiagramSession, true);
    deps.render();
  };
  slot.appendChild(reveal);
  return slot;
}

function renderPracticeSecondaryActions(args: {
  displayMode: string;
  practiceSession: HandDiagramNavigationDeps['practiceSession'];
  beginPracticeRun: HandDiagramNavigationDeps['beginPracticeRun'];
  resetGame: HandDiagramNavigationDeps['resetGame'];
  currentSeed: number;
  goToNextPracticePuzzle: HandDiagramNavigationDeps['goToNextPracticePuzzle'];
}): HandDiagramSecondaryActionRow | null {
  const {
    displayMode,
    practiceSession,
    beginPracticeRun,
    resetGame,
    currentSeed,
    goToNextPracticePuzzle
  } = args;
  const practiceProfile: PracticeInteractionProfile = practiceSession?.interactionProfile ?? 'puzzle-solving';

  if (displayMode === 'practice' && !shouldScorePracticeProfile(practiceProfile)) {
    return {
      className: 'practice-secondary-actions',
      buttons: [
        {
          id: 'practice-replay',
          label: 'Replay',
          onClick: () => {
            beginPracticeRun('puzzle-solving');
            resetGame(currentSeed, 'practiceReplay');
          }
        },
        {
          id: 'practice-next',
          label: 'Next Puzzle',
          onClick: () => goToNextPracticePuzzle()
        }
      ]
    };
  }

  if (displayMode === 'practice' && practiceSession?.isTerminal && shouldScorePracticeProfile(practiceProfile)) {
    return {
      className: 'practice-secondary-actions',
      buttons: [
        {
          id: 'practice-replay',
          label: 'Replay',
          onClick: () => {
            beginPracticeRun('puzzle-solving');
            resetGame(currentSeed, 'practiceReplay');
          }
        },
        {
          id: 'practice-show-solution',
          label: 'Show Solution',
          onClick: () => {
            beginPracticeRun('solution-viewing');
            resetGame(currentSeed, 'practiceSolution');
          }
        },
        {
          id: 'practice-next',
          label: 'Next Puzzle',
          onClick: () => goToNextPracticePuzzle()
        }
      ]
    };
  }

  return null;
}

function renderSecondaryActionRow(row: HandDiagramSecondaryActionRow | null): HTMLElement | null {
  if (!row || row.buttons.length === 0) return null;
  const actions = document.createElement('div');
  actions.className = `nav-secondary-actions${row.className ? ` ${row.className}` : ''}`;
  for (const buttonDef of row.buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = buttonDef.label;
    btn.disabled = buttonDef.disabled === true;
    if (buttonDef.title) btn.title = buttonDef.title;
    if (buttonDef.onClick) {
      btn.onclick = () => buttonDef.onClick?.();
    }
    actions.appendChild(btn);
  }
  return actions;
}

function renderTransportRow(args: {
  view: State;
  deps: HandDiagramNavigationDeps;
  scriptedChoicePresentation: any;
  widgetArticleScript: HandDiagramNavigationDeps['articleScriptState'];
  articleScriptAtAbsoluteStart: boolean;
  articleScriptAtEnd: boolean;
  articleScriptUserAdvanceBlocked: boolean;
  practicePuzzleMode: boolean;
}): HTMLElement {
  const {
    view,
    deps,
    scriptedChoicePresentation,
    widgetArticleScript,
    articleScriptAtAbsoluteStart,
    articleScriptAtEnd,
    articleScriptUserAdvanceBlocked,
    practicePuzzleMode
  } = args;
  const {
    displayMode,
    practiceSession,
    currentArticleScriptStateId,
    currentArticleScriptReplayCard,
    isWidgetShellMode,
    state,
    trickFrozen,
    currentViewState,
    dismissTransientWidgetOutcome,
    matchCurrentArticleScriptHistory,
    articleScriptIsStoryViewing,
    resolvePreviousArticleScriptLandmarkCursor,
    previousUnfinishedArticleScriptBranchCursor,
    replayArticleScriptToCursor,
    currentSeed,
    resetGame,
    articleScriptUndoTargetCursor,
    backupLastUserPlay,
    undoStack,
    seatName,
    handDiagramSession,
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
    renderSettingsButton,
    render,
    resolveExplicitBranchAdvanceAction,
    hintDiag,
  } = deps;

  const transport = document.createElement('div');
  transport.className = `transport-bar mode-${displayMode}`;
  const widgetTransport = isWidgetShellMode;
  const practiceAdvanceTransport = displayMode === 'practice';
  const practiceProfile: PracticeInteractionProfile = practiceSession?.interactionProfile ?? 'puzzle-solving';
  const practiceAdvanceEnabled = !practiceAdvanceTransport || canGuidedAdvanceByProfile(practiceProfile);
  const compactAdvanceTransport = widgetTransport || practiceAdvanceTransport;

  const restartBtn = document.createElement('button');
  restartBtn.type = 'button';
  restartBtn.textContent = widgetTransport ? '|<<' : 'Restart';
  restartBtn.title = 'Restart';
  restartBtn.setAttribute('aria-label', 'Restart');
  if (isWidgetShellMode) restartBtn.classList.add('icon-btn');
  if (widgetTransport) restartBtn.classList.add('script-transport-btn');
  if (widgetArticleScript) restartBtn.disabled = widgetArticleScript.cursor === widgetArticleScript.initialCursor;
  restartBtn.onclick = () => {
    dismissTransientWidgetOutcome(currentViewState());
    if (widgetArticleScript) {
      const matched = matchCurrentArticleScriptHistory();
      const choiceSelections = matched?.choiceSelections ?? {};
      const targetCursor = articleScriptIsStoryViewing()
        ? resolvePreviousArticleScriptLandmarkCursor(widgetArticleScript.spec, widgetArticleScript.cursor, choiceSelections)
        : previousUnfinishedArticleScriptBranchCursor(widgetArticleScript.cursor, choiceSelections)
          ?? resolvePreviousArticleScriptLandmarkCursor(widgetArticleScript.spec, widgetArticleScript.cursor, choiceSelections);
      replayArticleScriptToCursor(targetCursor ?? widgetArticleScript.initialCursor);
      render();
      return;
    }
    resetGame(currentSeed, 'reset');
  };
  transport.appendChild(restartBtn);

  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.textContent = widgetTransport ? '<' : 'Undo';
  undoBtn.title = 'Undo';
  undoBtn.setAttribute('aria-label', 'Undo');
  if (isWidgetShellMode) undoBtn.classList.add('icon-btn', 'undo-btn');
  if (widgetTransport) undoBtn.classList.add('script-transport-btn');
  if (widgetArticleScript) undoBtn.disabled = articleScriptAtAbsoluteStart;
  else if (!isWidgetShellMode) undoBtn.disabled = undoStack.length === 0;
  undoBtn.onclick = () => {
    dismissTransientWidgetOutcome(currentViewState());
    if (widgetArticleScript) {
      replayArticleScriptToCursor(deps.articleScriptUndoTargetCursor());
      render();
      return;
    }
    if (undoStack.length === 0) return;
    backupLastUserPlay();
  };
  transport.appendChild(undoBtn);

  if (compactAdvanceTransport) {
    const forwardBtn = document.createElement('button');
    forwardBtn.type = 'button';
    forwardBtn.textContent = '>';
    forwardBtn.title = 'Forward';
    forwardBtn.setAttribute('aria-label', 'Forward');
    forwardBtn.classList.add('icon-btn', 'script-transport-btn');
    const forwardDisabled = widgetArticleScript
      ? ((widgetArticleScript?.spec && ['in-script', 'pre-script'].includes(currentArticleScriptStateId() ?? ''))
          ? articleScriptAtEnd || ((!scriptedChoicePresentation || articleScriptUserAdvanceBlocked) && !currentArticleScriptReplayCard())
          : state.phase === 'end' && !trickFrozen)
      : practiceAdvanceTransport && !practiceAdvanceEnabled
        ? true
        : state.phase === 'end' && !trickFrozen;
    if (widgetArticleScript && articleScriptUserAdvanceBlocked) {
      forwardBtn.classList.add('is-disabled');
      forwardBtn.setAttribute('aria-disabled', 'true');
    } else {
      forwardBtn.disabled = forwardDisabled;
    }
    forwardBtn.onclick = () => {
      dismissTransientWidgetOutcome(currentViewState());
      if (widgetArticleScript && articleScriptUserAdvanceBlocked) {
        if (handDiagramSession.followPromptCursor === widgetArticleScript.cursor && followCurrentArticleScriptUserTurn()) {
          render();
          return;
        }
        handDiagramSession.followPromptCursor = widgetArticleScript.cursor;
        handDiagramSession.stickyMessage = false;
        setMessage(handDiagramSession, `Select ${seatName[view.turn]}'s next play, or click > again to follow script.`);
        render();
        return;
      }
      if (widgetArticleScript && scriptedChoicePresentation && (scriptedChoicePresentation.rawChoice.optionMode ?? 'explicit') === 'explicit') {
        const unresolvedOptions = scriptedChoicePresentation.unresolvedOptions;
        const branchAdvanceAction = resolveExplicitBranchAdvanceAction({
          unresolvedOptionCount: unresolvedOptions.length,
          followPromptActive: handDiagramSession.followPromptCursor === widgetArticleScript.cursor
        });
        if (branchAdvanceAction === 'choose') {
          const chosenCardId = chooseCurrentArticleScriptBranchOption();
          const legal = legalPlays(state).filter((candidate: any) => candidate.seat === state.turn);
          const play = chosenCardId
            ? legal.find((candidate: any) => (toCardId(candidate.suit, candidate.rank) as CardId) === chosenCardId)
            : null;
          if (play) {
            const choiceMessage = scriptedChoicePresentation.rawChoice.choiceMessages?.[chosenCardId];
            clearArticleScriptFollowPrompt();
            runTurn(play);
            if (!choiceMessage) {
              handDiagramSession.stickyMessage = true;
              setMessage(handDiagramSession, `Choosing ${chosenCardId}.`);
            }
            render();
            return;
          }
        }
        if (branchAdvanceAction === 'prompt') {
          handDiagramSession.followPromptCursor = widgetArticleScript.cursor;
          handDiagramSession.stickyMessage = false;
          setMessage(handDiagramSession, `Choose ${seatName[view.turn]}'s play, or click > again to choose the lowest.`);
          render();
          return;
        }
        if (branchAdvanceAction === 'choose-single') {
          const chosenCardId = chooseCurrentArticleScriptBranchOption() ?? unresolvedOptions[0];
          const legal = legalPlays(state).filter((candidate: any) => candidate.seat === state.turn);
          const play = legal.find((candidate: any) => (toCardId(candidate.suit, candidate.rank) as CardId) === chosenCardId);
          if (play) {
            const choiceMessage = scriptedChoicePresentation.rawChoice.choiceMessages?.[chosenCardId];
            clearArticleScriptFollowPrompt();
            runTurn(play);
            if (!choiceMessage) {
              handDiagramSession.stickyMessage = true;
              setMessage(handDiagramSession, `Choosing ${chosenCardId}.`);
            }
            render();
            return;
          }
        }
      }
      if (practiceAdvanceTransport && !practiceAdvanceEnabled) return;
      advanceOneWidgetCard();
    };
    transport.appendChild(forwardBtn);

    const jumpBtn = document.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.textContent = '>>|';
    jumpBtn.title = 'Advance to end';
    jumpBtn.setAttribute('aria-label', 'Advance to end');
    jumpBtn.classList.add('icon-btn', 'script-transport-btn');
    jumpBtn.disabled = widgetArticleScript
      ? ((['in-script', 'pre-script'].includes(currentArticleScriptStateId() ?? ''))
          ? articleScriptAtEnd
          : state.phase === 'end' && !trickFrozen)
      : practiceAdvanceTransport && !practiceAdvanceEnabled
        ? true
        : state.phase === 'end' && !trickFrozen;
    jumpBtn.onclick = () => {
      dismissTransientWidgetOutcome(currentViewState());
      if (practiceAdvanceTransport && !practiceAdvanceEnabled) return;
      advanceWidgetToNextPauseBoundary();
    };
    transport.appendChild(jumpBtn);
  }

  if (displayMode === 'analysis') {
    const nextVariationBtn = document.createElement('button');
    nextVariationBtn.type = 'button';
    nextVariationBtn.textContent = 'Next variation';
    nextVariationBtn.disabled = !(deps.runStatus === 'success' && playAgainAvailable);
    nextVariationBtn.onclick = () => startPlayAgain('manual');
    transport.appendChild(nextVariationBtn);
  }

  if (practicePuzzleMode) {
    const endBtn = document.createElement('button');
    endBtn.type = 'button';
    endBtn.textContent = isWidgetShellMode ? '⏭' : 'End';
    endBtn.title = 'End puzzle';
    endBtn.setAttribute('aria-label', 'End puzzle');
    if (isWidgetShellMode) endBtn.classList.add('icon-btn');
    endBtn.onclick = () => endPracticeRun();
    transport.appendChild(endBtn);

    const claimBtn = document.createElement('button');
    claimBtn.type = 'button';
    claimBtn.textContent = 'Claim';
    claimBtn.title = 'Claim remaining tricks';
    claimBtn.setAttribute('aria-label', 'Claim remaining tricks');
    claimBtn.classList.add('claim-btn');
    claimBtn.onclick = () => attemptClaim();
    transport.appendChild(claimBtn);
  } else if (hintsEnabled) {
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
      if (currentProblemVariantId) u.searchParams.set('variant', currentProblemVariantId);
      else u.searchParams.delete('variant');
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
    transport.appendChild(renderSettingsButton('widget'));
  }

  return transport;
}

export function renderHandDiagramNavigationArea(view: State, deps: HandDiagramNavigationDeps): HTMLElement {
  const {
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
    render,
    secondaryActionRow
  } = deps;

  const section = document.createElement('section');
  section.className = `board-navigation-area mode-${displayMode}${showGuides ? ' show-guides' : ''}`;
  const slot = document.createElement('div');
  slot.className = `hand-diagram-nav-slot mode-${displayMode}`;
  if (deps.readingRevealEnabled) slot.classList.add('reading-profile-nav');
  const practiceProfile: PracticeInteractionProfile = practiceSession?.interactionProfile ?? 'puzzle-solving';
  const practicePuzzleMode = displayMode === 'practice' && !!practiceSession && shouldScorePracticeProfile(practiceProfile);
  const warningStatusActive = inevitableFailureAlert && runStatus !== 'success' && runStatus !== 'failure';
  const scriptedChoice = pendingArticleScriptChoice();
  const scriptedChoicePresentation = currentArticleScriptChoicePresentation();
  const widgetArticleScript = displayMode === 'widget' ? articleScriptState : null;
  const articleScriptEndCursor = widgetArticleScript ? currentArticleScriptEndCursor() ?? resolveArticleScriptLength(widgetArticleScript.spec) : null;
  const articleScriptAtAbsoluteStart = widgetArticleScript ? widgetArticleScript.cursor === 0 : false;
  const articleScriptAtEnd = widgetArticleScript && articleScriptEndCursor !== null ? widgetArticleScript.cursor >= articleScriptEndCursor : false;
  const articleScriptHasRememberedTail = widgetArticleScript ? currentArticleScriptHasRememberedTail() : false;
  const articleScriptStateLabel = widgetArticleScript ? currentArticleScriptStateLabel() : null;
  const articleScriptTerminalLabel = widgetArticleScript ? currentArticleScriptTerminalLabel() : null;
  const scriptedPrefix = articleScriptStateLabel ? `${articleScriptStateLabel} · ` : '';
  const articleScriptUserAdvanceBlocked = Boolean(
    widgetArticleScript
      && shouldBlockArticleScriptUserAdvance({
        profile: currentArticleScriptInteractionProfile(),
        isUserTurn: currentProblem.userControls.includes(view.turn),
        hasRememberedTail: articleScriptHasRememberedTail,
        trickFrozen,
        canLeadDismiss,
        phase: state.phase
      })
  );
  const dismissedOutcomeKey = currentDismissibleWidgetOutcomeKey(view);
  const suppressDismissedOutcome = dismissedOutcomeKey !== null && dismissedOutcomeKey === handDiagramSession.dismissedOutcomeKey;

  if (deps.readingRevealEnabled && !handDiagramSession.readingControlsRevealed) {
    section.appendChild(renderReadingRevealEdge({ slot, deps, handDiagramSession }));
    return section;
  }

  const outcome = renderOutcomeModule({
    view,
    deps,
    scriptedChoice,
    widgetArticleScript,
    articleScriptTerminalLabel,
    articleScriptStateLabel,
    scriptedPrefix,
    warningStatusActive,
    suppressDismissedOutcome
  });
  slot.appendChild(outcome);
  slot.appendChild(renderTransportRow({
    view,
    deps,
    scriptedChoicePresentation,
    widgetArticleScript,
    articleScriptAtAbsoluteStart,
    articleScriptAtEnd,
    articleScriptUserAdvanceBlocked,
    practicePuzzleMode
  }));
  section.appendChild(slot);
  const practiceSecondaryActionRow = renderPracticeSecondaryActions({
    displayMode,
    practiceSession,
    beginPracticeRun,
    resetGame,
    currentSeed,
    goToNextPracticePuzzle
  });
  const secondaryActions = renderSecondaryActionRow(practiceSecondaryActionRow ?? secondaryActionRow);
  if (secondaryActions) section.appendChild(secondaryActions);
  return section;
}
