import { describe, expect, it } from 'vitest';
import { init, type CardId, type Play, type Problem, type State } from '../../src/core';
import {
  createArticleScriptCoordinator,
  type ArticleScriptCoordinatorState
} from '../../src/demo/articleScriptCoordinator';
import { ARTICLE_SCRIPT_NAVIGATION_MODE, type ArticleScriptSpec } from '../../src/demo/articleScripts';
import { createHandDiagramSession } from '../../src/demo/handDiagramSession';
import type { InteractionProfile } from '../../src/demo/interactionProfiles';
import { doubleDummy01 } from '../../src/puzzles/double_dummy_01';

const AUTHORED_EXPLICIT_SPEC: ArticleScriptSpec = {
  id: 'coordinator-authored-explicit',
  parentProblemId: doubleDummy01.id,
  navigationMode: ARTICLE_SCRIPT_NAVIGATION_MODE,
  interactionProfile: 'puzzle-solving',
  checkpoints: [{ id: '1', cursor: 0 }],
  steps: [
    { kind: 'play', cardId: 'SK' },
    {
      kind: 'choice',
      seat: 'E',
      options: ['DJ', 'ST'],
      prompt: "Pick East's play",
      choiceMessages: {
        DJ: 'Use DJ'
      }
    },
    { kind: 'play', cardId: 'D4', branchPrefix: 'SKDJ', terminalState: 'complete' },
    { kind: 'play', cardId: 'H5', branchPrefix: 'SKST', terminalState: 'complete' }
  ]
};

const INTERNAL_EXPLICIT_SPEC: ArticleScriptSpec = {
  id: 'coordinator-internal-explicit',
  parentProblemId: doubleDummy01.id,
  navigationMode: ARTICLE_SCRIPT_NAVIGATION_MODE,
  interactionProfile: 'puzzle-solving',
  checkpoints: [{ id: '1', cursor: 0 }],
  steps: [
    { kind: 'play', cardId: 'SK' },
    {
      kind: 'choice',
      seat: 'E',
      options: ['DJ'],
      prompt: "Pick East's play"
    },
    { kind: 'play', cardId: 'D4', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'S',
      options: ['CA', 'D8'],
      prompt: "Pick South's play",
      branchRole: 'internal',
      branchPrefix: 'SKDJ'
    }
  ]
};

const STORY_NARRATIVE_SPEC: ArticleScriptSpec = {
  id: 'coordinator-story-narrative',
  parentProblemId: doubleDummy01.id,
  navigationMode: ARTICLE_SCRIPT_NAVIGATION_MODE,
  interactionProfile: 'story-viewing',
  companionPanel: {
    enabledProfiles: ['story-viewing'],
    textStyle: 'article-prose',
    narrative: {
      introText: 'Intro.',
      segments: [
        { id: 'lead-s7', text: 'West leads a third-or-lowest spade seven;' },
        { id: 'win-sa', text: 'you win in dummy,' }
      ],
      activeSegmentByPlayCardId: {
        S7: 'lead-s7',
        SA: 'win-sa'
      },
      activeProfiles: ['story-viewing']
    }
  },
  checkpoints: [{ id: '1', cursor: 0 }],
  steps: [
    { kind: 'play', cardId: 'S7' },
    { kind: 'play', cardId: 'SA' }
  ]
};

function createScriptState(args: {
  spec: ArticleScriptSpec;
  history: CardId[];
  cursor: number;
  choiceSelections?: Record<number, CardId>;
  initialCursor?: number;
  checkpointId?: string | null;
  interactionProfileOverride?: InteractionProfile | null;
}): ArticleScriptCoordinatorState {
  const {
    spec,
    history,
    cursor,
    choiceSelections = {},
    initialCursor = 0,
    checkpointId = '1',
    interactionProfileOverride = null
  } = args;
  return {
    spec,
    checkpointId,
    initialCursor,
    cursor,
    history: [...history],
    choiceSelections: { ...choiceSelections },
    interactionProfileOverride
  };
}

function playFor(seat: Play['seat'], cardId: CardId): Play {
  return {
    seat,
    suit: cardId[0] as Play['suit'],
    rank: cardId[1] as Play['rank']
  };
}

