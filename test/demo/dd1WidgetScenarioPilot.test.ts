import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { resolveArticleScript } from '../../src/demo/articleScripts';
import { demoProblems } from '../../src/demo/problems';
import {
  resolveWidgetJourneyRicherStartupPayload,
  resolveWidgetJourneyState,
  resolveWidgetStartupGatePending
} from '../../src/demo/widgetJourneyState';
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

function resolveProblemPagePath(problemId: string): string {
  const entry = demoProblems.find((problem) => problem.id === problemId);
  if (!entry?.articlePath) throw new Error(`No articlePath configured for demo problem '${problemId}'`);
  return resolve(process.cwd(), entry.articlePath, 'index.html');
}

const dd1ArticlePath = resolveProblemPagePath('double_dummy_01');
const reviewPermalinkArtifactPath = resolve(process.cwd(), 'tmp', 'dd1-widget-review-permalinks.txt');

// Seam note:
// DD1 pilot scenarios are progression-only (articleScriptWidgetActionCore) and
// do not claim prompt-aware `>`/`>>|` transport authority.
const reviewScenarios: Dd1WidgetScenarioDefinition[] = [
  {
    id: 'dd1-review-nextPause-first-trick-progression',
    classification: 'review',
    description: 'Progression-only nextPause from DD1 baseline through early trick progression.',
    startSnapshot: createDd1PilotStartSnapshot(),
    actions: ['nextPause']
  },
  {
    id: 'dd1-review-nextPause-to-first-choice-progression',
    classification: 'review',
    description: 'Progression-only continuation into first explicit choice boundary for manual vetting.',
    startSnapshot: createDd1PilotStartSnapshot(),
    actions: ['nextPause', 'nextPause']
  }
];

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
      journey,
      hasRicherStartupPayload: resolveWidgetJourneyRicherStartupPayload({
        articleScriptModeEnabled: Boolean(scriptSpec),
        articleScriptCheckpointId: snapshot.articleScript?.checkpointId ?? null,
        startupGateEnabledFromUrl: snapshot.initialConfig.startupGateEnabledFromUrl,
        startupOpeningLength: snapshot.runtime.scriptedOpening.length
      })
    });
    expect(snapshot.journey.startupGatePhase).toBe(pending ? 'pending' : 'started');
  });
});

describe('dd1WidgetScenarioPilot review scenarios (progression-only seam)', () => {
  it('runs review scenarios and writes raw permalinks to a local artifact file', () => {
    const lines: string[] = [];
    for (const scenario of reviewScenarios) {
      const result = runDd1WidgetScenario(scenario);
      expect(result.summary.scriptedPrefixValid).toBe(true);
      expect(result.summary.activeInteractionProfile).toBe('puzzle-solving');
      expect(result.summary.startupGatePhase).toBe('started');
      expect(result.permalink).toBeTruthy();
      lines.push(
        `${scenario.id} :: actions=${scenario.actions.join(' > ')} :: cursor=${result.summary.scriptCursor} state=${result.summary.scriptStateId} startup=${result.summary.startupGatePhase} profile=${result.summary.activeInteractionProfile} pendingSeat=${result.summary.pendingChoiceSeat ?? '-'} pendingOptions=${result.summary.pendingChoiceOptions.join(',') || '-'} branch=${result.summary.branchName ?? '-'}`
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
