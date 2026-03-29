import { describe, expect, it } from 'vitest';
import { legalPlays, type CardId, type Problem } from '../../src/core';
import { doubleDummy01 } from '../../src/puzzles/double_dummy_01';
import { experimentalDraft01 } from '../../src/puzzles/experimental_draft';
import {
  doubleDummy01Script,
  experimentalDraftIntroScript,
  resolvePendingArticleScriptChoice,
  type ArticleScriptSpec
} from '../../src/demo/articleScripts';
import { chooseLowestCardId } from '../../src/demo/articleScriptInteractionPolicy';
import { matchArticleScriptHistory, replayArticleHistory } from '../../src/demo/articleScriptRuntime';
import {
  createArticleScriptWidgetTransport,
  type ArticleScriptWidgetTransportSnapshot
} from '../../src/demo/articleScriptWidgetTransport';
import {
  applyArticleScriptWidgetActionCore,
  type ArticleScriptWidgetAction,
  type ArticleScriptWidgetActionCoreResult,
  type ArticleScriptWidgetProgressionState,
  type ArticleScriptWidgetStartupMode,
  type ReadingControlsRevealStage,
  type StartupGatePhase
} from '../../src/demo/articleScriptWidgetActionCore';

type TransportHarnessConfig = {
  spec: ArticleScriptSpec;
  problem: Problem;
  seed: number;
  startupOpeningLength: number;
  interactionProfile: ArticleScriptWidgetTransportSnapshot['interactionProfile'];
  startupGatePhase: StartupGatePhase;
  readingRevealEnabled: boolean;
  readingControlsRevealStage: ReadingControlsRevealStage;
  checkpointId: string | null;
  cursor: number;
  history: CardId[];
  followPromptCursor?: number | null;
  pauseTriggerCards?: ReadonlySet<CardId>;
};

function buildNarrativeTriggerCards(spec: ArticleScriptSpec): Set<CardId> {
  return new Set<CardId>(
    Object.keys(spec.companionPanel?.narrative?.activeSegmentByPlayCardId ?? {}) as CardId[]
  );
}

function createTransportHarness(config: TransportHarnessConfig) {
  let progression: ArticleScriptWidgetProgressionState = {
    startupGatePhase: config.startupGatePhase,
    readingRevealEnabled: config.readingRevealEnabled,
    readingControlsRevealStage: config.readingControlsRevealStage,
    checkpointId: config.checkpointId,
    cursor: config.cursor,
    history: [...config.history]
  };
  let followPromptCursor = config.followPromptCursor ?? null;
  let trickFrozen = false;
  let canLeadDismiss = false;

  function currentMatch() {
    return matchArticleScriptHistory(
      config.spec,
      progression.checkpointId,
      progression.history,
      progression.cursor
    );
  }

  function currentReplay() {
    return replayArticleHistory(
      config.problem,
      progression.history,
      progression.cursor,
      config.seed
    );
  }

  function currentPendingChoice() {
    const matched = currentMatch();
    return resolvePendingArticleScriptChoice(
      config.spec,
      progression.cursor,
      matched.choiceSelections
    );
  }

  function updateBoundaryState(previousTrickLength: number): void {
    const replayed = currentReplay().state;
    const completedTrick = previousTrickLength > 0 && replayed.trick.length === 0;
    trickFrozen = completedTrick;
    canLeadDismiss = completedTrick
      && replayed.phase !== 'end'
      && replayed.trick.length === 0
      && replayed.userControls.includes(replayed.turn);
  }

  function planAction(
    action: ArticleScriptWidgetAction,
    options: { startupMode?: ArticleScriptWidgetStartupMode } = {}
  ): ArticleScriptWidgetActionCoreResult {
    return applyArticleScriptWidgetActionCore({
      action,
      state: progression,
      spec: config.spec,
      problem: config.problem,
      seed: config.seed,
      pauseTriggerCards: config.pauseTriggerCards ?? buildNarrativeTriggerCards(config.spec),
      startupOpeningLength: config.startupOpeningLength,
      startupMode: options.startupMode
    });
  }

  function applyCoreResult(planned: ArticleScriptWidgetActionCoreResult): number {
    const previousReplay = currentReplay().state;
    progression = {
      ...planned.nextState,
      history: [...planned.nextState.history]
    };
    if (planned.steps.length > 0) updateBoundaryState(previousReplay.trick.length);
    else {
      trickFrozen = false;
      canLeadDismiss = false;
    }
    return progression.cursor;
  }

  function playCardById(cardId: CardId): { played: boolean; usedChoiceMessage: boolean } {
    const replayed = currentReplay().state;
    const legal = legalPlays(replayed).filter((candidate) => candidate.seat === replayed.turn);
    const play = legal.find((candidate) => `${candidate.suit}${candidate.rank}` === cardId);
    if (!play) return { played: false, usedChoiceMessage: false };
    const pendingChoice = currentPendingChoice();
    const usedChoiceMessage = Boolean(pendingChoice?.choiceMessages?.[cardId]);
    const previousTrickLength = replayed.trick.length;
    progression.history = progression.history.slice(0, progression.cursor);
    progression.history.push(cardId);
    progression.cursor += 1;
    updateBoundaryState(previousTrickLength);
    return { played: true, usedChoiceMessage };
  }

  function readSnapshot(): ArticleScriptWidgetTransportSnapshot {
    const replayed = currentReplay().state;
    const pendingChoice = currentPendingChoice();
    return {
      scriptStateId: currentMatch().stateId,
      scriptCursor: progression.cursor,
      followPromptCursor,
      interactionProfile: config.interactionProfile,
      phase: replayed.phase,
      turn: replayed.turn,
      isUserTurn: config.problem.userControls.includes(replayed.turn),
      hasRememberedTail: progression.cursor < progression.history.length,
      trickFrozen,
      canLeadDismiss,
      explicitChoice: pendingChoice
        ? {
            seat: pendingChoice.seat,
            unresolvedOptions: [...(pendingChoice.options ?? [])],
            optionMode: pendingChoice.optionMode ?? 'explicit',
            choiceMessages: pendingChoice.choiceMessages ?? {}
          }
        : null
    };
  }

  const transport = createArticleScriptWidgetTransport({
    readSnapshot,
    planAction,
    applyCoreResult,
    followPromptAdvance: () => {
      const snapshot = readSnapshot();
      if (!snapshot.isUserTurn) return false;
      const pendingChoice = currentPendingChoice();
      if (pendingChoice && pendingChoice.seat === snapshot.turn) {
        const chosen = chooseLowestCardId([...(pendingChoice.options ?? [])]);
        if (!chosen) return false;
        return playCardById(chosen).played;
      }
      const planned = planAction('next');
      if (!planned.changed || planned.steps.length === 0) return false;
      applyCoreResult(planned);
      return true;
    },
    chooseExplicitBranchOption: () => {
      const pendingChoice = currentPendingChoice();
      return chooseLowestCardId([...(pendingChoice?.options ?? [])]);
    },
    playCardById,
    setFollowPromptCursor: (cursor) => {
      followPromptCursor = cursor;
    },
    clearFollowPromptCursor: () => {
      followPromptCursor = null;
    }
  });

  return {
    transport,
    current: () => ({
      progression,
      followPromptCursor,
      pendingChoice: currentPendingChoice()
    })
  };
}

