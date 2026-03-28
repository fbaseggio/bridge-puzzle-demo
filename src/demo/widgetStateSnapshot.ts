import type { CardId } from '../ai/threatModel';
import type { ArticleScriptCoordinatorState } from './articleScriptCoordinator';
import type { ReadingControlsRevealStage } from './handDiagramSession';
import type { InteractionProfile } from './interactionProfiles';

export type WidgetSnapshotDisplayMode = 'analysis' | 'widget' | 'practice';
export type WidgetSnapshotUiMode = 'default' | 'dd-puzzle' | 'sd-puzzle';

export type WidgetStateSnapshotV1 = {
  version: 1;
  problem: {
    problemId: string;
    variantId: string | null;
    seed: number;
  };
  initialConfig: {
    displayMode: WidgetSnapshotDisplayMode;
    widgetUiMode: WidgetSnapshotUiMode;
    readingProfileEnabledFromUrl: boolean;
    companionPanelEnabledFromUrl: boolean;
    startupGateEnabledFromUrl: boolean;
  };
  runtime: {
    userHistory: CardId[];
    scriptedOpening: CardId[];
  };
  articleScript?: {
    scriptId: string;
    checkpointId: string | null;
    initialCursor: number;
    cursor: number;
    history: CardId[];
    choiceSelections: Record<number, CardId>;
    interactionProfileOverride: InteractionProfile | null;
  };
  journey: {
    activeInteractionProfile: InteractionProfile | null;
    assistLevelByPuzzleMode: Record<string, string>;
    overrideToggles: {
      alwaysHint: boolean;
      narrate: boolean;
      cardColoringEnabled: boolean;
      hideEastWest: boolean;
    };
  };
  chrome: {
    readingRevealEnabled: boolean;
    readingControlsRevealStage: ReadingControlsRevealStage;
    readingInteractionStarted: boolean;
    companionPanelHidden: boolean;
  };
};

export type CaptureWidgetStateSnapshotV1Input = {
  problemId: string;
  variantId: string | null;
  seed: number;
  displayMode: WidgetSnapshotDisplayMode;
  widgetUiMode: WidgetSnapshotUiMode;
  readingProfileEnabledFromUrl: boolean;
  companionPanelEnabledFromUrl: boolean;
  startupGateEnabledFromUrl: boolean;
  userHistory: CardId[];
  scriptedOpening: CardId[];
  articleScriptState: ArticleScriptCoordinatorState | null;
  activeInteractionProfile: InteractionProfile | null;
  assistLevelByPuzzleMode: Record<string, string>;
  overrideToggles: {
    alwaysHint: boolean;
    narrate: boolean;
    cardColoringEnabled: boolean;
    hideEastWest: boolean;
  };
  readingRevealEnabled: boolean;
  readingControlsRevealStage: ReadingControlsRevealStage;
  readingInteractionStarted: boolean;
  companionPanelHidden: boolean;
};

function normalizeChoiceSelections(choiceSelections: Record<number, CardId>): Record<number, CardId> {
  const keys = Object.keys(choiceSelections)
    .map((key) => Number(key))
    .filter((key) => Number.isInteger(key))
    .sort((a, b) => a - b);
  const normalized: Record<number, CardId> = {};
  for (const key of keys) {
    normalized[key] = choiceSelections[key];
  }
  return normalized;
}

function normalizeStringRecord(values: Record<string, string>): Record<string, string> {
  const keys = Object.keys(values).sort((a, b) => a.localeCompare(b));
  const normalized: Record<string, string> = {};
  for (const key of keys) {
    normalized[key] = values[key];
  }
  return normalized;
}

function normalizeArticleScript(
  articleScriptState: ArticleScriptCoordinatorState
): NonNullable<WidgetStateSnapshotV1['articleScript']> {
  return {
    scriptId: articleScriptState.spec.id,
    checkpointId: articleScriptState.checkpointId,
    initialCursor: articleScriptState.initialCursor,
    cursor: articleScriptState.cursor,
    history: [...articleScriptState.history],
    choiceSelections: normalizeChoiceSelections(articleScriptState.choiceSelections),
    interactionProfileOverride: articleScriptState.interactionProfileOverride
  };
}

