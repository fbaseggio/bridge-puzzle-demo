import type { InteractionProfile } from './interactionProfiles';
import {
  resolveWidgetJourneyState,
  resolveWidgetStartupGatePending,
  type WidgetJourneyStartupBias,
  type WidgetJourneyState
} from './widgetJourneyState';

export type WidgetJourneyStartupGatePhase = 'pending' | 'started';

export type WidgetJourneyRuntimeState = {
  activeInteractionProfile: InteractionProfile | null;
  startupGatePhase: WidgetJourneyStartupGatePhase;
  startupBias: WidgetJourneyStartupBias;
};

export type CreateWidgetJourneyRuntimeStateInput = {
  displayMode: 'analysis' | 'widget' | 'practice';
  widgetReadingProfileEnabledFromUrl: boolean;
  articleScriptModeEnabled: boolean;
  articleScriptInteractionProfile: InteractionProfile | null;
  startupGateEnabledFromUrl: boolean;
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
  skipStartupGate?: boolean;
}): WidgetJourneyStartupGatePhase {
  return resolveWidgetStartupGatePending({
    startupGateEnabledFromUrl: input.startupGateEnabledFromUrl,
    journey: input.journey,
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

  if (input.articleScriptModeEnabled) {
    const activeProfile = input.runtime.activeInteractionProfile ?? 'puzzle-solving';
    return {
      activeInteractionProfile: activeProfile,
      readingRevealEnabled: activeProfile === 'story-viewing',
      startupBias: input.runtime.startupBias
    };
  }

  return {
    activeInteractionProfile: null,
    readingRevealEnabled: input.widgetReadingProfileEnabledFromUrl,
    startupBias: input.runtime.startupBias
  };
}

export function setWidgetJourneyRuntimeActiveInteractionProfile(
  runtime: WidgetJourneyRuntimeState,
  activeInteractionProfile: InteractionProfile | null
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
