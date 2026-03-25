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
  resolveArticleScriptCardAtCursor,
  resolveArticleScriptCheckpointEndCursor,
  resolveArticleScriptLength,
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

function resolveWidgetTestDerivedPlayCard(step: { seat: Seat; suit?: Suit }, view: State): CardId | null {
  const legal = legalPlays(view).filter((candidate) => candidate.seat === step.seat && (!step.suit || candidate.suit === step.suit));
  if (legal.length === 0) return null;
  legal.sort((a, b) => '23456789TJQKA'.indexOf(a.rank) - '23456789TJQKA'.indexOf(b.rank));
  const chosen = legal[0];
  return chosen ? (toCardId(chosen.suit, chosen.rank) as CardId) : null;
}

function deriveWidgetStyleArticleScriptState(history: CardId[], cursor: number): 'pre-script' | 'in-script' | 'off-script' | 'post-script' {
  return matchArticleScriptHistory(doubleDummy01Script, '1', history, cursor, {
    resolveChoiceStep: (step, historyPrefix, stepCursor) => resolveWidgetTestChoiceOptions(step, historyPrefix, stepCursor),
    matchDerivedPlay: (matchHistory, stepCursor, seat, suit) => {
      const replayed = replayArticleHistory(doubleDummy01, matchHistory, stepCursor, doubleDummy01.rngSeed >>> 0);
      const expectedDerived = resolveWidgetTestDerivedPlayCard({ seat, suit }, replayed.state);
      return Boolean(expectedDerived && matchHistory[stepCursor] === expectedDerived);
    }
  }).stateId;
}

describe('article script runtime', () => {
  it('uses explicit checkpoints and scripted navigation mode', () => {
    expect(experimentalDraftIntroScript.navigationMode).toBe(ARTICLE_SCRIPT_NAVIGATION_MODE);
    expect(resolveArticleScriptCheckpoint(experimentalDraftIntroScript, '1a')).toEqual({ id: '1a', cursor: 24 });
    expect(resolveArticleScriptCheckpointEndCursor(experimentalDraftIntroScript, '1a')).toBe(36);
    expect(resolveArticleScriptCheckpointEndCursor(experimentalDraftIntroScript, '1b')).toBe(resolveArticleScriptLength(experimentalDraftIntroScript));
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
        DJ: 'When East pitches a diamond, we must <b>ruff</b> and then throw them in with a diamond.',
        ST: "When East pitches a spade, we must <b>sluff</b> so West will perforce grant us access to dummy's 2 spade winners."
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
    expect(resolveArticleScriptLength(doubleDummy01Script, selections)).toBe(20);
  });

  it('extends SKDJ into the authored trick 5 sequence', () => {
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
    expect(resolveArticleScriptLength(doubleDummy01Script, selections)).toBe(20);
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

    expect(resolveArticleScriptLength(doubleDummy01Script, { 7: 'D4' })).toBe(history.length);
    expect(replay.playedCardIds).toEqual(history);
    expect(replay.state.turn).toBe('S');
    expect(deriveArticleScriptState(doubleDummy01Script, '1', history, history.length)).toBe('in-script');

    const postScriptHistory = [...history, 'DQ'];
    expect(deriveArticleScriptState(doubleDummy01Script, '1', postScriptHistory, postScriptHistory.length)).toBe('post-script');
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