export function normalizeWidgetStateSnapshotV1(snapshot: WidgetStateSnapshotV1): WidgetStateSnapshotV1 {
  const normalized: WidgetStateSnapshotV1 = {
    version: 1,
    problem: {
      problemId: snapshot.problem.problemId,
      variantId: snapshot.problem.variantId,
      seed: snapshot.problem.seed
    },
    initialConfig: {
      displayMode: snapshot.initialConfig.displayMode,
      widgetUiMode: snapshot.initialConfig.widgetUiMode,
      readingProfileEnabledFromUrl: snapshot.initialConfig.readingProfileEnabledFromUrl,
      companionPanelEnabledFromUrl: snapshot.initialConfig.companionPanelEnabledFromUrl,
      startupGateEnabledFromUrl: snapshot.initialConfig.startupGateEnabledFromUrl
    },
    runtime: {
      userHistory: [...snapshot.runtime.userHistory],
      scriptedOpening: [...snapshot.runtime.scriptedOpening]
    },
    journey: {
      activeInteractionProfile: snapshot.journey.activeInteractionProfile,
      assistLevelByPuzzleMode: normalizeStringRecord(snapshot.journey.assistLevelByPuzzleMode),
      overrideToggles: {
        alwaysHint: snapshot.journey.overrideToggles.alwaysHint,
        narrate: snapshot.journey.overrideToggles.narrate,
        cardColoringEnabled: snapshot.journey.overrideToggles.cardColoringEnabled,
        hideEastWest: snapshot.journey.overrideToggles.hideEastWest
      }
    },
    chrome: {
      readingRevealEnabled: snapshot.chrome.readingRevealEnabled,
      readingControlsRevealStage: snapshot.chrome.readingControlsRevealStage,
      readingInteractionStarted: snapshot.chrome.readingInteractionStarted,
      companionPanelHidden: snapshot.chrome.companionPanelHidden
    }
  };
  if (snapshot.articleScript) {
    normalized.articleScript = {
      scriptId: snapshot.articleScript.scriptId,
      checkpointId: snapshot.articleScript.checkpointId,
      initialCursor: snapshot.articleScript.initialCursor,
      cursor: snapshot.articleScript.cursor,
      history: [...snapshot.articleScript.history],
      choiceSelections: normalizeChoiceSelections(snapshot.articleScript.choiceSelections),
      interactionProfileOverride: snapshot.articleScript.interactionProfileOverride
    };
  }
  return normalized;
}

export function captureWidgetStateSnapshotV1(
  input: CaptureWidgetStateSnapshotV1Input
): WidgetStateSnapshotV1 {
  const snapshot: WidgetStateSnapshotV1 = {
    version: 1,
    problem: {
      problemId: input.problemId,
      variantId: input.variantId,
      seed: input.seed
    },
    initialConfig: {
      displayMode: input.displayMode,
      widgetUiMode: input.widgetUiMode,
      readingProfileEnabledFromUrl: input.readingProfileEnabledFromUrl,
      companionPanelEnabledFromUrl: input.companionPanelEnabledFromUrl,
      startupGateEnabledFromUrl: input.startupGateEnabledFromUrl
    },
    runtime: {
      userHistory: [...input.userHistory],
      scriptedOpening: [...input.scriptedOpening]
    },
    journey: {
      activeInteractionProfile: input.activeInteractionProfile,
      assistLevelByPuzzleMode: normalizeStringRecord(input.assistLevelByPuzzleMode),
      overrideToggles: {
        alwaysHint: input.overrideToggles.alwaysHint,
        narrate: input.overrideToggles.narrate,
        cardColoringEnabled: input.overrideToggles.cardColoringEnabled,
        hideEastWest: input.overrideToggles.hideEastWest
      }
    },
    chrome: {
      readingRevealEnabled: input.readingRevealEnabled,
      readingControlsRevealStage: input.readingControlsRevealStage,
      readingInteractionStarted: input.readingInteractionStarted,
      companionPanelHidden: input.companionPanelHidden
    }
  };
  if (input.articleScriptState) {
    snapshot.articleScript = normalizeArticleScript(input.articleScriptState);
  }
  return normalizeWidgetStateSnapshotV1(snapshot);
}

export function serializeWidgetStateSnapshotV1(
  snapshot: WidgetStateSnapshotV1,
  spacing: number = 2
): string {
  return JSON.stringify(normalizeWidgetStateSnapshotV1(snapshot), null, spacing);
}
