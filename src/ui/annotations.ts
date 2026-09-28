import { threatsForSuit } from '../ai/threatModel';
import type { CardId, DefenderLabels, ThreatContext } from '../ai/threatModel';
import { getRankColorForFeatureRole, type FeatureCardRole, type FeatureColor, type FeatureState } from '../ai/features';

export type RankColor = FeatureColor;

function isBusy(cardId: CardId, labels: DefenderLabels): boolean {
  return labels.E.busy.has(cardId) || labels.W.busy.has(cardId);
}

function isDesignatedThreat(cardId: CardId, ctx: ThreatContext): boolean {
  if (!ctx.threatCardIds.includes(cardId)) return false;
  const { suit } = cardId.length >= 2 ? { suit: cardId[0] as 'S' | 'H' | 'D' | 'C' } : { suit: 'S' as const };
  return threatsForSuit(ctx, suit).some((threat) => threat.active && threat.threatCardId === cardId);
}

export function isPromotedWinner(cardId: CardId, ctx: ThreatContext, labels: DefenderLabels): boolean {
  const { suit } = cardId.length >= 2 ? { suit: cardId[0] as 'S' | 'H' | 'D' | 'C' } : { suit: 'S' as const };
  const threat = threatsForSuit(ctx, suit).find((entry) => entry.threatCardId === cardId);
  if (!threat || !threat.active || threat.threatCardId !== cardId) return false;

  if (threat.stranded) return false;
  if (threat.stopStatus !== undefined) return threat.stopStatus === 'none';
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
  let role: FeatureCardRole = 'default';
  if (isPromotedWinner(cardId, ctx, labels)) role = 'promotedWinner';
  else if (isDesignatedThreat(cardId, ctx)) role = 'threat';
  else if (isBusy(cardId, labels)) role = 'busy';
  return getRankColorForFeatureRole(role, teachingMode);
}

export function getCardRankColorFromFeatures(
  cardId: CardId,
  features: Pick<FeatureState, 'cardRoleById'> | null,
  teachingMode: boolean
): RankColor {
  const role = features?.cardRoleById[cardId] ?? 'default';
  return getRankColorForFeatureRole(role, teachingMode);
}
