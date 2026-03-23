import { describe, expect, it } from 'vitest';
import { InMemorySemanticEventCollector, TeachingReducer, apply, init, type Play, type Problem } from '../../src/core';
import { demoProblems, resolveDemoProblem } from '../../src/demo/problems';

function replayWithDdFlags(problem: Problem, plays: Array<{ cardId: string; ddError?: boolean }>): string[] {
  let state = init(problem);
  const reducer = new TeachingReducer();
  reducer.setTrumpSuit(state.trumpSuit);
  const collector = new InMemorySemanticEventCollector();
  collector.attachReducer(reducer);

  for (const step of plays) {
    const play: Play = {
      seat: state.turn,
      suit: step.cardId[0] as Play['suit'],
      rank: step.cardId.slice(1) as Play['rank']
    };
    const result = apply(state, play, {
      eventCollector: collector,
      userDdError: step.ddError
    });
    state = result.state;
  }

  const snapshot = reducer.snapshot() as { entries: Array<{ summary: string }> };
  return snapshot.entries.map((entry) => entry.summary);
}

describe('teaching DD-error narration', () => {
  it('can mark the same user play as a DD error in both concrete sure-tricks variants', () => {
    const entry = demoProblems.find((problem) => problem.id === 'sure_tricks_demo');
    expect(entry).toBeTruthy();
    if (!entry) return;

    const summariesA = replayWithDdFlags(resolveDemoProblem(entry, 'a'), [{ cardId: 'DQ', ddError: true }]);
    const summariesB = replayWithDdFlags(resolveDemoProblem(entry, 'b'), [{ cardId: 'DQ', ddError: true }]);

    expect(summariesA[0]).toContain('DD Error.');
    expect(summariesB[0]).toContain('DD Error.');
  });

  it('can distinguish a DD error in only one concrete sure-tricks variant for the ST pitch branch', () => {
    const entry = demoProblems.find((problem) => problem.id === 'sure_tricks_demo');
    expect(entry).toBeTruthy();
    if (!entry) return;

    const branch = [
      { cardId: 'CT' },
      { cardId: 'CA' },
      { cardId: 'CQ' },
      { cardId: 'CK' },
      { cardId: 'CJ' }
    ];
    const summariesA = replayWithDdFlags(resolveDemoProblem(entry, 'a'), [...branch, { cardId: 'ST', ddError: false }]);
    const summariesB = replayWithDdFlags(resolveDemoProblem(entry, 'b'), [...branch, { cardId: 'ST', ddError: true }]);

    const southStSummaryA = summariesA.find((summary) => summary.includes('♠T.'));
    const southStSummaryB = summariesB.find((summary) => summary.includes('♠T.'));
    expect(southStSummaryA).toBeTruthy();
    expect(southStSummaryB).toBeTruthy();
    expect(southStSummaryA).not.toContain('DD Error.');
    expect(southStSummaryB).toContain('DD Error.');
  });
});
