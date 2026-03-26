import { describe, expect, it } from 'vitest';
import { experimentalDraft01 } from '../../src/puzzles/experimental_draft';
import { doubleDummy01 } from '../../src/puzzles/double_dummy_01';
import { legalPlays, type Seat, type State, type Suit } from '../../src/core';
import { toCardId, type CardId } from '../../src/ai/threatModel';
import {
  ARTICLE_SCRIPT_NAVIGATION_MODE,
  ArticleScriptChoiceStep,
  doubleDummy01Script,
  experimentalDraftIntroScript,
  resolveArticleScriptAuthoredBranchName,
  resolveArticleScriptCardAtCursor,
  resolveArticleScriptCheckpointEndCursor,
  resolveNextArticleScriptCheckpoint,
  resolveArticleScriptLength,
  resolveArticleScriptTerminalState,
  resolvePreviousArticleScriptAuthoredChoiceCursor,
  resolvePreviousArticleScriptLandmarkCursor,
  resolvePendingArticleScriptChoice,
  resolveArticleScriptCheckpoint,
  resolveArticleScriptStepAtCursor
} from '../../src/demo/articleScripts';
import {
  defaultArticleScriptHistory,
  deriveArticleScriptState,
  matchArticleScriptHistory,
  replayArticleHistory,
  replayArticleScript
} from '../../src/demo/articleScriptRuntime';

function suitStrengthForTest(cardId: CardId): number {
  return { C: 0, D: 1, H: 2, S: 3 }[cardId[0] as Suit];
}

function resolveWidgetTestChoiceOptions(
  step: ArticleScriptChoiceStep,
  historyPrefix: CardId[],
  cursor: number
): ArticleScriptChoiceStep {
  if ((step.optionMode ?? 'explicit') === 'explicit') return { ...step, options: step.options ?? [] };
  const replayed = replayArticleHistory(doubleDummy01, historyPrefix, cursor, doubleDummy01.rngSeed >>> 0);
  const legal = legalPlays(replayed.state)
    .filter((candidate) => candidate.seat === step.seat)
    .map((candidate) => toCardId(candidate.suit, candidate.rank) as CardId);
  const filteredLegal = step.suit ? legal.filter((cardId) => (cardId[0] as Suit) === step.suit) : legal;
  return { ...step, options: filteredLegal };
}

function resolveWidgetTestDerivedPlayCard(
  step: { seat: Seat; suit?: Suit; rule?: 'lowest' | 'dd-min' | 'dd-max' | 'cover' },
  view: State,
  playedCardIds: CardId[] = []
): CardId | null {
  if (step.rule === 'dd-min' || step.rule === 'dd-max') {
    const options = resolveWidgetTestChoiceOptions(
      { kind: 'choice', seat: step.seat, optionMode: 'dd-accurate', suit: step.suit },
      playedCardIds,
      playedCardIds.length
    ).options ?? [];
    const sortedOptions = [...options].sort((a, b) => {
      const rankDelta = '23456789TJQKA'.indexOf(a[1] ?? '') - '23456789TJQKA'.indexOf(b[1] ?? '');
      if (rankDelta !== 0) return rankDelta;
      return suitStrengthForTest(a) - suitStrengthForTest(b);
    });
    return step.rule === 'dd-max' ? (sortedOptions.at(-1) ?? null) : (sortedOptions[0] ?? null);
  }
  if (step.rule === 'cover') {
    const coverHeartTen = view.trick.some((played) => toCardId(played.suit, played.rank) === 'HT');
    if (coverHeartTen) {
      const jackCover = legalPlays(view).find((candidate) => candidate.seat === step.seat && candidate.suit === 'H' && candidate.rank === 'J');
      if (jackCover) return toCardId(jackCover.suit, jackCover.rank) as CardId;
    }
  }
  const legal = legalPlays(view).filter((candidate) => candidate.seat === step.seat && (!step.suit || candidate.suit === step.suit));
  if (legal.length === 0) return null;
  legal.sort((a, b) => {
    const rankDelta = '23456789TJQKA'.indexOf(a.rank) - '23456789TJQKA'.indexOf(b.rank);
    if (rankDelta !== 0) return rankDelta;
    return suitStrengthForTest(toCardId(a.suit, a.rank) as CardId) - suitStrengthForTest(toCardId(b.suit, b.rank) as CardId);
  });
  const chosen = legal[0];
  return chosen ? (toCardId(chosen.suit, chosen.rank) as CardId) : null;
}