function createCoordinatorHarness(args: {
  scriptState: ArticleScriptCoordinatorState;
  displayMode?: 'analysis' | 'widget' | 'practice';
  runStatus?: 'running' | 'success' | 'failure';
  widgetCompanionPanelEnabledFromUrl?: boolean;
  widgetCompanionPanelHidden?: boolean;
}) {
  const currentProblem: Problem & { threatCardIds?: CardId[] } = doubleDummy01;
  let currentState: State = init({ ...currentProblem, rngSeed: currentProblem.rngSeed >>> 0 });
  let currentRunStatus: 'running' | 'success' | 'failure' = args.runStatus ?? 'running';
  let currentDisplayMode: 'analysis' | 'widget' | 'practice' = args.displayMode ?? 'widget';
  let currentAutoplayEw = true;
  let currentScriptState: ArticleScriptCoordinatorState | null = args.scriptState;
  let widgetCompanionPanelHidden = args.widgetCompanionPanelHidden ?? false;
  const appliedDefaults: InteractionProfile[] = [];
  let clearHintCalls = 0;
  const handDiagramSession = createHandDiagramSession();

  const coordinator = createArticleScriptCoordinator({
    getDisplayMode: () => currentDisplayMode,
    getCurrentProblem: () => currentProblem,
    getCurrentProblemId: () => currentProblem.id,
    getCurrentSeed: () => currentProblem.rngSeed >>> 0,
    getCurrentState: () => currentState,
    getRunStatus: () => currentRunStatus,
    getAutoplayEw: () => currentAutoplayEw,
    getArticleScriptState: () => currentScriptState,
    setArticleScriptState: (next) => {
      currentScriptState = next;
    },
    withDdSource: (problem) => problem,
    handDiagramSession,
    widgetCompanionPanelEnabledFromUrl: args.widgetCompanionPanelEnabledFromUrl ?? false,
    getWidgetCompanionPanelHidden: () => widgetCompanionPanelHidden,
    clearHint: () => {
      clearHintCalls += 1;
    },
    chooseHintAdvanceCard: (options) => options[0] ?? null,
    applyArticleScriptInteractionProfileDefaults: (profile) => {
      appliedDefaults.push(profile);
    }
  });

  return {
    coordinator,
    handDiagramSession,
    appliedDefaults,
    getClearHintCalls: () => clearHintCalls,
    setCurrentState: (next: State) => {
      currentState = next;
    },
    setRunStatus: (next: 'running' | 'success' | 'failure') => {
      currentRunStatus = next;
    },
    setDisplayMode: (next: 'analysis' | 'widget' | 'practice') => {
      currentDisplayMode = next;
    },
    setAutoplayEw: (next: boolean) => {
      currentAutoplayEw = next;
    },
    setWidgetCompanionPanelHidden: (next: boolean) => {
      widgetCompanionPanelHidden = next;
    }
  };
}

