import type { CardId, DefenderLabels, ThreatContext } from '../ai/threatModel';

export type RankColor = 'purple' | 'green' | 'blue' | 'black';

function isBusy(cardId: CardId, labels: DefenderLabels): boolean {
  return labels.E.busy.has(cardId) || labels.W.busy.has(cardId);
}

function isDesignatedThreat(cardId: CardId, ctx: ThreatContext): boolean {
  if (!ctx.threatCardIds.includes(cardId)) return false;
  const { suit } = cardId.length >= 2 ? { suit: cardId[0] as 'S' | 'H' | 'D' | 'C' } : { suit: 'S' as const };
  const threat = ctx.threatsBySuit[suit];
  return Boolean(threat?.active && threat.threatCardId === cardId);
}

export function isPromotedWinner(cardId: CardId, ctx: ThreatContext, labels: DefenderLabels): boolean {
  const { suit } = cardId.length >= 2 ? { suit: cardId[0] as 'S' | 'H' | 'D' | 'C' } : { suit: 'S' as const };
  const threat = ctx.threatsBySuit[suit];
  if (!threat || !threat.active || threat.threatCardId !== cardId) return false;

  const eBusyInSuit = [...labels.E.busy].some((id) => id.startsWith(suit));
  const wBusyInSuit = [...labels.W.busy].some((id) => id.startsWith(suit));
  return !eBusyInSuit && !wBusyInSuit;
}

export function getCardRankColor(
  cardId: CardId,
  ctx: ThreatContext,
  labels: DefenderLabels,
  teachingMode: boolean
): RankColor {
  if (!teachingMode) return 'black';
  if (isPromotedWinner(cardId, ctx, labels)) return 'purple';
  if (isDesignatedThreat(cardId, ctx)) return 'green';
  if (isBusy(cardId, labels)) return 'blue';
  return 'black';
}
