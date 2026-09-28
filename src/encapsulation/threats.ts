import type { BoundEncapsulation, BoundThreatCard } from './types';
import type { PositionInverseExplanation } from './positionInverse';

function companionSymbol(symbol: string): 'a' | 'b' | 'c' {
  return symbol.endsWith("'") ? (symbol[0] === 'A' ? 'a' : 'b')
    : symbol.endsWith('*') ? (symbol[0] === 'A' ? 'b' : 'a') : 'c';
}

/** Undefined means a secondary squeeze needs an explicit onboarding decision. */
export function resolveCompanionThreatPolicy(bound: BoundEncapsulation, choice?: boolean): boolean | undefined {
  if (choice !== undefined) return choice;
  if (bound.parsed.goalOffset === 0) return true;
  const hasCompanion = bound.cardBindings.some((binding) => binding.note === 'low'
    && binding.role === 'structural' && /^(?:[AB]['*]?|C)$/.test(binding.symbol));
  return hasCompanion && bound.parsed.goalOffset < 0 ? undefined : false;
}

/** Runtime threats include the implied card opposite A/B/C, without changing the authored tokens. */
export function deriveBoundThreatCards(bound: BoundEncapsulation, includeCompanions = true): BoundThreatCard[] {
  const threats = bound.threatCards.map((card) => ({ ...card }));
  if (!includeCompanions) return threats;
  for (const binding of bound.cardBindings) {
    if (binding.note !== 'low' || binding.role !== 'structural' || !/^(?:[AB]['*]?|C)$/.test(binding.symbol)) continue;
    if (binding.hand !== 'N' && binding.hand !== 'S') continue;
    // Lowercase symbols are relative to this card's owner, opposite the capital's owner.
    const symbol = companionSymbol(binding.symbol);
    threats.push({ symbol, seat: binding.hand, suit: binding.suit, rank: binding.rank, cardId: `${binding.suit}${binding.rank}` });
  }
  return threats;
}

/** Extract actual card identities from inversion, rather than rebinding and changing ranks. */
export function deriveInverseThreatCards(explanation: PositionInverseExplanation): BoundThreatCard[] {
  const cards: BoundThreatCard[] = [];
  for (const suit of explanation.suits) {
    for (const step of suit.selectedByScorer?.assignmentSteps ?? suit.bindingLabels ?? []) {
      const match = /^([NS])([AKQJT2-9])->([AB]['*]?|[gG]'|[abcfgABCFG])\d+(-low)?$/.exec(step);
      if (!match) continue;
      if (match[4] && !/^(?:[AB]['*]?|C)$/.test(match[3])) continue;
      cards.push({
        seat: match[1] as 'N' | 'S', suit: suit.suit, rank: match[2], cardId: `${suit.suit}${match[2]}`,
        symbol: match[4] ? companionSymbol(match[3]) : match[3] as BoundThreatCard['symbol']
      });
    }
  }
  return cards;
}
