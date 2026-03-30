import type { CardId } from '../core';
import { doubleDummy01 } from '../puzzles/double_dummy_01';
import {
  doubleDummy01Script,
  resolveArticleScriptAuthoredBranchName,
  resolvePendingArticleScriptChoice
} from './articleScripts';
import { matchArticleScriptHistory } from './articleScriptRuntime';
import { applyArticleScriptWidgetActionCore } from './articleScriptWidgetActionCore';
import {
  normalizeWidgetStateSnapshotV1,
  type WidgetStateSnapshotV1
} from './widgetStateSnapshot';
import { buildWidgetStateSnapshotPermalink } from './widgetStateSnapshotUrl';
import type { InteractionProfile } from './interactionProfiles';

// Pilot scope note:
// This runner intentionally uses articleScriptWidgetActionCore only.
// It is progression-only coverage and does not model prompt-aware transport
// semantics like followPromptCursor second-click behavior.
export type Dd1WidgetScenarioAction = 'start' | 'next' | 'nextPause';
export type Dd1WidgetScenarioClassification = 'locked' | 'review' | 'open-question';

export type Dd1WidgetScenarioDefinition = {
  id: string;
  classification: Dd1WidgetScenarioClassification;
  description: string;
  actions: Dd1WidgetScenarioAction[];
  startSnapshot: WidgetStateSnapshotV1;
};

export type Dd1WidgetScenarioSummary = {
  startupGatePhase: WidgetStateSnapshotV1['journey']['startupGatePhase'];
  activeInteractionProfile: WidgetStateSnapshotV1['journey']['activeInteractionProfile'];
  scriptCursor: number;
  scriptHistoryLength: number;
  scriptStateId: string;
  scriptedPrefixValid: boolean;
  pendingChoiceSeat: string | null;
  pendingChoiceOptions: CardId[];
  branchName: string | null;
  interactionProfileOverride: InteractionProfile | null;
};

export type Dd1WidgetScenarioResult = {
  scenario: Dd1WidgetScenarioDefinition;
  endSnapshot: WidgetStateSnapshotV1;
  summary: Dd1WidgetScenarioSummary;
  permalink: string | null;
};

const DD1_WIDGET_BASE_URL = 'http://localhost:5173/workbench/?mode=widget';
const DD1_TRIGGER_CARDS = new Set<CardId>(
  Object.keys(doubleDummy01Script.companionPanel?.narrative?.activeSegmentByPlayCardId ?? {}) as CardId[]
);

function cloneSnapshot(snapshot: WidgetStateSnapshotV1): WidgetStateSnapshotV1 {
  return normalizeWidgetStateSnapshotV1(snapshot);
}

function applyAction(snapshot: WidgetStateSnapshotV1, action: Dd1WidgetScenarioAction): void {
  const scriptState = snapshot.articleScript;
  if (!scriptState) return;
  const result = applyArticleScriptWidgetActionCore({
    action,
    state: {
      startupGatePhase: snapshot.journey.startupGatePhase,
      readingRevealEnabled: snapshot.chrome.readingRevealEnabled,
      readingControlsRevealStage: snapshot.chrome.readingControlsRevealStage,
      checkpointId: scriptState.checkpointId,
      cursor: scriptState.cursor,
      history: scriptState.history
    },
    spec: doubleDummy01Script,
    problem: doubleDummy01,
    seed: snapshot.problem.seed,
    pauseTriggerCards: DD1_TRIGGER_CARDS,
    startupOpeningLength: snapshot.runtime.scriptedOpening.length,
    startupMode: 'default'
  });
  snapshot.journey.startupGatePhase = result.nextState.startupGatePhase;
  snapshot.chrome.readingControlsRevealStage = result.nextState.readingControlsRevealStage;
  scriptState.checkpointId = result.nextState.checkpointId;
  scriptState.cursor = result.nextState.cursor;
  scriptState.history = result.nextState.history;
}

