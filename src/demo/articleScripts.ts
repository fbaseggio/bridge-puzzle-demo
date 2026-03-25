import type { CardId, Seat } from '../core';

export const ARTICLE_SCRIPT_NAVIGATION_MODE = 'article-script';

export type ArticleScriptNavigationMode = typeof ARTICLE_SCRIPT_NAVIGATION_MODE;

export type ArticleScriptStep = {
  kind: 'play';
  cardId: CardId;
};

export type ArticleScriptChoiceStep = {
  kind: 'choice';
  seat: Seat;
  options: CardId[];
  prompt?: string;
  choiceMessages?: Partial<Record<CardId, string>>;
  continuations?: Partial<Record<CardId, CardId[]>>;
};

export type ArticleScriptCheckpoint = {
  id: string;
  cursor: number;
};

export type ArticleScriptSpec = {
  id: string;
  parentProblemId: string;
  navigationMode: ArticleScriptNavigationMode;
  checkpoints: ArticleScriptCheckpoint[];
  steps: Array<ArticleScriptStep | ArticleScriptChoiceStep>;
};

export const experimentalDraftIntroScript: ArticleScriptSpec = {
  id: 'experimental-draft-intro',
  parentProblemId: 'experimental_draft_01',
  navigationMode: ARTICLE_SCRIPT_NAVIGATION_MODE,
  checkpoints: [
    { id: '1', cursor: 0 },
    { id: '1a', cursor: 24 },
    { id: '1b', cursor: 36 }
  ],
  steps: [
    { kind: 'play', cardId: 'S7' }, { kind: 'play', cardId: 'SA' }, { kind: 'play', cardId: 'S6' }, { kind: 'play', cardId: 'S5' },
    { kind: 'play', cardId: 'H2' }, { kind: 'play', cardId: 'H6' }, { kind: 'play', cardId: 'HJ' }, { kind: 'play', cardId: 'H7' },
    { kind: 'play', cardId: 'HA' }, { kind: 'play', cardId: 'H8' }, { kind: 'play', cardId: 'H3' }, { kind: 'play', cardId: 'HQ' },
    { kind: 'play', cardId: 'H4' }, { kind: 'play', cardId: 'H9' }, { kind: 'play', cardId: 'HT' }, { kind: 'play', cardId: 'DK' },
    { kind: 'play', cardId: 'C2' }, { kind: 'play', cardId: 'C3' }, { kind: 'play', cardId: 'CJ' }, { kind: 'play', cardId: 'CT' },
    { kind: 'play', cardId: 'CA' }, { kind: 'play', cardId: 'C7' }, { kind: 'play', cardId: 'C4' }, { kind: 'play', cardId: 'C5' },
    { kind: 'play', cardId: 'HK' }, { kind: 'play', cardId: 'S2' }, { kind: 'play', cardId: 'D6' }, { kind: 'play', cardId: 'D2' },
    { kind: 'play', cardId: 'D3' }, { kind: 'play', cardId: 'S3' }, { kind: 'play', cardId: 'DA' }, { kind: 'play', cardId: 'DT' },
    { kind: 'play', cardId: 'CK' }, { kind: 'play', cardId: 'CQ' }, { kind: 'play', cardId: 'D4' }, { kind: 'play', cardId: 'C8' },
    { kind: 'play', cardId: 'C6' },
    {
      kind: 'choice',
      seat: 'E',
      options: ['DJ', 'ST'],
      prompt: "Pick East's play",
      choiceMessages: {
        DJ: 'When East pitches a diamond, we must <b>ruff</b> and then throw them in with a diamond.',
        ST: "When East pitches a spade, we must <b>sluff</b> so West will perforce grant us access to dummy's 2 spade winners."
      },
      continuations: {
        DJ: ['H5', 'C9', 'D5', 'S4', 'D8', 'DQ', 'ST', 'D7', 'S8', 'SJ', 'SK', 'SQ', 'D9', 'S9'],
        ST: ['D5', 'C9', 'S9', 'SK', 'SQ', 'D7', 'SJ', 'DJ', 'D9', 'S4', 'D8', 'DQ', 'H5', 'S8']
      }
    }
  ]
};

const ARTICLE_SCRIPTS: Record<string, ArticleScriptSpec> = {
  [experimentalDraftIntroScript.id]: experimentalDraftIntroScript
};

export function resolveArticleScript(id?: string | null): ArticleScriptSpec | null {
  const trimmed = id?.trim();
  if (!trimmed) return null;
  return ARTICLE_SCRIPTS[trimmed] ?? null;
}