type DerivedDd1ReferenceStates = {
  followPrompt: { cursor: number; history: CardId[] };
  explicitChoice: { cursor: number; history: CardId[]; options: CardId[] };
};

function deriveDd1ReferenceStates(): DerivedDd1ReferenceStates {
  let progression: ArticleScriptWidgetProgressionState = {
    startupGatePhase: 'started',
    readingRevealEnabled: false,
    readingControlsRevealStage: 'collapsed',
    checkpointId: '1',
    cursor: 0,
    history: []
  };
  let followPrompt: DerivedDd1ReferenceStates['followPrompt'] | null = null;
  let explicitChoice: DerivedDd1ReferenceStates['explicitChoice'] | null = null;

  for (let i = 0; i < 128; i += 1) {
    const matched = matchArticleScriptHistory(
      doubleDummy01Script,
      progression.checkpointId,
      progression.history,
      progression.cursor
    );
    const pendingChoice = resolvePendingArticleScriptChoice(
      doubleDummy01Script,
      progression.cursor,
      matched.choiceSelections
    );
    const replayed = replayArticleHistory(
      doubleDummy01,
      progression.history,
      progression.cursor,
      2501
    ).state;
    if (
      !followPrompt
      && !pendingChoice
      && (matched.stateId === 'in-script' || matched.stateId === 'pre-script')
      && doubleDummy01.userControls.includes(replayed.turn)
    ) {
      followPrompt = {
        cursor: progression.cursor,
        history: [...progression.history]
      };
    }
    if (
      !explicitChoice
      && pendingChoice
      && (pendingChoice.optionMode ?? 'explicit') === 'explicit'
      && (pendingChoice.options?.length ?? 0) > 1
    ) {
      explicitChoice = {
        cursor: progression.cursor,
        history: [...progression.history],
        options: [...(pendingChoice.options ?? [])]
      };
    }
    if (followPrompt && explicitChoice) break;

    const next = applyArticleScriptWidgetActionCore({
      action: 'next',
      state: progression,
      spec: doubleDummy01Script,
      problem: doubleDummy01,
      seed: 2501,
      pauseTriggerCards: new Set<CardId>(),
      startupOpeningLength: 0
    });
    if (!next.changed || next.steps.length === 0) break;
    progression = {
      ...next.nextState,
      history: [...next.nextState.history]
    };
  }

  if (!followPrompt) throw new Error('Failed to locate DD1 user-turn follow-prompt state for transport test');
  if (!explicitChoice) throw new Error('Failed to locate DD1 explicit-choice state for transport test');
  return { followPrompt, explicitChoice };
}

