import { describe, expect, it } from 'vitest';
import { experimentalDraft01 } from '../../src/puzzles/experimental_draft';
import {
  ARTICLE_SCRIPT_NAVIGATION_MODE,
  experimentalDraftIntroScript,
  resolveArticleScriptCheckpointEndCursor,
  resolveArticleScriptLength,
  resolvePendingArticleScriptChoice,
  resolveArticleScriptCheckpoint
} from '../../src/demo/articleScripts';
import {
  defaultArticleScriptHistory,
  deriveArticleScriptState,
  replayArticleHistory,
  replayArticleScript
} from '../../src/demo/articleScriptRuntime';

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
});
