import { normalizeWidgetStateSnapshotV1, type WidgetStateSnapshotV1 } from './widgetStateSnapshot';
import type { InteractionProfile } from './interactionProfiles';
import type { WidgetJourneyProfile } from './widgetJourneyState';

const SNAPSHOT_VERSION = 1;
const CARD_ID_PATTERN = /^[SHDC](?:[2-9TJQKA])$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isScriptInteractionProfile(value: unknown): value is InteractionProfile {
  return value === 'story-viewing' || value === 'puzzle-solving' || value === 'solution-viewing';
}

function isWidgetJourneyProfile(value: unknown): value is WidgetJourneyProfile {
  return value === 'story-viewing'
    || value === 'puzzle-solving'
    || value === 'solution-viewing'
    || value === 'reading-profile';
}

function isCardId(value: unknown): value is string {
  return typeof value === 'string' && CARD_ID_PATTERN.test(value);
}

function isCardIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isCardId(entry));
}

function normalizeChoiceSelectionRecord(value: unknown): Record<number, string> | null {
  if (!isPlainObject(value)) return null;
  const normalized: Record<number, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^\d+$/.test(key)) return null;
    if (!isCardId(raw)) return null;
    normalized[Number(key)] = raw;
  }
  return normalized;
}

function normalizeStringRecord(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const normalized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'string') return null;
    normalized[key] = raw;
  }
  return normalized;
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let base64: string;
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    base64 = btoa(binary);
  } else {
    const globalBuffer = (globalThis as { Buffer?: { from: (value: Uint8Array) => { toString: (encoding: string) => string } } }).Buffer;
    if (!globalBuffer) throw new Error('No base64 encoder available');
    base64 = globalBuffer.from(bytes).toString('base64');
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(text: string): string | null {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    let bytes: Uint8Array;
    if (typeof atob === 'function') {
      const binary = atob(padded);
      bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } else {
      const globalBuffer = (globalThis as { Buffer?: { from: (value: string, encoding: string) => { values: () => IterableIterator<number> } } }).Buffer;
      if (!globalBuffer) return null;
      bytes = Uint8Array.from(globalBuffer.from(padded, 'base64').values());
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeWidgetStateSnapshotPayload(snapshot: WidgetStateSnapshotV1): string {
  const normalized = normalizeWidgetStateSnapshotV1(snapshot);
  return base64UrlEncode(JSON.stringify(normalized));
}

export function decodeWidgetStateSnapshotPayload(payload: string): WidgetStateSnapshotV1 | null {
  const decoded = base64UrlDecode(payload);
  if (!decoded) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  if (parsed.version !== SNAPSHOT_VERSION) return null;
  if (!isPlainObject(parsed.problem)) return null;
  if (typeof parsed.problem.problemId !== 'string' || !parsed.problem.problemId.trim()) return null;
  if (!(parsed.problem.variantId === null || typeof parsed.problem.variantId === 'string')) return null;
  if (!Number.isInteger(parsed.problem.seed)) return null;

  if (!isPlainObject(parsed.initialConfig)) return null;
  if (
    parsed.initialConfig.displayMode !== 'analysis'
    && parsed.initialConfig.displayMode !== 'widget'
    && parsed.initialConfig.displayMode !== 'practice'
  ) return null;
  if (
    parsed.initialConfig.widgetUiMode !== 'default'
    && parsed.initialConfig.widgetUiMode !== 'dd-puzzle'
    && parsed.initialConfig.widgetUiMode !== 'sd-puzzle'
  ) return null;
  if (typeof parsed.initialConfig.readingProfileEnabledFromUrl !== 'boolean') return null;
  if (typeof parsed.initialConfig.companionPanelEnabledFromUrl !== 'boolean') return null;
  if (typeof parsed.initialConfig.startupGateEnabledFromUrl !== 'boolean') return null;

  if (!isPlainObject(parsed.runtime)) return null;
  if (!isCardIdArray(parsed.runtime.userHistory)) return null;
  if (!isCardIdArray(parsed.runtime.scriptedOpening)) return null;

  let articleScript: WidgetStateSnapshotV1['articleScript'] = undefined;
  if (parsed.articleScript !== undefined) {
    if (!isPlainObject(parsed.articleScript)) return null;
    if (typeof parsed.articleScript.scriptId !== 'string' || !parsed.articleScript.scriptId.trim()) return null;
    if (!(parsed.articleScript.checkpointId === null || typeof parsed.articleScript.checkpointId === 'string')) return null;
    if (!Number.isInteger(parsed.articleScript.initialCursor)) return null;
    if (!Number.isInteger(parsed.articleScript.cursor)) return null;
    if (!isCardIdArray(parsed.articleScript.history)) return null;
    const choiceSelections = normalizeChoiceSelectionRecord(parsed.articleScript.choiceSelections);
    if (!choiceSelections) return null;
    if (
      !(
        parsed.articleScript.interactionProfileOverride === null
        || isScriptInteractionProfile(parsed.articleScript.interactionProfileOverride)
      )
    ) {
      return null;
    }
    articleScript = {
      scriptId: parsed.articleScript.scriptId,
      checkpointId: parsed.articleScript.checkpointId,
      initialCursor: parsed.articleScript.initialCursor,
      cursor: parsed.articleScript.cursor,
      history: parsed.articleScript.history,
      choiceSelections,
      interactionProfileOverride: parsed.articleScript.interactionProfileOverride
    };
  }

  if (!isPlainObject(parsed.journey)) return null;
  if (!(parsed.journey.activeInteractionProfile === null || isWidgetJourneyProfile(parsed.journey.activeInteractionProfile))) {
    return null;
  }
  if (parsed.journey.startupGatePhase !== 'pending' && parsed.journey.startupGatePhase !== 'started') return null;
  const assistLevelByPuzzleMode = normalizeStringRecord(parsed.journey.assistLevelByPuzzleMode);
  if (!assistLevelByPuzzleMode) return null;
  if (!isPlainObject(parsed.journey.overrideToggles)) return null;
  if (typeof parsed.journey.overrideToggles.alwaysHint !== 'boolean') return null;
  if (typeof parsed.journey.overrideToggles.narrate !== 'boolean') return null;
  if (typeof parsed.journey.overrideToggles.cardColoringEnabled !== 'boolean') return null;
  if (typeof parsed.journey.overrideToggles.hideEastWest !== 'boolean') return null;

  if (!isPlainObject(parsed.chrome)) return null;
  if (typeof parsed.chrome.readingRevealEnabled !== 'boolean') return null;
  if (
    parsed.chrome.readingControlsRevealStage !== 'collapsed'
    && parsed.chrome.readingControlsRevealStage !== 'quiet'
    && parsed.chrome.readingControlsRevealStage !== 'full'
  ) return null;
  if (typeof parsed.chrome.readingInteractionStarted !== 'boolean') return null;
  if (typeof parsed.chrome.companionPanelHidden !== 'boolean') return null;

  const snapshot: WidgetStateSnapshotV1 = {
    version: 1,
    problem: {
      problemId: parsed.problem.problemId,
      variantId: parsed.problem.variantId,
      seed: parsed.problem.seed
    },
    initialConfig: {
      displayMode: parsed.initialConfig.displayMode,
      widgetUiMode: parsed.initialConfig.widgetUiMode,
      readingProfileEnabledFromUrl: parsed.initialConfig.readingProfileEnabledFromUrl,
      companionPanelEnabledFromUrl: parsed.initialConfig.companionPanelEnabledFromUrl,
      startupGateEnabledFromUrl: parsed.initialConfig.startupGateEnabledFromUrl
    },
    runtime: {
      userHistory: parsed.runtime.userHistory,
      scriptedOpening: parsed.runtime.scriptedOpening
    },
    articleScript,
    journey: {
      activeInteractionProfile: parsed.journey.activeInteractionProfile,
      startupGatePhase: parsed.journey.startupGatePhase,
      assistLevelByPuzzleMode,
      overrideToggles: {
        alwaysHint: parsed.journey.overrideToggles.alwaysHint,
        narrate: parsed.journey.overrideToggles.narrate,
        cardColoringEnabled: parsed.journey.overrideToggles.cardColoringEnabled,
        hideEastWest: parsed.journey.overrideToggles.hideEastWest
      }
    },
    chrome: {
      readingRevealEnabled: parsed.chrome.readingRevealEnabled,
      readingControlsRevealStage: parsed.chrome.readingControlsRevealStage,
      readingInteractionStarted: parsed.chrome.readingInteractionStarted,
      companionPanelHidden: parsed.chrome.companionPanelHidden
    }
  };
  return normalizeWidgetStateSnapshotV1(snapshot);
}

export function buildWidgetStateSnapshotHash(snapshot: WidgetStateSnapshotV1): string {
  const params = new URLSearchParams();
  params.set('wsv', String(SNAPSHOT_VERSION));
  params.set('ws', encodeWidgetStateSnapshotPayload(snapshot));
  return params.toString();
}

export function readWidgetStateSnapshotFromHash(hash: string): WidgetStateSnapshotV1 | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.trim()) return null;
  const params = new URLSearchParams(raw);
  if (params.get('wsv') !== String(SNAPSHOT_VERSION)) return null;
  const payload = params.get('ws');
  if (!payload) return null;
  return decodeWidgetStateSnapshotPayload(payload);
}

export function buildWidgetStateSnapshotPermalink(
  baseUrl: string,
  snapshot: WidgetStateSnapshotV1
): string {
  const normalized = normalizeWidgetStateSnapshotV1(snapshot);
  const url = new URL(baseUrl);
  url.searchParams.set('mode', 'widget');
  url.searchParams.set('problem', normalized.problem.problemId);
  if (normalized.problem.variantId) url.searchParams.set('variant', normalized.problem.variantId);
  else url.searchParams.delete('variant');

  if (normalized.initialConfig.widgetUiMode !== 'default') {
    url.searchParams.set('uiMode', normalized.initialConfig.widgetUiMode);
  } else {
    url.searchParams.delete('uiMode');
    url.searchParams.delete('ui');
  }
  if (normalized.initialConfig.readingProfileEnabledFromUrl) url.searchParams.set('reading', '1');
  else url.searchParams.delete('reading');
  if (normalized.initialConfig.companionPanelEnabledFromUrl) url.searchParams.set('companionPanel', '1');
  else url.searchParams.delete('companionPanel');
  if (normalized.initialConfig.startupGateEnabledFromUrl) url.searchParams.set('start', '1');
  else url.searchParams.delete('start');

  if (normalized.articleScript) {
    url.searchParams.set('articleScript', normalized.articleScript.scriptId);
    if (normalized.articleScript.checkpointId) url.searchParams.set('checkpoint', normalized.articleScript.checkpointId);
    else url.searchParams.delete('checkpoint');
  } else {
    url.searchParams.delete('articleScript');
    url.searchParams.delete('checkpoint');
  }

  url.hash = buildWidgetStateSnapshotHash(normalized);
  return url.toString();
}