export function resolveArticleScriptCheckpoint(spec: ArticleScriptSpec, checkpointId?: string | null): ArticleScriptCheckpoint {
  const requested = checkpointId?.trim();
  if (requested) {
    const exact = spec.checkpoints.find((checkpoint) => checkpoint.id === requested);
    if (exact) return exact;
  }
  return spec.checkpoints[0] ?? { id: '0', cursor: 0 };
}

export function clampArticleScriptCursor(spec: ArticleScriptSpec, cursor: number): number {
  return Math.max(0, Math.min(cursor, resolveArticleScriptLength(spec)));
}

function maxChoiceContinuationLength(step: ArticleScriptChoiceStep): number {
  return Math.max(0, ...Object.values(step.continuations ?? {}).map((cards) => cards?.length ?? 0));
}

function selectedContinuation(step: ArticleScriptChoiceStep, selected: CardId | undefined): CardId[] {
  if (!selected || !step.options.includes(selected)) return [];
  return step.continuations?.[selected] ?? [];
}

function logicalScriptCursorForStepIndex(
  spec: ArticleScriptSpec,
  stepIndex: number,
  choiceSelections: Partial<Record<number, CardId>> = {}
): number {
  let cursor = 0;
  for (let i = 0; i < stepIndex; i += 1) {
    const step = spec.steps[i];
    if (!step) break;
    if (step.kind === 'play') {
      cursor += 1;
      continue;
    }
    cursor += 1;
    const choiceCursor = cursor - 1;
    const selected = choiceSelections[choiceCursor];
    cursor += selected ? selectedContinuation(step, selected).length : maxChoiceContinuationLength(step);
  }
  return cursor;
}

export function resolveArticleScriptLength(
  spec: ArticleScriptSpec,
  choiceSelections: Partial<Record<number, CardId>> = {}
): number {
  return logicalScriptCursorForStepIndex(spec, spec.steps.length, choiceSelections);
}

export function resolvePendingArticleScriptChoice(
  spec: ArticleScriptSpec,
  cursor: number,
  choiceSelections: Partial<Record<number, CardId>> = {}
): ArticleScriptChoiceStep | null {
  let logicalCursor = 0;
  for (const step of spec.steps) {
    if (step.kind === 'play') {
      if (logicalCursor === cursor) return null;
      logicalCursor += 1;
      continue;
    }
    const choiceCursor = logicalCursor;
    if (choiceCursor === cursor) {
      const selected = choiceSelections[choiceCursor];
      return selected && step.options.includes(selected) ? null : step;
    }
    logicalCursor += 1;
    const selected = choiceSelections[choiceCursor];
    logicalCursor += selected ? selectedContinuation(step, selected).length : maxChoiceContinuationLength(step);
    if (cursor < logicalCursor) return null;
  }
  return null;
}

export function resolveArticleScriptCardAtCursor(
  spec: ArticleScriptSpec,
  cursor: number,
  choiceSelections: Partial<Record<number, CardId>> = {}
): CardId | null {
  let logicalCursor = 0;
  for (const step of spec.steps) {
    if (step.kind === 'play') {
      if (logicalCursor === cursor) return step.cardId;
      logicalCursor += 1;
      continue;
    }
    const choiceCursor = logicalCursor;
    if (choiceCursor === cursor) {
      const selected = choiceSelections[choiceCursor];
      return selected && step.options.includes(selected) ? selected : null;
    }
    logicalCursor += 1;
    const selected = choiceSelections[choiceCursor];
    const continuation = selected ? selectedContinuation(step, selected) : [];
    for (const cardId of continuation) {
      if (logicalCursor === cursor) return cardId;
      logicalCursor += 1;
    }
    if (!selected && cursor < logicalCursor + maxChoiceContinuationLength(step)) return null;
  }
  return null;
}

export function resolveArticleScriptCheckpointEndCursor(spec: ArticleScriptSpec, checkpointId?: string | null): number {
  const checkpoint = resolveArticleScriptCheckpoint(spec, checkpointId);
  const checkpoints = [...spec.checkpoints].sort((a, b) => a.cursor - b.cursor);
  const idx = checkpoints.findIndex((entry) => entry.id === checkpoint.id);
  const next = idx >= 0 ? checkpoints[idx + 1] : null;
  return next?.cursor ?? resolveArticleScriptLength(spec);
}
