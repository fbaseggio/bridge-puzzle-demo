import { describe, expect, it } from 'vitest';
import {
  createWidgetJourneyRuntimeState,
  isWidgetJourneyRuntimeStartupGatePending,
  resolveWidgetJourneyStartupGatePhase,
  resolveWidgetJourneyStateFromRuntime,
  setWidgetJourneyRuntimeActiveInteractionProfile,
  setWidgetJourneyRuntimeStartupGatePhase
} from '../../src/demo/widgetJourneyRuntimeState';

describe('widgetJourneyRuntimeState', () => {
  it('initializes story-widget journey runtime from resolver output and startup inputs', () => {
    const runtime = createWidgetJourneyRuntimeState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: false,
      articleScriptModeEnabled: true,
      articleScriptInteractionProfile: 'story-viewing',
      startupGateEnabledFromUrl: false
    });

    expect(runtime).toEqual({
      activeInteractionProfile: 'story-viewing',
      startupGatePhase: 'pending',
      startupBias: 'article-story-profile'
    });
  });

  it('exposes focused mutators for active profile and startup gate phase', () => {
    const runtime = createWidgetJourneyRuntimeState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: false,
      articleScriptModeEnabled: true,
      articleScriptInteractionProfile: 'puzzle-solving',
      startupGateEnabledFromUrl: false
    });

    expect(runtime.startupGatePhase).toBe('started');
    expect(isWidgetJourneyRuntimeStartupGatePending(runtime)).toBe(false);

    setWidgetJourneyRuntimeActiveInteractionProfile(runtime, 'solution-viewing');
    setWidgetJourneyRuntimeStartupGatePhase(runtime, 'pending');

    expect(runtime.activeInteractionProfile).toBe('solution-viewing');
    expect(runtime.startupGatePhase).toBe('pending');
    expect(isWidgetJourneyRuntimeStartupGatePending(runtime)).toBe(true);
    expect(runtime.startupBias).toBe('none');
  });

  it('resolves current journey view from runtime without mutating startup bias', () => {
    const runtime = createWidgetJourneyRuntimeState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: false,
      articleScriptModeEnabled: true,
      articleScriptInteractionProfile: 'story-viewing',
      startupGateEnabledFromUrl: false
    });

    const storyView = resolveWidgetJourneyStateFromRuntime({
      runtime,
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: false,
      articleScriptModeEnabled: true
    });
    expect(storyView).toEqual({
      activeInteractionProfile: 'story-viewing',
      readingRevealEnabled: true,
      startupBias: 'article-story-profile'
    });

    setWidgetJourneyRuntimeActiveInteractionProfile(runtime, 'puzzle-solving');
    const puzzleView = resolveWidgetJourneyStateFromRuntime({
      runtime,
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: false,
      articleScriptModeEnabled: true
    });
    expect(puzzleView).toEqual({
      activeInteractionProfile: 'puzzle-solving',
      readingRevealEnabled: false,
      startupBias: 'article-story-profile'
    });

    expect(
      resolveWidgetJourneyStartupGatePhase({
        startupGateEnabledFromUrl: true,
        journey: puzzleView,
        skipStartupGate: true
      })
    ).toBe('started');
  });
});
