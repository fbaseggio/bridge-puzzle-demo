import { describe, expect, it } from 'vitest';
import { explainPositionInverse } from '../../src/encapsulation';
import { demoProblems, resolveDemoProblem } from '../../src/demo/problems';
import type { Suit } from '../../src/core';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

describe('problem inversion quality', () => {
  it('flags any suit that inverts to unresolved placeholders', () => {
    const unresolved: string[] = [];

    for (const entry of demoProblems) {
      const problem = resolveDemoProblem(entry);
      const explained = explainPositionInverse({
        hands: problem.hands,
        turn: problem.leader,
        suitOrder: SUITS,
        threatCardIds: problem.threatCardIds
      });

      for (const suit of explained.suits) {
        if (suit.finalText.startsWith('{')) {
          unresolved.push(`${problem.id}:${suit.suit}:${suit.finalText}`);
        }
      }
    }

    expect(unresolved, `Unresolved inverse outcomes:\n${unresolved.join('\n')}`).toEqual([]);
  });
});

