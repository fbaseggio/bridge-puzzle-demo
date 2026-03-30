import { describe, expect, it } from 'vitest';
import type { WidgetStateSnapshotV1 } from '../../src/demo/widgetStateSnapshot';
import {
  buildWidgetStateSnapshotHash,
  buildWidgetStateSnapshotPermalink,
  decodeWidgetStateSnapshotPayload,
  encodeWidgetStateSnapshotPayload,
  readWidgetStateSnapshotFromHash
} from '../../src/demo/widgetStateSnapshotUrl';

function sampleSnapshot(): WidgetStateSnapshotV1 {
  return {
    version: 1,
    problem: {
      problemId: 'double_dummy_01',
      variantId: null,
      seed: 12345
    },
    initialConfig: {
      displayMode: 'widget',
      widgetUiMode: 'default',
      readingProfileEnabledFromUrl: false,
      companionPanelEnabledFromUrl: true,
      startupGateEnabledFromUrl: true
    },
    runtime: {
      userHistory: ['SK', 'S7'],
      scriptedOpening: ['SK']
    },
    articleScript: {
      scriptId: 'double-dummy-01',
      checkpointId: '1',
      initialCursor: 0,
      cursor: 3,
      history: ['SK', 'S7', 'S8'],
      choiceSelections: { 1: 'DJ' },
      interactionProfileOverride: 'solution-viewing'
    },
    journey: {
      activeInteractionProfile: 'solution-viewing',
      startupGatePhase: 'started',
      assistLevelByPuzzleMode: {
        scripted: 'guided',
        standard: 'solution'
      },
      overrideToggles: {
        alwaysHint: true,
        narrate: true,
        cardColoringEnabled: true,
        hideEastWest: false
      }
    },
    chrome: {
      readingRevealEnabled: false,
      readingControlsRevealStage: 'full',
      readingInteractionStarted: true,
      companionPanelHidden: true
    }
  };
}

describe('widgetStateSnapshotUrl', () => {
  it('encodes and decodes payload round-trip', () => {
    const snapshot = sampleSnapshot();
    const payload = encodeWidgetStateSnapshotPayload(snapshot);
    const decoded = decodeWidgetStateSnapshotPayload(payload);

    expect(payload.length).toBeGreaterThan(20);
    expect(decoded).toEqual(snapshot);
  });

  it('reads snapshot from hash only when version and payload are valid', () => {
    const snapshot = sampleSnapshot();
    const hash = `#${buildWidgetStateSnapshotHash(snapshot)}`;

    expect(readWidgetStateSnapshotFromHash(hash)).toEqual(snapshot);
    expect(readWidgetStateSnapshotFromHash('#wsv=2&ws=abc')).toBeNull();
    expect(readWidgetStateSnapshotFromHash('#wsv=1')).toBeNull();
    expect(readWidgetStateSnapshotFromHash('#wsv=1&ws=not-valid-base64url')).toBeNull();
  });

  it('builds permalink with readable bootstrap params plus versioned hash payload', () => {
    const snapshot = sampleSnapshot();
    const permalink = buildWidgetStateSnapshotPermalink(
      'http://localhost:5173/workbench/?mode=widget&problem=placeholder',
      snapshot
    );
    const url = new URL(permalink);

    expect(url.searchParams.get('mode')).toBe('widget');
    expect(url.searchParams.get('problem')).toBe('double_dummy_01');
    expect(url.searchParams.get('articleScript')).toBe('double-dummy-01');
    expect(url.searchParams.get('checkpoint')).toBe('1');
    expect(url.searchParams.get('companionPanel')).toBe('1');
    expect(url.searchParams.get('start')).toBe('1');
    expect(url.hash).toContain('wsv=1');
    expect(url.hash).toContain('ws=');
    expect(readWidgetStateSnapshotFromHash(url.hash)).toEqual(snapshot);
  });

  it('accepts reading-profile only on journey.activeInteractionProfile', () => {
    const journeySnapshot = sampleSnapshot();
    journeySnapshot.journey.activeInteractionProfile = 'reading-profile';
    expect(decodeWidgetStateSnapshotPayload(encodeWidgetStateSnapshotPayload(journeySnapshot))).toEqual(journeySnapshot);

    const invalidOverride = sampleSnapshot();
    const payload = encodeWidgetStateSnapshotPayload({
      ...invalidOverride,
      articleScript: {
        ...invalidOverride.articleScript!,
        interactionProfileOverride: 'reading-profile' as any
      }
    });
    expect(decodeWidgetStateSnapshotPayload(payload)).toBeNull();
  });
});