const dd1ReferenceStates = deriveDd1ReferenceStates();

describe('articleScriptWidgetTransport', () => {
  it('pauses first DD1 next on follow prompt, then advances on second next at same cursor', () => {
    const { followPrompt } = dd1ReferenceStates;
    const harness = createTransportHarness({
      spec: doubleDummy01Script,
      problem: doubleDummy01,
      seed: 2501,
      startupOpeningLength: 0,
      interactionProfile: 'puzzle-solving',
      startupGatePhase: 'started',
      readingRevealEnabled: false,
      readingControlsRevealStage: 'collapsed',
      checkpointId: '1',
      cursor: followPrompt.cursor,
      history: [...followPrompt.history]
    });

    const first = harness.transport.next();
    expect(first.outcome).toBe('paused');
    expect(first.pauseReason).toBe('follow-prompt');
    expect(first.effects.some((effect) => effect.type === 'set-follow-prompt')).toBe(true);
    expect(harness.current().progression.cursor).toBe(followPrompt.cursor);
    expect(harness.current().followPromptCursor).toBe(followPrompt.cursor);

    const second = harness.transport.next();
    expect(second.outcome).toBe('advanced');
    expect(harness.current().progression.cursor).toBe(followPrompt.cursor + 1);
    expect(harness.current().followPromptCursor).toBeNull();
  });

  it('pauses DD1 next and nextPause at explicit-choice boundary, then advances on second next', () => {
    const { explicitChoice } = dd1ReferenceStates;
    const harness = createTransportHarness({
      spec: doubleDummy01Script,
      problem: doubleDummy01,
      seed: 2501,
      startupOpeningLength: 0,
      interactionProfile: 'puzzle-solving',
      startupGatePhase: 'started',
      readingRevealEnabled: false,
      readingControlsRevealStage: 'collapsed',
      checkpointId: '1',
      cursor: explicitChoice.cursor,
      history: [...explicitChoice.history]
    });

    expect(harness.current().pendingChoice).not.toBeNull();

    const nextPause = harness.transport.nextPause();
    expect(nextPause.outcome).toBe('paused');
    expect(nextPause.pauseReason).toBe('explicit-choice-prompt');
    expect(harness.current().progression.cursor).toBe(explicitChoice.cursor);
    expect(harness.current().followPromptCursor).toBe(explicitChoice.cursor);

    const second = harness.transport.next();
    const expectedChoice = chooseLowestCardId(explicitChoice.options);
    expect(second.outcome).toBe('advanced');
    expect(harness.current().progression.cursor).toBe(explicitChoice.cursor + 1);
    expect(harness.current().progression.history[explicitChoice.cursor]).toBe(expectedChoice);
  });

  it('implements DD1 nextPause as repeated next and pauses on follow prompt when blocked', () => {
    const { followPrompt } = dd1ReferenceStates;
    const harness = createTransportHarness({
      spec: doubleDummy01Script,
      problem: doubleDummy01,
      seed: 2501,
      startupOpeningLength: 0,
      interactionProfile: 'puzzle-solving',
      startupGatePhase: 'started',
      readingRevealEnabled: false,
      readingControlsRevealStage: 'collapsed',
      checkpointId: '1',
      cursor: followPrompt.cursor,
      history: [...followPrompt.history]
    });

    const result = harness.transport.nextPause();
    expect(result.outcome).toBe('paused');
    expect(result.pauseReason).toBe('follow-prompt');
    expect(result.iterations).toBe(1);
    expect(harness.current().progression.cursor).toBe(followPrompt.cursor);
  });

  it('uses VSC start + nextPause to advance by repeated next and pause at trick boundary', () => {
    const harness = createTransportHarness({
      spec: experimentalDraftIntroScript,
      problem: experimentalDraft01,
      seed: 1975,
      startupOpeningLength: 24,
      interactionProfile: 'story-viewing',
      startupGatePhase: 'pending',
      readingRevealEnabled: true,
      readingControlsRevealStage: 'collapsed',
      checkpointId: '1',
      cursor: 0,
      history: []
    });

    const started = harness.transport.start({ startupMode: 'single-step' });
    expect(started.outcome).toBe('advanced');
    expect(harness.current().progression.startupGatePhase).toBe('started');
    expect(harness.current().progression.readingControlsRevealStage).toBe('quiet');
    expect(harness.current().progression.cursor).toBe(1);
    expect(harness.current().progression.history.slice(0, 1)).toEqual(['S7']);

    const pausedAtBoundary = harness.transport.nextPause();
    expect(pausedAtBoundary.outcome).toBe('advanced');
    expect(pausedAtBoundary.pauseReason).toBe('trick-boundary');
    expect(pausedAtBoundary.steps.length).toBeGreaterThan(1);
    expect(harness.current().progression.cursor).toBe(4);
    expect(harness.current().progression.history.slice(0, 4)).toEqual(['S7', 'SA', 'S6', 'S5']);
  });
});
