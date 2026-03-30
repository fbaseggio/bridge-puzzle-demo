import { describe, expect, it } from 'vitest';
import {
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

  it('resolves non-story article widget posture without reading startup bias', () => {
    expect(
      resolveWidgetJourneyState({
        displayMode: 'widget',
        widgetReadingProfileEnabledFromUrl: true,
        articleScriptModeEnabled: true,
        articleScriptInteractionProfile: 'puzzle-solving'
      })
    ).toEqual({
      activeInteractionProfile: 'puzzle-solving',
      readingRevealEnabled: false,
      startupBias: 'none'
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
    const journey = resolveWidgetJourneyState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: false,
      articleScriptModeEnabled: true,
      articleScriptInteractionProfile: 'story-viewing'
    });

    expect(
      resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: false,
        journey
      })
    ).toBe(true);

    expect(
      resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: true,
        journey: {
          activeInteractionProfile: null,
          readingRevealEnabled: false,
          startupBias: 'none'
        }
      })
    ).toBe(true);

    expect(
      resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: true,
        journey,
        skipStartupGate: true
      })
    ).toBe(false);
  });
});
