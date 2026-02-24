import type { Hand, Rank, Suit } from '../core';
import {
  getPromotedWinnerRankForSuit,
  parseCardId,
  toCardId,
  type CardId,
  type DefenderLabels,
  type DefenderSeat,
  type Position,
  type ThreatContext
} from './threatModel';

export type RngFn = () => number;
export type DiscardTiers = {
  legal: CardId[];
  tier1a: CardId[];
  tier1b: CardId[];
  tier1c: CardId[];
  tier2a: CardId[];
  tier2b: CardId[];
  tier3a: CardId[];
  tier3b: CardId[];
  tier4: CardId[];
};
export type Tier1ExplainCard = {
  cardId: CardId;
  suit: Suit;
  rank: Rank;
  label: 'busy' | 'idle' | 'default';
  idle: boolean;
  suitActiveThreat: boolean;
  threshold: Rank | null;
  rankBelowThreshold: boolean | null;
  tier1a: boolean;
  tier1b: boolean;
  tier1c: boolean;
};
export type Tier1Explain = {
  cards: Tier1ExplainCard[];
  idleLegal: CardId[];
  tier1a: CardId[];
  tier1b: CardId[];
  tier1c: CardId[];
  activeThreats: Array<{
    suit: Suit;
    active: boolean;
    threatRank: Rank;
    promotedWinnerRank: Rank | null;
    threshold: Rank;
    stopStatus: 'none' | 'single' | 'double' | '-';
  }>;
  integrityOk: boolean;
  missing: CardId[];
  overlap: CardId[];
};

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

function legalCards(hand: Hand, ledSuit: Suit | null): CardId[] {
  if (ledSuit && hand[ledSuit].length > 0) {
    return hand[ledSuit].map((r) => toCardId(ledSuit, r));
  }

  const out: CardId[] = [];
  for (const suit of SUITS) {
    for (const rank of hand[suit]) out.push(toCardId(suit, rank));
  }
  return out;
}

function pickUniform(cards: CardId[], rng: RngFn): CardId {
  const n = cards.length;
  if (n === 0) throw new Error('No cards to pick from');
  const raw = Math.floor(rng() * n);
  const idx = Number.isFinite(raw) && raw >= 0 && raw < n ? raw : 0;
  return cards[idx];
}

function isIdle(defender: DefenderSeat, cardId: CardId, labels: DefenderLabels): boolean {
  return labels[defender].idle.has(cardId);
}

function cardRank(cardId: CardId): Rank {
  return parseCardId(cardId).rank;
}

function cardSuit(cardId: CardId): Suit {
  return parseCardId(cardId).suit;
}

function suitHasActiveThreat(suit: Suit, ctx: ThreatContext): boolean {
  return Boolean(ctx.threatsBySuit[suit]?.active);
}

function threatRankForSuit(suit: Suit, ctx: ThreatContext): Rank | null {
  const threat = ctx.threatsBySuit[suit];
  if (!threat || !threat.active) return null;
  return threat.threatRank;
}

export function getIdleThreatThresholdRank(suit: Suit, ctx: ThreatContext, labels: DefenderLabels): Rank | null {
  const threatRank = threatRankForSuit(suit, ctx);
  if (!threatRank) return null;
  const promotedWinnerRank = getPromotedWinnerRankForSuit(ctx, labels, suit);
  if (!promotedWinnerRank) return threatRank;
  return RANK_VALUE[promotedWinnerRank] > RANK_VALUE[threatRank] ? promotedWinnerRank : threatRank;
}

function tier1aPredicate(defender: DefenderSeat, cardId: CardId, labels: DefenderLabels, ctx: ThreatContext): boolean {
  if (!isIdle(defender, cardId, labels)) return false;
  return !suitHasActiveThreat(cardSuit(cardId), ctx);
}

function tier1bPredicate(defender: DefenderSeat, cardId: CardId, labels: DefenderLabels, ctx: ThreatContext): boolean {
  if (!isIdle(defender, cardId, labels)) return false;
  const suit = cardSuit(cardId);
  const threshold = getIdleThreatThresholdRank(suit, ctx, labels);
  if (!threshold) return false;
  return RANK_VALUE[cardRank(cardId)] < RANK_VALUE[threshold];
}

