import type { CardId, Seat, Suit } from '../core';

export const ARTICLE_SCRIPT_NAVIGATION_MODE = 'article-script';

export type ArticleScriptNavigationMode = typeof ARTICLE_SCRIPT_NAVIGATION_MODE;
export type ArticleScriptInteractionProfile = 'story-viewing' | 'puzzle-solving';

export type ArticleScriptStep = {
  kind: 'play';
  cardId: CardId;
  branchPrefix?: string;
  assertedWinner?: Seat;
  terminalState?: 'complete';
};

export type ArticleScriptDerivedPlayStep = {
  kind: 'derived-play';
  seat: Seat;
  rule: 'lowest' | 'dd-min' | 'dd-max' | 'cover';
  suit?: Suit;
  branchPrefix?: string;
  assertedWinner?: Seat;
  terminalState?: 'complete';
};

export type ArticleScriptChoiceStep = {
  kind: 'choice';
  seat: Seat;
  options?: CardId[];
  optionMode?: 'explicit' | 'dd-accurate';
  branchRole?: 'authored' | 'internal' | 'none';
  routeTokenByOption?: Partial<Record<CardId, string>>;
  suit?: Suit;
  assertedOptions?: CardId[];
  assertedSuits?: Suit[];
  prompt?: string;
  choiceMessages?: Partial<Record<CardId, string>>;
  continuations?: Partial<Record<CardId, CardId[]>>;
  branchPrefix?: string;
  assertedWinner?: Seat;
  terminalState?: 'complete';
};

export type ArticleScriptFlexSegmentStep = {
  kind: 'flex-segment';
  plays: number;
  branchPrefix?: string;
  terminalState?: 'complete';
};

export type ArticleScriptCheckpoint = {
  id: string;
  cursor: number;
};

export type ArticleScriptSpec = {
  id: string;
  parentProblemId: string;
  navigationMode: ArticleScriptNavigationMode;
  interactionProfile: ArticleScriptInteractionProfile;
  checkpoints: ArticleScriptCheckpoint[];
  steps: Array<ArticleScriptStep | ArticleScriptDerivedPlayStep | ArticleScriptChoiceStep | ArticleScriptFlexSegmentStep>;
};

export const experimentalDraftIntroScript: ArticleScriptSpec = {
  id: 'experimental-draft-intro',
  parentProblemId: 'experimental_draft_01',
  navigationMode: ARTICLE_SCRIPT_NAVIGATION_MODE,
  interactionProfile: 'story-viewing',
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
        DJ: 'When East pitches a diamond, we must <span class="article-inline-emphasis">ruff</span> and then throw them in with a diamond.',
        ST: "When East pitches a spade, we must <span class=\"article-inline-emphasis\">sluff</span> so West will perforce grant us access to dummy's 2 spade winners."
      },
      continuations: {
        DJ: ['H5', 'C9', 'D5', 'S4', 'D8', 'DQ', 'ST', 'D7', 'S8', 'SJ', 'SK', 'SQ', 'D9', 'S9'],
        ST: ['D5', 'C9', 'S9', 'SK', 'SQ', 'D7', 'SJ', 'DJ', 'D9', 'S4', 'D8', 'DQ', 'H5', 'S8']
      }
    }
  ]
};

