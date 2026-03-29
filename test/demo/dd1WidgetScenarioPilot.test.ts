import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { resolveArticleScript } from '../../src/demo/articleScripts';
import { resolveWidgetJourneyState, resolveWidgetStartupGatePending } from '../../src/demo/widgetJourneyState';
import type { Dd1WidgetScenarioDefinition } from '../../src/demo/dd1WidgetScenarioPilot';
import {
  createDd1PilotStartSnapshot,
  runDd1WidgetScenario
} from '../../src/demo/dd1WidgetScenarioPilot';

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

const dd1ArticlePath = resolve(process.cwd(), 'articles', 'double-dummy-1', 'index.html');
const reviewPermalinkArtifactPath = resolve(process.cwd(), 'tmp', 'dd1-widget-review-permalinks.txt');

const lockedScenario: Dd1WidgetScenarioDefinition = {
  id: 'dd1-locked-nextPause-first-trick',
  classification: 'locked',
  description: 'From live DD1 baseline posture, nextPause should advance to first trick completion boundary.',
  startSnapshot: createDd1PilotStartSnapshot(),
  actions: ['nextPause']
};

const reviewScenario: Dd1WidgetScenarioDefinition = {
  id: 'dd1-review-nextPause-to-first-choice',
  classification: 'review',
  description: 'Continue from live baseline into first explicit E choice boundary.',
  startSnapshot: createDd1PilotStartSnapshot(),
  actions: ['nextPause', 'nextPause']
};

describe('dd1WidgetScenarioPilot baseline parity', () => {
  it('matches article embed baseline inputs and resolver-derived startup posture', () => {
    const snapshot = createDd1PilotStartSnapshot();
    const url = findWidgetEmbedUrl(dd1ArticlePath, (candidate) => {
      const params = candidate.searchParams;
      return params.get('problem') === 'double_dummy_01'
        && params.get('articleScript') === 'double-dummy-01'
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

describe('dd1WidgetScenarioPilot locked scenario', () => {
  it(lockedScenario.id, () => {
    const result = runDd1WidgetScenario(lockedScenario);
    expect(result.summary.scriptedPrefixValid).toBe(true);
    expect(result.summary.startupGatePhase).toBe('started');
    expect(result.summary.scriptCursor).toBe(4);
    expect(result.endSnapshot.articleScript?.history.slice(0, 4)).toEqual(['SK', 'S7', 'S8', 'SA']);
    expect(result.summary.pendingChoiceSeat).toBeNull();
  });
});

describe('dd1WidgetScenarioPilot review scenario', () => {
  it('runs review scenario and writes raw permalink to a local artifact file', () => {
    const result = runDd1WidgetScenario(reviewScenario);
    expect(result.summary.scriptedPrefixValid).toBe(true);
    expect(result.summary.scriptCursor).toBe(7);
    expect(result.summary.pendingChoiceSeat).toBe('E');
    expect(result.summary.pendingChoiceOptions.sort()).toEqual(['D4', 'DJ']);
    expect(result.permalink).toBeTruthy();

    const lines = [
      `${reviewScenario.id} :: actions=${reviewScenario.actions.join(' > ')} :: cursor=${result.summary.scriptCursor} state=${result.summary.scriptStateId} startup=${result.summary.startupGatePhase} profile=${result.summary.activeInteractionProfile} pendingSeat=${result.summary.pendingChoiceSeat ?? '-'} branch=${result.summary.branchName ?? '-'}`,
      `permalink=${result.permalink}`,
      ''
    ];
    mkdirSync(dirname(reviewPermalinkArtifactPath), { recursive: true });
    writeFileSync(reviewPermalinkArtifactPath, lines.join('\n'), 'utf8');
    const content = lines.join('\n');
    expect(content.includes('http://localhost:5173/workbench/')).toBe(true);
    expect(content.includes('wsv=1&ws=')).toBe(true);
  });
});
