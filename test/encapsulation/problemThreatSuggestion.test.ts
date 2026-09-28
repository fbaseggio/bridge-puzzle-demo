import { describe, expect, it } from 'vitest';
import { deriveInverseThreatCards, explainPositionInverse } from '../../src/encapsulation';
import { demoProblems, resolveDemoProblem } from '../../src/demo/problems';
import type { CardId, Suit } from '../../src/core';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function hasThreatCardIds(problem: unknown): problem is { threatCardIds: CardId[] } {
  if (!problem || typeof problem !== 'object') return false;
  const value = (problem as { threatCardIds?: unknown }).threatCardIds;
  return Array.isArray(value);
}

function suggestedThreatsForProblem(problem: { hands: Record<'N' | 'E' | 'S' | 'W', Record<Suit, string[]>>; leader: 'N' | 'E' | 'S' | 'W' }): CardId[] {
  const explained = explainPositionInverse({
    hands: problem.hands,
    turn: problem.leader,
    suitOrder: SUITS
  });

  return deriveInverseThreatCards(explained).filter((card) => card.symbol.toLowerCase() !== 'f').map((card) => card.cardId as CardId);
}

describe('problem threat suggestions', () => {
  it('flags new demo problems missing explicit threatCardIds when inverse suggests threats', () => {
    const flagged: string[] = [];

    for (const entry of demoProblems) {
      if (entry.puzzleModeId === 'draft') continue;
      const problem = resolveDemoProblem(entry);
      if (hasThreatCardIds(problem) && problem.threatCardIds.length > 0) continue;
      const suggested = suggestedThreatsForProblem(problem);
      if (suggested.length > 0) {
        flagged.push(`${problem.id}: suggested threatCardIds ${suggested.join(',')}`);
      }
    }

    expect(flagged, `Problems missing threatCardIds with inverse suggestions:\n${flagged.join('\n')}`).toEqual([]);
  });
});
