import type { InteractionProfile } from './interactionProfiles';
import {
  isWidgetJourneyReadingRevealProfile,
  resolveWidgetJourneyRicherStartupPayload,
  resolveWidgetJourneyState,
  resolveWidgetStartupGatePending,
  type WidgetJourneyProfile,
  type WidgetJourneyStartupBias,
  type WidgetJourneyState
} from './widgetJourneyState';

export type WidgetJourneyStartupGatePhase = 'pending' | 'started';

export type WidgetJourneyRuntimeState = {
  activeInteractionProfile: WidgetJourneyProfile | null;
  startupGatePhase: WidgetJourneyStartupGatePhase;
  startupBias: WidgetJourneyStartupBias;
};

export type CreateWidgetJourneyRuntimeStateInput = {
  displayMode: 'analysis' | 'widget' | 'practice';
  widgetReadingProfileEnabledFromUrl: boolean;
  articleScriptModeEnabled: boolean;
  articleScriptCheckpointId: string | null;
  articleScriptInteractionProfile: InteractionProfile | null;
  startupGateEnabledFromUrl: boolean;
  startupOpeningLength: number;
  skipStartupGate?: boolean;
};

export type ResolveWidgetJourneyStateFromRuntimeInput = {
  runtime: WidgetJourneyRuntimeState;
  displayMode: 'analysis' | 'widget' | 'practice';
  widgetReadingProfileEnabledFromUrl: boolean;
  articleScriptModeEnabled: boolean;
};

export function resolveWidgetJourneyStartupGatePhase(input: {
  startupGateEnabledFromUrl: boolean;
  journey: WidgetJourneyState;
  hasRicherStartupPayload: boolean;
  skipStartupGate?: boolean;
}): WidgetJourneyStartupGatePhase {
  return resolveWidgetStartupGatePending({
    startupGateEnabledFromUrl: input.startupGateEnabledFromUrl,
    journey: input.journey,
    hasRicherStartupPayload: input.hasRicherStartupPayload,
    skipStartupGate: input.skipStartupGate
  })
    ? 'pending'
    : 'started';
}

export function createWidgetJourneyRuntimeState(
  input: CreateWidgetJourneyRuntimeStateInput
): WidgetJourneyRuntimeState {
  const journey = resolveWidgetJourneyState({
    displayMode: input.displayMode,
    widgetReadingProfileEnabledFromUrl: input.widgetReadingProfileEnabledFromUrl,
    articleScriptModeEnabled: input.articleScriptModeEnabled,
    articleScriptInteractionProfile: input.articleScriptInteractionProfile
  });
  return {
    activeInteractionProfile: journey.activeInteractionProfile,
    startupGatePhase: resolveWidgetJourneyStartupGatePhase({
      startupGateEnabledFromUrl: input.startupGateEnabledFromUrl,
      journey,
      hasRicherStartupPayload: resolveWidgetJourneyRicherStartupPayload({
        articleScriptModeEnabled: input.articleScriptModeEnabled,
        articleScriptCheckpointId: input.articleScriptCheckpointId,
        startupGateEnabledFromUrl: input.startupGateEnabledFromUrl,
        startupOpeningLength: input.startupOpeningLength
      }),
      skipStartupGate: input.skipStartupGate
    }),
    startupBias: journey.startupBias
  };
}

export function resolveWidgetJourneyStateFromRuntime(
  input: ResolveWidgetJourneyStateFromRuntimeInput
): WidgetJourneyState {
  if (input.displayMode !== 'widget') {
    return {
      activeInteractionProfile: null,
      readingRevealEnabled: false,
      startupBias: 'none'
    };
  }

  const activeProfile = input.runtime.activeInteractionProfile;
  return {
    activeInteractionProfile: activeProfile,
    readingRevealEnabled: isWidgetJourneyReadingRevealProfile(activeProfile),
    startupBias: input.runtime.startupBias
  };
}

export function setWidgetJourneyRuntimeActiveInteractionProfile(
  runtime: WidgetJourneyRuntimeState,
  activeInteractionProfile: WidgetJourneyProfile | null
): void {
  runtime.activeInteractionProfile = activeInteractionProfile;
}

export function setWidgetJourneyRuntimeStartupGatePhase(
  runtime: WidgetJourneyRuntimeState,
  startupGatePhase: WidgetJourneyStartupGatePhase
): void {
  runtime.startupGatePhase = startupGatePhase;
}

export function isWidgetJourneyRuntimeStartupGatePending(runtime: WidgetJourneyRuntimeState): boolean {
  return runtime.startupGatePhase === 'pending';
}