function deriveWidgetStyleArticleScriptState(history: CardId[], cursor: number): 'pre-script' | 'in-script' | 'off-script' | 'post-script' {
  return matchArticleScriptHistory(doubleDummy01Script, '1', history, cursor, {
    resolveChoiceStep: (step, historyPrefix, stepCursor) => resolveWidgetTestChoiceOptions(step, historyPrefix, stepCursor),
    matchDerivedPlay: (matchHistory, stepCursor, step) => {
      const replayed = replayArticleHistory(doubleDummy01, matchHistory, stepCursor, doubleDummy01.rngSeed >>> 0);
      const expectedDerived = resolveWidgetTestDerivedPlayCard(step, replayed.state, replayed.playedCardIds);
      return Boolean(expectedDerived && matchHistory[stepCursor] === expectedDerived);
    },
    replayHistory: (matchHistory, replayCursor) => replayArticleHistory(doubleDummy01, matchHistory, replayCursor, doubleDummy01.rngSeed >>> 0)
  }).stateId;
}

describe('article script runtime', () => {
  it('uses explicit checkpoints and scripted navigation mode', () => {
    expect(experimentalDraftIntroScript.navigationMode).toBe(ARTICLE_SCRIPT_NAVIGATION_MODE);
    expect(resolveArticleScriptCheckpoint(experimentalDraftIntroScript, '1a')).toEqual({ id: '1a', cursor: 24 });
    expect(resolveArticleScriptCheckpointEndCursor(experimentalDraftIntroScript, '1a')).toBe(36);
    expect(resolveArticleScriptCheckpointEndCursor(experimentalDraftIntroScript, '1b')).toBe(resolveArticleScriptLength(experimentalDraftIntroScript));
    expect(resolveNextArticleScriptCheckpoint(experimentalDraftIntroScript, '1')).toEqual({ id: '1a', cursor: 24 });
    expect(resolveNextArticleScriptCheckpoint(experimentalDraftIntroScript, '1b')).toBeNull();
    expect(resolveNextArticleScriptCheckpoint(doubleDummy01Script, '1')).toBeNull();
    expect(resolveArticleScriptCheckpoint(experimentalDraftIntroScript, 'missing')).toEqual({ id: '1', cursor: 0 });
  });

  it('replays the experimental draft parent deal to a named checkpoint', () => {
    const checkpoint = resolveArticleScriptCheckpoint(experimentalDraftIntroScript, '1a');
    const replay = replayArticleScript(experimentalDraft01, experimentalDraftIntroScript, checkpoint.cursor);

    expect(replay.cursor).toBe(24);
    expect(replay.playedCardIds).toHaveLength(24);
    expect(replay.playedCardIds.slice(-4)).toEqual(['CA', 'C7', 'C4', 'C5']);
    expect(replay.state.turn).toBe('S');
  });

  it('supports one-card forward, backward, and checkpoint reset by replay', () => {
    const checkpoint = resolveArticleScriptCheckpoint(experimentalDraftIntroScript, '1a');
    const atCheckpoint = replayArticleScript(experimentalDraft01, experimentalDraftIntroScript, checkpoint.cursor);
    const oneForward = replayArticleScript(experimentalDraft01, experimentalDraftIntroScript, checkpoint.cursor + 1);
    const resetAgain = replayArticleScript(experimentalDraft01, experimentalDraftIntroScript, checkpoint.cursor);

    expect(oneForward.playedCardIds).toHaveLength(25);
    expect(oneForward.playedCardIds.at(-1)).toBe('HK');
    expect(resetAgain.playedCardIds).toEqual(atCheckpoint.playedCardIds);
    expect(resetAgain.state).toEqual(atCheckpoint.state);
  });

  it('pauses on the pending scripted branch and can replay through a chosen option', () => {
    const checkpoint = resolveArticleScriptCheckpoint(experimentalDraftIntroScript, '1b');
    const afterC6 = replayArticleScript(experimentalDraft01, experimentalDraftIntroScript, checkpoint.cursor + 1);

    expect(afterC6.playedCardIds.at(-1)).toBe('C6');
    expect(resolvePendingArticleScriptChoice(experimentalDraftIntroScript, checkpoint.cursor + 1)).toEqual({
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
    });

    const afterBranch = replayArticleScript(
      experimentalDraft01,
      experimentalDraftIntroScript,
      checkpoint.cursor + 2,
      experimentalDraft01.rngSeed >>> 0,
      { [checkpoint.cursor + 1]: 'DJ' }
    );

    expect(afterBranch.playedCardIds.at(-1)).toBe('DJ');
    const continued = replayArticleScript(
      experimentalDraft01,
      experimentalDraftIntroScript,
      checkpoint.cursor + 6,
      experimentalDraft01.rngSeed >>> 0,
      { [checkpoint.cursor + 1]: 'DJ' }
    );
    expect(continued.playedCardIds.slice(-5)).toEqual(['DJ', 'H5', 'C9', 'D5', 'S4']);
  });

  it('derives pre/in/off/post script-state from local history and cursor', () => {
    const checkpoint = resolveArticleScriptCheckpoint(experimentalDraftIntroScript, '1b');
    const end = resolveArticleScriptCheckpointEndCursor(experimentalDraftIntroScript, '1b');
    const inScriptHistory = defaultArticleScriptHistory(experimentalDraftIntroScript, checkpoint.cursor + 1);

    expect(deriveArticleScriptState(experimentalDraftIntroScript, '1b', inScriptHistory, checkpoint.cursor)).toBe('in-script');
    expect(deriveArticleScriptState(experimentalDraftIntroScript, '1b', inScriptHistory, checkpoint.cursor - 1)).toBe('pre-script');

    const offScriptHistory = [...inScriptHistory];
    offScriptHistory[checkpoint.cursor] = 'DJ';
    expect(deriveArticleScriptState(experimentalDraftIntroScript, '1b', offScriptHistory, checkpoint.cursor + 1)).toBe('off-script');

    const authoredBranchHistory = [
      ...inScriptHistory,
      'DJ',
      'H5',
      'C9',
      'D5',
      'S4',
      'D8',
      'DQ',
      'ST',
      'D7',
      'S8',
      'SJ',
      'SK',
      'SQ',
      'D9',
      'S9',
      'S2'
    ];
    expect(deriveArticleScriptState(experimentalDraftIntroScript, '1b', authoredBranchHistory, end + 1)).toBe('post-script');
  });

  it('replays arbitrary local article history after divergence or post-script continuation', () => {
    const checkpoint = resolveArticleScriptCheckpoint(experimentalDraftIntroScript, '1b');
    const history = [...defaultArticleScriptHistory(experimentalDraftIntroScript, checkpoint.cursor + 1), 'DJ', 'S2'];
    const replay = replayArticleHistory(experimentalDraft01, history, history.length);

    expect(replay.playedCardIds).toEqual(history.slice(0, replay.playedCardIds.length));
    expect(replay.cursor).toBe(history.length);
    expect(replay.playedCardIds).toHaveLength(history.length - 1);
  });

  it('does not treat SKDJ as complete immediately after the first branch choice', () => {
    const history = ['SK', 'S7', 'S8', 'SA', 'DT', 'D9', 'D3', 'DJ'] as const;
    const stateAtChoice = deriveArticleScriptState(doubleDummy01Script, '1', [...history], history.length);
    const replayAfterChoice = replayArticleHistory(doubleDummy01, [...history], history.length);

    expect(stateAtChoice).toBe('in-script');
    expect(resolveArticleScriptLength(doubleDummy01Script, { 7: 'DJ' })).toBeGreaterThan(history.length);
    expect(replayAfterChoice.state.turn).toBe('E');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, history.length, { 7: 'DJ' })).toBe('D4');
  });

  it('pins down SKDJ through trick 3 and the start of trick 4', () => {
    const selections = { 7: 'DJ' as const };

    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 8, selections)).toBe('D4');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 9, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate',
      assertedOptions: ['DQ', 'D8', 'D7', 'D2'],
      prompt: "Pick South's play"
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 10, selections)).toBe('DK');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 11, selections)).toBe('DA');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 12, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play"
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 13, selections)).toBe('H5');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 14, selections)).toBe('HQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 15, selections)).toBe('H7');
    expect(resolveArticleScriptLength(doubleDummy01Script, selections)).toBe(28);
  });

  it('extends SKDJ into the authored trick 5 and trick 6 sequences', () => {
    const selections = { 7: 'DJ' as const };
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 16, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play"
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 17, selections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest',
      suit: 'C'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 18, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play"
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 19, selections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 20, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play"
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 21, selections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest',
      suit: 'C'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 22, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play"
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 23, selections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest'
    });
    expect(resolveArticleScriptLength(doubleDummy01Script, selections)).toBe(28);
  });

  it('extends SKDJ to the next explicit branch with the asserted trick-7 shape', () => {
    const selections = { 7: 'DJ' as const };

    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 24, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate',
      assertedSuits: ['D'],
      prompt: "Pick South's play"
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 25, selections)).toBe('S2');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 26, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play"
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 27, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'E',
      options: ['S6', 'H6', 'CJ'],
      assertedWinner: 'S',
      prompt: "Pick East's play"
    });
  });

  it('routes authored branches for SKDJCJ, SKDJH6, and SKDJS6', () => {
    expect(resolveArticleScriptAuthoredBranchName(doubleDummy01Script, { 7: 'DJ', 27: 'CJ' })).toBe('SKDJCJ');
    expect(resolveArticleScriptAuthoredBranchName(doubleDummy01Script, { 7: 'DJ', 27: 'H6' })).toBe('SKDJH6');
    expect(resolveArticleScriptAuthoredBranchName(doubleDummy01Script, { 7: 'DJ', 27: 'S6' })).toBe('SKDJS6');
    expect(resolveArticleScriptAuthoredBranchName(doubleDummy01Script, { 7: 'DJ', 9: 'D8', 27: 'CJ', 28: 'DA', 30: 'HK' })).toBe('SKDJCJ');
  });

  it('encodes the SKDJCJ continuation without changing the earlier line', () => {
    const selections = { 7: 'DJ' as const, 27: 'CJ' as const };

    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 28, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate',
      prompt: "Pick South's play"
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 29, selections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 30, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play"
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 31, selections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest',
      assertedWinner: 'N'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 32, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate',
      prompt: "Pick North's play"
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 33, selections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 34, selections)).toBe('S5');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 35, selections)).toBe('S3');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 36, selections)).toBe('CQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 37, selections)).toBe('CK');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 38, selections)).toBe('CA');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 39, selections)).toBe('C6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 40, selections)).toBe('SJ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 41, selections)).toBe('SQ');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 42, selections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 43, selections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 44, selections)).toBe('C7');
  });

  it('encodes the SKDJH6 and SKDJS6 authored continuations', () => {
    const heartSelections = { 7: 'DJ' as const, 27: 'H6' as const };
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 28, heartSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 29, heartSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 30, heartSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 31, heartSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest',
      assertedWinner: 'N'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 32, heartSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 33, heartSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 34, heartSelections)).toBe('C8');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 35, heartSelections)).toBe('C6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 36, heartSelections)).toBe('HT');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 37, heartSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'E',
      options: ['S6', 'CJ'],
      prompt: "Pick East's play"
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 38, { ...heartSelections, 37: 'S6' })).toBe('CT');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 39, { ...heartSelections, 37: 'S6' })).toBe('C7');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 40, { ...heartSelections, 37: 'S6' })).toBe('S4');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 41, { ...heartSelections, 37: 'S6' })).toBe('ST');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 42, { ...heartSelections, 37: 'S6' })).toBe('SJ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 43, { ...heartSelections, 37: 'S6' })).toBe('SQ');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 38, { ...heartSelections, 37: 'CJ' }) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 39, { ...heartSelections, 37: 'CJ' })).toBe('C7');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 40, { ...heartSelections, 37: 'CJ' })).toBe('CQ');

    const spadeSelections = { 7: 'DJ' as const, 27: 'S6' as const };
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 28, spadeSelections)).toBe('SJ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 29, spadeSelections)).toBe('SQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 30, spadeSelections)).toBe('S9');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 31, spadeSelections)).toBe('ST');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 32, spadeSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'W',
      options: ['H9', 'C6'],
      prompt: "Pick West's play"
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 33, { ...spadeSelections, 32: 'H9' }) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 34, { ...spadeSelections, 32: 'H9' })).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'dd-min'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 35, { ...spadeSelections, 32: 'H9' }) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 36, { ...spadeSelections, 32: 'H9' }) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 37, { ...spadeSelections, 32: 'H9' })).toBe('H8');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 38, { ...spadeSelections, 32: 'H9' })).toBe('S5');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 39, { ...spadeSelections, 32: 'H9' })).toBe('S3');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 40, { ...spadeSelections, 32: 'H9' })).toBe('S4');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 41, { ...spadeSelections, 32: 'H9' })).toBe('CJ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 42, { ...spadeSelections, 32: 'H9' })).toBe('C8');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 43, { ...spadeSelections, 32: 'H9' })).toBe('C6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 44, { ...spadeSelections, 32: 'H9' })).toBe('CQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 45, { ...spadeSelections, 32: 'H9' })).toBe('CK');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 46, { ...spadeSelections, 32: 'H9' })).toBe('CA');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 47, { ...spadeSelections, 32: 'H9' })).toBe('C7');
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 34, { ...spadeSelections, 32: 'C6' })).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'dd-max'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 35, { ...spadeSelections, 32: 'C6' }) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 36, { ...spadeSelections, 32: 'C6' })).toBe('S5');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 37, { ...spadeSelections, 32: 'C6' })).toBe('S3');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 38, { ...spadeSelections, 32: 'C6' })).toBe('S4');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 39, { ...spadeSelections, 32: 'C6' })).toBe('H6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 40, { ...spadeSelections, 32: 'C6' })).toBe('H4');
    expect(resolveArticleScriptLength(doubleDummy01Script, { ...spadeSelections, 32: 'H9' })).toBe(48);
    expect(resolveArticleScriptLength(doubleDummy01Script, { ...spadeSelections, 32: 'C6' })).toBe(41);
  });

  it('marks only explicit successful branch ends as complete', () => {
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, { 7: 'DJ', 27: 'S6', 32: 'H9' })).toBe('complete');
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, { 7: 'DJ', 27: 'S6', 32: 'C6' })).toBe('complete');
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, { 7: 'DJ', 27: 'CJ' })).toBe('complete');
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, { 7: 'DJ', 27: 'H6', 37: 'S6' })).toBe('complete');
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, { 7: 'DJ', 27: 'H6', 37: 'CJ' })).toBe('complete');
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, { 7: 'DJ' })).toBeNull();
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, { 7: 'D4', 8: 'CA' })).toBe('complete');
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, { 7: 'D4', 8: 'D8' })).toBe('complete');
  });

  it('finds the previous authored branch cursor for transport rewind', () => {
    expect(resolvePreviousArticleScriptAuthoredChoiceCursor(doubleDummy01Script, 0, {})).toBeNull();
    expect(resolvePreviousArticleScriptAuthoredChoiceCursor(doubleDummy01Script, 20, { 7: 'DJ' })).toBe(7);
    expect(resolvePreviousArticleScriptAuthoredChoiceCursor(doubleDummy01Script, 35, { 7: 'DJ', 27: 'S6', 32: 'H9' })).toBe(32);
    expect(resolvePreviousArticleScriptAuthoredChoiceCursor(doubleDummy01Script, 29, { 7: 'DJ', 27: 'S6' })).toBe(27);
  });

  it('finds the previous authored landmark cursor for checkpoints and branch points', () => {
    expect(resolvePreviousArticleScriptLandmarkCursor(experimentalDraftIntroScript, 0, {})).toBeNull();
    expect(resolvePreviousArticleScriptLandmarkCursor(experimentalDraftIntroScript, 30, {})).toBe(24);
    expect(resolvePreviousArticleScriptLandmarkCursor(doubleDummy01Script, 20, { 7: 'DJ' })).toBe(7);
    expect(resolvePreviousArticleScriptLandmarkCursor(doubleDummy01Script, 35, { 7: 'DJ', 27: 'S6', 32: 'H9' })).toBe(32);
  });

  it('uses only explicit choices in the authored branch name', () => {
    expect(resolveArticleScriptAuthoredBranchName(doubleDummy01Script, {})).toBe('SK');
    expect(resolveArticleScriptAuthoredBranchName(doubleDummy01Script, { 7: 'DJ' })).toBe('SKDJ');
    expect(resolveArticleScriptAuthoredBranchName(doubleDummy01Script, { 7: 'DJ', 9: 'D8', 12: 'HA', 16: 'CT', 18: 'CQ' })).toBe('SKDJ');
  });

  it('keeps the authored SKDJ line in-script through the end of trick 4', () => {
    const history = ['SK', 'S7', 'S8', 'SA', 'DT', 'D9', 'D3', 'DJ', 'D4', 'DQ', 'DK', 'DA', 'HA', 'H5', 'HQ', 'H7'];
    const replay = replayArticleHistory(doubleDummy01, history, history.length);

    expect(replay.playedCardIds).toEqual(history);
    expect(deriveArticleScriptState(doubleDummy01Script, '1', history, history.length)).toBe('in-script');
  });

  it('treats SKD4 as complete at East’s branch choice and transitions to post-script after it', () => {
    const history = ['SK', 'S7', 'S8', 'SA', 'DT', 'D9', 'D3', 'D4'];
    const replay = replayArticleHistory(doubleDummy01, history, history.length);

    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, history.length, { 7: 'D4' }) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      options: ['CA', 'D8', 'D7', 'D2'],
      branchRole: 'internal',
      prompt: "Pick South's play"
    });
    expect(replay.playedCardIds).toEqual(history);
    expect(replay.state.turn).toBe('S');
    expect(deriveArticleScriptState(doubleDummy01Script, '1', history, history.length)).toBe('in-script');
  });

  it('extends SKD4 through the merged T11 ending without creating an authored branch', () => {
    const caSelections = { 7: 'D4' as const, 8: 'CA' as const };
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 9, caSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 10, caSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 11, caSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest',
      assertedWinner: 'S'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 12, caSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'S',
      optionMode: 'dd-accurate',
      suit: 'D'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 13, caSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 14, caSelections)).toBe('DA');
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 15, caSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest',
      assertedWinner: 'N'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 16, caSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 17, caSelections)).toBe('CK');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 18, caSelections)).toBe('C8');
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 19, caSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest',
      assertedWinner: 'E'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 20, caSelections)).toBe('ST');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 21, caSelections)).toBe('SJ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 22, caSelections)).toBe('SQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 23, caSelections)).toBe('S4');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 24, caSelections)).toBe('H9');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 25, caSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 26, caSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'cover'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 27, caSelections)).toBe('HQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 28, caSelections)).toBe('DQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 29, caSelections)).toBe('C6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 30, caSelections)).toBe('CQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 31, caSelections)).toBe('D6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 32, caSelections)).toBe('CT');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 33, caSelections)).toBe('C7');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 34, caSelections)).toBe('S9');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 35, caSelections)).toBe('S6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 36, caSelections)).toBe('S5');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 37, caSelections)).toBe('S2');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 38, caSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 39, caSelections)).toBe('H6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 40, caSelections)).toBe('H4');
    expect(resolveArticleScriptLength(doubleDummy01Script, caSelections)).toBe(41);

    const diamondSelections = { 7: 'D4' as const, 8: 'D8' as const };
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 9, diamondSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 10, diamondSelections)).toBe('DA');
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 11, diamondSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest',
      assertedWinner: 'N'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 12, diamondSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 13, diamondSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'lowest'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 14, diamondSelections)).toBe('CA');
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 15, diamondSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest',
      assertedWinner: 'S'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 16, diamondSelections)).toBe('C8');
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 17, diamondSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'W',
      rule: 'lowest'
    });
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 18, diamondSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 19, diamondSelections)).toBe('CK');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 20, diamondSelections)).toBe('ST');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 21, diamondSelections)).toBe('SJ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 22, diamondSelections)).toBe('SQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 23, diamondSelections)).toBe('S4');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 24, diamondSelections)).toBe('H9');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 25, diamondSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptStepAtCursor(doubleDummy01Script, 26, diamondSelections)).toMatchObject({
      kind: 'derived-play',
      seat: 'E',
      rule: 'cover'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 27, diamondSelections)).toBe('HQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 28, diamondSelections)).toBe('DQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 29, diamondSelections)).toBe('C6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 30, diamondSelections)).toBe('CQ');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 31, diamondSelections)).toBe('D6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 32, diamondSelections)).toBe('CT');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 33, diamondSelections)).toBe('C7');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 34, diamondSelections)).toBe('S9');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 35, diamondSelections)).toBe('S6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 36, diamondSelections)).toBe('S5');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 37, diamondSelections)).toBe('S2');
    expect(resolvePendingArticleScriptChoice(doubleDummy01Script, 38, diamondSelections) as ArticleScriptChoiceStep).toMatchObject({
      seat: 'N',
      optionMode: 'dd-accurate'
    });
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 39, diamondSelections)).toBe('H6');
    expect(resolveArticleScriptCardAtCursor(doubleDummy01Script, 40, diamondSelections)).toBe('H4');
    expect(resolveArticleScriptLength(doubleDummy01Script, diamondSelections)).toBe(41);
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, caSelections)).toBe('complete');
    expect(resolveArticleScriptTerminalState(doubleDummy01Script, diamondSelections)).toBe('complete');
    expect(resolveArticleScriptAuthoredBranchName(doubleDummy01Script, { 7: 'D4', 8: 'CA' })).toBe('SKD4');
    expect(resolveArticleScriptLength(doubleDummy01Script, { 7: 'D4', 8: 'D7' })).toBe(41);
  });

  it('covers the heart ten on the merged SKD4 line and otherwise plays low', () => {
    const coverHistory = [
      'SK', 'S7', 'S8', 'SA',
      'DT', 'D9', 'D3', 'D4',
      'CA', 'C4', 'C2', 'CJ',
      'D8', 'DK', 'DA', 'D5',
      'C3', 'CK', 'C8', 'C5',
      'ST', 'SJ', 'SQ', 'S4',
      'H9', 'HT', 'HJ', 'HQ'
    ] as CardId[];
    expect(deriveWidgetStyleArticleScriptState(coverHistory, coverHistory.length)).toBe('in-script');

    const lowHistory = [
      'SK', 'S7', 'S8', 'SA',
      'DT', 'D9', 'D3', 'D4',
      'CA', 'C4', 'C2', 'CJ',
      'D8', 'DK', 'DA', 'D5',
      'C3', 'CK', 'C8', 'C5',
      'ST', 'SJ', 'SQ', 'S4',
      'H9', 'H3', 'H5', 'HQ'
    ] as CardId[];
    expect(deriveWidgetStyleArticleScriptState(lowHistory, lowHistory.length)).toBe('in-script');
  });

  it('keeps SKDJ in-script when West follows South’s diamond with DK', () => {
    const history = ['SK', 'S7', 'S8', 'SA', 'DT', 'D9', 'D3', 'DJ', 'D4', 'DQ', 'DK'];

    expect(deriveWidgetStyleArticleScriptState(history, 10)).toBe('in-script');
    expect(deriveWidgetStyleArticleScriptState(history, history.length)).toBe('in-script');
  });

  it('keeps SKDJ in-script through DK for every asserted South diamond', () => {
    for (const southDiamond of ['DQ', 'D8', 'D7', 'D2'] as const) {
      const history = ['SK', 'S7', 'S8', 'SA', 'DT', 'D9', 'D3', 'DJ', 'D4', southDiamond, 'DK'];
      expect(deriveWidgetStyleArticleScriptState(history, history.length)).toBe('in-script');
    }
  });

  it('asserts the expected option set for the first SKDJ any-slot', () => {
    const matched = matchArticleScriptHistory(
      doubleDummy01Script,
      '1',
      ['SK', 'S7', 'S8', 'SA', 'DT', 'D9', 'D3', 'DJ', 'D4'],
      9,
      {
        resolveChoiceStep: (step, historyPrefix, stepCursor) => resolveWidgetTestChoiceOptions(step, historyPrefix, stepCursor)
      }
    );

    expect(matched.assertionFailure).toBeNull();
    expect((resolvePendingArticleScriptChoice(doubleDummy01Script, 9, { 7: 'DJ' }) as ArticleScriptChoiceStep).assertedOptions).toEqual(['DQ', 'D8', 'D7', 'D2']);
  });
});
