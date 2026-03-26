import { describe, expect, it } from 'vitest';
import { doubleDummy01Script, experimentalDraftIntroScript } from '../../src/demo/articleScripts';
import {
  canAutoplayArticleScriptDefender,
  canReplayArticleScriptRememberedTail,
  chooseArticleScriptBranchOptionForProfile,
  explicitChoiceStepForBranch,
  isArticleScriptBranchComplete,
  previousUnfinishedArticleScriptBranchCursor,
  resolveExplicitBranchAdvanceAction,
  shouldPauseArticleScriptAutoplayAtChoice,
  shouldAutoAdvanceNonExplicitChoiceForProfile,
  shouldBlockArticleScriptUserAdvance,
  type ArticleScriptChoicePresentationLike
} from '../../src/demo/articleScriptInteractionPolicy';
import type { CardId } from '../../src/ai/threatModel';

function explicitChoicePresentation(
  options: CardId[],
  unresolvedOptions: CardId[] = options
): ArticleScriptChoicePresentationLike {
  return {
    choice: { options: unresolvedOptions },
    rawChoice: { kind: 'choice', seat: 'E', options, prompt: "Pick East's play" },
    unresolvedOptions
  };
}

describe('article script interaction policy', () => {
  it('story-viewing prefers a different explicit branch option before falling back to lowest', () => {
    const branchName = 'S7';
    const triedBranchOptions = new Map<string, Set<CardId>>([[branchName, new Set<CardId>(['DJ'])]]);

    expect(
      chooseArticleScriptBranchOptionForProfile({
        profile: 'story-viewing',
        choicePresentation: explicitChoicePresentation(['DJ', 'ST']),
        branchName,
        triedBranchOptions
      })
    ).toBe('ST');

    triedBranchOptions.set(branchName, new Set<CardId>(['DJ', 'ST']));
    expect(
      chooseArticleScriptBranchOptionForProfile({
        profile: 'story-viewing',
        choicePresentation: explicitChoicePresentation(['DJ', 'ST']),
        branchName,
        triedBranchOptions
      })
    ).toBe('ST');
  });

  it('puzzle-solving chooses the lowest unresolved authored option', () => {
    expect(
      chooseArticleScriptBranchOptionForProfile({
        profile: 'puzzle-solving',
        choicePresentation: explicitChoicePresentation(['DJ', 'D4'], ['DJ']),
        branchName: 'SK',
        triedBranchOptions: new Map()
      })
    ).toBe('DJ');
  });

  it('computes recursive branch completion from completed leaf branches', () => {
    const completedBranches = new Set<string>([
      'SKD4',
      'SKDJCJ',
      'SKDJH6S6',
      'SKDJH6CJ',
      'SKDJS6H9',
      'SKDJS6C6'
    ]);

    expect(explicitChoiceStepForBranch(doubleDummy01Script, 'SKDJH6')?.options).toEqual(['S6', 'CJ']);
    expect(isArticleScriptBranchComplete(doubleDummy01Script, completedBranches, 'SKDJH6')).toBe(true);
    expect(isArticleScriptBranchComplete(doubleDummy01Script, completedBranches, 'SKDJS6')).toBe(true);
    expect(isArticleScriptBranchComplete(doubleDummy01Script, completedBranches, 'SKDJ')).toBe(true);
    expect(isArticleScriptBranchComplete(doubleDummy01Script, completedBranches, 'SK')).toBe(true);
  });

  it('finds the nearest unfinished authored branch cursor for DD1 rewinds', () => {
    const choiceSelections = { 7: 'DJ' as const, 27: 'H6' as const, 37: 'S6' as const };

    expect(
      previousUnfinishedArticleScriptBranchCursor({
        spec: doubleDummy01Script,
        initialCursor: 0,
        cursor: 43,
        choiceSelections,
        completedBranches: new Set(['SKDJH6S6'])
      })
    ).toBe(37);

    expect(
      previousUnfinishedArticleScriptBranchCursor({
        spec: doubleDummy01Script,
        initialCursor: 0,
        cursor: 43,
        choiceSelections,
        completedBranches: new Set(['SKDJH6S6', 'SKDJH6CJ'])
      })
    ).toBe(27);
  });

  it('recognizes the VSC branch choice as an authored explicit branch on the root branch name', () => {
    expect(explicitChoiceStepForBranch(experimentalDraftIntroScript, 'S7')?.options).toEqual(['DJ', 'ST']);
  });

  it('blocks scripted user advance only for puzzle-solving user turns without remembered tail', () => {
    expect(
      shouldBlockArticleScriptUserAdvance({
        profile: 'puzzle-solving',
        isUserTurn: true,
        hasRememberedTail: false,
        trickFrozen: false,
        canLeadDismiss: false,
        phase: 'play'
      })
    ).toBe(true);

    expect(
      shouldBlockArticleScriptUserAdvance({
        profile: 'story-viewing',
        isUserTurn: true,
        hasRememberedTail: false,
        trickFrozen: false,
        canLeadDismiss: false,
        phase: 'play'
      })
    ).toBe(false);

    expect(
      shouldBlockArticleScriptUserAdvance({
        profile: 'solution-viewing',
        isUserTurn: true,
        hasRememberedTail: false,
        trickFrozen: false,
        canLeadDismiss: false,
        phase: 'play'
      })
    ).toBe(false);
  });

  it('only auto-advances non-explicit scripted choices in story-viewing', () => {
    expect(
      shouldAutoAdvanceNonExplicitChoiceForProfile({
        profile: 'story-viewing',
        choice: { kind: 'choice', seat: 'N', optionMode: 'dd-accurate', prompt: "Pick North's play" }
      })
    ).toBe(true);

    expect(
      shouldAutoAdvanceNonExplicitChoiceForProfile({
        profile: 'story-viewing',
        choice: { kind: 'choice', seat: 'E', options: ['DJ', 'ST'], prompt: "Pick East's play" }
      })
    ).toBe(false);

    expect(
      shouldAutoAdvanceNonExplicitChoiceForProfile({
        profile: 'puzzle-solving',
        choice: { kind: 'choice', seat: 'N', optionMode: 'dd-accurate', prompt: "Pick North's play" }
      })
    ).toBe(false);

    expect(
      shouldAutoAdvanceNonExplicitChoiceForProfile({
        profile: 'solution-viewing',
        choice: { kind: 'choice', seat: 'N', optionMode: 'dd-accurate', prompt: "Pick North's play" }
      })
    ).toBe(true);
  });

  it('distinguishes first-click prompt from second-click explicit branch auto-choice', () => {
    expect(resolveExplicitBranchAdvanceAction({ unresolvedOptionCount: 2, followPromptActive: false })).toBe('prompt');
    expect(resolveExplicitBranchAdvanceAction({ unresolvedOptionCount: 2, followPromptActive: true })).toBe('choose');
    expect(resolveExplicitBranchAdvanceAction({ unresolvedOptionCount: 1, followPromptActive: false })).toBe('choose-single');
    expect(resolveExplicitBranchAdvanceAction({ unresolvedOptionCount: 0, followPromptActive: false })).toBe('none');
  });

  it('does not replay remembered tail through a live pending choice', () => {
    expect(canReplayArticleScriptRememberedTail({ hasPendingChoice: true, cursorInRememberedHistory: true })).toBe(false);
    expect(canReplayArticleScriptRememberedTail({ hasPendingChoice: false, cursorInRememberedHistory: true })).toBe(true);
  });

  it('pauses scripted defender autoplay at explicit choices unless the branch is remembered', () => {
    const explicitChoice = { kind: 'choice', seat: 'E', options: ['DJ', 'ST'], prompt: "Pick East's play" } as const;

    expect(shouldPauseArticleScriptAutoplayAtChoice({ choice: explicitChoice, hasRememberedTail: false })).toBe(true);
    expect(shouldPauseArticleScriptAutoplayAtChoice({ choice: explicitChoice, hasRememberedTail: true })).toBe(false);

    expect(
      canAutoplayArticleScriptDefender({
        autoplayEw: true,
        isUserTurn: false,
        phase: 'play',
        trickFrozen: false,
        canLeadDismiss: false,
        choice: explicitChoice,
        hasRememberedTail: false
      })
    ).toBe(false);

    expect(
      canAutoplayArticleScriptDefender({
        autoplayEw: true,
        isUserTurn: false,
        phase: 'play',
        trickFrozen: false,
        canLeadDismiss: false,
        choice: explicitChoice,
        hasRememberedTail: true
      })
    ).toBe(true);
  });
});
