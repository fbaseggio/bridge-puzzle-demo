import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { resolveArticleScript } from '../../src/demo/articleScripts';
import { resolveWidgetJourneyState, resolveWidgetStartupGatePending } from '../../src/demo/widgetJourneyState';
import type { VscWidgetScenarioDefinition } from '../../src/demo/vscWidgetScenarioPilot';
import {
  createVscPilotStartSnapshot,
  runVscWidgetScenario
} from '../../src/demo/vscWidgetScenarioPilot';

function repeated(action: 'nextPause' | 'next', count: number): Array<'nextPause' | 'next'> {
  return Array.from({ length: count }, () => action);
}

function parseFlag(rawValue: string | null): boolean {
  const raw = (rawValue ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function extractIframeSrcs(articlePath: string): string[] {
  const html = readFileSync(articlePath, 'utf8');
  return [...html.matchAll(/<iframe[^>]*\ssrc="([^"]+)"/g)]
    .map((match) => (match[1] ?? '').replace(/&amp;/g, '&'))
    .filter((src) => src.length > 0);
}

function findWidgetEmbedUrl(
  articlePath: string,
  predicate: (url: URL) => boolean
): URL {
  const srcs = extractIframeSrcs(articlePath);
  for (const src of srcs) {
    const url = new URL(src, 'http://localhost:5173');
    if (predicate(url)) return url;
  }
  throw new Error(`No matching widget iframe found in ${articlePath}`);
}

// Seam note:
// This pilot is progression-only and intentionally exercises
// articleScriptWidgetActionCore, not prompt-aware transport behavior.
//
// Locked rationale:
// - Code-grounded: the action core deterministically drives VSC cursor/history
//   movement for start/next/nextPause.
// - Intent-grounded: these cases lock authored-prefix integrity and startup
//   opening behavior, which are stable product contracts for VSC.
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
    id: 'vsc-review-linear-next-12',
    classification: 'review',
    description: 'Progression-only linear next simulation through early story beats.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', ...repeated('next', 11)]
  },
  {
    id: 'vsc-review-full-controls-midstream',
    classification: 'review',
    description: 'Progression-only simulation with reveal-stage change plus nextPause/next.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', 'next', 'openFullControls', 'nextPause', 'next']
  },
  {
    id: 'vsc-review-nextPause-noop-tail',
    classification: 'review',
    description: 'Progression-only nextPause saturation near checkpoint tail for manual review.',
    startSnapshot: createVscPilotStartSnapshot(),
    actions: ['start', ...repeated('nextPause', 26)]
  }
];

const reviewPermalinkArtifactPath = resolve(process.cwd(), 'tmp', 'vsc-widget-review-permalinks.txt');
const vscArticlePath = resolve(process.cwd(), 'articles', 'experimental-draft', 'index.html');

describe('vscWidgetScenarioPilot baseline parity', () => {
  it('matches article embed baseline inputs and resolver-derived startup posture', () => {
    const snapshot = createVscPilotStartSnapshot();
    const url = findWidgetEmbedUrl(vscArticlePath, (candidate) => {
      const params = candidate.searchParams;
      return params.get('problem') === 'experimental_draft_01'
        && params.get('articleScript') === 'experimental-draft-intro'
        && params.get('checkpoint') === '1';
    });
    const params = url.searchParams;

    expect(snapshot.problem.problemId).toBe(params.get('problem'));
    expect(snapshot.articleScript?.scriptId).toBe(params.get('articleScript'));
    expect(snapshot.articleScript?.checkpointId).toBe(params.get('checkpoint'));
    expect(snapshot.initialConfig.readingProfileEnabledFromUrl).toBe(parseFlag(params.get('reading')));
    expect(snapshot.initialConfig.companionPanelEnabledFromUrl).toBe(parseFlag(params.get('companionPanel')));
    expect(snapshot.initialConfig.startupGateEnabledFromUrl).toBe(parseFlag(params.get('start')));

    const scriptSpec = resolveArticleScript(snapshot.articleScript?.scriptId ?? null);
    const journey = resolveWidgetJourneyState({
      displayMode: 'widget',
      widgetReadingProfileEnabledFromUrl: snapshot.initialConfig.readingProfileEnabledFromUrl,
      articleScriptModeEnabled: Boolean(scriptSpec),
      articleScriptInteractionProfile: scriptSpec?.interactionProfile ?? null
    });
    const pending = resolveWidgetStartupGatePending({
      startupGateEnabledFromUrl: snapshot.initialConfig.startupGateEnabledFromUrl,
      journey
    });
    expect(snapshot.journey.startupGatePhase).toBe(pending ? 'pending' : 'started');
  });
});

describe('vscWidgetScenarioPilot locked scenarios (progression-only seam)', () => {
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

describe('vscWidgetScenarioPilot review scenarios (progression-only seam)', () => {
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
