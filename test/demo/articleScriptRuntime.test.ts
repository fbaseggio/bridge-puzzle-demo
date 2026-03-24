import { describe, expect, it } from 'vitest';
import { experimentalDraft01 } from '../../src/puzzles/experimental_draft';
import {
  ARTICLE_SCRIPT_NAVIGATION_MODE,
  experimentalDraftIntroScript,
  resolveArticleScriptCheckpoint
} from '../../src/demo/articleScripts';
import { replayArticleScript } from '../../src/demo/articleScriptRuntime';

describe('article script runtime', () => {
  it('uses explicit checkpoints and scripted navigation mode', () => {
    expect(experimentalDraftIntroScript.navigationMode).toBe(ARTICLE_SCRIPT_NAVIGATION_MODE);
    expect(resolveArticleScriptCheckpoint(experimentalDraftIntroScript, '1a')).toEqual({ id: '1a', cursor: 24 });
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
});