describe('article script coordinator', () => {
  it('manages interaction profile override, follow-prompt clearing, and defaults application', () => {
    const scriptState = createScriptState({
      spec: AUTHORED_EXPLICIT_SPEC,
      history: ['SK'],
      cursor: 1
    });
    const harness = createCoordinatorHarness({ scriptState });
    harness.handDiagramSession.followPromptCursor = 17;

    harness.coordinator.setCurrentArticleScriptInteractionProfile('solution-viewing');

    expect(harness.coordinator.currentArticleScriptInteractionProfile()).toBe('solution-viewing');
    expect(scriptState.interactionProfileOverride).toBe('solution-viewing');
    expect(harness.handDiagramSession.followPromptCursor).toBeNull();
    expect(harness.appliedDefaults).toEqual([]);

    harness.handDiagramSession.followPromptCursor = 4;
    harness.coordinator.setCurrentArticleScriptInteractionProfile('puzzle-solving', { applyDefaults: true });

    expect(harness.coordinator.currentArticleScriptInteractionProfile()).toBe('puzzle-solving');
    expect(scriptState.interactionProfileOverride).toBeNull();
    expect(harness.handDiagramSession.followPromptCursor).toBeNull();
    expect(harness.appliedDefaults).toEqual(['puzzle-solving']);
  });

  it('applies valid explicit authored choices to history, cursor, selections, tried options, and message', () => {
    const scriptState = createScriptState({
      spec: AUTHORED_EXPLICIT_SPEC,
      history: ['SK'],
      cursor: 1
    });
    const harness = createCoordinatorHarness({ scriptState });

    harness.coordinator.applyTurnPlay(playFor('E', 'DJ'));

    expect(scriptState.history).toEqual(['SK', 'DJ']);
    expect(scriptState.cursor).toBe(2);
    expect(scriptState.choiceSelections).toEqual({ 1: 'DJ' });
    expect([...((harness.handDiagramSession.triedBranchOptions.get('SK') ?? new Set()) as Set<CardId>)]).toEqual(['DJ']);
    expect(harness.handDiagramSession.status).toEqual({ type: 'message', text: 'Use DJ', html: true });
  });

  it('falls back to off-script history behavior for invalid choice plays', () => {
    const scriptState = createScriptState({
      spec: AUTHORED_EXPLICIT_SPEC,
      history: ['SK'],
      cursor: 1
    });
    const harness = createCoordinatorHarness({ scriptState });

    harness.coordinator.applyTurnPlay(playFor('E', 'C2'));

    expect(scriptState.history).toEqual(['SK', 'C2']);
    expect(scriptState.cursor).toBe(2);
    expect(scriptState.choiceSelections).toEqual({});
    expect(harness.handDiagramSession.triedBranchOptions.size).toBe(0);
    expect(harness.handDiagramSession.status.type).toBe('default');
  });

  it('filters authored explicit choice presentation by completed options', () => {
    const scriptState = createScriptState({
      spec: AUTHORED_EXPLICIT_SPEC,
      history: ['SK'],
      cursor: 1
    });
    const harness = createCoordinatorHarness({ scriptState });
    harness.handDiagramSession.completedBranches.add('SKDJ');

    const presentation = harness.coordinator.currentArticleScriptChoicePresentation();

    expect(presentation).not.toBeNull();
    expect(presentation?.rawChoice.options).toEqual(['DJ', 'ST']);
    expect(presentation?.choice.options).toEqual(['ST']);
    expect(presentation?.unresolvedOptions).toEqual(['ST']);
    expect(presentation?.completedOptions).toEqual(['DJ']);
  });

  it('passes non-authored explicit choice presentation options through without completion filtering', () => {
    const scriptState = createScriptState({
      spec: INTERNAL_EXPLICIT_SPEC,
      history: ['SK', 'DJ', 'D4'],
      cursor: 3,
      choiceSelections: { 1: 'DJ' }
    });
    const harness = createCoordinatorHarness({ scriptState });
    harness.handDiagramSession.completedBranches.add('SKDJCA');

    const presentation = harness.coordinator.currentArticleScriptChoicePresentation();

    expect(presentation).not.toBeNull();
    expect(presentation?.rawChoice.options).toEqual(['CA', 'D8']);
    expect(presentation?.choice.options).toEqual(['CA', 'D8']);
    expect(presentation?.unresolvedOptions).toEqual(['CA', 'D8']);
    expect(presentation?.completedOptions).toEqual([]);
  });

  it('reveals known authored branches from the current path', () => {
    const scriptState = createScriptState({
      spec: AUTHORED_EXPLICIT_SPEC,
      history: ['SK'],
      cursor: 1
    });
    const harness = createCoordinatorHarness({ scriptState });

    harness.coordinator.revealKnownArticleScriptBranchesFromCurrentPath();

    expect([...harness.handDiagramSession.knownBranches].sort()).toEqual(['SK', 'SKDJ', 'SKST']);
  });

  it('activates companion narrative segments on matching scripted plays', () => {
    const scriptState = createScriptState({
      spec: STORY_NARRATIVE_SPEC,
      history: [],
      cursor: 0
    });
    const harness = createCoordinatorHarness({
      scriptState,
      widgetCompanionPanelEnabledFromUrl: true
    });

    const before = harness.coordinator.currentWidgetCompanionPanelState();
    expect(before.content?.html).toBe(true);
    expect(before.content?.text).toContain('prose-chunk--future');
    expect(before.content?.text).toContain('West leads a third-or-lowest spade seven;');
    expect(before.futureTransitioning).toBe(false);

    harness.coordinator.applyTurnPlay(playFor('W', 'S7'));
    const afterLead = harness.coordinator.currentWidgetCompanionPanelState();
    expect(afterLead.content?.text).toContain('is-active');
    expect(harness.handDiagramSession.companionNarrativeActiveSegmentIds.has('lead-s7')).toBe(true);
    expect(afterLead.futureTransitioning).toBe(true);

    harness.coordinator.applyTurnPlay(playFor('N', 'SA'));
    const afterWin = harness.coordinator.currentWidgetCompanionPanelState();
    expect(harness.handDiagramSession.companionNarrativeActiveSegmentIds.has('win-sa')).toBe(true);
    expect(afterWin.content?.text).toContain('you win in dummy,');
    expect(afterWin.futureTransitioning).toBe(true);
  });

  it('attributes completion stats once per leaf branch', () => {
    const scriptState = createScriptState({
      spec: AUTHORED_EXPLICIT_SPEC,
      history: ['SK', 'DJ', 'D4'],
      cursor: 3,
      choiceSelections: { 1: 'DJ' }
    });
    const harness = createCoordinatorHarness({ scriptState });
    harness.handDiagramSession.mistakeCount = 3;
    harness.handDiagramSession.hintCount = 2;

    harness.coordinator.syncArticleScriptCompletionProgress();

    expect(harness.handDiagramSession.leafStatsByBranch.get('SKDJ')).toEqual({
      mistakes: 3,
      hints: 2,
      outcome: 'success'
    });
    expect(harness.handDiagramSession.completedBranches.has('SKDJ')).toBe(true);
    expect(harness.handDiagramSession.attributedLeafMistakes).toBe(3);
    expect(harness.handDiagramSession.attributedLeafHints).toBe(2);

    harness.handDiagramSession.mistakeCount = 8;
    harness.handDiagramSession.hintCount = 9;
    harness.coordinator.syncArticleScriptCompletionProgress();

    expect(harness.handDiagramSession.leafStatsByBranch.size).toBe(1);
    expect(harness.handDiagramSession.leafStatsByBranch.get('SKDJ')).toEqual({
      mistakes: 3,
      hints: 2,
      outcome: 'success'
    });
    expect(harness.handDiagramSession.attributedLeafMistakes).toBe(3);
    expect(harness.handDiagramSession.attributedLeafHints).toBe(2);
  });

  it('resolves companion panel model for scripted puzzle profile and url-enabled content mode', () => {
    const puzzleProfileState = createScriptState({
      spec: AUTHORED_EXPLICIT_SPEC,
      history: ['SK'],
      cursor: 1
    });
    const puzzleHarness = createCoordinatorHarness({
      scriptState: puzzleProfileState,
      widgetCompanionPanelHidden: true
    });
    const puzzlePanel = puzzleHarness.coordinator.currentWidgetCompanionPanelState();

    expect(puzzlePanel.enabled).toBe(true);
    expect(puzzlePanel.hidden).toBe(true);
    expect(puzzlePanel.branchName).toBe('SK');
    expect(puzzlePanel.branchTree?.key).toBe('SK');
    expect((puzzlePanel.branchTree?.children ?? []).map((child) => child.key).sort()).toEqual(['SKDJ', 'SKST']);
    expect(puzzlePanel.content).toBeNull();

    const urlModeState = createScriptState({
      spec: AUTHORED_EXPLICIT_SPEC,
      history: ['SK'],
      cursor: 1,
      interactionProfileOverride: 'story-viewing'
    });
    const urlModeHarness = createCoordinatorHarness({
      scriptState: urlModeState,
      widgetCompanionPanelEnabledFromUrl: true
    });
    urlModeHarness.handDiagramSession.companionContent = {
      title: 'Companion',
      text: 'Show this panel',
      html: false
    };

    const urlModePanel = urlModeHarness.coordinator.currentWidgetCompanionPanelState();

    expect(urlModePanel.enabled).toBe(true);
    expect(urlModePanel.hidden).toBe(false);
    expect(urlModePanel.branchName).toBeNull();
    expect(urlModePanel.branchTree).toBeNull();
    expect(urlModePanel.content).toEqual({
      title: 'Companion',
      text: 'Show this panel',
      html: false
    });
  });
});