function tier1cPredicate(defender: DefenderSeat, cardId: CardId, labels: DefenderLabels, ctx: ThreatContext): boolean {
  if (!isIdle(defender, cardId, labels)) return false;
  return !tier1aPredicate(defender, cardId, labels, ctx) && !tier1bPredicate(defender, cardId, labels, ctx);
}

function isBusy(defender: DefenderSeat, cardId: CardId, labels: DefenderLabels): boolean {
  return labels[defender].busy.has(cardId);
}

function isBusyInActiveThreat(defender: DefenderSeat, cardId: CardId, labels: DefenderLabels, ctx: ThreatContext): boolean {
  if (!isBusy(defender, cardId, labels)) return false;
  const suit = cardSuit(cardId);
  return suitHasActiveThreat(suit, ctx);
}

function stopStatusForSuit(suit: Suit, labels: DefenderLabels, ctx: ThreatContext): 'none' | 'single' | 'double' | undefined {
  const fromCtx = ctx.threatsBySuit[suit]?.stopStatus;
  if (fromCtx) return fromCtx;
  if (!suitHasActiveThreat(suit, ctx)) return undefined;
  const busyE = [...labels.E.busy].some((id) => cardSuit(id) === suit);
  const busyW = [...labels.W.busy].some((id) => cardSuit(id) === suit);
  if (busyE && busyW) return 'double';
  if (busyE || busyW) return 'single';
  return 'none';
}

function isCoordinatedSuit(defender: DefenderSeat, suit: Suit, labels: DefenderLabels, ctx: ThreatContext): boolean {
  void defender;
  return stopStatusForSuit(suit, labels, ctx) === 'double';
}

function isSoloBusySuit(defender: DefenderSeat, suit: Suit, labels: DefenderLabels, ctx: ThreatContext): boolean {
  if (stopStatusForSuit(suit, labels, ctx) !== 'single') return false;
  return [...labels[defender].busy].some((id) => cardSuit(id) === suit);
}

function cardBelowThreatRank(cardId: CardId, ctx: ThreatContext): boolean {
  const suit = cardSuit(cardId);
  const rank = cardRank(cardId);
  const threatRank = threatRankForSuit(suit, ctx);
  if (!threatRank) return false;
  return RANK_VALUE[rank] < RANK_VALUE[threatRank];
}

export function chooseDiscard(
  defenderHandId: DefenderSeat,
  position: Position,
  ledSuit: Suit | null,
  ctx: ThreatContext,
  labels: DefenderLabels,
  rng: RngFn
): CardId {
  const { legal, tier1a, tier1b, tier1c, tier2a, tier2b, tier3a, tier3b, tier4 } = computeDiscardTiers(defenderHandId, position, ledSuit, ctx, labels);
  if (legal.length === 0) {
    throw new Error(`No legal cards for defender ${defenderHandId}`);
  }

  if (tier1a.length > 0) return pickUniform(tier1a, rng);
  if (tier1b.length > 0) return pickUniform(tier1b, rng);
  if (tier1c.length > 0) return pickUniform(tier1c, rng);
  if (tier2a.length > 0) return pickUniform(tier2a, rng);
  if (tier2b.length > 0) return pickUniform(tier2b, rng);
  if (tier3a.length > 0) return pickUniform(tier3a, rng);
  if (tier3b.length > 0) return pickUniform(tier3b, rng);
  return pickUniform(tier4, rng);
}