export const doubleDummy01Script: ArticleScriptSpec = {
  id: 'double-dummy-01',
  parentProblemId: 'double_dummy_01',
  navigationMode: ARTICLE_SCRIPT_NAVIGATION_MODE,
  interactionProfile: 'puzzle-solving',
  checkpoints: [{ id: '1', cursor: 0 }],
  steps: [
    { kind: 'play', cardId: 'SK' },
    { kind: 'play', cardId: 'S7' },
    { kind: 'play', cardId: 'S8' },
    { kind: 'play', cardId: 'SA' },
    { kind: 'play', cardId: 'DT' },
    { kind: 'play', cardId: 'D9' },
    { kind: 'play', cardId: 'D3' },
    {
      kind: 'choice',
      seat: 'E',
      options: ['DJ', 'D4'],
      prompt: "Pick East's play"
    },
    { kind: 'play', cardId: 'D4', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'S',
      options: ['CA', 'D8', 'D7', 'D2'],
      branchRole: 'internal',
      routeTokenByOption: {
        CA: 'CA',
        D8: 'D',
        D7: 'D',
        D2: 'D'
      },
      prompt: "Pick South's play",
      branchPrefix: 'SKD4'
    },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', branchPrefix: 'SKD4CA' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKD4CA'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKD4CA', assertedWinner: 'S' },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      suit: 'D',
      prompt: "Pick South's play",
      branchPrefix: 'SKD4CA'
    },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', branchPrefix: 'SKD4CA' },
    { kind: 'play', cardId: 'DA', branchPrefix: 'SKD4CA' },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKD4CA', assertedWinner: 'N' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKD4CA'
    },
    { kind: 'play', cardId: 'CK', branchPrefix: 'SKD4CA' },
    { kind: 'play', cardId: 'C8', branchPrefix: 'SKD4CA' },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', branchPrefix: 'SKD4CA', assertedWinner: 'E' },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', branchPrefix: 'SKD4D' },
    { kind: 'play', cardId: 'DA', branchPrefix: 'SKD4D' },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKD4D', assertedWinner: 'N' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKD4D'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKD4D' },
    { kind: 'play', cardId: 'CA', branchPrefix: 'SKD4D' },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', branchPrefix: 'SKD4D', assertedWinner: 'S' },
    { kind: 'play', cardId: 'C8', branchPrefix: 'SKD4D' },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', branchPrefix: 'SKD4D' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKD4D'
    },
    { kind: 'play', cardId: 'CK', branchPrefix: 'SKD4D', assertedWinner: 'E' },
    { kind: 'play', cardId: 'ST', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'SJ', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'SQ', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'S4', branchPrefix: 'SKD4', assertedWinner: 'W' },
    { kind: 'play', cardId: 'H9', branchPrefix: 'SKD4' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKD4'
    },
    { kind: 'derived-play', seat: 'E', rule: 'cover', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'HQ', branchPrefix: 'SKD4', assertedWinner: 'S' },
    { kind: 'play', cardId: 'DQ', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'C6', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'CQ', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'D6', branchPrefix: 'SKD4', assertedWinner: 'S' },
    { kind: 'play', cardId: 'CT', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'C7', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'S9', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'S6', branchPrefix: 'SKD4', assertedWinner: 'S' },
    { kind: 'play', cardId: 'S5', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'S2', branchPrefix: 'SKD4' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKD4'
    },
    { kind: 'play', cardId: 'H6', branchPrefix: 'SKD4' },
    { kind: 'play', cardId: 'H4', branchPrefix: 'SKD4', terminalState: 'complete' },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      assertedOptions: ['DQ', 'D8', 'D7', 'D2'],
      prompt: "Pick South's play",
      branchPrefix: 'SKDJ'
    },
    { kind: 'play', cardId: 'DK', branchPrefix: 'SKDJ' },
    { kind: 'play', cardId: 'DA', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJ'
    },
    { kind: 'play', cardId: 'H5', branchPrefix: 'SKDJ' },
    { kind: 'play', cardId: 'HQ', branchPrefix: 'SKDJ' },
    { kind: 'play', cardId: 'H7', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play",
      branchPrefix: 'SKDJ'
    },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', suit: 'C', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJ'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play",
      branchPrefix: 'SKDJ'
    },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', suit: 'C', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJ'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      assertedSuits: ['D'],
      prompt: "Pick South's play",
      branchPrefix: 'SKDJ'
    },
    { kind: 'play', cardId: 'S2', branchPrefix: 'SKDJ' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJ'
    },
    {
      kind: 'choice',
      seat: 'E',
      options: ['S6', 'H6', 'CJ'],
      prompt: "Pick East's play",
      branchPrefix: 'SKDJ',
      assertedWinner: 'S'
    },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play",
      branchPrefix: 'SKDJCJ'
    },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', branchPrefix: 'SKDJCJ' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJCJ'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKDJCJ', assertedWinner: 'N' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJCJ'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKDJCJ' },
    { kind: 'play', cardId: 'S5', branchPrefix: 'SKDJCJ' },
    { kind: 'play', cardId: 'S3', branchPrefix: 'SKDJCJ', assertedWinner: 'N' },
    { kind: 'play', cardId: 'CQ', branchPrefix: 'SKDJCJ' },
    { kind: 'play', cardId: 'CK', branchPrefix: 'SKDJCJ' },
    { kind: 'play', cardId: 'CA', branchPrefix: 'SKDJCJ' },
    { kind: 'play', cardId: 'C6', branchPrefix: 'SKDJCJ' },
    { kind: 'play', cardId: 'SJ', branchPrefix: 'SKDJCJ' },
    { kind: 'play', cardId: 'SQ', branchPrefix: 'SKDJCJ' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJCJ'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKDJCJ' },
    { kind: 'play', cardId: 'C7', branchPrefix: 'SKDJCJ', terminalState: 'complete' },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play",
      branchPrefix: 'SKDJH6'
    },
    { kind: 'derived-play', seat: 'W', rule: 'lowest', branchPrefix: 'SKDJH6' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJH6'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKDJH6', assertedWinner: 'N' },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJH6'
    },
    { kind: 'derived-play', seat: 'E', rule: 'lowest', branchPrefix: 'SKDJH6' },
    { kind: 'play', cardId: 'C8', branchPrefix: 'SKDJH6' },
    { kind: 'play', cardId: 'C6', branchPrefix: 'SKDJH6' },
    { kind: 'play', cardId: 'HT', branchPrefix: 'SKDJH6' },
    {
      kind: 'choice',
      seat: 'E',
      options: ['S6', 'CJ'],
      prompt: "Pick East's play",
      branchPrefix: 'SKDJH6'
    },
    { kind: 'play', cardId: 'CT', branchPrefix: 'SKDJH6S6' },
    { kind: 'play', cardId: 'C7', branchPrefix: 'SKDJH6S6' },
    { kind: 'play', cardId: 'S4', branchPrefix: 'SKDJH6S6' },
    { kind: 'play', cardId: 'ST', branchPrefix: 'SKDJH6S6' },
    { kind: 'play', cardId: 'SJ', branchPrefix: 'SKDJH6S6' },
    { kind: 'play', cardId: 'SQ', branchPrefix: 'SKDJH6S6', terminalState: 'complete' },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play",
      branchPrefix: 'SKDJH6CJ'
    },
    { kind: 'play', cardId: 'C7', branchPrefix: 'SKDJH6CJ' },
    { kind: 'play', cardId: 'CQ', branchPrefix: 'SKDJH6CJ', terminalState: 'complete' },
    { kind: 'play', cardId: 'SJ', branchPrefix: 'SKDJS6' },
    { kind: 'play', cardId: 'SQ', branchPrefix: 'SKDJS6' },
    { kind: 'play', cardId: 'S9', branchPrefix: 'SKDJS6' },
    { kind: 'play', cardId: 'ST', branchPrefix: 'SKDJS6', assertedWinner: 'W' },
    {
      kind: 'choice',
      seat: 'W',
      options: ['H9', 'C6'],
      prompt: "Pick West's play",
      branchPrefix: 'SKDJS6'
    },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJS6'
    },
    { kind: 'derived-play', seat: 'E', rule: 'dd-min', branchPrefix: 'SKDJS6H9' },
    { kind: 'derived-play', seat: 'E', rule: 'dd-max', branchPrefix: 'SKDJS6C6' },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play",
      branchPrefix: 'SKDJS6H9',
      assertedWinner: 'N'
    },
    {
      kind: 'choice',
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play",
      branchPrefix: 'SKDJS6C6',
      assertedWinner: 'S'
    },
    {
      kind: 'choice',
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play",
      branchPrefix: 'SKDJS6H9'
    },
    { kind: 'play', cardId: 'H8', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'S5', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'S3', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'S4', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'CJ', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'C8', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'C6', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'CQ', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'CK', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'CA', branchPrefix: 'SKDJS6H9' },
    { kind: 'play', cardId: 'C7', branchPrefix: 'SKDJS6H9', terminalState: 'complete' },
    { kind: 'play', cardId: 'S5', branchPrefix: 'SKDJS6C6' },
    { kind: 'play', cardId: 'S3', branchPrefix: 'SKDJS6C6' },
    { kind: 'play', cardId: 'S4', branchPrefix: 'SKDJS6C6' },
    { kind: 'play', cardId: 'H6', branchPrefix: 'SKDJS6C6' },
    { kind: 'play', cardId: 'H4', branchPrefix: 'SKDJS6C6', terminalState: 'complete' }
  ]
};

