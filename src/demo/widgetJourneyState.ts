import type { InteractionProfile } from './interactionProfiles';

export type WidgetJourneyStartupBias = 'none' | 'url-reading-profile' | 'article-story-profile';

export type WidgetJourneyState = {
  activeInteractionProfile: InteractionProfile | null;
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
  skipStartupGate?: boolean;
};

export function resolveWidgetJourneyState(input: ResolveWidgetJourneyStateInput): WidgetJourneyState {
  if (input.displayMode !== 'widget') {
    return {
      activeInteractionProfile: null,
      readingRevealEnabled: false,
      startupBias: 'none'
    };
  }

  if (input.articleScriptModeEnabled) {
    const activeProfile = input.articleScriptInteractionProfile ?? 'puzzle-solving';
    const storyProfile = activeProfile === 'story-viewing';
    return {
      activeInteractionProfile: activeProfile,
      readingRevealEnabled: storyProfile,
      startupBias: storyProfile ? 'article-story-profile' : 'none'
    };
  }

  return {
    activeInteractionProfile: null,
    readingRevealEnabled: input.widgetReadingProfileEnabledFromUrl,
    startupBias: input.widgetReadingProfileEnabledFromUrl ? 'url-reading-profile' : 'none'
  };
}

export function resolveWidgetStartupGatePending(input: ResolveWidgetStartupGatePendingInput): boolean {
  if (input.skipStartupGate) return false;
  return input.startupGateEnabledFromUrl || input.journey.readingRevealEnabled;
}