export function computeDiscardTiers(
  defenderHandId: DefenderSeat,
  position: Position,
  ledSuit: Suit | null,
  ctx: ThreatContext,
  labels: DefenderLabels
): DiscardTiers {
  const hand = position.hands[defenderHandId];
  const legal = legalCards(hand, ledSuit);

  const tier1a = legal.filter((cardId) => tier1aPredicate(defenderHandId, cardId, labels, ctx));
  const tier1b = legal.filter((cardId) => tier1bPredicate(defenderHandId, cardId, labels, ctx));
  const tier1c = legal.filter((cardId) => tier1cPredicate(defenderHandId, cardId, labels, ctx));
  const tier2a = legal.filter((cardId) => {
    if (!isBusyInActiveThreat(defenderHandId, cardId, labels, ctx)) return false;
    const suit = cardSuit(cardId);
    return isCoordinatedSuit(defenderHandId, suit, labels, ctx) && cardBelowThreatRank(cardId, ctx);
  });
  const tier2b = legal.filter((cardId) => {
    if (!isBusyInActiveThreat(defenderHandId, cardId, labels, ctx)) return false;
    const suit = cardSuit(cardId);
    return isCoordinatedSuit(defenderHandId, suit, labels, ctx);
  });
  const tier3a = legal.filter((cardId) => {
    if (!isBusyInActiveThreat(defenderHandId, cardId, labels, ctx)) return false;
    const suit = cardSuit(cardId);
    return isSoloBusySuit(defenderHandId, suit, labels, ctx) && cardBelowThreatRank(cardId, ctx);
  });
  const tier3b = legal.filter((cardId) => {
    if (!isBusyInActiveThreat(defenderHandId, cardId, labels, ctx)) return false;
    const suit = cardSuit(cardId);
    return isSoloBusySuit(defenderHandId, suit, labels, ctx);
  });

  return { legal, tier1a, tier1b, tier1c, tier2a, tier2b, tier3a, tier3b, tier4: legal };
}

export function explainTier1Membership(
  defenderHandId: DefenderSeat,
  legal: CardId[],
  ctx: ThreatContext,
  labels: DefenderLabels
): Tier1Explain {
  const cards: Tier1ExplainCard[] = legal.map((cardId) => {
    const suit = cardSuit(cardId);
    const rank = cardRank(cardId);
    const idle = isIdle(defenderHandId, cardId, labels);
    const busy = isBusy(defenderHandId, cardId, labels);
    const threshold = getIdleThreatThresholdRank(suit, ctx, labels);
    return {
      cardId,
      suit,
      rank,
      label: busy ? 'busy' : idle ? 'idle' : 'default',
      idle,
      suitActiveThreat: suitHasActiveThreat(suit, ctx),
      threshold,
      rankBelowThreshold: threshold ? RANK_VALUE[rank] < RANK_VALUE[threshold] : null,
      tier1a: tier1aPredicate(defenderHandId, cardId, labels, ctx),
      tier1b: tier1bPredicate(defenderHandId, cardId, labels, ctx),
      tier1c: tier1cPredicate(defenderHandId, cardId, labels, ctx)
    };
  });

  const tier1a = cards.filter((c) => c.tier1a).map((c) => c.cardId);
  const tier1b = cards.filter((c) => c.tier1b).map((c) => c.cardId);
  const tier1c = cards.filter((c) => c.tier1c).map((c) => c.cardId);
  const idleLegal = cards.filter((c) => c.idle).map((c) => c.cardId);

  const counts = new Map<CardId, number>();
  for (const id of [...tier1a, ...tier1b, ...tier1c]) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const missing = idleLegal.filter((id) => !counts.has(id));
  const overlap = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const activeThreats: Tier1Explain['activeThreats'] = [];
  for (const suit of SUITS) {
    const threat = ctx.threatsBySuit[suit];
    if (!threat || !threat.active) continue;
    activeThreats.push({
      suit,
      active: threat.active,
      threatRank: threat.threatRank,
      promotedWinnerRank: getPromotedWinnerRankForSuit(ctx, labels, suit),
      threshold: getIdleThreatThresholdRank(suit, ctx, labels) ?? threat.threatRank,
      stopStatus: threat.stopStatus ?? '-'
    });
  }

  return {
    cards,
    idleLegal,
    tier1a,
    tier1b,
    tier1c,
    activeThreats,
    integrityOk: missing.length === 0 && overlap.length === 0 && idleLegal.length === tier1a.length + tier1b.length + tier1c.length,
    missing,
    overlap
  };
}
