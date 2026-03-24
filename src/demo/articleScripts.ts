import type { CardId } from '../core';

export const ARTICLE_SCRIPT_NAVIGATION_MODE = 'article-script';

export type ArticleScriptNavigationMode = typeof ARTICLE_SCRIPT_NAVIGATION_MODE;

export type ArticleScriptStep = {
  kind: 'play';
  cardId: CardId;
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
  steps: ArticleScriptStep[];
};

export const experimentalDraftIntroScript: ArticleScriptSpec = {
  id: 'experimental-draft-intro',
  parentProblemId: 'experimental_draft_01',
  navigationMode: ARTICLE_SCRIPT_NAVIGATION_MODE,
  checkpoints: [
    { id: '1', cursor: 0 },
    { id: '1a', cursor: 24 },
    { id: '1b', cursor: 32 }
  ],
  steps: [
    { kind: 'play', cardId: 'S7' }, { kind: 'play', cardId: 'SA' }, { kind: 'play', cardId: 'S6' }, { kind: 'play', cardId: 'S5' },
    { kind: 'play', cardId: 'H2' }, { kind: 'play', cardId: 'H6' }, { kind: 'play', cardId: 'HJ' }, { kind: 'play', cardId: 'H7' },
    { kind: 'play', cardId: 'HA' }, { kind: 'play', cardId: 'H8' }, { kind: 'play', cardId: 'H3' }, { kind: 'play', cardId: 'HQ' },
    { kind: 'play', cardId: 'H4' }, { kind: 'play', cardId: 'H9' }, { kind: 'play', cardId: 'HT' }, { kind: 'play', cardId: 'DK' },
    { kind: 'play', cardId: 'C2' }, { kind: 'play', cardId: 'C3' }, { kind: 'play', cardId: 'CJ' }, { kind: 'play', cardId: 'CT' },
    { kind: 'play', cardId: 'CA' }, { kind: 'play', cardId: 'C7' }, { kind: 'play', cardId: 'C4' }, { kind: 'play', cardId: 'C5' },
    { kind: 'play', cardId: 'HK' }, { kind: 'play', cardId: 'S2' }, { kind: 'play', cardId: 'D6' }, { kind: 'play', cardId: 'D2' },
    { kind: 'play', cardId: 'D5' }, { kind: 'play', cardId: 'S3' }, { kind: 'play', cardId: 'DA' }, { kind: 'play', cardId: 'DT' }
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
  return Math.max(0, Math.min(cursor, spec.steps.length));
}
