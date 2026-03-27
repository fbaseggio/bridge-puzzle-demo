import { describe, expect, it } from 'vitest';
import {
  clearDismissedOutcomeIfChanged,
  clearFollowPrompt,
  clearMessage,
  completeCompanionFutureTransition,
  createHandDiagramSession,
  dismissOutcome,
  markBranchOptionTried,
  markCompanionNarrativeSegmentsActive,
  resetArticleScriptTracking,
  resetReadingReveal,
  startCompanionFutureTransition,
  setMessage,
  setReadingControlsRevealStage,
  setReadingControlsRevealed
} from '../../src/demo/handDiagramSession';

describe('hand diagram session', () => {
  it('starts with empty default hand-diagram interaction state', () => {
    const session = createHandDiagramSession();

    expect(session.status).toEqual({ type: 'default', text: '' });
    expect(session.dismissedOutcomeKey).toBeNull();
    expect(session.readingControlsRevealStage).toBe('collapsed');
    expect(session.readingControlsRevealed).toBe(false);
    expect(session.followPromptCursor).toBeNull();
    expect(session.stickyMessage).toBe(false);
    expect(session.completedBranches.size).toBe(0);
    expect(session.knownBranches.size).toBe(0);
    expect(session.triedBranchOptions.size).toBe(0);
    expect(session.leafStatsByBranch.size).toBe(0);
    expect(session.attributedLeafMistakes).toBe(0);
    expect(session.attributedLeafHints).toBe(0);
    expect(session.hintCount).toBe(0);
    expect(session.mistakeCount).toBe(0);
    expect(session.companionNarrativeActiveSegmentIds.size).toBe(0);
    expect(session.companionFutureTransitioning).toBe(false);
    expect(session.companionFuturePruned).toBe(false);
  });

  it('sets and clears message status without disturbing non-message state', () => {
    const session = createHandDiagramSession();

    setMessage(session, 'Choose East', true);
    expect(session.status).toEqual({ type: 'message', text: 'Choose East', html: true });

    clearMessage(session);
    expect(session.status).toEqual({ type: 'default', text: '' });

    session.status = { type: 'hint', text: 'BEST: SA' };
    clearMessage(session);
    expect(session.status).toEqual({ type: 'hint', text: 'BEST: SA' });
  });

  it('tracks and clears dismissed outcomes against the latest derived key', () => {
    const session = createHandDiagramSession();

    dismissOutcome(session, 'script-status:3:Branches 1');
    expect(session.dismissedOutcomeKey).toBe('script-status:3:Branches 1');

    clearDismissedOutcomeIfChanged(session, 'script-status:3:Branches 1');
    expect(session.dismissedOutcomeKey).toBe('script-status:3:Branches 1');

    clearDismissedOutcomeIfChanged(session, 'script-status:4:Branches 2');
    expect(session.dismissedOutcomeKey).toBeNull();
  });

  it('tracks reading reveal state and resets it back to collapsed', () => {
    const session = createHandDiagramSession();

    setReadingControlsRevealed(session, true);
    expect(session.readingControlsRevealStage).toBe('full');
    expect(session.readingControlsRevealed).toBe(true);

    resetReadingReveal(session);
    expect(session.readingControlsRevealStage).toBe('collapsed');
    expect(session.readingControlsRevealed).toBe(false);
  });

  it('supports quiet-stage reveal before full controls are opened', () => {
    const session = createHandDiagramSession();

    setReadingControlsRevealStage(session, 'quiet');
    expect(session.readingControlsRevealStage).toBe('quiet');
    expect(session.readingControlsRevealed).toBe(true);
  });

  it('tracks follow prompt state and clears it independently of sticky messages', () => {
    const session = createHandDiagramSession();

    session.followPromptCursor = 12;
    session.stickyMessage = true;

    clearFollowPrompt(session);

    expect(session.followPromptCursor).toBeNull();
    expect(session.stickyMessage).toBe(true);
  });

  it('records tried branch options by branch name', () => {
    const session = createHandDiagramSession();

    markBranchOptionTried(session, 'S7', 'DJ');
    markBranchOptionTried(session, 'S7', 'ST');
    markBranchOptionTried(session, 'H6', 'C2');

    expect([...session.triedBranchOptions.get('S7') ?? []]).toEqual(['DJ', 'ST']);
    expect([...session.triedBranchOptions.get('H6') ?? []]).toEqual(['C2']);
  });

  it('tracks one-time companion future transition state', () => {
    const session = createHandDiagramSession();

    expect(startCompanionFutureTransition(session)).toBe(true);
    expect(session.companionFutureTransitioning).toBe(true);
    expect(session.companionFuturePruned).toBe(false);

    expect(startCompanionFutureTransition(session)).toBe(false);
    completeCompanionFutureTransition(session);
    expect(session.companionFutureTransitioning).toBe(false);
    expect(session.companionFuturePruned).toBe(true);

    expect(startCompanionFutureTransition(session)).toBe(false);
  });

  it('resets article-script tracking without clearing general widget dismissal state', () => {
    const session = createHandDiagramSession();

    session.followPromptCursor = 9;
    session.stickyMessage = true;
    session.completedBranches.add('SKDJ');
    session.knownBranches.add('SK');
    session.knownBranches.add('SKDJ');
    markBranchOptionTried(session, 'SK', 'DJ');
    session.leafStatsByBranch.set('SKDJ', { mistakes: 2, hints: 1, outcome: 'success' });
    session.attributedLeafMistakes = 2;
    session.attributedLeafHints = 1;
    session.hintCount = 2;
    session.mistakeCount = 1;
    markCompanionNarrativeSegmentsActive(session, ['lead-s7', 'win-sa']);
    session.dismissedOutcomeKey = 'run:success:end';
    session.readingControlsRevealStage = 'full';
    session.readingControlsRevealed = true;

    resetArticleScriptTracking(session);

    expect(session.followPromptCursor).toBeNull();
    expect(session.stickyMessage).toBe(false);
    expect(session.completedBranches.size).toBe(0);
    expect(session.knownBranches.size).toBe(0);
    expect(session.triedBranchOptions.size).toBe(0);
    expect(session.leafStatsByBranch.size).toBe(0);
    expect(session.attributedLeafMistakes).toBe(0);
    expect(session.attributedLeafHints).toBe(0);
    expect(session.hintCount).toBe(0);
    expect(session.mistakeCount).toBe(0);
    expect(session.companionNarrativeActiveSegmentIds.size).toBe(0);
    expect(session.companionFutureTransitioning).toBe(false);
    expect(session.companionFuturePruned).toBe(false);
    expect(session.dismissedOutcomeKey).toBe('run:success:end');
    expect(session.readingControlsRevealStage).toBe('full');
    expect(session.readingControlsRevealed).toBe(true);
  });
});
