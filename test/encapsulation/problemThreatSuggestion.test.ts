import { describe, expect, it } from 'vitest';
import { explainPositionInverse } from '../../src/encapsulation';
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

  const out: CardId[] = [];
  for (const suit of explained.suits) {
    if (!/[abcfgABCFG]/.test(suit.finalText)) continue;
    const stepSource = suit.selectedByScorer?.assignmentSteps ?? suit.bindingLabels ?? [];
    for (const step of stepSource) {
      const m = /^([NESW])([AKQJT2-9])->([abcfgABCFG])/.exec(step);
      if (!m) continue;
      const seat = m[1] as 'N' | 'E' | 'S' | 'W';
      if (seat !== 'N' && seat !== 'S') continue;
      const rank = m[2];
      const cardId = `${suit.suit}${rank}` as CardId;
      if (!out.includes(cardId)) out.push(cardId);
    }
  }
  return out;
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
