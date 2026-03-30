import type { InteractionProfile } from './interactionProfiles';

export type WidgetJourneyStartupBias = 'none' | 'url-reading-profile' | 'article-story-profile';
export type WidgetJourneyProfile = InteractionProfile | 'reading-profile';

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
  skipStartupGate?: boolean;
};

export function isWidgetJourneyReadingRevealProfile(
  profile: WidgetJourneyProfile | null
): boolean {
  return profile === 'story-viewing' || profile === 'reading-profile';
}

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
    return {
      activeInteractionProfile: activeProfile,
      readingRevealEnabled: isWidgetJourneyReadingRevealProfile(activeProfile),
      startupBias: activeProfile === 'story-viewing' ? 'article-story-profile' : 'none'
    };
  }

  const activeProfile: WidgetJourneyProfile | null = input.widgetReadingProfileEnabledFromUrl
    ? 'reading-profile'
    : null;
  return {
    activeInteractionProfile: activeProfile,
    readingRevealEnabled: isWidgetJourneyReadingRevealProfile(activeProfile),
    startupBias: input.widgetReadingProfileEnabledFromUrl ? 'url-reading-profile' : 'none'
  };
}

export function resolveWidgetStartupGatePending(input: ResolveWidgetStartupGatePendingInput): boolean {
  if (input.skipStartupGate) return false;
  return input.startupGateEnabledFromUrl || input.journey.readingRevealEnabled;
}
