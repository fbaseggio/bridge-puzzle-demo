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
  it('initializes reading-start widget journey runtime from resolver output and startup inputs', () => {
    const runtime = createWidgetJourneyRuntimeState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: true,
      articleScriptModeEnabled: true,
      articleScriptCheckpointId: '1',
      articleScriptInteractionProfile: 'story-viewing',
      startupGateEnabledFromUrl: false,
      startupOpeningLength: 24
    });

    expect(runtime).toEqual({
      activeInteractionProfile: 'reading-profile',
      startupGatePhase: 'pending',
      startupBias: 'url-reading-profile'
    });
  });

  it('exposes focused mutators for active profile and startup gate phase', () => {
    const runtime = createWidgetJourneyRuntimeState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: false,
      articleScriptModeEnabled: true,
      articleScriptCheckpointId: '1',
      articleScriptInteractionProfile: 'puzzle-solving',
      startupGateEnabledFromUrl: false,
      startupOpeningLength: 24
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
      articleScriptCheckpointId: '1',
      articleScriptInteractionProfile: 'story-viewing',
      startupGateEnabledFromUrl: false,
      startupOpeningLength: 24
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
        hasRicherStartupPayload: true,
        skipStartupGate: true
      })
    ).toBe('started');
  });

  it('treats non-script reading as an explicit journey profile posture', () => {
    const runtime = createWidgetJourneyRuntimeState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: true,
      articleScriptModeEnabled: false,
      articleScriptCheckpointId: null,
      articleScriptInteractionProfile: null,
      startupGateEnabledFromUrl: false,
      startupOpeningLength: 0
    });

    expect(runtime.activeInteractionProfile).toBe('reading-profile');

    const journey = resolveWidgetJourneyStateFromRuntime({
      runtime,
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: true,
      articleScriptModeEnabled: false
    });

    expect(journey).toEqual({
      activeInteractionProfile: 'reading-profile',
      readingRevealEnabled: true,
      startupBias: 'url-reading-profile'
    });
  });
});
