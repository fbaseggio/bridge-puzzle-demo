import { describe, expect, it } from 'vitest';
import { type CardId } from '../../src/core';
import type { ArticleScriptCoordinatorState } from '../../src/demo/articleScriptCoordinator';
import { doubleDummy01Script } from '../../src/demo/articleScripts';
import {
  captureWidgetStateSnapshotV1,
  normalizeWidgetStateSnapshotV1,
  serializeWidgetStateSnapshotV1,
  type WidgetStateSnapshotV1
} from '../../src/demo/widgetStateSnapshot';

function createArticleState(): ArticleScriptCoordinatorState {
  return {
    spec: doubleDummy01Script,
    checkpointId: '1',
    initialCursor: 0,
    cursor: 8,
    history: ['SK', 'S7', 'S8', 'SA', 'DT', 'D9', 'D3', 'DJ'],
    choiceSelections: {
      11: 'CA',
      7: 'DJ'
    },
    interactionProfileOverride: 'solution-viewing'
  };
}

describe('widgetStateSnapshot', () => {
  it('captures first-slice widget snapshot from explicit state owners', () => {
    const scriptedOpening: CardId[] = ['SK', 'S7', 'S8'];
    const userHistory: CardId[] = ['SK', 'S7', 'S8', 'SA'];
    const assistLevelByPuzzleMode = {
      standard: 'solution',
      draft: 'guided',
      scripted: 'puzzle'
    };
    const snapshot = captureWidgetStateSnapshotV1({
      problemId: 'double_dummy_01',
      variantId: null,
      seed: 1234,
      displayMode: 'widget',
      widgetUiMode: 'default',
      readingProfileEnabledFromUrl: false,
      companionPanelEnabledFromUrl: true,
      startupGateEnabledFromUrl: true,
      userHistory,
      scriptedOpening,
      articleScriptState: createArticleState(),
      activeInteractionProfile: 'solution-viewing',
      assistLevelByPuzzleMode,
      overrideToggles: {
        alwaysHint: true,
        narrate: true,
        cardColoringEnabled: true,
        hideEastWest: false
      },
      readingRevealEnabled: true,
      readingControlsRevealStage: 'full',
      readingInteractionStarted: true,
      companionPanelHidden: false
    });

    userHistory.push('HT');
    scriptedOpening.push('HT');
    assistLevelByPuzzleMode.draft = 'puzzle';

    expect(snapshot).toEqual({
      version: 1,
      problem: {
        problemId: 'double_dummy_01',
        variantId: null,
        seed: 1234
      },
      initialConfig: {
        displayMode: 'widget',
        widgetUiMode: 'default',
        readingProfileEnabledFromUrl: false,
        companionPanelEnabledFromUrl: true,
        startupGateEnabledFromUrl: true
      },
      runtime: {
        userHistory: ['SK', 'S7', 'S8', 'SA'],
        scriptedOpening: ['SK', 'S7', 'S8']
      },
      articleScript: {
        scriptId: 'double-dummy-01',
        checkpointId: '1',
        initialCursor: 0,
        cursor: 8,
        history: ['SK', 'S7', 'S8', 'SA', 'DT', 'D9', 'D3', 'DJ'],
        choiceSelections: {
          7: 'DJ',
          11: 'CA'
        },
        interactionProfileOverride: 'solution-viewing'
      },
      journey: {
        activeInteractionProfile: 'solution-viewing',
        assistLevelByPuzzleMode: {
          draft: 'guided',
          scripted: 'puzzle',
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
        readingRevealEnabled: true,
        readingControlsRevealStage: 'full',
        readingInteractionStarted: true,
        companionPanelHidden: false
      }
    });
    expect(Object.keys(snapshot.articleScript?.choiceSelections ?? {})).toEqual(['7', '11']);
    expect(Object.keys(snapshot.journey.assistLevelByPuzzleMode)).toEqual(['draft', 'scripted', 'standard']);
  });

  it('normalizes an existing snapshot and keeps optional article state absent', () => {
    const input: WidgetStateSnapshotV1 = {
      version: 1,
      problem: {
        problemId: 'p007',
        variantId: 'alt',
        seed: 77
      },
      initialConfig: {
        displayMode: 'widget',
        widgetUiMode: 'dd-puzzle',
        readingProfileEnabledFromUrl: true,
        companionPanelEnabledFromUrl: false,
        startupGateEnabledFromUrl: false
      },
      runtime: {
        userHistory: ['SA'],
        scriptedOpening: ['SK']
      },
      journey: {
        activeInteractionProfile: null,
        assistLevelByPuzzleMode: {
          scripted: 'puzzle',
          draft: 'guided'
        },
        overrideToggles: {
          alwaysHint: false,
          narrate: false,
          cardColoringEnabled: false,
          hideEastWest: true
        }
      },
      chrome: {
        readingRevealEnabled: false,
        readingControlsRevealStage: 'collapsed',
        readingInteractionStarted: false,
        companionPanelHidden: true
      }
    };

    const normalized = normalizeWidgetStateSnapshotV1(input);

    expect(normalized.articleScript).toBeUndefined();
    expect(normalized.runtime.userHistory).toEqual(['SA']);
    expect(normalized.runtime.scriptedOpening).toEqual(['SK']);
    expect(Object.keys(normalized.journey.assistLevelByPuzzleMode)).toEqual(['draft', 'scripted']);
  });

  it('serializes as normalized stable JSON', () => {
    const snapshot = captureWidgetStateSnapshotV1({
      problemId: 'double_dummy_01',
      variantId: 'unknown',
      seed: 999,
      displayMode: 'widget',
      widgetUiMode: 'sd-puzzle',
      readingProfileEnabledFromUrl: true,
      companionPanelEnabledFromUrl: false,
      startupGateEnabledFromUrl: false,
      userHistory: ['SK'],
      scriptedOpening: ['SK'],
      articleScriptState: createArticleState(),
      activeInteractionProfile: 'puzzle-solving',
      assistLevelByPuzzleMode: {
        scripted: 'puzzle',
        standard: 'light'
      },
      overrideToggles: {
        alwaysHint: false,
        narrate: false,
        cardColoringEnabled: false,
        hideEastWest: true
      },
      readingRevealEnabled: true,
      readingControlsRevealStage: 'quiet',
      readingInteractionStarted: false,
      companionPanelHidden: true
    });

    const serialized = serializeWidgetStateSnapshotV1(snapshot);
    const parsed = JSON.parse(serialized) as WidgetStateSnapshotV1;

    expect(parsed).toEqual(snapshot);
    expect(serialized.indexOf('"7": "DJ"')).toBeLessThan(serialized.indexOf('"11": "CA"'));
    expect(serialized.indexOf('"scripted": "puzzle"')).toBeLessThan(serialized.indexOf('"standard": "light"'));
  });
});
