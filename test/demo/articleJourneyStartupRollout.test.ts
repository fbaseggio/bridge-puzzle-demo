import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSharedWidgetEmbedSrc } from '../../articles/_shared/widgetEmbedConfigs.js';
import { resolveArticleScript } from '../../src/demo/articleScripts';
import { demoProblems, resolveDemoProblem } from '../../src/demo/problems';
import {
  isWidgetJourneyReadingRevealProfile,
  resolveWidgetJourneyStartupAffordanceLabel,
  resolveWidgetJourneyRicherStartupPayload,
  resolveWidgetJourneyStartupReleaseProfile,
  resolveWidgetJourneyStartupReleaseRevealStage,
  resolveWidgetJourneyState,
  resolveWidgetStartupGatePending
} from '../../src/demo/widgetJourneyState';

type ArticleEmbedStartupSummary = {
  articlePath: string;
  problemId: string;
  articleScriptId: string | null;
  checkpointId: string | null;
  startupGateEnabledFromUrl: boolean;
  startupOpeningLength: number;
  hasRicherStartupPayload: boolean;
  startupPending: boolean;
  activeInteractionProfile: ReturnType<typeof resolveWidgetJourneyState>['activeInteractionProfile'];
  startupReleaseProfile: ReturnType<typeof resolveWidgetJourneyStartupReleaseProfile>;
};

const ARTICLE_PATHS = [
  resolve(process.cwd(), 'articles', 'squeeze-self', 'index.html'),
  resolve(process.cwd(), 'articles', 'experimental-draft', 'index.html'),
  resolve(process.cwd(), 'articles', 'ruff-or-sluff', 'index.html'),
  resolve(process.cwd(), 'articles', 'gorillas', 'index.html')
];

function parseFlag(rawValue: string | null): boolean {
  const raw = (rawValue ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function extractWidgetEmbedUrls(articlePath: string): URL[] {
  const html = readFileSync(articlePath, 'utf8');
  const staticSrcs = [...html.matchAll(/<iframe[^>]*\ssrc="([^"]+)"/g)]
    .map((match) => (match[1] ?? '').replace(/&amp;/g, '&'))
    .filter((src) => src.startsWith('/workbench/'));
  const sharedConfigSrcs = [...html.matchAll(/<iframe[^>]*\sdata-widget-config="([^"]+)"/g)]
    .map((match) => resolveSharedWidgetEmbedSrc((match[1] ?? '').trim()))
    .filter((src): src is string => typeof src === 'string' && src.startsWith('/workbench/'));
  return [...staticSrcs, ...sharedConfigSrcs].map((src) => new URL(src, 'http://localhost:5173'));
}

function openingLengthFromUrl(url: URL): number {
  const raw = (url.searchParams.get('opening') ?? '').trim();
  if (!raw) return 0;
  return raw
    .split('.')
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[SHDC](10|[AKQJT2-9])$/.test(token))
    .length;
}

function startupOpeningLength(url: URL): number {
  const explicit = openingLengthFromUrl(url);
  if (explicit > 0) return explicit;
  const problemId = url.searchParams.get('problem');
  if (!problemId) return 0;
  const entry = demoProblems.find((problem) => problem.id === problemId);
  if (!entry) return 0;
  const variantId = url.searchParams.get('variant');
  const resolved = resolveDemoProblem(entry, variantId);
  return (resolved.scriptedOpening ?? []).reduce((sum, trick) => sum + trick.length, 0);
}

function summarizeArticleEmbeds(): ArticleEmbedStartupSummary[] {
  const summaries: ArticleEmbedStartupSummary[] = [];
  for (const articlePath of ARTICLE_PATHS) {
    for (const url of extractWidgetEmbedUrls(articlePath)) {
      const problemId = url.searchParams.get('problem');
      if (!problemId) continue;
      const articleScriptId = url.searchParams.get('articleScript');
      const checkpointId = url.searchParams.get('checkpoint');
      const startupGateEnabledFromUrl = parseFlag(url.searchParams.get('start'));
      const widgetReadingProfileEnabledFromUrl = parseFlag(url.searchParams.get('reading'));
      const openingLength = startupOpeningLength(url);
      const scriptSpec = resolveArticleScript(articleScriptId);
      const articleScriptModeEnabled = Boolean(scriptSpec);
      const journey = resolveWidgetJourneyState({
        displayMode: 'widget',
        widgetReadingProfileEnabledFromUrl,
        articleScriptModeEnabled,
        articleScriptInteractionProfile: scriptSpec?.interactionProfile ?? null
      });
      const hasRicherStartupPayload = resolveWidgetJourneyRicherStartupPayload({
        articleScriptModeEnabled,
        articleScriptCheckpointId: checkpointId,
        startupGateEnabledFromUrl,
        startupOpeningLength: openingLength
      });
      const startupPending = resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl,
        journey,
        hasRicherStartupPayload
      });
      const startupReleaseProfile = resolveWidgetJourneyStartupReleaseProfile({
        currentActiveProfile: journey.activeInteractionProfile,
        articleScriptModeEnabled,
        articleScriptInteractionProfile: scriptSpec?.interactionProfile ?? null,
        startupProblemId: problemId
      });
      summaries.push({
        articlePath,
        problemId,
        articleScriptId,
        checkpointId,
        startupGateEnabledFromUrl,
        startupOpeningLength: openingLength,
        hasRicherStartupPayload,
        startupPending,
        activeInteractionProfile: journey.activeInteractionProfile,
        startupReleaseProfile
      });
    }
  }
  return summaries;
}

