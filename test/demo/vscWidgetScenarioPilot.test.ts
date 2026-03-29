import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { VscWidgetScenarioDefinition } from '../../src/demo/vscWidgetScenarioPilot';
import {
  createVscPilotStartSnapshot,
  runVscWidgetScenario
} from '../../src/demo/vscWidgetScenarioPilot';

function repeated(action: 'nextPause' | 'next', count: number): Array<'nextPause' | 'next'> {
  return Array.from({ length: count }, () => action);
}

// These scenarios intentionally mix invariant checks with script-exact checks.
// When authored script content/pause boundaries change, update the script-exact
// expectations in this file in the same change, while keeping invariant checks
// (prefix validity, cursor/history coherence) stable across script revisions.
const lockedScenarios: VscWidgetScenarioDefinition[] = [
  {
    id: 'vsc-locked-start-single-step',
    classification: 'locked',
    description: 'Start should move story into quiet controls and consume exactly one scripted card.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start']
  },
  {
    id: 'vsc-locked-start-plus-four-next',
    classification: 'locked',
    description: 'Start + 4x next should reach cursor 5 with authored H2 at index 4.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', 'next', 'next', 'next', 'next']
  },
  {
    id: 'vsc-locked-start-plus-six-nextPause',
    classification: 'locked',
    description: 'Repeated nextPause in opening beats must preserve authored prefix and avoid H2/H6 corruption.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', ...repeated('nextPause', 6)]
  },
  {
    id: 'vsc-locked-nextPause-checkpoint-saturation',
    classification: 'locked',
    description: 'Many nextPause actions should saturate at opening checkpoint without corrupting prefix.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', ...repeated('nextPause', 20)]
  }
];

const reviewScenarios: VscWidgetScenarioDefinition[] = [
  {
    id: 'vsc-review-start-plus-nextPause-6',
    classification: 'review',
    description: 'User-reported path: Start then roughly six nextPause presses.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', ...repeated('nextPause', 6)]
  },
  {
    id: 'vsc-review-linear-next-12',
    classification: 'review',
    description: 'Linear progression via next through early story beats.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', ...repeated('next', 11)]
  },
  {
    id: 'vsc-review-full-controls-midstream',
    classification: 'review',
    description: 'Open full controls mid-progress, then continue with nextPause + next.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', 'next', 'openFullControls', 'nextPause', 'next']
  },
  {
    id: 'vsc-review-nextPause-noop-tail',
    classification: 'review',
    description: 'Extra nextPause actions near checkpoint end should stabilize.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', ...repeated('nextPause', 26)]
  }
];

const reviewPermalinkArtifactPath = resolve(process.cwd(), 'tmp', 'vsc-widget-review-permalinks.txt');

describe('vscWidgetScenarioPilot locked scenarios', () => {
  for (const scenario of lockedScenarios) {
    it(scenario.id, () => {
      const result = runVscWidgetScenario(scenario);
      expect(result.summary.scriptedPrefixValid).toBe(true);
      expect(result.summary.activeInteractionProfile).toBe('story-viewing');
      expect(result.summary.startupGatePhase).toBe('started');
      if (scenario.id === 'vsc-locked-start-single-step') {
        expect(result.summary.readingControlsRevealStage).toBe('quiet');
        expect(result.summary.scriptCursor).toBe(1);
        expect(result.summary.scriptHistoryPrefix).toEqual(['S7']);
      }
      if (scenario.id === 'vsc-locked-start-plus-four-next') {
        expect(result.summary.scriptCursor).toBe(5);
        expect(result.summary.scriptHistoryPrefix[4]).toBe('H2');
      }
      if (scenario.id === 'vsc-locked-start-plus-six-nextPause') {
        expect(result.summary.scriptCursor).toBeGreaterThanOrEqual(5);
        expect(result.summary.scriptHistoryPrefix[4]).toBe('H2');
      }
      if (scenario.id === 'vsc-locked-nextPause-checkpoint-saturation') {
        expect(result.summary.scriptCursor).toBe(24);
        expect(result.summary.scriptHistoryLength).toBe(24);
      }
    });
  }
});

describe('vscWidgetScenarioPilot review scenarios', () => {
  it('runs review scenarios and writes raw permalinks to a local artifact file', () => {
    const lines: string[] = [];
    for (const scenario of reviewScenarios) {
      const result = runVscWidgetScenario(scenario);
      expect(result.summary.scriptedPrefixValid).toBe(true);
      expect(result.permalink).toBeTruthy();
      lines.push(
        `${scenario.id} :: actions=${scenario.actions.join(' > ')} :: cursor=${result.summary.scriptCursor} state=${result.summary.scriptStateId} startup=${result.summary.startupGatePhase} reveal=${result.summary.readingControlsRevealStage} prefixValid=${result.summary.scriptedPrefixValid}`
      );
      lines.push(`permalink=${result.permalink}`);
      lines.push('');
    }
    mkdirSync(dirname(reviewPermalinkArtifactPath), { recursive: true });
    writeFileSync(reviewPermalinkArtifactPath, lines.join('\n'), 'utf8');
    const content = lines.join('\n');
    expect(content.includes('http://localhost:5173/workbench/')).toBe(true);
    expect(content.includes('wsv=1&ws=')).toBe(true);
  });
});
