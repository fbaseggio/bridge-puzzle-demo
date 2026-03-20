import type { CardId, Rank } from '../core/types';
import type { DdsPlay } from './ddsBrowser';

const RANK_ORDER: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export function normalizeDdsRank(raw: unknown): Rank | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).toUpperCase();
  if (value === '10') return 'T';
  return RANK_ORDER.includes(value as Rank) ? (value as Rank) : null;
}

export function normalizeDdsCardId(suitRaw: unknown, rankRaw: unknown): CardId | null {
  const suit = typeof suitRaw === 'string' ? suitRaw.toUpperCase() : '';
  const rank = normalizeDdsRank(rankRaw);
  if (!['S', 'H', 'D', 'C'].includes(suit) || !rank) return null;
  return `${suit}${rank}` as CardId;
}

export function buildDdsScoreByCard(plays: DdsPlay[] | undefined): Map<CardId, number> {
  const scoreByCard = new Map<CardId, number>();
  for (const play of plays ?? []) {
    if (typeof play.score !== 'number') continue;
    const baseCard = normalizeDdsCardId(play.suit, play.rank);
    if (baseCard) scoreByCard.set(baseCard, play.score);

    const equalsRaw = Array.isArray(play.equals)
      ? play.equals
      : (typeof play.equals === 'string' ? [play.equals] : []);
    for (const eq of equalsRaw) {
      if (!eq) continue;
      const normalized = String(eq).toUpperCase().trim();
      if (!normalized) continue;
      if (normalized.length === 1) {
        const eqCard = normalizeDdsCardId(play.suit, normalized);
        if (eqCard) scoreByCard.set(eqCard, play.score);
        continue;
      }
      const suitRank = normalizeDdsCardId(normalized.slice(0, 1), normalized.slice(1));
      const rankSuit = normalizeDdsCardId(normalized.slice(-1), normalized.slice(0, -1));
      const eqCard = suitRank ?? rankSuit;
      if (eqCard) scoreByCard.set(eqCard, play.score);
    }
  }
  return scoreByCard;
}

