import { describe, expect, it } from 'vitest';
import {
  defaultAlertMistakesEnabledForWidgetJourneyProfile,
  resolveWidgetJourneyStartupAffordanceLabel,
  resolveWidgetJourneyStartupReleaseProfile,
  resolveWidgetJourneyStartupReleaseRevealStage,
  resolveWidgetJourneyState,
  resolveWidgetStartupGatePending
} from '../../src/demo/widgetJourneyState';

describe('widgetJourneyState', () => {
  it('returns no widget journey posture outside widget display mode', () => {
    expect(
      resolveWidgetJourneyState({
        displayMode: 'analysis',
        widgetReadingProfileEnabledFromUrl: true,
        articleScriptModeEnabled: true,
        articleScriptInteractionProfile: 'story-viewing'
      })
    ).toEqual({
      activeInteractionProfile: null,
      readingRevealEnabled: false,
      startupBias: 'none'
    });
  });

  it('resolves story-profile article widget posture', () => {
    expect(
      resolveWidgetJourneyState({
        displayMode: 'widget',
        widgetReadingProfileEnabledFromUrl: false,
        articleScriptModeEnabled: true,
        articleScriptInteractionProfile: 'story-viewing'
      })
    ).toEqual({
      activeInteractionProfile: 'story-viewing',
      readingRevealEnabled: true,
      startupBias: 'article-story-profile'
    });
  });

  it('prioritizes reading-profile posture over script profile when reading startup is enabled', () => {
    expect(
      resolveWidgetJourneyState({
        displayMode: 'widget',
        widgetReadingProfileEnabledFromUrl: true,
        articleScriptModeEnabled: true,
        articleScriptInteractionProfile: 'puzzle-solving'
      })
    ).toEqual({
      activeInteractionProfile: 'reading-profile',
      readingRevealEnabled: true,
      startupBias: 'url-reading-profile'
    });
  });

  it('resolves non-script widget posture from URL reading bias', () => {
    expect(
      resolveWidgetJourneyState({
        displayMode: 'widget',
        widgetReadingProfileEnabledFromUrl: true,
        articleScriptModeEnabled: false,
        articleScriptInteractionProfile: null
      })
    ).toEqual({
      activeInteractionProfile: 'reading-profile',
      readingRevealEnabled: true,
      startupBias: 'url-reading-profile'
    });
  });

  it('computes startup gate pending from startup config and resolved journey', () => {
    const readingJourney = resolveWidgetJourneyState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: true,
      articleScriptModeEnabled: true,
      articleScriptInteractionProfile: 'story-viewing'
    });
    const storyJourney = resolveWidgetJourneyState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: false,
      articleScriptModeEnabled: true,
      articleScriptInteractionProfile: 'story-viewing'
    });

    expect(
      resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: false,
        journey: readingJourney,
        hasRicherStartupPayload: true
      })
    ).toBe(true);

    expect(
      resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: false,
        journey: storyJourney,
        hasRicherStartupPayload: true
      })
    ).toBe(false);

    expect(
      resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: true,
        journey: {
          activeInteractionProfile: null,
          readingRevealEnabled: false,
          startupBias: 'none'
        },
        hasRicherStartupPayload: true
      })
    ).toBe(true);

    expect(
      resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: true,
        journey: readingJourney,
        hasRicherStartupPayload: true,
        skipStartupGate: true
      })
    ).toBe(false);

    expect(
      resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: false,
        journey: readingJourney,
        hasRicherStartupPayload: false
      })
    ).toBe(false);
  });

  it('maps startup release destination for story-script, ruff rich-start, and gorillas rich-start widgets', () => {
    expect(
      resolveWidgetJourneyStartupReleaseProfile({
        currentActiveProfile: 'reading-profile',
        articleScriptModeEnabled: true,
        articleScriptInteractionProfile: 'story-viewing',
        startupProblemId: 'experimental_draft_01'
      })
    ).toBe('story-viewing');

    expect(
      resolveWidgetJourneyStartupReleaseProfile({
        currentActiveProfile: 'reading-profile',
        articleScriptModeEnabled: false,
        articleScriptInteractionProfile: null,
        startupProblemId: 'ruff_or_sluff_02'
      })
    ).toBe('story-viewing');

    expect(
      resolveWidgetJourneyStartupReleaseProfile({
        currentActiveProfile: 'reading-profile',
        articleScriptModeEnabled: false,
        articleScriptInteractionProfile: null,
        startupProblemId: 'gorillas_full_deal'
      })
    ).toBe('puzzle-solving');
  });

  it('derives startup affordance labels from startup destination profile', () => {
    expect(resolveWidgetJourneyStartupAffordanceLabel('story-viewing')).toBe('Start Story');
    expect(resolveWidgetJourneyStartupAffordanceLabel('puzzle-solving')).toBe('Start Puzzle');
  });

  it('normalizes startup release from reading-profile to quiet controls', () => {
    expect(
      resolveWidgetJourneyStartupReleaseRevealStage({
        startedFromReadingProfile: true,
        currentRevealStage: 'full'
      })
    ).toBe('quiet');
    expect(
      resolveWidgetJourneyStartupReleaseRevealStage({
        startedFromReadingProfile: true,
        currentRevealStage: 'collapsed'
      })
    ).toBe('quiet');
    expect(
      resolveWidgetJourneyStartupReleaseRevealStage({
        startedFromReadingProfile: false,
        currentRevealStage: 'full'
      })
    ).toBe('full');
  });

  it('defaults alert mistakes off for puzzle-solving journey profile', () => {
    expect(defaultAlertMistakesEnabledForWidgetJourneyProfile('puzzle-solving')).toBe(false);
    expect(defaultAlertMistakesEnabledForWidgetJourneyProfile('story-viewing')).toBe(true);
    expect(defaultAlertMistakesEnabledForWidgetJourneyProfile('solution-viewing')).toBe(true);
    expect(defaultAlertMistakesEnabledForWidgetJourneyProfile('reading-profile')).toBe(true);
    expect(defaultAlertMistakesEnabledForWidgetJourneyProfile(null)).toBe(true);
  });
});