function buildSummary(snapshot: WidgetStateSnapshotV1): Dd1WidgetScenarioSummary {
  const scriptState = snapshot.articleScript;
  if (!scriptState) {
    return {
      startupGatePhase: snapshot.journey.startupGatePhase,
      activeInteractionProfile: snapshot.journey.activeInteractionProfile,
      scriptCursor: 0,
      scriptHistoryLength: 0,
      scriptStateId: 'missing-script',
      scriptedPrefixValid: false,
      pendingChoiceSeat: null,
      pendingChoiceOptions: [],
      branchName: null,
      interactionProfileOverride: null
    };
  }
  const matched = matchArticleScriptHistory(
    doubleDummy01Script,
    scriptState.checkpointId,
    scriptState.history,
    scriptState.cursor
  );
  const pendingChoice = resolvePendingArticleScriptChoice(
    doubleDummy01Script,
    scriptState.cursor,
    matched.choiceSelections
  );
  const branchName = resolveArticleScriptAuthoredBranchName(
    doubleDummy01Script,
    matched.choiceSelections,
    scriptState.cursor
  );
  return {
    startupGatePhase: snapshot.journey.startupGatePhase,
    activeInteractionProfile: snapshot.journey.activeInteractionProfile,
    scriptCursor: scriptState.cursor,
    scriptHistoryLength: scriptState.history.length,
    scriptStateId: matched.stateId,
    scriptedPrefixValid: matched.stateId !== 'off-script' && matched.assertionFailure === null,
    pendingChoiceSeat: pendingChoice?.seat ?? null,
    pendingChoiceOptions: [...(pendingChoice?.options ?? [])],
    branchName: branchName || null,
    interactionProfileOverride: scriptState.interactionProfileOverride
  };
}

function buildPermalink(snapshot: WidgetStateSnapshotV1): string | null {
  try {
    return buildWidgetStateSnapshotPermalink(DD1_WIDGET_BASE_URL, snapshot);
  } catch {
    return null;
  }
}

export function createDd1PilotStartSnapshot(overrides: Partial<WidgetStateSnapshotV1> = {}): WidgetStateSnapshotV1 {
  const base: WidgetStateSnapshotV1 = {
    version: 1,
    problem: {
      problemId: 'double_dummy_01',
      variantId: null,
      seed: 2501
    },
    initialConfig: {
      displayMode: 'widget',
      widgetUiMode: 'default',
      readingProfileEnabledFromUrl: false,
      companionPanelEnabledFromUrl: false,
      startupGateEnabledFromUrl: false
    },
    runtime: {
      userHistory: [],
      scriptedOpening: []
    },
    journey: {
      activeInteractionProfile: 'puzzle-solving',
      startupGatePhase: 'started',
      assistLevelByPuzzleMode: {
        draft: 'solution',
        'multi-ew': 'puzzle',
        scripted: 'puzzle',
        'single-dummy': 'sd',
        standard: 'solution'
      },
      overrideToggles: {
        alwaysHint: false,
        narrate: false,
        cardColoringEnabled: false,
        hideEastWest: false
      }
    },
    chrome: {
      readingRevealEnabled: false,
      readingControlsRevealStage: 'collapsed',
      readingInteractionStarted: false,
      companionPanelHidden: false
    },
    articleScript: {
      scriptId: 'double-dummy-01',
      checkpointId: '1',
      initialCursor: 0,
      cursor: 0,
      history: [],
      choiceSelections: {},
      interactionProfileOverride: null
    }
  };
  return normalizeWidgetStateSnapshotV1({ ...base, ...overrides } as WidgetStateSnapshotV1);
}

export function runDd1WidgetScenario(
  scenario: Dd1WidgetScenarioDefinition
): Dd1WidgetScenarioResult {
  const working = cloneSnapshot(scenario.startSnapshot);
  for (const action of scenario.actions) applyAction(working, action);
  const endSnapshot = normalizeWidgetStateSnapshotV1(working);
  return {
    scenario,
    endSnapshot,
    summary: buildSummary(endSnapshot),
    permalink: buildPermalink(endSnapshot)
  };
}