const ARTICLE_SCRIPTS: Record<string, ArticleScriptSpec> = {
  [experimentalDraftIntroScript.id]: experimentalDraftIntroScript,
  [doubleDummy01Script.id]: doubleDummy01Script
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

function isAuthoredBranchChoice(step: ArticleScriptChoiceStep): boolean {
  return (step.optionMode ?? 'explicit') === 'explicit' && (step.branchRole ?? 'authored') === 'authored';
}

function isRouteBranchChoice(step: ArticleScriptChoiceStep): boolean {
  if ((step.optionMode ?? 'explicit') !== 'explicit') return false;
  return (step.branchRole ?? 'authored') !== 'none';
}

function resolveArticleScriptRouteKey(
  spec: ArticleScriptSpec,
  choiceSelections: Partial<Record<number, CardId>>,
  maxCursor: number = Number.POSITIVE_INFINITY
): string {
  const parts: CardId[] = [];
  const firstStep = spec.steps[0];
  if (firstStep?.kind === 'play') parts.push(firstStep.cardId);
  let cursor = 0;
  for (const step of spec.steps) {
    const routeKey = parts.join('');
    if (!stepMatchesBranch(step, routeKey)) continue;
    if (step.kind === 'play' || step.kind === 'derived-play') {
      cursor += 1;
      continue;
    }
    if (step.kind === 'flex-segment') {
      cursor += step.plays;
      continue;
    }
    const choiceCursor = cursor;
    cursor += 1;
    const selected = choiceSelections[choiceCursor];
    if (selected && choiceCursor < maxCursor && isRouteBranchChoice(step)) {
      parts.push((step.routeTokenByOption?.[selected] ?? selected) as CardId);
    }
    cursor += selected ? selectedContinuation(step, selected).length : maxChoiceContinuationLength(step);
  }
  return parts.join('');
}

export function resolveArticleScriptAuthoredBranchName(
  spec: ArticleScriptSpec,
  choiceSelections: Partial<Record<number, CardId>>,
  maxCursor: number = Number.POSITIVE_INFINITY
): string {
  const parts: CardId[] = [];
  const firstStep = spec.steps[0];
  if (firstStep?.kind === 'play') parts.push(firstStep.cardId);
  let cursor = 0;
  for (const step of spec.steps) {
    const routeKey = resolveArticleScriptRouteKey(spec, choiceSelections, maxCursor);
    if (!stepMatchesBranch(step, routeKey)) continue;
    if (step.kind === 'play' || step.kind === 'derived-play') {
      cursor += 1;
      continue;
    }
    if (step.kind === 'flex-segment') {
      cursor += step.plays;
      continue;
    }
    const choiceCursor = cursor;
    cursor += 1;
    const selected = choiceSelections[choiceCursor];
    if (selected && choiceCursor < maxCursor && isAuthoredBranchChoice(step)) parts.push(selected);
    cursor += selected ? selectedContinuation(step, selected).length : maxChoiceContinuationLength(step);
  }
  return parts.join('');
}

function stepMatchesBranch(step: { branchPrefix?: string }, branchName: string): boolean {
  return !step.branchPrefix || branchName.startsWith(step.branchPrefix);
}

function selectedContinuation(step: ArticleScriptChoiceStep, selected: CardId | undefined): CardId[] {
  if (!selected) return [];
  if (step.options && !step.options.includes(selected)) return [];
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
    const routeKey = resolveArticleScriptRouteKey(spec, choiceSelections);
    if (!stepMatchesBranch(step, routeKey)) continue;
    if (step.kind === 'play' || step.kind === 'derived-play') {
      cursor += 1;
      continue;
    }
    if (step.kind === 'flex-segment') {
      cursor += step.plays;
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
    const routeKey = resolveArticleScriptRouteKey(spec, choiceSelections);
    if (!stepMatchesBranch(step, routeKey)) continue;
    if (step.kind === 'play') {
      if (logicalCursor === cursor) return null;
      logicalCursor += 1;
      continue;
    }
    if (step.kind === 'derived-play') {
      if (logicalCursor === cursor) return null;
      logicalCursor += 1;
      continue;
    }
    if (step.kind === 'flex-segment') {
      if (cursor >= logicalCursor && cursor < logicalCursor + step.plays) return null;
      logicalCursor += step.plays;
      continue;
    }
    const choiceCursor = logicalCursor;
    if (choiceCursor === cursor) {
      const selected = choiceSelections[choiceCursor];
      return selected ? null : step;
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
    const routeKey = resolveArticleScriptRouteKey(spec, choiceSelections);
    if (!stepMatchesBranch(step, routeKey)) continue;
    if (step.kind === 'play') {
      if (logicalCursor === cursor) return step.cardId;
      logicalCursor += 1;
      continue;
    }
    if (step.kind === 'derived-play') {
      if (logicalCursor === cursor) return null;
      logicalCursor += 1;
      continue;
    }
    if (step.kind === 'flex-segment') {
      if (cursor >= logicalCursor && cursor < logicalCursor + step.plays) return null;
      logicalCursor += step.plays;
      continue;
    }
    const choiceCursor = logicalCursor;
    if (choiceCursor === cursor) {
      const selected = choiceSelections[choiceCursor];
      return selected ?? null;
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

export function resolveArticleScriptStepAtCursor(
  spec: ArticleScriptSpec,
  cursor: number,
  choiceSelections: Partial<Record<number, CardId>> = {}
): ArticleScriptStep | ArticleScriptDerivedPlayStep | ArticleScriptChoiceStep | ArticleScriptFlexSegmentStep | null {
  let logicalCursor = 0;
  for (const step of spec.steps) {
    const routeKey = resolveArticleScriptRouteKey(spec, choiceSelections);
    if (!stepMatchesBranch(step, routeKey)) continue;
    if (step.kind === 'play' || step.kind === 'derived-play') {
      if (logicalCursor === cursor) return step;
      logicalCursor += 1;
      continue;
    }
    if (step.kind === 'flex-segment') {
      if (cursor >= logicalCursor && cursor < logicalCursor + step.plays) return step;
      logicalCursor += step.plays;
      continue;
    }
    const choiceCursor = logicalCursor;
    if (choiceCursor === cursor) return step;
    logicalCursor += 1;
    const selected = choiceSelections[choiceCursor];
    const continuation = selected ? selectedContinuation(step, selected) : [];
    for (const cardId of continuation) {
      if (logicalCursor === cursor) return { kind: 'play', cardId };
      logicalCursor += 1;
    }
    if (!selected) logicalCursor += maxChoiceContinuationLength(step);
  }
  return null;
}

export function resolveArticleScriptCheckpointEndCursor(spec: ArticleScriptSpec, checkpointId?: string | null): number {
  const next = resolveNextArticleScriptCheckpoint(spec, checkpointId);
  return next?.cursor ?? resolveArticleScriptLength(spec);
}

export function resolveNextArticleScriptCheckpoint(
  spec: ArticleScriptSpec,
  checkpointId?: string | null
): ArticleScriptCheckpoint | null {
  const checkpoint = resolveArticleScriptCheckpoint(spec, checkpointId);
  const checkpoints = [...spec.checkpoints].sort((a, b) => a.cursor - b.cursor);
  const idx = checkpoints.findIndex((entry) => entry.id === checkpoint.id);
  return idx >= 0 ? checkpoints[idx + 1] ?? null : null;
}

export function resolvePreviousArticleScriptCheckpointCursor(
  spec: ArticleScriptSpec,
  cursor: number
): number | null {
  const checkpoints = [...spec.checkpoints]
    .map((checkpoint) => checkpoint.cursor)
    .filter((checkpointCursor) => checkpointCursor < cursor)
    .sort((a, b) => b - a);
  return checkpoints[0] ?? null;
}

export function resolveArticleScriptTerminalState(
  spec: ArticleScriptSpec,
  choiceSelections: Partial<Record<number, CardId>> = {}
): 'complete' | null {
  const endCursor = resolveArticleScriptLength(spec, choiceSelections);
  if (endCursor <= 0) return null;
  const step = resolveArticleScriptStepAtCursor(spec, endCursor - 1, choiceSelections);
  return step?.terminalState ?? null;
}

export function resolvePreviousArticleScriptAuthoredChoiceCursor(
  spec: ArticleScriptSpec,
  cursor: number,
  choiceSelections: Partial<Record<number, CardId>> = {}
): number | null {
  for (let current = Math.max(0, cursor - 1); current >= 0; current -= 1) {
    const step = resolveArticleScriptStepAtCursor(spec, current, choiceSelections);
    if (step?.kind !== 'choice') continue;
    if (!isAuthoredBranchChoice(step)) continue;
    if (!choiceSelections[current]) continue;
    return current;
  }
  return null;
}

export function resolvePreviousArticleScriptLandmarkCursor(
  spec: ArticleScriptSpec,
  cursor: number,
  choiceSelections: Partial<Record<number, CardId>> = {}
): number | null {
  const previousCheckpoint = resolvePreviousArticleScriptCheckpointCursor(spec, cursor);
  const previousAuthoredChoice = resolvePreviousArticleScriptAuthoredChoiceCursor(spec, cursor, choiceSelections);
  return Math.max(previousCheckpoint ?? Number.NEGATIVE_INFINITY, previousAuthoredChoice ?? Number.NEGATIVE_INFINITY) === Number.NEGATIVE_INFINITY
    ? null
    : Math.max(previousCheckpoint ?? Number.NEGATIVE_INFINITY, previousAuthoredChoice ?? Number.NEGATIVE_INFINITY);
}