describe('article journey startup rollout (4 in-scope article pages)', () => {
  it('starts every in-scope article widget in reading-profile', () => {
    const summaries = summarizeArticleEmbeds();
    expect(summaries.length).toBe(33);
    for (const summary of summaries) {
      expect(summary.activeInteractionProfile).toBe('reading-profile');
    }
  });

  it('exposes startup affordance only for richer startup payload widgets', () => {
    const summaries = summarizeArticleEmbeds();
    const richer = summaries.filter((summary) => summary.hasRicherStartupPayload);
    const readingOnly = summaries.filter((summary) => !summary.hasRicherStartupPayload);

    expect(richer.length).toBe(7);
    expect(readingOnly.length).toBe(26);
    for (const summary of richer) {
      expect(summary.startupPending).toBe(true);
    }
    for (const summary of readingOnly) {
      expect(summary.startupPending).toBe(false);
    }
  });

  it('maps richer startup release to story-viewing for VSC + Ruff and puzzle-solving for gorillas full-deal', () => {
    const summaries = summarizeArticleEmbeds().filter((summary) => summary.hasRicherStartupPayload);
    const experimentalPath = resolve(process.cwd(), 'articles', 'experimental-draft', 'index.html');
    const ruffPath = resolve(process.cwd(), 'articles', 'ruff-or-sluff', 'index.html');
    const gorillasPath = resolve(process.cwd(), 'articles', 'gorillas', 'index.html');

    for (const summary of summaries) {
      if (summary.articlePath === experimentalPath || summary.articlePath === ruffPath) {
        expect(summary.startupReleaseProfile).toBe('story-viewing');
      } else if (summary.articlePath === gorillasPath) {
        expect(summary.startupReleaseProfile).toBe('puzzle-solving');
      } else {
        throw new Error(`Unexpected richer startup article path: ${summary.articlePath}`);
      }
    }
  });

  it('matches startup affordance label to startup destination profile', () => {
    const summaries = summarizeArticleEmbeds().filter((summary) => summary.hasRicherStartupPayload);
    for (const summary of summaries) {
      const expected = summary.startupReleaseProfile === 'story-viewing' ? 'Start Story' : 'Start Puzzle';
      expect(resolveWidgetJourneyStartupAffordanceLabel(summary.startupReleaseProfile)).toBe(expected);
    }
  });

  it('normalizes startup release from reading-profile to quiet controls for richer startup widgets', () => {
    const summaries = summarizeArticleEmbeds().filter((summary) => summary.hasRicherStartupPayload);
    for (const summary of summaries) {
      expect(summary.activeInteractionProfile).toBe('reading-profile');
      expect(
        resolveWidgetJourneyStartupReleaseRevealStage({
          startedFromReadingProfile: true,
          currentRevealStage: 'full'
        })
      ).toBe('quiet');
    }
  });

  it('treats startup release as consumed after profile transition for richer payload widgets', () => {
    const summaries = summarizeArticleEmbeds().filter((summary) => summary.hasRicherStartupPayload);
    for (const summary of summaries) {
      const releasedJourney = {
        activeInteractionProfile: summary.startupReleaseProfile,
        readingRevealEnabled: isWidgetJourneyReadingRevealProfile(summary.startupReleaseProfile),
        startupBias: 'none' as const
      };
      const pendingAfterRelease = resolveWidgetStartupGatePending({
        startupGateEnabledFromUrl: summary.startupGateEnabledFromUrl,
        journey: releasedJourney,
        hasRicherStartupPayload: summary.hasRicherStartupPayload
      });
      expect(pendingAfterRelease).toBe(false);
    }
  });
});
