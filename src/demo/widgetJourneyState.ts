import type { InteractionProfile } from './interactionProfiles';
import type { ReadingControlsRevealStage } from './handDiagramSession';

export type WidgetJourneyStartupBias = 'none' | 'url-reading-profile' | 'article-story-profile';
export type WidgetJourneyProfile = InteractionProfile | 'reading-profile';
export type WidgetJourneyStartupAdvanceMode = 'default' | 'single-step';

export type WidgetJourneyState = {
  activeInteractionProfile: WidgetJourneyProfile | null;
  readingRevealEnabled: boolean;
  startupBias: WidgetJourneyStartupBias;
};

export type ResolveWidgetJourneyStateInput = {
  displayMode: 'analysis' | 'widget' | 'practice';
  widgetReadingProfileEnabledFromUrl: boolean;
  articleScriptModeEnabled: boolean;
  articleScriptInteractionProfile: InteractionProfile | null;
};

export type ResolveWidgetStartupGatePendingInput = {
  startupGateEnabledFromUrl: boolean;
  journey: WidgetJourneyState;
  hasRicherStartupPayload: boolean;
  skipStartupGate?: boolean;
};

export type ResolveWidgetJourneyRicherStartupPayloadInput = {
  articleScriptModeEnabled: boolean;
  articleScriptCheckpointId: string | null;
  startupGateEnabledFromUrl: boolean;
  startupOpeningLength: number;
};

const RUFF_OR_SLUFF_STORY_STARTUP_PROBLEM_IDS = new Set<string>([
  'ruff_or_sluff_01',
  'ruff_or_sluff_02',
  'ruff_or_sluff_05'
]);
const SINGLE_STEP_PUZZLE_STARTUP_PROBLEM_IDS = new Set<string>([
  'which_squeeze_1'
]);

export function isWidgetJourneyReadingRevealProfile(
  profile: WidgetJourneyProfile | null
): boolean {
  return profile === 'story-viewing' || profile === 'reading-profile';
}

export function resolveWidgetJourneyRicherStartupPayload(
  input: ResolveWidgetJourneyRicherStartupPayloadInput
): boolean {
  if (input.articleScriptModeEnabled) {
    return typeof input.articleScriptCheckpointId === 'string' && input.articleScriptCheckpointId.trim().length > 0;
  }
  return input.startupGateEnabledFromUrl && Math.max(0, input.startupOpeningLength) > 0;
}

export function resolveWidgetJourneyStartupReleaseProfile(input: {
  currentActiveProfile: WidgetJourneyProfile | null;
  articleScriptModeEnabled: boolean;
  articleScriptInteractionProfile: InteractionProfile | null;
  startupProblemId?: string | null;
}): InteractionProfile | null {
  if (input.currentActiveProfile !== 'reading-profile') {
    return input.currentActiveProfile;
  }
  if (input.articleScriptModeEnabled) {
    return input.articleScriptInteractionProfile ?? 'puzzle-solving';
  }
  if (
    typeof input.startupProblemId === 'string'
    && RUFF_OR_SLUFF_STORY_STARTUP_PROBLEM_IDS.has(input.startupProblemId)
  ) {
    return 'story-viewing';
  }
  return 'puzzle-solving';
}

export function resolveWidgetJourneyStartupAdvanceMode(input: {
  currentActiveProfile: WidgetJourneyProfile | null;
  startupReleaseProfile: InteractionProfile | null;
  articleScriptModeEnabled: boolean;
  hasRicherStartupPayload: boolean;
  startupOpeningLength: number;
  startupProblemId?: string | null;
}): WidgetJourneyStartupAdvanceMode {
  if (input.currentActiveProfile !== 'reading-profile') return 'default';
  if (!input.hasRicherStartupPayload) return 'default';
  if (input.articleScriptModeEnabled) return 'single-step';
  if (Math.max(0, input.startupOpeningLength) <= 0) return 'default';
  if (input.startupReleaseProfile === 'story-viewing') return 'single-step';
  if (
    input.startupReleaseProfile === 'puzzle-solving'
    && typeof input.startupProblemId === 'string'
    && SINGLE_STEP_PUZZLE_STARTUP_PROBLEM_IDS.has(input.startupProblemId)
  ) {
    return 'single-step';
  }
  return 'default';
}

export function resolveWidgetJourneyStartupAffordanceLabel(
  destinationProfile: InteractionProfile | null
): 'Start Story' | 'Start Puzzle' | 'Start' {
  if (destinationProfile === 'story-viewing') return 'Start Story';
  if (destinationProfile === 'puzzle-solving') return 'Start Puzzle';
  return 'Start';
}

export function resolveWidgetJourneyStartupReleaseRevealStage(input: {
  startedFromReadingProfile: boolean;
  currentRevealStage: ReadingControlsRevealStage;
}): ReadingControlsRevealStage {
  if (input.startedFromReadingProfile) return 'quiet';
  return input.currentRevealStage === 'collapsed' ? 'quiet' : input.currentRevealStage;
}

export function defaultAlertMistakesEnabledForWidgetJourneyProfile(
  profile: WidgetJourneyProfile | null
): boolean {
  return profile !== 'puzzle-solving';
}

export function resolveWidgetJourneyState(input: ResolveWidgetJourneyStateInput): WidgetJourneyState {
  if (input.displayMode !== 'widget') {
    return {
      activeInteractionProfile: null,
      readingRevealEnabled: false,
      startupBias: 'none'
    };
  }

  if (input.widgetReadingProfileEnabledFromUrl) {
    return {
      activeInteractionProfile: 'reading-profile',
      readingRevealEnabled: true,
      startupBias: 'url-reading-profile'
    };
  }

  if (input.articleScriptModeEnabled) {
    const activeProfile = input.articleScriptInteractionProfile ?? 'puzzle-solving';
    return {
      activeInteractionProfile: activeProfile,
      readingRevealEnabled: isWidgetJourneyReadingRevealProfile(activeProfile),
      startupBias: activeProfile === 'story-viewing' ? 'article-story-profile' : 'none'
    };
  }

  const activeProfile: WidgetJourneyProfile | null = null;
  return {
    activeInteractionProfile: activeProfile,
    readingRevealEnabled: isWidgetJourneyReadingRevealProfile(activeProfile),
    startupBias: 'none'
  };
}

export function resolveWidgetStartupGatePending(input: ResolveWidgetStartupGatePendingInput): boolean {
  if (input.skipStartupGate) return false;
  if (!input.hasRicherStartupPayload) return false;
  if (input.journey.activeInteractionProfile === 'reading-profile') return true;
  return input.startupGateEnabledFromUrl && input.journey.activeInteractionProfile === null;
}
