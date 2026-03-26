import { parseCardId, type CardId } from '../ai/threatModel';
import {
  resolveArticleScriptAuthoredBranchName,
  resolveArticleScriptStepAtCursor,
  type ArticleScriptChoiceStep,
  type ArticleScriptSpec
} from './articleScripts';

type InteractionProfile = 'story-viewing' | 'puzzle-solving';
type ScriptPhase = 'play' | 'end';

export type ArticleScriptChoicePresentationLike = {
  choice: { options?: CardId[] };
  rawChoice: ArticleScriptChoiceStep;
  unresolvedOptions: CardId[];
};

export type ArticleScriptExplicitBranchAdvanceAction = 'prompt' | 'choose' | 'choose-single' | 'none';

function rankStrengthForAdvance(rank: string): number {
  return { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 }[rank] ?? 99;
}

function suitStrengthForAdvance(suit: string): number {
  return { C: 0, D: 1, H: 2, S: 3 }[suit] ?? 99;
}

export function chooseLowestCardId(options: CardId[]): CardId | null {
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) => {
    const rankDelta = rankStrengthForAdvance(parseCardId(a).rank) - rankStrengthForAdvance(parseCardId(b).rank);
    if (rankDelta !== 0) return rankDelta;
    return suitStrengthForAdvance(parseCardId(a).suit) - suitStrengthForAdvance(parseCardId(b).suit);
  });
  return sorted[0] ?? null;
}

export function chooseArticleScriptBranchOptionForProfile(args: {
  profile: InteractionProfile;
  choicePresentation: ArticleScriptChoicePresentationLike | null;
  branchName: string;
  triedBranchOptions: Map<string, Set<CardId>>;
}): CardId | null {
  const { profile, choicePresentation, branchName, triedBranchOptions } = args;
  if (!choicePresentation) return null;
  const authoredExplicit = (choicePresentation.rawChoice.optionMode ?? 'explicit') === 'explicit'
    && (choicePresentation.rawChoice.branchRole ?? 'authored') === 'authored';
  const preferredOptions = authoredExplicit
    ? (choicePresentation.unresolvedOptions.length > 0 ? choicePresentation.unresolvedOptions : (choicePresentation.rawChoice.options ?? []))
    : (choicePresentation.choice.options ?? []);
  if (profile === 'story-viewing' && authoredExplicit) {
    const tried = branchName ? triedBranchOptions.get(branchName) : null;
    const untriedOptions = tried ? preferredOptions.filter((cardId) => !tried.has(cardId)) : preferredOptions;
    return chooseLowestCardId(untriedOptions.length > 0 ? untriedOptions : preferredOptions);
  }
  return chooseLowestCardId(preferredOptions);
}

export function explicitChoiceStepForBranch(spec: ArticleScriptSpec, branchName: string): ArticleScriptChoiceStep | null {
  const rootBranch = spec.steps[0]?.kind === 'play' ? spec.steps[0].cardId : '';
  for (const step of spec.steps) {
    if (step.kind !== 'choice') continue;
    if ((step.optionMode ?? 'explicit') !== 'explicit') continue;
    if ((step.branchRole ?? 'authored') !== 'authored') continue;
    const stepBranch = step.branchPrefix ?? rootBranch;
    if (stepBranch === branchName) return step;
  }
  return null;
}

export function isArticleScriptBranchComplete(
  spec: ArticleScriptSpec,
  completedBranches: Set<string>,
  branchName: string
): boolean {
  if (!branchName) return false;
  if (completedBranches.has(branchName)) return true;
  const explicitChoice = explicitChoiceStepForBranch(spec, branchName);
  const options = explicitChoice?.options ?? [];
  if (options.length === 0) return false;
  return options.every((option) => isArticleScriptBranchComplete(spec, completedBranches, `${branchName}${option}`));
}

export function previousUnfinishedArticleScriptBranchCursor(args: {
  spec: ArticleScriptSpec;
  initialCursor: number;
  cursor: number;
  choiceSelections: Partial<Record<number, CardId>>;
  completedBranches: Set<string>;
}): number | null {
  const { spec, initialCursor, cursor, choiceSelections, completedBranches } = args;
  for (let current = Math.max(0, cursor - 1); current >= initialCursor; current -= 1) {
    const step = resolveArticleScriptStepAtCursor(spec, current, choiceSelections);
    if (step?.kind !== 'choice') continue;
    if ((step.optionMode ?? 'explicit') !== 'explicit') continue;
    if ((step.branchRole ?? 'authored') !== 'authored') continue;
    if (!choiceSelections[current]) continue;
    const branchName = resolveArticleScriptAuthoredBranchName(spec, choiceSelections, current);
    const options = step.options ?? [];
    if (options.some((option) => !isArticleScriptBranchComplete(spec, completedBranches, `${branchName}${option}`))) {
      return current;
    }
  }
  return null;
}

export function shouldBlockArticleScriptUserAdvance(args: {
  profile: InteractionProfile;
  isUserTurn: boolean;
  hasRememberedTail: boolean;
  trickFrozen: boolean;
  canLeadDismiss: boolean;
  phase: ScriptPhase;
}): boolean {
  const { profile, isUserTurn, hasRememberedTail, trickFrozen, canLeadDismiss, phase } = args;
  return profile !== 'story-viewing'
    && isUserTurn
    && !hasRememberedTail
    && (!trickFrozen || canLeadDismiss)
    && phase !== 'end';
}

export function shouldAutoAdvanceNonExplicitChoiceForProfile(args: {
  profile: InteractionProfile;
  choice: ArticleScriptChoiceStep | null;
}): boolean {
  const { profile, choice } = args;
  return profile === 'story-viewing' && Boolean(choice) && (choice?.optionMode ?? 'explicit') !== 'explicit';
}

export function resolveExplicitBranchAdvanceAction(args: {
  unresolvedOptionCount: number;
  followPromptActive: boolean;
}): ArticleScriptExplicitBranchAdvanceAction {
  const { unresolvedOptionCount, followPromptActive } = args;
  if (unresolvedOptionCount > 1) return followPromptActive ? 'choose' : 'prompt';
  if (unresolvedOptionCount === 1) return 'choose-single';
  return 'none';
}

export function canReplayArticleScriptRememberedTail(args: {
  hasPendingChoice: boolean;
  cursorInRememberedHistory: boolean;
}): boolean {
  const { hasPendingChoice, cursorInRememberedHistory } = args;
  return !hasPendingChoice && cursorInRememberedHistory;
}

export function shouldPauseArticleScriptAutoplayAtChoice(args: {
  choice: ArticleScriptChoiceStep | null;
  hasRememberedTail: boolean;
}): boolean {
  const { choice, hasRememberedTail } = args;
  return Boolean(choice) && (choice?.optionMode ?? 'explicit') === 'explicit' && !hasRememberedTail;
}

export function canAutoplayArticleScriptDefender(args: {
  autoplayEw: boolean;
  isUserTurn: boolean;
  phase: ScriptPhase;
  trickFrozen: boolean;
  canLeadDismiss: boolean;
  choice: ArticleScriptChoiceStep | null;
  hasRememberedTail: boolean;
}): boolean {
  const { autoplayEw, isUserTurn, phase, trickFrozen, canLeadDismiss, choice, hasRememberedTail } = args;
  return autoplayEw
    && !isUserTurn
    && phase !== 'end'
    && (!trickFrozen || canLeadDismiss)
    && !shouldPauseArticleScriptAutoplayAtChoice({ choice, hasRememberedTail });
}
