import type { CardId } from '../core';
import { experimentalDraft01 } from '../puzzles/experimental_draft';
import {
  experimentalDraftIntroScript,
  resolveArticleScriptCardAtCursor
} from './articleScripts';
import { matchArticleScriptHistory } from './articleScriptRuntime';
import { applyArticleScriptWidgetActionCore } from './articleScriptWidgetActionCore';
import {
  normalizeWidgetStateSnapshotV1,
  type WidgetStateSnapshotV1
} from './widgetStateSnapshot';
import { buildWidgetStateSnapshotPermalink } from './widgetStateSnapshotUrl';

// Pilot scope note:
// This runner intentionally uses articleScriptWidgetActionCore only.
// It is progression-only coverage (cursor/history/checkpoint progression) and
// is not authoritative for prompt/follow transport semantics.
export type VscWidgetScenarioAction = 'start' | 'next' | 'nextPause' | 'revealQuiet' | 'openFullControls';
export type VscWidgetScenarioClassification = 'locked' | 'review' | 'open-question';

export type VscWidgetScenarioDefinition = {
  id: string;
  classification: VscWidgetScenarioClassification;
  description: string;
  actions: VscWidgetScenarioAction[];
  startSnapshot: WidgetStateSnapshotV1;
};

export type VscWidgetScenarioSummary = {
  startupGatePhase: WidgetStateSnapshotV1['journey']['startupGatePhase'];
  readingControlsRevealStage: WidgetStateSnapshotV1['chrome']['readingControlsRevealStage'];
  activeInteractionProfile: WidgetStateSnapshotV1['journey']['activeInteractionProfile'];
  scriptCursor: number;
  scriptHistoryLength: number;
  scriptStateId: string;
  scriptHistoryPrefix: CardId[];
  scriptedPrefixValid: boolean;
};

export type VscWidgetScenarioResult = {
  scenario: VscWidgetScenarioDefinition;
  endSnapshot: WidgetStateSnapshotV1;
  summary: VscWidgetScenarioSummary;
  permalink: string | null;
};

const VSC_WIDGET_BASE_URL = 'http://localhost:5173/workbench/?mode=widget';
const VSC_CHECKPOINT_OPENING_CURSOR = 24;
const VSC_TRIGGER_CARDS = new Set<CardId>(
  Object.keys(experimentalDraftIntroScript.companionPanel?.narrative?.activeSegmentByPlayCardId ?? {}) as CardId[]
);

function cloneSnapshot(snapshot: WidgetStateSnapshotV1): WidgetStateSnapshotV1 {
  return normalizeWidgetStateSnapshotV1(snapshot);
}

function buildVscScriptedOpening(): CardId[] {
  const opening: CardId[] = [];
  for (let cursor = 0; cursor < VSC_CHECKPOINT_OPENING_CURSOR; cursor += 1) {
    const cardId = resolveArticleScriptCardAtCursor(experimentalDraftIntroScript, cursor);
    if (!cardId) break;
    opening.push(cardId);
  }
  return opening;
}

function applyArticleScriptAction(snapshot: WidgetStateSnapshotV1, action: 'start' | 'next' | 'nextPause'): void {
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
    spec: experimentalDraftIntroScript,
    problem: experimentalDraft01,
    seed: snapshot.problem.seed,
    pauseTriggerCards: VSC_TRIGGER_CARDS,
    startupOpeningLength: snapshot.runtime.scriptedOpening.length,
    startupMode: 'single-step'
  });
  snapshot.journey.startupGatePhase = result.nextState.startupGatePhase;
  snapshot.chrome.readingControlsRevealStage = result.nextState.readingControlsRevealStage;
  scriptState.checkpointId = result.nextState.checkpointId;
  scriptState.cursor = result.nextState.cursor;
  scriptState.history = result.nextState.history;
}

function applyAction(snapshot: WidgetStateSnapshotV1, action: VscWidgetScenarioAction): void {
  if (action === 'start') {
    applyArticleScriptAction(snapshot, 'start');
    return;
  }
  if (action === 'next') {
    applyArticleScriptAction(snapshot, 'next');
    return;
  }
  if (action === 'nextPause') {
    applyArticleScriptAction(snapshot, 'nextPause');
    return;
  }
  if (action === 'revealQuiet') {
    snapshot.chrome.readingControlsRevealStage = 'quiet';
    return;
  }
  if (action === 'openFullControls') {
    snapshot.chrome.readingControlsRevealStage = 'full';
  }
}

function scriptHistoryIsAuthoredPrefix(history: CardId[]): boolean {
  for (let idx = 0; idx < history.length; idx += 1) {
    const expected = resolveArticleScriptCardAtCursor(experimentalDraftIntroScript, idx);
    if (!expected || expected !== history[idx]) return false;
  }
  return true;
}

function buildSummary(snapshot: WidgetStateSnapshotV1): VscWidgetScenarioSummary {
  const scriptState = snapshot.articleScript;
  if (!scriptState) {
    return {
      startupGatePhase: snapshot.journey.startupGatePhase,
      readingControlsRevealStage: snapshot.chrome.readingControlsRevealStage,
      activeInteractionProfile: snapshot.journey.activeInteractionProfile,
      scriptCursor: 0,
      scriptHistoryLength: 0,
      scriptStateId: 'missing-script',
      scriptHistoryPrefix: [],
      scriptedPrefixValid: false
    };
  }
  const matched = matchArticleScriptHistory(
    experimentalDraftIntroScript,
    scriptState.checkpointId,
    scriptState.history,
    scriptState.cursor
  );
  return {
    startupGatePhase: snapshot.journey.startupGatePhase,
    readingControlsRevealStage: snapshot.chrome.readingControlsRevealStage,
    activeInteractionProfile: snapshot.journey.activeInteractionProfile,
    scriptCursor: scriptState.cursor,
    scriptHistoryLength: scriptState.history.length,
    scriptStateId: matched.stateId,
    scriptHistoryPrefix: scriptState.history.slice(0, scriptState.cursor),
    scriptedPrefixValid: scriptHistoryIsAuthoredPrefix(scriptState.history.slice(0, scriptState.cursor))
  };
}

function buildPermalink(snapshot: WidgetStateSnapshotV1): string | null {
  try {
    return buildWidgetStateSnapshotPermalink(VSC_WIDGET_BASE_URL, snapshot);
  } catch {
    return null;
  }
}

export function createVscPilotStartSnapshot(overrides: Partial<WidgetStateSnapshotV1> = {}): WidgetStateSnapshotV1 {
  const base: WidgetStateSnapshotV1 = {
    version: 1,
    problem: {
      problemId: 'experimental_draft_01',
      variantId: null,
      seed: 1975
    },
    initialConfig: {
      displayMode: 'widget',
      widgetUiMode: 'default',
      readingProfileEnabledFromUrl: true,
      companionPanelEnabledFromUrl: true,
      startupGateEnabledFromUrl: false
    },
    runtime: {
      userHistory: [],
      scriptedOpening: buildVscScriptedOpening()
    },
    journey: {
      activeInteractionProfile: 'story-viewing',
      startupGatePhase: 'pending',
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
      readingRevealEnabled: true,
      readingControlsRevealStage: 'collapsed',
      readingInteractionStarted: false,
      companionPanelHidden: false
    },
    articleScript: {
      scriptId: 'experimental-draft-intro',
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

export function runVscWidgetScenario(
  scenario: VscWidgetScenarioDefinition
): VscWidgetScenarioResult {
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
